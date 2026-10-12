import { uuidv7 } from "@leakbook/core";
import { HybridClock, compareHlc, type HlcState } from "./hlc";
import type { FieldChange, JsonValue, Mutation, PullCursor, PullPage, Row } from "./types";

/**
 * Minimal synchronous SQLite interface. better-sqlite3 (tests) and expo-sqlite (app,
 * via its *Sync methods) both fit it.
 */
export interface SqlDatabase {
  run(sql: string, params?: unknown[]): void;
  all<T>(sql: string, params?: unknown[]): T[];
  get<T>(sql: string, params?: unknown[]): T | undefined;
  transaction<T>(fn: () => T): T;
}

/**
 * Local tables. Every synced server table lives in sync_records as JSON, so a server schema
 * change never needs a device migration. Screens read through LocalStore.get/list.
 */
const SCHEMA_VERSION = 1;
const SCHEMA = [
  `create table if not exists sync_records (
     table_name text not null,
     id text not null,
     company_id text not null,
     data text not null,
     deleted integer not null default 0,
     primary key (table_name, id))`,
  `create index if not exists sync_records_company on sync_records (table_name, company_id, deleted)`,
  `create table if not exists sync_outbox (
     seq integer primary key autoincrement,
     mutation_id text not null,
     table_name text not null,
     row_id text not null,
     company_id text not null,
     fields text not null,
     created_at integer not null,
     attempts integer not null default 0,
     status text not null default 'pending',
     last_error text)`,
  `create index if not exists sync_outbox_status on sync_outbox (status, seq)`,
  `create index if not exists sync_outbox_row on sync_outbox (table_name, row_id)`,
  `create table if not exists sync_meta (key text primary key, value text not null)`,
  `create table if not exists upload_queue (
     media_id text primary key,
     company_id text not null,
     local_path text not null,
     storage_path text not null,
     mime_type text not null,
     attempts integer not null default 0,
     next_attempt_at integer not null default 0,
     last_error text)`,
];

/** Columns the server manages. Devices never send them. */
const SERVER_COLUMNS = new Set([
  "id",
  "company_id",
  "created_at",
  "updated_at",
  "field_hlc",
  "sync_xid",
]);

export interface OutboxProblem {
  seq: number;
  table: string;
  rowId: string;
  fields: string[];
  error: string;
}

/** A batch of coalesced mutations and the outbox entries each one covers. */
export interface PendingBatch {
  mutations: Mutation[];
  seqsByMutation: Map<string, number[]>;
}

interface OutboxRow {
  seq: number;
  mutation_id: string;
  table_name: string;
  row_id: string;
  company_id: string;
  fields: string;
}

export class LocalStore {
  readonly clock: HybridClock;

  private constructor(
    private readonly db: SqlDatabase,
    readonly deviceId: string,
    clockState: HlcState,
    private readonly now: () => number,
  ) {
    this.clock = new HybridClock(deviceId, clockState, now);
  }

  /** Create tables if needed and load the device id and clock. */
  static open(db: SqlDatabase, opts: { now?: () => number; deviceId?: string } = {}): LocalStore {
    for (const sql of SCHEMA) db.run(sql);
    const meta = (key: string) =>
      db.get<{ value: string }>("select value from sync_meta where key = ?", [key])?.value;
    const set = (key: string, value: string) =>
      db.run("insert or replace into sync_meta (key, value) values (?, ?)", [key, value]);

    set("schema_version", String(SCHEMA_VERSION));
    let deviceId = meta("device_id");
    if (!deviceId) {
      deviceId = opts.deviceId ?? uuidv7().replace(/-/g, "");
      set("device_id", deviceId);
    }
    const clockState = JSON.parse(meta("hlc_state") ?? '{"ms":0,"counter":0}') as HlcState;
    return new LocalStore(db, deviceId, clockState, opts.now ?? Date.now);
  }

  // ---------------------------------------------------------------------------
  // Reads
  // ---------------------------------------------------------------------------

  get<T extends Row = Row>(table: string, id: string): T | undefined {
    const r = this.db.get<{ data: string }>(
      "select data from sync_records where table_name = ? and id = ?",
      [table, id],
    );
    return r ? (JSON.parse(r.data) as T) : undefined;
  }

