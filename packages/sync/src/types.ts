/** Wire types shared with the sync_push / sync_pull Postgres functions. */

export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export type Row = Record<string, JsonValue> & { id: string; company_id: string };

export interface FieldChange {
  v: JsonValue;
  hlc: string;
}

export interface Mutation {
  id: string;
  table: string;
  row_id: string;
  company_id: string;
  fields: Record<string, FieldChange>;
}

export type MutationStatus = "applied" | "partial" | "stale" | "duplicate" | "rejected";

export interface MutationResult {
  id: string;
  status: MutationStatus;
  lost?: string[];
  code?: string;
  error?: string;
}

export interface PushResponse {
  server_hlc: string;
  results: MutationResult[];
}

/**
 * The server's pull cursor, passed back as it came. `first` marks a first download's pages
 * (20261022001900_first_download.sql): the server leaves out deleted rows until it's done, and
 * its `after` carries the table's place in the download as a fourth item.
 */
export interface PullCursor {
  from?: string;
  high?: string;
  after?: [string, string, string] | [string, string, string, number];
  first?: boolean;
}

export interface PulledRow {
  table: string;
  xid: string;
  row: Row;
}

export interface PullPage {
  rows: PulledRow[];
  done: boolean;
  cursor: PullCursor;
  server_hlc: string;
}

/** How the engine reaches the server. The app uses Supabase RPC; tests use pg directly. */
export interface SyncTransport {
  push(mutations: Mutation[], deviceId: string): Promise<PushResponse>;
  pull(cursor: PullCursor, pageSize: number): Promise<PullPage>;
  /**
   * What this user may see (public.sync_scope). When it changes, for example a job was taken
   * away from them, the engine pulls everything again and drops what is no longer theirs.
   */
  scope?(): Promise<string>;
  /**
   * How many rows this user will download, per table (public.sync_pull_count), for the first
   * download's progress. Null when the server can't say (an older server, offline): the download
   * goes on without a number.
   */
  count?(): Promise<Record<string, number> | null>;
}
