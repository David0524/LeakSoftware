import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { Followup } from "@leakbook/core";
import { runFollowups, type FollowupIo } from "../src/server/followups";

// The daily follow-ups' choices (text reminders and feedback screening, 2026-11-16): which
// channel goes, who is left out (STOP, no number, no line), and that nothing goes twice. The
// database decides what is due (supabase/tests/894_feedback_and_text_reminders.test.sql, which
// also covers open-complaint suppression); this checks what the server does with it.

const base: Followup = {
  company_id: "co",
  job_id: "job",
  quote_id: null,
  invoice_id: "inv",
  template: "invoice_reminder_7",
  number: 1042,
  amount_cents: 35_000,
  token: "tok",
  channel: "email",
  feedback_first: true,
  sent_channels: [],
  customer: { name: "Sam", email: "sam@example.com", phone: "(602) 555-0199", cc_emails: [] },
  company: { name: "Demo Pools", email: "office@example.com", phone: null, review_url: null },
};

/** A stand-in for the service-role client: records the message log, answers what is due. */
function fakeDb(due: Followup[], claimed: (c: Record<string, unknown>) => boolean = () => true) {
  const log: { insert: Record<string, unknown>; update?: Record<string, unknown> }[] = [];
  const db = {
    rpc: async () => ({ data: due, error: null }),
    from: () => ({
      insert: (row: Record<string, unknown>) => ({
        select: () => ({
          single: async () => {
            if (!claimed(row)) return { data: null, error: { code: "23505" } };
            log.push({ insert: row });
            return { data: { id: `m${log.length}` }, error: null };
          },
        }),
      }),
      update: (patch: Record<string, unknown>) => ({
        eq: async (_: string, id: string) => {
          log[Number(id.slice(1)) - 1]!.update = patch;
          return { error: null };
        },
      }),
    }),
  };
  return { db: db as unknown as SupabaseClient, log };
}

function io(over: Partial<FollowupIo> = {}) {
  const emails: string[] = [];
  const texts: { phone: string; body: string; jobId: string }[] = [];
  const full: FollowupIo = {
    emailReady: () => true,
    sendEmail: async (m) => {
      emails.push(m.to);
      return { id: "e1" };
    },
    hasLine: async () => true,
    optedOut: async () => new Set(),
    sendText: async (_db, m) => {
      texts.push({ phone: m.phone, body: m.body, jobId: m.jobId });
      return { id: "t1" };
    },
    ...over,
  };
  return { io: full, emails, texts };
}

const at = new Date("2026-11-16T15:00:00Z");

