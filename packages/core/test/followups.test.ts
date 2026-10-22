import { describe, expect, it } from "vitest";
import { followupEmail, parseReminderDays, type Followup } from "../src";

const base: Followup = {
  company_id: "c",
  job_id: "j",
  quote_id: "q",
  invoice_id: null,
  template: "quote_reminder_3",
  number: 1042,
  amount_cents: 85_000,
  token: "tok",
  customer: { name: "Sam Sample", email: "sam@example.com", cc_emails: [] },
  company: {
    name: "Demo Leak Co.",
    email: "office@example.com",
    phone: "(480) 555-0100",
    review_url: "https://g.page/r/demo",
  },
};

describe("follow-up emails", () => {
  it("reminds about a quote with its link and a way to stop", () => {
    const e = followupEmail(base, "https://app.test");
    expect(e.subject).toBe("Your repair quote from Demo Leak Co.");
    expect(e.text).toContain("A reminder about your quote #1042 for $850.00.");
    expect(e.text).toContain("Review your quote: https://app.test/q/tok");
    expect(e.text).toContain(
      "Stop reminder, review and shop emails from Demo Leak Co.: https://app.test/stop/tok",
    );
    expect(e.html).toContain('href="https://app.test/q/tok"');
  });

  it("reminds about what is still owed on an invoice", () => {
    const e = followupEmail(
      {
        ...base,
        template: "invoice_reminder_14",
        quote_id: null,
        invoice_id: "i",
        amount_cents: 35_000,
      },
      "https://app.test",
    );
    expect(e.subject).toBe("Reminder: invoice #1042 from Demo Leak Co.");
    expect(e.text).toContain("$350.00 is still due on your invoice #1042.");
    expect(e.text).toContain("https://app.test/i/tok");
  });

  it("asks for a review with the shop's link", () => {
    const e = followupEmail({ ...base, template: "review_request" }, "https://app.test");
    expect(e.subject).toBe("How did we do? Demo Leak Co.");
    expect(e.text).toContain("Leave a review: https://g.page/r/demo");
  });

  it("escapes names in the HTML", () => {
    const e = followupEmail(
      { ...base, customer: { ...base.customer, name: "<b>Sam</b>" } },
      "https://app.test",
    );
    expect(e.html).toContain("Hi &#60;b&#62;Sam&#60;/b&#62;,");
  });
});

describe("reminder days", () => {
  it("reads days typed in settings", () => {
    expect(parseReminderDays("7, 3 3")).toEqual([3, 7]);
    expect(parseReminderDays("")).toEqual([]);
  });
  it("refuses anything that isn't whole days from 1 to 365", () => {
    expect(parseReminderDays("3, x")).toBeNull();
    expect(parseReminderDays("0")).toBeNull();
    expect(parseReminderDays("400")).toBeNull();
    expect(parseReminderDays("1.5")).toBeNull();
  });
});