  list<T extends Row = Row>(
    table: string,
    opts: { companyId?: string; includeDeleted?: boolean } = {},
  ): T[] {
    const where = ["table_name = ?"];
    const params: unknown[] = [table];
    if (opts.companyId) {
      where.push("company_id = ?");
      params.push(opts.companyId);
    }
    if (!opts.includeDeleted) where.push("deleted = 0");
    return this.db
      .all<{ data: string }>(
        `select data from sync_records where ${where.join(" and ")} order by id`,
        params,
      )
      .map((r) => JSON.parse(r.data) as T);
  }

  // ---------------------------------------------------------------------------
  // Local writes: update the row and append to the outbox in one transaction.
  // ---------------------------------------------------------------------------

  /** Create a row offline. Returns its new id. */
  insert(table: string, companyId: string, values: Record<string, JsonValue>): string {
    const id = uuidv7(this.now());
    this.write(table, id, companyId, values);
    return id;
  }

  /** Change fields on a row (new or existing). */
  write(table: string, id: string, companyId: string, values: Record<string, JsonValue>): void {
    const keys = Object.keys(values);
    if (keys.length === 0) return;
    for (const k of keys) {
      if (SERVER_COLUMNS.has(k)) throw new Error(`${table}.${k} is managed by the server`);
    }

    this.db.transaction(() => {
      const hlc = this.clock.tick();
      const fields: Record<string, FieldChange> = {};
      for (const k of keys) fields[k] = { v: values[k] ?? null, hlc };

      const existing = this.get(table, id);
      if (existing && existing.company_id !== companyId) {
        throw new Error(`${table} ${id} belongs to another company`);
      }
      const row = { ...(existing ?? { id, company_id: companyId }), ...values } as Row;
      this.putRecord(table, row);

      this.db.run(
        `insert into sync_outbox (mutation_id, table_name, row_id, company_id, fields, created_at)
         values (?, ?, ?, ?, ?, ?)`,
        [uuidv7(this.now()), table, id, companyId, JSON.stringify(fields), this.now()],
      );
      this.saveClock();
    });
  }

  /** Soft delete, so the deletion syncs like any other change. */
  softDelete(table: string, id: string): void {
    const row = this.get(table, id);
    if (!row) throw new Error(`${table} ${id} not found`);
    this.write(table, id, row.company_id, { deleted_at: new Date(this.now()).toISOString() });
  }

  // ---------------------------------------------------------------------------
  // Outbox
  // ---------------------------------------------------------------------------

  pendingCount(): number {
    return (
      this.db.get<{ n: number }>("select count(*) as n from sync_outbox where status = 'pending'")
        ?.n ?? 0
    );
  }

  problems(): OutboxProblem[] {
    return this.db
      .all<OutboxRow & { last_error: string }>(
        "select * from sync_outbox where status = 'rejected' order by seq",
      )
      .map((r) => ({
        seq: r.seq,
        table: r.table_name,
        rowId: r.row_id,
        fields: Object.keys(JSON.parse(r.fields) as object),
        error: r.last_error,
      }));
  }

  /**
   * Pending changes merged per row (latest HLC wins per field), in the order rows were
   * first touched so parents are created before children.
   */
  pendingBatch(maxMutations: number): PendingBatch {
    const entries = this.db.all<OutboxRow>(
      "select seq, mutation_id, table_name, row_id, company_id, fields from sync_outbox where status = 'pending' order by seq",
    );
    const groups = new Map<string, { mutation: Mutation; seqs: number[] }>();
    for (const e of entries) {
      const key = `${e.table_name}\u0000${e.row_id}`;
      let g = groups.get(key);
      if (!g) {
        if (groups.size >= maxMutations) continue;
        g = {
          mutation: {
            id: e.mutation_id,
            table: e.table_name,
            row_id: e.row_id,
            company_id: e.company_id,
            fields: {},
          },
          seqs: [],
        };
        groups.set(key, g);
      }
      const fields = JSON.parse(e.fields) as Record<string, FieldChange>;
      for (const [k, change] of Object.entries(fields)) {
        const prev = g.mutation.fields[k];
        if (!prev || compareHlc(change.hlc, prev.hlc) > 0) g.mutation.fields[k] = change;
      }
      // The id of a merged mutation is its newest entry's id: retrying the same merge
      // reuses it, and new edits produce a new id.
      g.mutation.id = e.mutation_id;
      g.seqs.push(e.seq);
    }
    const seqsByMutation = new Map<string, number[]>();
    for (const g of groups.values()) seqsByMutation.set(g.mutation.id, g.seqs);
    return { mutations: [...groups.values()].map((g) => g.mutation), seqsByMutation };
  }