describe("the daily follow-ups", () => {
  it("send email only, as before, when the shop's channel is email", async () => {
    const { db, log } = fakeDb([base]);
    const t = io();
    const run = await runFollowups(db, "https://app.test", at, t.io);
    expect(t.emails).toEqual(["sam@example.com"]);
    expect(t.texts).toEqual([]);
    expect(run).toMatchObject({ due: 1, sent: 1, failed: 0, skipped: 0 });
    expect(log[0]!.insert).toMatchObject({ channel: "email", template: "invoice_reminder_7" });
    expect(log[0]!.update).toMatchObject({ status: "sent", provider_id: "e1" });
  });

  it("send a text from the shop's number, with the pay link, when the channel is text", async () => {
    const { db, log } = fakeDb([{ ...base, channel: "text" }]);
    const t = io();
    const run = await runFollowups(db, "https://app.test", at, t.io);
    expect(t.emails).toEqual([]);
    expect(t.texts).toEqual([
      {
        phone: "+16025550199",
        jobId: "job",
        body: "Demo Pools: a reminder that $350.00 is still due on your invoice #1042. Pay online: https://app.test/i/tok",
      },
    ]);
    expect(run.sent).toBe(1);
    expect(log[0]!.insert).toMatchObject({ channel: "sms", recipient: "+16025550199" });
  });

  it("send both, each claimed in its own channel, when the channel is both", async () => {
    const { db, log } = fakeDb([{ ...base, channel: "both" }]);
    const t = io();
    const run = await runFollowups(db, "https://app.test", at, t.io);
    expect(t.emails).toHaveLength(1);
    expect(t.texts).toHaveLength(1);
    expect(log.map((l) => l.insert.channel)).toEqual(["email", "sms"]);
    expect(run.sent).toBe(2);
  });

  it("send only the channel that hasn't gone for the step", async () => {
    const { db } = fakeDb([{ ...base, channel: "both", sent_channels: ["email"] }]);
    const t = io();
    await runFollowups(db, "https://app.test", at, t.io);
    expect(t.emails).toEqual([]);
    expect(t.texts).toHaveLength(1);
  });

  it("don't text a customer who replied STOP, and log nothing for it", async () => {
    const { db, log } = fakeDb([{ ...base, channel: "text" }]);
    const t = io({ optedOut: async () => new Set(["+16025550199"]) });
    const run = await runFollowups(db, "https://app.test", at, t.io);
    expect(t.texts).toEqual([]);
    expect(log).toEqual([]);
    expect(run).toMatchObject({ sent: 0, skipped: 1 });
  });

  it("still emails a customer who replied STOP to texts, when the channel is both", async () => {
    const { db } = fakeDb([{ ...base, channel: "both" }]);
    const t = io({ optedOut: async () => new Set(["+16025550199"]) });
    await runFollowups(db, "https://app.test", at, t.io);
    expect(t.emails).toHaveLength(1);
    expect(t.texts).toEqual([]);
  });

  it("don't text without a working company number or a mobile number", async () => {
    const noLine = fakeDb([{ ...base, channel: "text" }]);
    const a = io({ hasLine: async () => false });
    await runFollowups(noLine.db, "https://app.test", at, a.io);
    expect(a.texts).toEqual([]);

    const noPhone = fakeDb([
      { ...base, channel: "text", customer: { ...base.customer, phone: "12345" } },
    ]);
    const b = io();
    await runFollowups(noPhone.db, "https://app.test", at, b.io);
    expect(b.texts).toEqual([]);
  });

  it("reach a customer with no email by text, and skip the email", async () => {
    const { db } = fakeDb([
      { ...base, channel: "both", customer: { ...base.customer, email: "" } },
    ]);
    const t = io();
    await runFollowups(db, "https://app.test", at, t.io);
    expect(t.emails).toEqual([]);
    expect(t.texts).toHaveLength(1);
  });

  it("keep texting when the mailer isn't set up, and email nothing", async () => {
    const { db } = fakeDb([{ ...base, channel: "both" }]);
    const t = io({ emailReady: () => false });
    await runFollowups(db, "https://app.test", at, t.io);
    expect(t.emails).toEqual([]);
    expect(t.texts).toHaveLength(1);
  });

  it("send a review request by email whatever the channel, asking how we did first", async () => {
    const review: Followup = {
      ...base,
      template: "review_request",
      channel: "text",
      company: { ...base.company, review_url: "https://g.page/r/demo" },
    };
    let body = "";
    const { db } = fakeDb([review]);
    const t = io({
      sendEmail: async (m) => {
        body = m.email.text;
        return { id: "e1" };
      },
    });
    await runFollowups(db, "https://app.test", at, t.io);
    expect(t.texts).toEqual([]);
    expect(body).toContain("https://app.test/f/tok?rating=up");
    expect(body).toContain("https://app.test/f/tok?rating=down");
    expect(body).not.toContain("g.page");
  });

  it("go straight to the review link when asking first is off", async () => {
    const review: Followup = {
      ...base,
      template: "review_request",
      feedback_first: false,
      company: { ...base.company, review_url: "https://g.page/r/demo" },
    };
    let body = "";
    const { db } = fakeDb([review]);
    const t = io({
      sendEmail: async (m) => {
        body = m.email.text;
        return { id: "e1" };
      },
    });
    await runFollowups(db, "https://app.test", at, t.io);
    expect(body).toContain("Leave a review: https://g.page/r/demo");
  });

  it("send nothing twice: a claim another run holds is skipped", async () => {
    const { db } = fakeDb([base], () => false);
    const t = io();
    const run = await runFollowups(db, "https://app.test", at, t.io);
    expect(t.emails).toEqual([]);
    expect(run).toMatchObject({ sent: 0, skipped: 1 });
  });

  it("record a failed text and keep going", async () => {
    const { db, log } = fakeDb([{ ...base, channel: "both" }]);
    const t = io({
      sendText: vi.fn(async () => {
        throw new Error("Carrier said no");
      }),
    });
    const run = await runFollowups(db, "https://app.test", at, t.io);
    expect(run).toMatchObject({ sent: 1, failed: 1 });
    expect(log[1]!.update).toMatchObject({ status: "failed", error: "Carrier said no" });
  });
});
