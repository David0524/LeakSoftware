import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { LocalStore, type Uploader } from "@leakbook/sync";
import type { ComponentType, Media, ServiceIssue } from "@leakbook/core";
import { memoryDb } from "../../../packages/sync/test/sqlite";

// Service issues (docs/design/2026-11-16-service-issues.md): a tech reports one on a visit, the
// office makes a job of it, all on the phone first (row + outbox), in the order the server needs.

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

const store = LocalStore.open(memoryDb());
const kv = new Map<string, string>();
const sync = new SyncService(
  store,
  { auth: { getSession: async () => ({ data: { session: null } }) } } as never as SupabaseClient,
  {
    get: (k) => kv.get(k) ?? null,
    set: (k, v) => void kv.set(k, v),
    remove: (k) => void kv.delete(k),
  },
  {} as Uploader,
);
vi.mock("../src/lib/services", () => ({ getServices: () => ({ sync }) }));
const { convertIssue, reopenIssue, resolveIssue, saveIssue } = await import("../src/data/issues");

const company = "0190b6b0-0000-7000-8000-000000000001";
const visit = "0190b6b0-0000-7000-8000-000000000002";
const customer = "0190b6b0-0000-7000-8000-000000000003";
const pool = "0190b6b0-0000-7000-8000-000000000004";

const outbox = () =>
  store.database.all<{ table_name: string; row_id: string; fields: string }>(
    "select table_name, row_id, fields from sync_outbox order by seq",
  );

describe("service issues on the phone", () => {
  it("reports, resolves, reopens, and makes a job with the photos, in order", () => {
    const id = saveIssue(company, {
      customerId: customer,
      propertyId: pool,
      jobId: visit,
      description: " Cracked skimmer throat ",
      suggested: "repair",
      userId: "tech",
    });
    const saved = sync.get<ServiceIssue & Record<string, never>>("service_issue", id)!;
    expect(saved).toMatchObject({
      customer_id: customer,
      property_id: pool,
      job_id: visit,
      description: "Cracked skimmer throat",
      suggested_type: "repair",
      reported_by: "tech",
    });
    // A photo taken on the visit, linked to the issue.
    sync.write("media", "0190b6b0-0000-7000-8000-0000000000aa", company, {
      job_id: visit,
      service_issue_id: id,
      kind: "photo",
      storage_path: `${company}/${visit}/a.jpg`,
      upload_state: "pending",
      captured_at: "2026-11-16T15:00:00Z",
    });

    resolveIssue(company, id, "owner", "Customer will call back");
    expect(sync.get("service_issue", id)).toMatchObject({
      status: "resolved",
      resolution_note: "Customer will call back",
      resolved_by: "owner",
    });
    reopenIssue(company, id);
    expect(sync.get("service_issue", id)).toMatchObject({ status: "open", resolved_by: null });

    const before = outbox().length;
    const issue = sync.get("service_issue", id) as unknown as ServiceIssue;
    const media = sync.list("media", company, visit) as unknown as Media[];
    const types = [
      {
        id: "ct-skimmer",
        key: "skimmer",
        name: "Skimmer",
        job_type: "detection",
        active: true,
        allows_multiple: true,
        default_count: 1,
        applies_to: "pool",
        sort_order: 1,
      },
    ] as unknown as ComponentType[];
    const job = convertIssue(sync, company, {
      issue,
      media,
      type: "detection",
      userId: "owner",
      componentTypes: types,
      pool: { has_spa: false, pool_type: "gunite_plaster" },
    });
    // The job, then the issue, then the photo's copy, then the checklist.
    const writes = outbox().slice(before);
    expect(writes.map((w) => w.table_name)).toEqual([
      "job",
      "service_issue",
      "media",
      "job_component",
      "checklist_item_result",
    ]);
    expect(sync.get("job", job)).toMatchObject({
      type: "detection",
      property_id: pool,
      bill_to_customer_id: customer,
      status: "unscheduled",
      summary_notes: "Cracked skimmer throat",
    });
    expect(sync.get("service_issue", id)).toMatchObject({
      status: "converted",
      converted_job_id: job,
    });
    const copy = sync.list("media", company, job)[0]!;
    expect(copy).toMatchObject({
      job_id: job,
      service_issue_id: id,
      storage_path: `${company}/${visit}/a.jpg`,
      upload_state: "pending",
    });
  });
});