  /** Server accepted (or already had) these changes. */
  acknowledge(seqs: number[]): void {
    if (seqs.length === 0) return;
    this.db.run(`delete from sync_outbox where seq in (${seqs.map(() => "?").join(",")})`, seqs);
  }

  /** Server refused these changes. Kept for display; not retried. */
  reject(seqs: number[], error: string): void {
    if (seqs.length === 0) return;
    this.db.run(
      `update sync_outbox set status = 'rejected', last_error = ? where seq in (${seqs.map(() => "?").join(",")})`,
      [error, ...seqs],
    );
  }

  /** Network or server failure: keep the changes and count the attempt. */
  noteFailure(seqs: number[], error: string): void {
    if (seqs.length === 0) return;
    this.db.run(
      `update sync_outbox set attempts = attempts + 1, last_error = ? where seq in (${seqs.map(() => "?").join(",")})`,
      [error, ...seqs],
    );
  }

  /** Drop a rejected change and restore the server's value on the next pull. */
  discardProblem(seq: number): void {
    this.db.run("delete from sync_outbox where seq = ? and status = 'rejected'", [seq]);
    this.setCursor({});
  }

  // ---------------------------------------------------------------------------
  // Pull
  // ---------------------------------------------------------------------------

  getCursor(): PullCursor {
    const v = this.db.get<{ value: string }>(
      "select value from sync_meta where key = 'pull_cursor'",
    );
    return v ? (JSON.parse(v.value) as PullCursor) : {};
  }

  private setCursor(cursor: PullCursor): void {
    this.db.run("insert or replace into sync_meta (key, value) values ('pull_cursor', ?)", [
      JSON.stringify(cursor),
    ]);
  }

  /**
   * Apply one page of server rows and its cursor atomically. Pending local edits are laid
   * back over each row so unpushed work never disappears from the screen.
   */
  applyPage(page: PullPage): void {
    this.db.transaction(() => {
      for (const { table, row } of page.rows) {
        const pending = this.db.all<{ fields: string }>(
          "select fields from sync_outbox where table_name = ? and row_id = ? and status = 'pending' order by seq",
          [table, row.id],
        );
        const merged: Row = { ...row };
        for (const p of pending) {
          for (const [k, change] of Object.entries(
            JSON.parse(p.fields) as Record<string, FieldChange>,
          )) {
            merged[k] = change.v;
          }
        }
        this.putRecord(table, merged);
      }
      this.setCursor(page.cursor);
      this.receiveClock(page.server_hlc);
    });
  }

  receiveClock(hlc: string): void {
    this.clock.receive(hlc);
    this.saveClock();
  }

  private putRecord(table: string, row: Row): void {
    this.db.run(
      `insert into sync_records (table_name, id, company_id, data, deleted) values (?, ?, ?, ?, ?)
       on conflict (table_name, id) do update set company_id = excluded.company_id, data = excluded.data, deleted = excluded.deleted`,
      [table, row.id, row.company_id, JSON.stringify(row), row.deleted_at ? 1 : 0],
    );
  }

  private saveClock(): void {
    this.db.run("insert or replace into sync_meta (key, value) values ('hlc_state', ?)", [
      JSON.stringify(this.clock.state),
    ]);
  }

  /**
   * Remove all synced data, pending changes, uploads, and the pull cursor (sign-out).
   * Keeps the device id and clock. Callers must warn about unsent changes first.
   */
  clearAll(): void {
    this.db.transaction(() => {
      this.db.run("delete from sync_records");
      this.db.run("delete from sync_outbox");
      this.db.run("delete from upload_queue");
      this.db.run("delete from sync_meta where key = 'pull_cursor'");
    });
  }

  /** Low-level access for the upload queue (same database, same transactions). */
  get database(): SqlDatabase {
    return this.db;
  }
}
