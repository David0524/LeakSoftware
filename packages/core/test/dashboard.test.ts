import { describe, expect, it } from "vitest";
import {
  acceptanceRate,
  dashboardTotals,
  monthLabel,
  techFeedbackNote,
  techInvoicedNote,
  techJobsNote,
} from "../src";

describe("dashboard", () => {
  it("names months", () => {
    expect(monthLabel("2026-10")).toBe("Oct 2026");
    expect(monthLabel("2026-01", true)).toBe("January 2026");
  });
  it("gives the acceptance rate", () => {
    expect(acceptanceRate(3, 2)).toBe("67%");
    expect(acceptanceRate(0, 0)).toBe("–");
  });
  it("adds up the months shown", () => {
    const m = {
      quotes_sent: 2,
      quotes_accepted: 1,
      invoiced_cents: 100,
      outstanding_cents: 0,
      collected_cents: 50,
    };
    expect(
      dashboardTotals([
        { month: "2026-09", ...m },
        { month: "2026-10", ...m },
      ]),
    ).toEqual({
      quotes_sent: 4,
      quotes_accepted: 2,
      invoiced_cents: 200,
      collected_cents: 100,
    });
  });
});

describe("dashboard by tech", () => {
  const t = {
    jobs_done: 14,
    jobs_open: 3,
    invoiced_cents: 500000,
    thumbs_up: 9,
    thumbs_down: 1,
    on_site_minutes: 95,
  };
  it("words a tech's jobs", () => {
    expect(techJobsNote(t)).toBe("14 jobs done · 3 open");
    expect(techJobsNote({ jobs_done: 1, jobs_open: 0 })).toBe("1 job done · 0 open");
  });
  it("words what they invoiced", () => {
    expect(techInvoicedNote(t)).toBe("Invoiced $5,000.00");
  });
  it("words their feedback and time on site", () => {
    expect(techFeedbackNote(t)).toBe("9 thumbs up · 1 thumbs down · 1 hr 35 min avg on site");
    expect(techFeedbackNote({ thumbs_up: 0, thumbs_down: 0, on_site_minutes: null })).toBe(
      "No feedback yet",
    );
    expect(techFeedbackNote({ thumbs_up: 0, thumbs_down: 0, on_site_minutes: 60 })).toBe(
      "No feedback yet · 1 hr avg on site",
    );
  });
});
