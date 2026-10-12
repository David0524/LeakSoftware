import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { newJobRecords } from "@leakbook/core";
import { LocalStore, SupabaseTransport, SyncEngine } from "../../src";
import { memoryDb } from "../sqlite";

const config = JSON.parse(
  readFileSync(join(import.meta.dirname, "../../../../config/supabase-dev.json"), "utf8"),
) as { url: string; publishableKey: string };

async function signedInDevice(deviceId: string) {
  const client = createClient(config.url, config.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await client.auth.signInWithPassword({
    email: "tech@demo.leakbook.test",
    password: "leakbook-demo",
  });
  if (error) throw error;
  const store = LocalStore.open(memoryDb(), { deviceId });
  return { client, store, engine: new SyncEngine(store, new SupabaseTransport(client)) };
}

describe("hosted dev project", () => {
  it("syncs between two devices through supabase-js", async () => {
    const a = await signedInDevice("hostedA");
    const b = await signedInDevice("hostedB");

    const first = await a.engine.sync();
    expect(first.error).toBeUndefined();
    const company = a.store.list("company")[0];
    expect(company?.name).toBe("Demo Leak Co.");

    const name = `Hosted smoke ${new Date().toISOString()}`;
    const id = a.store.insert("customer", company!.id, { name, phone: "555-0100" });
    const pushed = await a.engine.sync();
    expect(pushed).toMatchObject({ pushed: 1, rejected: 0, pending: 0 });

    await b.engine.sync();
    expect(b.store.get("customer", id)?.name).toBe(name);

    // The exact records the New job screen writes are accepted by the server.
    const blank = {
      customerName: "",
      customerPhone: "",
      customerEmail: "",
      addressLine1: "",
      city: "",
      state: "",
      postalCode: "",
      scheduleDate: "",
      scheduleTime: "",
    };
    const me = (await a.client.auth.getUser()).data.user!.id;
    for (const timing of [
      { kind: "now" as const, at: new Date() },
      {
        kind: "scheduled" as const,
        date: "2030-01-15",
        time: "09:30",
        timeZone: "America/Phoenix",
      },
    ]) {
      const r = newJobRecords(
        {
          ...blank,
          customerName: "Hosted job test",
          customerPhone: "555-0101",
          addressLine1: "1 Smoke Test Ln",
          state: "az",
        },
        {
          poolType: "fiberglass",
          hasSpa: true,
          accessNotes: "gate 1234",
          timing,
          assignedUserId: me,
        },
      );
      const ids = a.store.database.transaction(() => {
        const cust = a.store.insert("customer", company!.id, r.customer!);
        const prop = a.store.insert("property", company!.id, { ...r.property!, customer_id: cust });
        const job = a.store.insert("job", company!.id, {
          ...r.job,
          property_id: prop,
          bill_to_customer_id: cust,
        });
        return { cust, prop, job };
      });
      const s = await a.engine.sync();
      expect(s, JSON.stringify(a.store.problems())).toMatchObject({
        pushed: 3,
        rejected: 0,
        pending: 0,
      });
      expect(a.store.get("job", ids.job)?.number).toEqual(expect.any(Number));
      for (const [t, id] of [
        ["job", ids.job],
        ["property", ids.prop],
        ["customer", ids.cust],
      ] as const) {
        a.store.softDelete(t, id);
      }
      await a.engine.sync();
    }

    // Clean up: tombstone the test row and check it syncs.
    a.store.softDelete("customer", id);
    await a.engine.sync();
    await b.engine.sync();
    expect(b.store.get("customer", id)?.deleted_at).toBeTruthy();
  });
});
