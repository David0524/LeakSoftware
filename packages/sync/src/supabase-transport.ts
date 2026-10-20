import { AuthError, isAuthFailure } from "./errors";
import type { Mutation, PullCursor, PullPage, PushResponse, SyncTransport } from "./types";

/** The slice of a Supabase client this transport uses (keeps supabase-js out of this package). */
export interface RpcClient {
  rpc(
    fn: string,
    args: Record<string, unknown>,
  ): PromiseLike<{
    data: unknown;
    error: { message: string; code?: string; status?: number } | null;
  }>;
}

/**
 * Sync over Supabase RPC: public.sync_push, public.sync_pull, public.sync_scope, and
 * public.sync_pull_count (the first download's progress).
 */
export class SupabaseTransport implements SyncTransport {
  constructor(private readonly client: RpcClient) {}

  async push(mutations: Mutation[], deviceId: string): Promise<PushResponse> {
    const { data, error } = await this.client.rpc("sync_push", { mutations, device_id: deviceId });
    if (error) throw failure(error);
    return data as PushResponse;
  }

  async pull(cursor: PullCursor, pageSize: number): Promise<PullPage> {
    const { data, error } = await this.client.rpc("sync_pull", { cursor, page_size: pageSize });
    if (error) throw failure(error);
    return data as PullPage;
  }

  /** Rows per table this user will download; null on any failure (never fails a sync). */
  async count(): Promise<Record<string, number> | null> {
    try {
      const { data, error } = await this.client.rpc("sync_pull_count", {});
      if (error || !data || typeof data !== "object" || Array.isArray(data)) return null;
      const totals: Record<string, number> = {};
      for (const [table, n] of Object.entries(data as Record<string, unknown>)) {
        const v = Number(n);
        if (Number.isFinite(v) && v >= 0) totals[table] = v;
      }
      return totals;
    } catch {
      return null;
    }
  }

  async scope(): Promise<string> {
    const { data, error } = await this.client.rpc("sync_scope", {});
    if (error) throw failure(error);
    return String(data ?? "");
  }
}

/** A signed-out user gets AuthError (sign in again); anything else is retried later. */
function failure(error: { message: string; code?: string; status?: number }): Error {
  return isAuthFailure(error) ? new AuthError(error.message) : new Error(error.message);
}
