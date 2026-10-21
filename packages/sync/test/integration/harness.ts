import { randomUUID } from "node:crypto";
import pg from "pg";
import {
  LocalStore,
  SyncEngine,
  type Mutation,
  type PullCursor,
  type PullPage,
  type PushResponse,
  type SyncTransport,
} from "../../src";
import { memoryDb } from "../sqlite";

const url = process.env.SYNC_TEST_DATABASE_URL;
if (!url) throw new Error("SYNC_TEST_DATABASE_URL is not set; run through `pnpm test:db`");

export const pool = new pg.Pool({ connectionString: url, max: 6 });

export interface TestUser {
  id: string;
  email: string;
}

/** One API request as a signed-in user, like PostgREST: a transaction in the authenticated role. */
export async function asUser<T>(user: TestUser, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query("set local role authenticated");
    await c.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: user.id, role: "authenticated", email: user.email }),
    ]);
    const result = await fn(c);
    await c.query("commit");
    return result;
  } catch (e) {
    await c.query("rollback");
    throw e;
  } finally {
    c.release();
  }
}

export class PgTransport implements SyncTransport {
  /** Apply the push on the server, then throw as if the response was lost. */
  loseNextResponse = false;
  /** Fail before reaching the server. */
  offline = false;

  constructor(private readonly user: TestUser) {}

  async push(mutations: Mutation[], deviceId: string): Promise<PushResponse> {
    if (this.offline) throw new Error("offline");
    const res = await asUser(this.user, (c) =>
      c.query<{ r: PushResponse }>("select sync_push($1::jsonb, $2) as r", [
        JSON.stringify(mutations),
        deviceId,
      ]),
    );
    if (this.loseNextResponse) {
      this.loseNextResponse = false;
      throw new Error("connection reset");
    }
    return res.rows[0]!.r;
  }

  async pull(cursor: PullCursor, pageSize: number): Promise<PullPage> {
    if (this.offline) throw new Error("offline");
    const res = await asUser(this.user, (c) =>
      c.query<{ r: PullPage }>("select sync_pull($1::jsonb, $2) as r", [
        JSON.stringify(cursor),
        pageSize,
      ]),
    );
    return res.rows[0]!.r;
  }

  async scope(): Promise<string> {
    const res = await asUser(this.user, (c) => c.query<{ s: string }>("select sync_scope() as s"));
    return res.rows[0]!.s;
  }
}

export interface Device {
  name: string;
  store: LocalStore;
  transport: PgTransport;
  engine: SyncEngine;
}

export function device(name: string, user: TestUser, pullPage = 500): Device {
  const store = LocalStore.open(memoryDb(), { deviceId: name });
  const transport = new PgTransport(user);
  return { name, store, transport, engine: new SyncEngine(store, transport, { pullPage }) };
}

export interface TestCompany {
  id: string;
  owner: TestUser;
  tech: TestUser;
  returnTypeId: string;
  pressureTypeId: string;
}

async function createUser(label: string): Promise<TestUser> {
  const email = `${label}-${randomUUID().slice(0, 8)}@sync.test`;
  const r = await pool.query<{ id: string }>(
    "insert into auth.users (id, email) values (gen_random_uuid(), $1) returning id",
    [email],
  );
  return { id: r.rows[0]!.id, email };
}

/** A fresh company through the real signup function, plus a tech. */
export async function createCompany(): Promise<TestCompany> {
  const owner = await createUser("owner");
  const tech = await createUser("tech");
  const id = await asUser(owner, async (c) => {
    const r = await c.query<{ id: string }>("select create_company('Sync Test Co') as id");
    return r.rows[0]!.id;
  });
  await pool.query("insert into membership (company_id, user_id, role) values ($1, $2, 'tech')", [
    id,
    tech.id,
  ]);
  // The scenarios have the tech work on jobs nobody is assigned to, so the shop lets techs see
  // every job (new shops start with only their own, 2026-10-20).
  await pool.query(
    `update company set settings = settings || '{"techs_see_all_jobs": true}' where id = $1`,
    [id],
  );
  const types = await pool.query<{ key: string; id: string }>(
    "select key, id from component_type where company_id = $1 union all select key, id from test_type where company_id = $1",
    [id],
  );
  const byKey = Object.fromEntries(types.rows.map((r) => [r.key, r.id]));
  return { id, owner, tech, returnTypeId: byKey.return!, pressureTypeId: byKey.pressure! };
}

const SERVER_ONLY = new Set(["field_hlc", "sync_xid", "created_at", "updated_at"]);

/** Server row with bookkeeping removed, as phones store it. */
export async function serverRow(
  table: string,
  id: string,
): Promise<Record<string, unknown> | undefined> {
  const r = await pool.query<{ row: Record<string, unknown> }>(
    `select to_jsonb(t) as row from public.${pg.escapeIdentifier(table)} t where id = $1`,
    [id],
  );
  const row = r.rows[0]?.row;
  if (!row) return undefined;
  return Object.fromEntries(Object.entries(row).filter(([k]) => !SERVER_ONLY.has(k)));
}

/** Phone row in the same shape as serverRow. */
export function localRow(
  d: Device,
  table: string,
  id: string,
): Record<string, unknown> | undefined {
  const row = d.store.get(table, id);
  if (!row) return undefined;
  return Object.fromEntries(Object.entries(row).filter(([k]) => !SERVER_ONLY.has(k)));
}
