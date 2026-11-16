import { describe, expect, it } from "vitest";
import {
  billingMonthDetail,
  chargeCents,
  chargeDetail,
  chargeItems,
  chargesFooter,
  linesSummary,
  notInvoicedText,
  ordinalDay,
  parseInvoiceDay,
  planInvoiceDayLabel,
  sendAllConfirm,
  sendAllLabel,
  sendAllResult,
  sendRoute,
  sendRouteLabel,
  shopInvoiceDay,
} from "../src";

describe("invoice day", () => {
  it("names days", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 28].map(ordinalDay)).toEqual([
      "1st",
      "2nd",
      "3rd",
      "4th",
      "11th",
      "12th",
      "13th",
      "21st",
      "22nd",
      "23rd",
      "28th",
    ]);
  });
  it("reads the shop's day and a plan's", () => {
    expect(shopInvoiceDay({})).toBe(1);
    expect(shopInvoiceDay({ invoice_day: 15 })).toBe(15);
    expect(shopInvoiceDay({ invoice_day: 31 })).toBe(1);
    expect(parseInvoiceDay("")).toBeNull();
    expect(parseInvoiceDay("10")).toBe(10);
    expect(parseInvoiceDay("29")).toBeNull();
    expect(planInvoiceDayLabel(null, 1)).toBe("Shop Default (1st)");
    expect(planInvoiceDayLabel(15, 1)).toBe("15th");
  });
});

describe("charges", () => {
  it("totals and describes a charge", () => {
    expect(chargeCents({ quantity: 2.5, unit_price_cents: 800 })).toBe(2000);
    expect(chargeDetail({ quantity: 1, unit_price_cents: 2400 })).toBe("1 × $24.00");
    expect(chargeDetail({ quantity: 2.5, unit_price_cents: 800 })).toBe("2.5 × $8.00");
  });
  it("offers services and parts, not chemicals", () => {
    const items = [
      { name: "Replace skimmer basket", category: "Repair" },
      { name: "Liquid chlorine", category: "Chemicals", chemical: "liquid_chlorine" },
      { name: "Old", category: "Service", deleted_at: "2026-01-01" },
    ];
    expect(chargeItems(items).map((i) => i.name)).toEqual(["Replace skimmer basket"]);
  });
  it("says where they're billed", () => {
    expect(chargesFooter({ firstName: "Jane", month: "October" })).toBe(
      "Billed on Jane’s October invoice.",
    );
    expect(
      chargesFooter({
        firstName: "Jane",
        month: "October",
        sentInvoice: { number: 1042, sentOn: "Nov 1" },
      }),
    ).toBe("On invoice #1042, sent Nov 1.");
  });
});

describe("monthly billing", () => {
  it("describes a month", () => {
    expect(
      billingMonthDetail({
        month: "2026-10-01",
        drafts: 38,
        draft_total_cents: 591200,
        sent: 2,
        not_invoiced: 3,
        current: false,
      }),
    ).toBe("38 to send · $5,912.00 · 3 customers not invoiced yet");
    expect(
      billingMonthDetail({
        month: "2026-11-01",
        drafts: 0,
        draft_total_cents: 0,
        sent: 0,
        not_invoiced: 1,
        current: true,
      }),
    ).toBe("1 customer not invoiced yet · so far");
  });
  it("picks how each invoice goes", () => {
    expect(sendRoute({ email: "a@b.co", phone: "6025550101" }, true)).toEqual({
      channel: "email",
      to: "a@b.co",
    });
    expect(sendRouteLabel(sendRoute({ email: null, phone: "(602) 555-0101" }, true))).toBe(
      "Text (602) 555-0101",
    );
    expect(sendRouteLabel(sendRoute({ email: null, phone: "(602) 555-0101" }, false))).toBe(
      "No email or mobile number",
    );
  });
  it("sums up the lines", () => {
    expect(
      linesSummary([
        { description: "Pool service, October" },
        { description: "Replace skimmer basket, Oct 14" },
        { description: "Clean filter, Oct 7" },
      ]),
    ).toBe("Pool service · Replace skimmer basket · 1 more");
    expect(linesSummary([])).toBe("No lines yet");
  });
  it("asks before sending, and says what happened", () => {
    expect(sendAllLabel(38)).toBe("Send 38 Invoices");
    expect(sendAllLabel(1)).toBe("Send 1 Invoice");
    expect(
      sendAllConfirm(
        [{ channel: "email", to: "a@b.co" }, { channel: "text", to: "602" }, { channel: "none" }],
        "October",
      ),
    ).toEqual({
      title: "Send 2 invoices?",
      message:
        "Each customer gets their October invoice now: 1 by email, 1 by text. 1 without an email or mobile number stays a draft.",
    });
    expect(sendAllResult(38, 0)).toBe("Sent 38 invoices.");
    expect(sendAllResult(36, 2)).toBe("Sent 36 invoices. 2 didn’t go.");
  });
  it("says who isn't invoiced yet", () => {
    expect(
      notInvoicedText(
        {
          month: "2026-10-01",
          invoices: [],
          not_invoiced: 3,
          waiting: [{ date: "2026-11-15", customers: 2 }],
        },
        () => "Nov 15",
      ),
    ).toBe(
      "3 customers have visits not on an invoice yet. 2 are billed on their invoice day, Nov 15. Create Invoices drafts them now.",
    );
  });
});
