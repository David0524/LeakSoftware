import { mkdtemp, readdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it } from "vitest";
import {
  weekLabel,
  weeklySummaryEmail,
  weeklySummaryNumbers,
  type WeeklySummaryData,
} from "../src/lib/weekly-summary";
import { runWeeklySummaries } from "../src/server/weekly-summary";

// The weekly summary email (owner, 2026-10-22: "A short email: jobs done, money in, quotes
// waiting").

const data: WeeklySummaryData = {
  company: {
    id: "c1",
    name: "Blue Lagoon Leak Detection",
    logo_path: null,
    timezone: "America/Phoenix",
  },
  week_of: "2026-10-12",
  jobs_done: { maintenance: 8, detection: 3, repair: 1 },
  collected_cents: 425_000,
  owed_cents: 198_000,
  owed_count: 3,
  quotes_waiting: {
    count: 5,
    total_cents: 610_000,
    oldest: [
      {
        customer_name: "Rebecca Soto",
        number: 1042,
        total_cents: 125_000,
        sent_at: "2026-10-02T17:00:00Z",
      },
      {
        customer_name: "Tom O'Neil & Sons",
        number: 1050,
        total_cents: 48_500,
        sent_at: "2026-10-18T20:00:00Z",
      },
      { customer_name: null, number: null, total_cents: 9_900, sent_at: null },
    ],
  },
  scheduled_next: 14,
};
// Monday Oct 19, 8:45 AM in Phoenix.
const now = new Date("2026-10-19T15:45:00Z");

describe("the weekly summary's numbers", () => {
  it("count jobs by type, most first, and money in dollars and cents", () => {
    const n = weeklySummaryNumbers(data, now);
    expect(n.jobsDone).toBe(12);
    expect(n.jobsDetail).toBe("8 service visits, 3 leak detections, 1 repair");
    expect(n.collected).toBe("$4,250.00");
    expect(n.owed).toBe("$1,980.00");
    expect(n.owedDetail).toBe("on 3 invoices");
    expect(n.quotesWaiting).toBe(5);
    expect(n.quotesTotal).toBe("$6,100.00");
    expect(n.scheduledNext).toBe(14);
    expect(n.empty).toBe(false);
  });

  it("name the oldest quotes waiting, how long, and how many more", () => {
    const n = weeklySummaryNumbers(data, now);
    expect(n.oldest).toEqual([
      { customer: "Rebecca Soto", detail: "Quote #1042 · $1,250.00 · sent Oct 2, 17 days ago" },
      { customer: "Tom O'Neil & Sons", detail: "Quote #1050 · $485.00 · sent Oct 18, 1 day ago" },
      { customer: "A customer", detail: "Quote · $99.00" },
    ]);
    expect(n.moreQuotes).toBe("and 2 more");
  });

  it("read the shop's own calendar day for sent dates", () => {
    // 11:30 PM Oct 18 in Phoenix is already Oct 19 in UTC.
    const n = weeklySummaryNumbers(
      {
        ...data,
        quotes_waiting: {
          count: 1,
          total_cents: 100,
          oldest: [
            { customer_name: "Lee", number: 1, total_cents: 100, sent_at: "2026-10-19T06:30:00Z" },
          ],
        },
      },
      now,
    );
    expect(n.oldest[0]!.detail).toBe("Quote #1 · $1.00 · sent Oct 18, 1 day ago");
    expect(n.moreQuotes).toBeNull();
  });

  it("are empty when nothing happened and nothing is waiting", () => {
    const quiet: WeeklySummaryData = {
      ...data,
      jobs_done: {},
      collected_cents: 0,
      owed_cents: 0,
      owed_count: 0,
      quotes_waiting: { count: 0, total_cents: 0, oldest: [] },
      scheduled_next: 0,
    };
    const n = weeklySummaryNumbers(quiet, now);
    expect(n).toMatchObject({ jobsDone: 0, jobsDetail: "", owedDetail: "", empty: true });
    expect(weeklySummaryNumbers({ ...quiet, scheduled_next: 1 }, now).empty).toBe(false);
  });

  it("label the week", () => {
    expect(weekLabel("2026-10-12")).toBe("Oct 12 – 18");
    expect(weekLabel("2026-09-28")).toBe("Sep 28 – Oct 4");
    expect(weekLabel("2026-12-28")).toBe("Dec 28 – Jan 3");
  });
});

