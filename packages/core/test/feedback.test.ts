import { describe, expect, it } from "vitest";
import {
  askFeedbackFirst,
  feedbackFilter,
  feedbackNotification,
  feedbackOpenLabel,
  feedbackSubtitle,
  followupEmail,
  followupText,
  planFollowup,
  reminderChannel,
  type Followup,
  type FeedbackRow,
} from "../src";

const row = (id: string, rating: "up" | "down", status: "open" | "closed"): FeedbackRow => ({
  id,
  customer_id: "c",
  customer_name: "Rebecca Soto",
  job_id: "j",
  job_number: 1042,
  rating,
  comment: null,
  status,
  office_note: null,
  closed_at: null,
  closed_by_name: null,
  created_at: "2026-11-16T17:00:00Z",
});

describe("feedback", () => {
  it("sorts answers into Open, Closed and Thumbs Up", () => {
    const rows = [
      row("a", "down", "open"),
      row("b", "down", "closed"),
      row("c", "up", "closed"),
      row("d", "down", "open"),
    ];
    expect(feedbackFilter(rows, "open").map((r) => r.id)).toEqual(["a", "d"]);
    expect(feedbackFilter(rows, "closed").map((r) => r.id)).toEqual(["b"]);
    expect(feedbackFilter(rows, "up").map((r) => r.id)).toEqual(["c"]);
  });

  it("counts open complaints in words", () => {
    expect(feedbackOpenLabel(0)).toBe("No open complaints");
    expect(feedbackOpenLabel(1)).toBe("1 open complaint");
    expect(feedbackOpenLabel(3)).toBe("3 open complaints");
    expect(feedbackSubtitle({ job_number: 1042 }, "Nov 16")).toBe("Job #1042 · Nov 16");
    expect(feedbackSubtitle({ job_number: null }, "Nov 16")).toBe("Nov 16");
  });

  it("tells owners and admins about a thumbs down, short", () => {
    expect(feedbackNotification("Rebecca Soto", "  Still\n green ")).toEqual({
      title: "Customer complaint",
      body: "Rebecca Soto: Still green",
    });
    expect(feedbackNotification("Rebecca Soto", null).body).toBe(
      "Rebecca Soto gave a thumbs down.",
    );
    expect(feedbackNotification("R", "x".repeat(200)).body).toHaveLength(3 + 138);
  });

  it("asks how we did first unless the shop turned it off", () => {
    expect(askFeedbackFirst({})).toBe(true);
    expect(askFeedbackFirst(null)).toBe(true);
    expect(askFeedbackFirst({ ask_feedback_first: false })).toBe(false);
  });
});

const f: Followup = {
  company_id: "co",
  job_id: "job",
  quote_id: "q",
  invoice_id: null,
  template: "quote_reminder_3",
  number: 7,
  amount_cents: 85_000,
  token: "tok",
  customer: { name: "Sam", email: "sam@example.com", phone: "(602) 555-0199", cc_emails: [] },
  company: { name: "Demo Pools", email: null, phone: null, review_url: "https://g.page/r/demo" },
};
const can = { email: true, texting: true, textOptedOut: false };

describe("reminder channels", () => {
  it("read the setting, email unless it says otherwise", () => {
    expect(reminderChannel({})).toBe("email");
    expect(reminderChannel({ reminders: { channel: "text" } })).toBe("text");
    expect(reminderChannel({ reminders: { channel: "both" } })).toBe("both");
    expect(reminderChannel({ reminders: { channel: "pigeon" } })).toBe("email");
  });

  it("pick the channels the shop chose and the customer can get", () => {
    expect(planFollowup(f, can)).toEqual({ email: true, text: null });
    expect(planFollowup({ ...f, channel: "text" }, can)).toEqual({
      email: false,
      text: "+16025550199",
    });
    expect(planFollowup({ ...f, channel: "both" }, can)).toEqual({
      email: true,
      text: "+16025550199",
    });
  });

  it("leave out STOP replies, a missing number, no company number, and what already went", () => {
    const both = { ...f, channel: "both" as const };
    expect(planFollowup(both, { ...can, textOptedOut: true }).text).toBeNull();
    expect(planFollowup(both, { ...can, texting: false }).text).toBeNull();
    expect(
      planFollowup({ ...both, customer: { ...f.customer, phone: null } }, can).text,
    ).toBeNull();
    expect(planFollowup({ ...both, sent_channels: ["email"] }, can)).toEqual({
      email: false,
      text: "+16025550199",
    });
    expect(planFollowup({ ...both, sent_channels: ["email", "sms"] }, can)).toEqual({
      email: false,
      text: null,
    });
    expect(planFollowup(both, { ...can, email: false }).email).toBe(false);
  });

  it("send the review request by email even when reminders are text only", () => {
    const review = { ...f, template: "review_request", channel: "text" as const };
    expect(planFollowup(review, can)).toEqual({ email: true, text: null });
  });

  it("write a short text with the shop's name and the link", () => {
    expect(followupText(f, "https://app.test")).toBe(
      "Demo Pools: a reminder about your quote #7 for $850.00. Review and accept it: https://app.test/q/tok",
    );
    expect(
      followupText(
        { ...f, template: "invoice_reminder_7", quote_id: null, invoice_id: "i" },
        "https://app.test",
      ),
    ).toBe(
      "Demo Pools: a reminder that $850.00 is still due on your invoice #7. Pay online: https://app.test/i/tok",
    );
  });
});

describe("the review request email", () => {
  const review = { ...f, template: "review_request" };

  it("asks how we did, with thumbs links, when asking first", () => {
    const e = followupEmail({ ...review, feedback_first: true }, "https://app.test");
    expect(e.text).toContain("How did we do?");
    expect(e.text).toContain("https://app.test/f/tok?rating=up");
    expect(e.text).toContain("https://app.test/f/tok?rating=down");
    expect(e.text).not.toContain("g.page");
    expect(e.html).toContain('href="https://app.test/f/tok?rating=down"');
  });

  it("goes straight to the review link otherwise", () => {
    const e = followupEmail({ ...review, feedback_first: false }, "https://app.test");
    expect(e.text).toContain("Leave a review: https://g.page/r/demo");
    expect(e.text).not.toContain("/f/tok");
  });
});
