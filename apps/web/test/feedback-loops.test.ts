import { beforeEach, describe, expect, it, vi } from "vitest";
import Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";

// Feedback loops (owner, 2026-10-22): a payment and a report's first open are told once, to
// the job's techs and the owners and admins; the preferences route keeps choices it isn't sent.

const notify = vi.fn(async (...args: unknown[]) => ({ sent: args.length ? 1 : 0 }));
vi.mock("../src/server/push", () => ({
  notify: (...args: unknown[]) => notify(...args),
  jobTechs: async () => ["tech-1", "tech-2"],
  shopManagers: async () => ["owner-1", "tech-1"],
}));

const { applyEvent, verifyEvent } = await import("../src/server/stripe");
const { notifyReportOpened } = await import("../src/server/notify-events");

const SECRET = "whsec_unit_test";

/**
 * A database that mimics the event log, the payment record, and the once-only claims
 * (claim_payment_notification and record_report_opened answer once per payment or report).
 */
function fakeDb() {
  const seen = new Set<string>();
  const claimed = new Set<string>();
  const db = {
    from: () => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        single: async () => ({ data: { settings: {} }, error: null }),
      };
      return chain;
    },
    async rpc(fn: string, args: Record<string, unknown>) {
      switch (fn) {
        case "stripe_event_seen":
          return { data: seen.has(args.event_id as string), error: null };
        case "stripe_claim_event":
          seen.add(args.event_id as string);
          return { data: true, error: null };
        case "stripe_record_invoice_payment":
          return { data: { paid_now: false }, error: null };
        case "stripe_record_quote_payment":
          return { data: "succeeded", error: null };
        case "claim_payment_notification": {
          const key = `pay:${args.session_id as string}`;
          if (claimed.has(key)) return { data: null, error: null };
          claimed.add(key);
          return {
            data: {
              company_id: "c1",
              job_id: "j1",
              invoice_id: "i1",
              quote_id: null,
              invoice_number: 1042,
              amount_cents: 65000,
              customer_name: "Rebecca Soto",
            },
            error: null,
          };
        }
        case "record_report_opened": {
          const key = `open:${args.link_token as string}`;
          if (claimed.has(key) || args.link_token === "bad") return { data: null, error: null };
          claimed.add(key);
          return {
            data: {
              company_id: "c1",
              job_id: "j1",
              report_id: "r1",
              customer_name: "Rebecca Soto",
            },
            error: null,
          };
        }
        default:
          return { data: null, error: null };
      }
    },
  };
  return db as unknown as SupabaseClient;
}

function invoicePaid(eventId: string, sessionId = "cs_1") {
  const payload = JSON.stringify({
    id: eventId,
    object: "event",
    type: "checkout.session.completed",
    account: "acct_shop",
    data: {
      object: {
        id: sessionId,
        object: "checkout.session",
        payment_status: "paid",
        amount_total: 65_000,
        payment_intent: "pi_1",
        metadata: { kind: "invoice_payment", invoice_id: "i1", company_id: "c1" },
      },
    },
  });
  const header = Stripe.webhooks.generateTestHeaderString({ payload, secret: SECRET });
  return verifyEvent(payload, header, [SECRET]);
}

describe("a payment's notification", () => {
  beforeEach(() => notify.mockClear());

  it("goes to the job's techs and the owners and admins, once, with the amount", async () => {
    const db = fakeDb();
    expect(await applyEvent(invoicePaid("evt_1"), db)).toBe("applied");
    expect(notify).toHaveBeenCalledTimes(1);
    const [, input] = notify.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(input.kind).toBe("payment");
    expect(input.text).toEqual({
      title: "Payment received",
      body: "Rebecca Soto paid $650.00 (invoice 1042).",
    });
    expect(input.userIds).toEqual(["tech-1", "tech-2", "owner-1", "tech-1"]);
    expect(input.data).toEqual({ job: "j1", invoice: "i1" });
  });

  it("isn't sent again when Stripe retries the event", async () => {
    const db = fakeDb();
    await applyEvent(invoicePaid("evt_1"), db);
    expect(await applyEvent(invoicePaid("evt_1"), db)).toBe("duplicate");
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it("isn't sent twice for one payment, even from two events (or two deliveries at once)", async () => {
    const db = fakeDb();
    await Promise.all([applyEvent(invoicePaid("evt_1"), db), applyEvent(invoicePaid("evt_2"), db)]);
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it("is sent for each payment", async () => {
    const db = fakeDb();
    await applyEvent(invoicePaid("evt_1", "cs_1"), db);
    await applyEvent(invoicePaid("evt_2", "cs_2"), db);
    expect(notify).toHaveBeenCalledTimes(2);
  });
});

describe("a report's first open", () => {
  beforeEach(() => notify.mockClear());

  it("tells the job's techs and the owners and admins, then never again", async () => {
    const db = fakeDb();
    await notifyReportOpened(db, "tok");
    await notifyReportOpened(db, "tok");
    await notifyReportOpened(db, "tok");
    expect(notify).toHaveBeenCalledTimes(1);
    const [, input] = notify.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(input).toMatchObject({
      kind: "opened",
      text: { title: "Report opened", body: "Rebecca Soto opened the report." },
      data: { job: "j1" },
    });
  });

  it("says nothing for a link that doesn't work, and never throws", async () => {
    await notifyReportOpened(fakeDb(), "bad");
    await notifyReportOpened(
      {
        rpc: () => {
          throw new Error("down");
        },
      } as never,
      "tok",
    );
    expect(notify).not.toHaveBeenCalled();
  });
});

describe("PUT /api/push/preferences", () => {
  it("changes what's sent and keeps the rest (an older app never resets the weekly summary)", async () => {
    let saved: unknown = null;
    vi.doMock("@/server/bearer", () => ({
      jsonError: (m: string, s: number) => Response.json({ error: m }, { status: s }),
      bearerSession: async () => ({
        userId: "u1",
        db: {
          from: () => {
            const chain = {
              select: () => chain,
              eq: () => chain,
              maybeSingle: async () => ({
                data: { notification_prefs: { weekly: false, text: false, junk: 1 } },
              }),
              update: (v: { notification_prefs: unknown }) => {
                saved = v.notification_prefs;
                return chain;
              },
              then: (ok: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(ok),
            };
            return chain;
          },
        },
      }),
    }));
    const { PUT } = await import("../src/app/api/push/preferences/route");
    const res = await PUT(
      new Request("http://x/api/push/preferences", {
        method: "PUT",
        body: JSON.stringify({ prefs: { opened: false, text: true, bogus: false } }),
      }),
    );
    expect(res.status).toBe(200);
    expect(saved).toEqual({ weekly: false, text: true, opened: false });
  });
});