describe("the weekly summary email", () => {
  const email = weeklySummaryEmail({
    data,
    now,
    origin: "https://sundeckpro.com",
    token: "tok123",
    logoUrl: null,
    role: "owner",
  });

  it("has a short subject with the week's two main numbers", () => {
    expect(email.subject).toBe(
      "Last week at Blue Lagoon Leak Detection: 12 jobs done, $4,250.00 collected",
    );
  });

  it("says it plainly in text", () => {
    expect(email.text).toBe(
      [
        "Blue Lagoon Leak Detection · Weekly summary",
        "Oct 12 – 18",
        "",
        "Jobs done: 12 (8 service visits, 3 leak detections, 1 repair)",
        "Collected: $4,250.00",
        "Owed: $1,980.00 on 3 invoices",
        "Quotes waiting: 5 ($6,100.00)",
        "  Rebecca Soto · Quote #1042 · $1,250.00 · sent Oct 2, 17 days ago",
        "  Tom O'Neil & Sons · Quote #1050 · $485.00 · sent Oct 18, 1 day ago",
        "  A customer · Quote · $99.00",
        "  and 2 more",
        "This week: 14 jobs scheduled",
        "",
        "Open Dashboard: https://sundeckpro.com/dashboard",
        "",
        "You get this because you’re an owner of Blue Lagoon Leak Detection.",
        "Turn off the weekly summary: https://sundeckpro.com/weekly-summary/tok123",
      ].join("\n"),
    );
  });

  it("has the Dashboard button, the turn-off link, and escapes names", () => {
    expect(email.html).toContain('href="https://sundeckpro.com/dashboard"');
    expect(email.html).toContain(">Open Dashboard</a>");
    expect(email.html).toContain('href="https://sundeckpro.com/weekly-summary/tok123"');
    expect(email.html).toContain("Tom O&#39;Neil &#38; Sons");
    expect(email.html).not.toContain("O'Neil & Sons");
  });

  it("shows the shop's logo when it has one, its name otherwise", () => {
    expect(email.html).toContain(">Blue Lagoon Leak Detection</div>");
    const withLogo = weeklySummaryEmail({
      data,
      now,
      origin: "https://sundeckpro.com",
      token: "t",
      logoUrl: "https://x.supabase.co/logo.png?token=a&b=1",
      role: "admin",
    });
    expect(withLogo.html).toContain('src="https://x.supabase.co/logo.png?token=a&#38;b=1"');
    expect(withLogo.text).toContain("you’re an admin of");
  });

  it("says one job, not one jobs", () => {
    const one = weeklySummaryEmail({
      data: { ...data, jobs_done: { repair: 1 }, scheduled_next: 1 },
      now,
      origin: "https://sundeckpro.com",
      token: "t",
      logoUrl: null,
      role: "owner",
    });
    expect(one.subject).toContain(": 1 job done,");
    expect(one.text).toContain("This week: 1 job scheduled");
  });
});

/**
 * A database for the cron: one shop due with two people; claims answer once per person and
 * week (claim_weekly_summary), as the unique key does.
 */
function fakeDb(summary: WeeklySummaryData = data) {
  const claims = new Map<string, string>();
  const finished: { link_token: string; delivered: boolean }[] = [];
  const db = {
    storage: { from: () => ({ createSignedUrl: async () => ({ data: null }) }) },
    async rpc(fn: string, args: Record<string, unknown>) {
      switch (fn) {
        case "weekly_summaries_due":
          return {
            data: [
              {
                company_id: "c1",
                week_of: "2026-10-12",
                recipients: [
                  { user_id: "u1", email: "owner@shop.test", role: "owner" },
                  { user_id: "u2", email: "admin@shop.test", role: "admin" },
                ],
              },
            ],
            error: null,
          };
        case "weekly_summary_data":
          return { data: summary, error: null };
        case "claim_weekly_summary": {
          const key = `${args.target_company}:${args.target_week}:${args.target_user}`;
          if (claims.has(key)) return { data: null, error: null };
          claims.set(key, `tok-${args.target_user as string}`);
          return { data: claims.get(key), error: null };
        }
        case "finish_weekly_summary":
          finished.push(args as { link_token: string; delivered: boolean });
          return { data: null, error: null };
        default:
          return { data: null, error: null };
      }
    },
  };
  return { db: db as unknown as SupabaseClient, finished };
}

describe("sending the weekly summaries (the daily cron)", () => {
  let outbox: string;
  beforeEach(async () => {
    delete process.env.RESEND_API_KEY;
    outbox = await mkdtemp(join(tmpdir(), "weekly-"));
    process.env.EMAIL_OUTBOX_DIR = outbox;
  });

  it("sends each person's once, however often the cron runs", async () => {
    const { db, finished } = fakeDb();
    const first = await runWeeklySummaries(db, "https://sundeckpro.com", now);
    expect(first).toEqual({ shops: 1, sent: 2, failed: 0, skipped: 0 });
    const second = await runWeeklySummaries(db, "https://sundeckpro.com", now);
    expect(second).toEqual({ shops: 1, sent: 0, failed: 0, skipped: 2 });
    const files = await readdir(outbox);
    expect(files).toHaveLength(2);
    const sent = await Promise.all(
      files.map(
        async (f) =>
          JSON.parse(await readFile(join(outbox, f), "utf8")) as {
            to: string;
            from: string;
            html: string;
          },
      ),
    );
    expect(sent.map((m) => m.to).sort()).toEqual(["admin@shop.test", "owner@shop.test"]);
    expect(sent[0]!.from).toBe('"Sundeck Pro" <summary@send.sundeckpro.com>');
    // Each person's turn-off link is their own.
    const owner = sent.find((m) => m.to === "owner@shop.test")!;
    expect(owner.html).toContain("/weekly-summary/tok-u1");
    expect(finished.every((f) => f.delivered)).toBe(true);
  });

  it("sends nothing (and claims nothing) for a week with nothing to say", async () => {
    const { db } = fakeDb({
      ...data,
      jobs_done: {},
      collected_cents: 0,
      owed_cents: 0,
      owed_count: 0,
      quotes_waiting: { count: 0, total_cents: 0, oldest: [] },
      scheduled_next: 0,
    });
    expect(await runWeeklySummaries(db, "https://sundeckpro.com", now)).toEqual({
      shops: 1,
      sent: 0,
      failed: 0,
      skipped: 2,
    });
    expect(await readdir(outbox)).toHaveLength(0);
  });

  it("does nothing without email set up", async () => {
    delete process.env.EMAIL_OUTBOX_DIR;
    const { db } = fakeDb();
    expect(await runWeeklySummaries(db, "https://sundeckpro.com", now)).toEqual({
      shops: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
    });
  });
});
