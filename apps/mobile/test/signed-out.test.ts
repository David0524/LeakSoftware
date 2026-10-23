import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { LocalStore, type Uploader } from "@leakbook/sync";
import { memoryDb } from "../../../packages/sync/test/sqlite";

// The owner's phone (2026-10-22): the website's Sign Out ended every session, so the phone's
// calls reached Postgres without a user token ("permission denied for function sync_pull").
// The phone now refreshes once, then signs out here and shows Sign In, keeping its work for
// the same account.

vi.mock("react-native", () => ({
  AppState: { addEventListener: () => ({ remove() {} }), currentState: "active" },
}));
vi.mock("@react-native-community/netinfo", () => ({
  default: { addEventListener: () => () => {} },
}));
vi.mock("expo-file-system", () => ({ Paths: { availableDiskSpace: 1e12 } }));
vi.mock("../src/lib/media", () => ({ deleteAllMedia: () => {} }));
vi.mock("../src/lib/config", () => ({ API_URL: "https://sundeck.test" }));

const { SyncService } = await import("../src/lib/sync-service");
const { endSignIn, rememberSignIn, signedOutUser, signedInUser, SIGNED_OUT_USER_KEY } =
  await import("../src/lib/signedOut");

const DENIED = { message: "permission denied for function sync_pull", code: "42501" };
const COMPANY = "0190b6b0-0000-7000-8000-000000000001";

interface Server {
  /** What every sync call answers: an error, or null for an empty, finished page. */
  rpcError: { message: string; code?: string } | null;
  refresh: () => { data: { session: unknown }; error: unknown };
  refreshes: number;
  /** Holds sync_pull until released (a download still running). */
  hold?: Promise<void>;
}

function phone(server: Server) {
  const kv = new Map<string, string>();
  const keyValue = {
    get: (k: string) => kv.get(k) ?? null,
    set: (k: string, v: string) => void kv.set(k, v),
    remove: (k: string) => void kv.delete(k),
  };
  const supabase = {
    auth: {
      getSession: async () => ({ data: { session: { access_token: "t" } }, error: null }),
      refreshSession: async () => {
        server.refreshes += 1;
        return server.refresh();
      },
    },
    rpc: async (fn: string, args: { mutations?: { id: string }[] }) => {
      if (fn === "sync_pull" && server.hold) await server.hold;
      if (server.rpcError) return { data: null, error: server.rpcError };
      if (fn === "sync_push")
        return {
          data: {
            server_hlc: "1760000000000-0000-srv",
            results: (args.mutations ?? []).map((m) => ({ id: m.id, status: "applied" })),
          },
          error: null,
        };
      if (fn === "sync_pull")
        return {
          data: {
            rows: [],
            done: true,
            cursor: { from: "1" },
            server_hlc: "1760000000000-0000-srv",
          },
          error: null,
        };
      return { data: fn === "sync_scope" ? "" : null, error: null };
    },
    from: () => ({ select: async () => ({ data: [], error: null }) }),
  };
  const sync = new SyncService(
    LocalStore.open(memoryDb()),
    supabase as never as SupabaseClient,
    keyValue,
    { upload: async () => undefined } as never as Uploader,
  );
  const ended = vi.fn();
  sync.onSessionEnded = ended;
  return { sync, kv: keyValue, ended };
}

const refused = () => ({
  data: { session: null },
  error: {
    name: "AuthApiError",
    status: 400,
    message: "Invalid Refresh Token: Refresh Token Not Found",
  },
});

