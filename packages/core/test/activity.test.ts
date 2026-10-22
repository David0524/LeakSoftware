import { describe, expect, it } from "vitest";
import {
  ACTIVITY_EMPTY,
  activityDay,
  activityEmpty,
  activityRow,
  activityTime,
  firstName,
  groupActivity,
  movedTo,
} from "../src";

const tz = "America/Phoenix";
const now = new Date("2026-10-20T17:00:00Z"); // Tue Oct 20, 10:00 AM in Phoenix

const base = {
  id: "e1",
  created_at: "2026-10-20T16:42:00Z",
  job_id: "j1",
  customer_name: "Maria Alvarez",
  job_number: 1038,
};

describe("activity", () => {
  it("words each kind", () => {
    const row = (e: object) => {
      const r = activityRow({ ...base, ...e } as never, now, tz);
      return `${r.title} · ${r.detail}`;
    };
    expect(row({ kind: "quote_accepted", amount_cents: 97500 })).toBe(
      "Quote accepted · Maria Alvarez, $975.00",
    );
    expect(row({ kind: "payment_received", amount_cents: 48750 })).toBe(
      "Payment received · Maria Alvarez, $487.50",
    );
    expect(row({ kind: "report_signed" })).toBe("Report signed · Maria Alvarez");
    expect(row({ kind: "report_sent" })).toBe("Report sent · Maria Alvarez");
    expect(row({ kind: "report_opened" })).toBe("Report opened · Maria Alvarez");
    expect(row({ kind: "job_completed", actor_name: "Tony Reyes" })).toBe(
      "Job completed · Maria Alvarez, by Tony",
    );
    expect(row({ kind: "job_completed" })).toBe("Job completed · Maria Alvarez");
    expect(row({ kind: "job_assigned", assignee_name: "Tony Reyes" })).toBe(
      "Job #1038 assigned to Tony · Maria Alvarez",
    );
    expect(row({ kind: "job_moved", scheduled_at: "2026-10-20T16:30:00Z" })).toBe(
      "Job #1038 moved to Tue 9:30 AM · Maria Alvarez",
    );
    expect(
      row({
        kind: "text_received",
        preview: "Is Tony on the way?",
        job_id: null,
        conversation_id: "c1",
      }),
    ).toBe("Text from Maria Alvarez · Is Tony on the way?");
    expect(row({ kind: "text_received", preview: null })).toBe(
      "Text from Maria Alvarez · Sent a picture",
    );
    expect(row({ kind: "report_sent", customer_name: null })).toBe("Report sent · A customer");
  });

  it("opens the job, or a text's conversation", () => {
    expect(activityRow({ ...base, kind: "report_sent" }, now, tz).open).toEqual({
      screen: "job",
      id: "j1",
    });
    expect(
      activityRow({ ...base, kind: "text_received", job_id: null, conversation_id: "c1" }, now, tz)
        .open,
    ).toEqual({ screen: "conversation", id: "c1" });
    expect(activityRow({ ...base, kind: "quote_accepted" }, now, tz).symbol).toBe("quote");
  });

  it("tells the time, the day, and where a job moved", () => {
    expect(activityTime("2026-10-20T16:42:00Z", now, tz)).toBe("9:42 AM");
    expect(activityTime("2026-10-19T16:42:00Z", now, tz)).toBe("Yesterday");
    expect(activityTime("2026-10-14T16:42:00Z", now, tz)).toBe("Oct 14");
    expect(activityTime("2025-10-14T16:42:00Z", now, tz)).toBe("Oct 14, 2025");
    expect(activityDay("2026-10-20T06:59:00Z", now, tz)).toBe("Yesterday");
    expect(activityDay("2026-10-14T16:42:00Z", now, tz)).toBe("Wed, Oct 14");
    expect(movedTo("2026-11-03T16:30:00Z", now, tz)).toBe("Nov 3, 9:30 AM");
    expect(firstName("  ")).toBeNull();
  });

  it("groups under day headers, newest first", () => {
    const days = groupActivity(
      [
        { ...base, id: "a", kind: "report_sent", created_at: "2026-10-20T16:00:00Z" },
        { ...base, id: "b", kind: "report_sent", created_at: "2026-10-20T08:00:00Z" },
        { ...base, id: "c", kind: "report_sent", created_at: "2026-10-19T08:00:00Z" },
        { ...base, id: "d", kind: "report_sent", created_at: "2026-10-12T08:00:00Z" },
      ],
      now,
      tz,
    );
    expect(days.map((d) => [d.title, d.rows.map((r) => r.id)])).toEqual([
      ["Today", ["a", "b"]],
      ["Yesterday", ["c"]],
      ["Mon, Oct 12", ["d"]],
    ]);
  });
});

describe("activityEmpty (owner, 2026-10-22)", () => {
  it("says which type has nothing yet", () => {
    expect(activityEmpty("all")).toBe(ACTIVITY_EMPTY);
    expect(activityEmpty("repair")).toBe("No activity on repair jobs yet.");
    expect(activityEmpty("detection")).toBe("No activity on leak detection jobs yet.");
  });
});
