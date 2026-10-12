import type { Mutation, PullCursor, PullPage, PushResponse, SyncTransport } from "./types";

/** The slice of a Supabase client this transport uses (keeps supabase-js out of this package). */
export interface RpcClient {
  rpc(
    fn: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

/** Sync over Supabase RPC: public.sync_push and public.sync_pull. */
export class SupabaseTransport implements SyncTransport {
  constructor(private readonly client: RpcClient) {}

  async push(mutations: Mutation[], deviceId: string): Promise<PushResponse> {
    const { data, error } = await this.client.rpc("sync_push", { mutations, device_id: deviceId });
    if (error) throw new Error(error.message);
    return data as PushResponse;
  }

  async pull(cursor: PullCursor, pageSize: number): Promise<PullPage> {
    const { data, error } = await this.client.rpc("sync_pull", { cursor, page_size: pageSize });
    if (error) throw new Error(error.message);
    return data as PullPage;
  }
}