describe("a sign-in the server ended", () => {
  it("refreshes once, then signs out here and keeps the unsent change", async () => {
    const server: Server = { rpcError: DENIED, refresh: refused, refreshes: 0 };
    const { sync, ended } = phone(server);
    sync.insert("customer", COMPANY, { name: "Maria" });
    await sync.syncNow();
    expect(server.refreshes).toBe(1);
    expect(ended).toHaveBeenCalledTimes(1);
    expect(sync.status.phase).toBe("signed_out");
    expect(sync.status.error).toBeNull();
    expect(sync.status.pending).toBe(1);
    sync.stop();
  });

  it("keeps the sign-in when the refresh only lacked a connection", async () => {
    const server: Server = {
      rpcError: DENIED,
      refresh: () => ({
        data: { session: null },
        error: { name: "AuthRetryableFetchError", status: 0, message: "Network request failed" },
      }),
      refreshes: 0,
    };
    const { sync, ended } = phone(server);
    await sync.syncNow();
    expect(ended).not.toHaveBeenCalled();
    expect(sync.status.phase).toBe("offline");
    sync.stop();
  });

  it("syncs again when a fresh token works", async () => {
    const server: Server = {
      rpcError: DENIED,
      refresh: () => {
        server.rpcError = null;
        return { data: { session: { access_token: "fresh" } }, error: null };
      },
      refreshes: 0,
    };
    const { sync, ended } = phone(server);
    await sync.syncNow();
    expect(ended).not.toHaveBeenCalled();
    expect(sync.status.phase).toBe("idle");
    expect(sync.status.initialSyncDone).toBe(true);
    sync.stop();
  });

  it("never shows the database's message", async () => {
    const server: Server = {
      rpcError: DENIED,
      refresh: () => ({ data: { session: { access_token: "fresh" } }, error: null }),
      refreshes: 0,
    };
    const { sync, ended } = phone(server);
    await sync.syncNow();
    expect(ended).not.toHaveBeenCalled();
    expect(sync.status.phase).toBe("error");
    expect(sync.status.error).toBe(
      "The server didn’t accept this phone’s sign-in. Sign out and sign in again if this keeps happening.",
    );
    server.rpcError = { message: 'relation "job" does not exist' };
    await sync.syncNow();
    expect(sync.status.error).toBe(
      "Couldn’t sync with the server. Sundeck Pro will try again in a minute.",
    );
    sync.stop();
  });

  it("ignores a download still running when the phone signs out", async () => {
    let release = () => {};
    const server: Server = {
      rpcError: null,
      refresh: refused,
      refreshes: 0,
      hold: new Promise<void>((r) => (release = r)),
    };
    const { sync, ended } = phone(server);
    const running = sync.syncNow();
    await new Promise((r) => setTimeout(r, 0));
    sync.clearLocalData();
    server.rpcError = DENIED;
    release();
    await running;
    expect(ended).not.toHaveBeenCalled();
    expect(server.refreshes).toBe(0);
    expect(sync.status.phase).toBe("signed_out");
    expect(sync.status.initialSyncDone).toBe(false);
  });
});

describe("whose work stays on the phone", () => {
  const tech = { id: "u1", email: "tech@shop.test" };
  const other = { id: "u2", email: "other@shop.test" };

  it("keeps it for the same account and sends it after signing in", async () => {
    const server: Server = { rpcError: DENIED, refresh: refused, refreshes: 0 };
    const { sync, kv } = phone(server);
    rememberSignIn(kv, sync, tech);
    sync.insert("customer", COMPANY, { name: "Maria" });
    expect(endSignIn(kv, sync)).toEqual(tech);
    expect(signedInUser(kv)).toBeNull();
    expect(signedOutUser(kv)).toEqual(tech);
    rememberSignIn(kv, sync, tech);
    expect(kv.get(SIGNED_OUT_USER_KEY)).toBeNull();
    expect(sync.status.pending).toBe(1);
    server.rpcError = null;
    await sync.syncNow();
    expect(sync.status.pending).toBe(0);
    sync.stop();
  });

  it("clears it before another account signs in", () => {
    const { sync, kv } = phone({ rpcError: null, refresh: refused, refreshes: 0 });
    rememberSignIn(kv, sync, tech);
    sync.insert("customer", COMPANY, { name: "Maria" });
    endSignIn(kv, sync);
    rememberSignIn(kv, sync, other);
    expect(sync.status.pending).toBe(0);
    expect(sync.list("customer")).toEqual([]);
    expect(signedInUser(kv)).toEqual(other);
    expect(signedOutUser(kv)).toBeNull();
  });

  it("does nothing when nobody was signed in", () => {
    const { sync, kv } = phone({ rpcError: null, refresh: refused, refreshes: 0 });
    expect(endSignIn(kv, sync)).toBeNull();
    expect(signedOutUser(kv)).toBeNull();
  });
});
