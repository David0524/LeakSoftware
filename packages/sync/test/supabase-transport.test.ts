import { describe, expect, it } from "vitest";
import { SupabaseTransport, type RpcClient } from "../src";

describe("SupabaseTransport", () => {
  it("calls the sync functions with named arguments", async () => {
    const calls: [string, Record<string, unknown>][] = [];
    const client: RpcClient = {
      rpc: async (fn, args) => {
        calls.push([fn, args]);
        return { data: { ok: fn }, error: null };
      },
    };
    const t = new SupabaseTransport(client);
    await t.push([], "dev1");
    await t.pull({ from: "5" }, 100);
    expect(calls).toEqual([
      ["sync_push", { mutations: [], device_id: "dev1" }],
      ["sync_pull", { cursor: { from: "5" }, page_size: 100 }],
    ]);
  });

  it("turns API errors into exceptions so changes stay queued", async () => {
    const t = new SupabaseTransport({
      rpc: async () => ({ data: null, error: { message: "JWT expired" } }),
    });
    await expect(t.push([], "d")).rejects.toThrow("JWT expired");
  });
});
