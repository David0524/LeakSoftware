import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { LocalStore, type Uploader } from "@leakbook/sync";
import { memoryDb } from "../../../packages/sync/test/sqlite";

// Signing out (or a different person signing in) leaves nothing of the last person's to send.

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

describe("clearing this phone's data", () => {
  it("forgets the report requests and visit reports waiting to send", () => {
    const kv = new Map<string, string>();
    const service = new SyncService(
      LocalStore.open(memoryDb()),
      {
        auth: { getSession: async () => ({ data: { session: null } }) },
      } as never as SupabaseClient,
      {
        get: (k) => kv.get(k) ?? null,
        set: (k, v) => void kv.set(k, v),
        remove: (k) => void kv.delete(k),
      },
      {} as Uploader,
    );
    kv.set(
      "report_request:queue",
      JSON.stringify([{ kind: "email", reportId: "r1", jobId: "j1", to: "a@b.co" }]),
    );
    kv.set("visit_report:queue", JSON.stringify(["j1"]));
    service.clearLocalData();
    expect(kv.get("report_request:queue")).toBeUndefined();
    expect(kv.get("visit_report:queue")).toBeUndefined();
  });

  it("forgets typed text kept as drafts (owner, 2026-10-27)", () => {
    const kv = new Map<string, string>();
    const service = new SyncService(
      LocalStore.open(memoryDb()),
      {
        auth: { getSession: async () => ({ data: { session: null } }) },
      } as never as SupabaseClient,
      {
        get: (k) => kv.get(k) ?? null,
        set: (k, v) => void kv.set(k, v),
        remove: (k) => void kv.delete(k),
      },
      {} as Uploader,
    );
    kv.set("draft:u1:finding:new-j1", JSON.stringify({ v: 1, at: Date.now(), fields: { a: "x" } }));
    kv.set("drafts:index", JSON.stringify(["draft:u1:finding:new-j1"]));
    service.clearLocalData();
    expect(kv.get("draft:u1:finding:new-j1")).toBeUndefined();
    expect(kv.get("drafts:index")).toBeUndefined();
  });

  it("knows when a job's signature image or photo is still waiting to upload", () => {
    const kv = new Map<string, string>();
    const service = new SyncService(
      LocalStore.open(memoryDb()),
      {
        auth: { getSession: async () => ({ data: { session: null } }) },
      } as never as SupabaseClient,
      {
        get: (k) => kv.get(k) ?? null,
        set: (k, v) => void kv.set(k, v),
        remove: (k) => void kv.delete(k),
      },
      {} as Uploader,
    );
    const company = "0190b6b0-0000-7000-8000-000000000001";
    expect(service.hasPendingUploads("j1")).toBe(false);
    service.addSignature(
      "0190b6b0-0000-7000-8000-0000000000a1",
      company,
      { job_id: "j1", signer_name: "Pat", purpose: "report" },
      { localPath: "sig.svg", storagePath: "c/sig.svg" },
    );
    service.addMedia(
      "0190b6b0-0000-7000-8000-0000000000b1",
      company,
      { job_id: "j2", kind: "photo" },
      { localPath: "p.jpg", storagePath: "c/p.jpg", mimeType: "image/jpeg" },
    );
    expect(service.hasPendingUploads("j1")).toBe(true);
    expect(service.hasPendingUploads("j2")).toBe(true);
    expect(service.hasPendingUploads("j3")).toBe(false);
    service.stop();
  });
});
