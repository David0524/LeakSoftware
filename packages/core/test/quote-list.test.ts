import { describe, expect, it } from "vitest";
import {
  filterQuotes,
  isQuoteJob,
  newQuoteRecords,
  quoteRowDetail,
  quoteSegment,
  quoteSegmentCounts,
  quoteTitle,
  quoteWaitingForPool,
  userTransitions,
  validateNewQuote,
  type QuoteListItem,
} from "../src";

const item = (over: Partial<QuoteListItem>): QuoteListItem => ({
  number: 1001,
  status: "sent",
  total_cents: 125000,
  customer: "Jane Diaz",
  jobStatus: "quote",
  ...over,
});

const blank = {
  customerName: "",
  customerPhone: "",
  customerEmail: "",
  addressLine1: "",
  city: "",
  state: "",
  postalCode: "",
};

describe("Quotes list", () => {
  it("puts expired quotes with the declined ones", () => {
    expect(quoteSegment("expired")).toBe("declined");
    expect(quoteSegment("draft")).toBe("draft");
  });

  it("opens on Sent and searches customer and numbers", () => {
    const list = [
      item({ number: 1001 }),
      item({ number: 1002, status: "draft" }),
      item({ number: 1003, customer: "Bo Lee", jobNumber: 1050, jobStatus: "unscheduled" }),
    ];
    expect(filterQuotes(list, {}).map((q) => q.number)).toEqual([1001, 1003]);
    expect(filterQuotes(list, { segment: "draft" }).map((q) => q.number)).toEqual([1002]);
    expect(filterQuotes(list, { q: "diaz" }).map((q) => q.number)).toEqual([1001]);
    expect(filterQuotes(list, { q: "#1003" }).map((q) => q.number)).toEqual([1003]);
    expect(filterQuotes(list, { q: "1050" }).map((q) => q.number)).toEqual([1003]);
    expect(quoteSegmentCounts(list)).toEqual({ draft: 1, sent: 2, accepted: 0, declined: 0 });
  });

  it("words rows and titles", () => {
    expect(quoteRowDetail(item({}))).toBe("Quote #1001 · $1,250.00");
    expect(quoteTitle(null)).toBe("Quote");
  });

  it("knows an accepted standalone quote waiting for a pool", () => {
    expect(quoteWaitingForPool(item({ status: "accepted" }))).toBe(true);
    expect(quoteWaitingForPool(item({ status: "accepted", jobStatus: "unscheduled" }))).toBe(false);
  });
});

describe("New Quote", () => {
  it("needs a name for a new customer, and nothing for an existing one", () => {
    expect(validateNewQuote(blank).customerName).toBeTruthy();
    expect(validateNewQuote({ ...blank, customerId: "c1" })).toEqual({});
  });

  it("leaves the pool optional but asks for a street with a city", () => {
    expect(validateNewQuote({ ...blank, customerName: "Pat" })).toEqual({});
    expect(validateNewQuote({ ...blank, customerName: "Pat", city: "Mesa" }).addressLine1).toBe(
      "Enter the street address, or leave the address blank.",
    );
  });

  it("writes a hidden repair job and an empty quote", () => {
    const r = newQuoteRecords({ ...blank, customerName: " Pat ", customerPhone: "602" }, "tech-1");
    expect(r.customer).toEqual({ kind: "homeowner", name: "Pat", phone: "602", email: null });
    expect(r.property).toBeNull();
    expect(r.job).toEqual({ type: "repair", status: "quote", assigned_user_id: "tech-1" });
    expect(r.quote).toEqual({ discount_cents: 0 });
    const withPool = newQuoteRecords(
      { ...blank, customerId: "c1", addressLine1: "1 Main", state: "az" },
      null,
    );
    expect(withPool.customer).toBeNull();
    expect(withPool.property).toMatchObject({ address_line1: "1 Main", state: "AZ" });
  });

  it("keeps a quote job out of people's status buttons", () => {
    expect(isQuoteJob({ status: "quote" })).toBe(true);
    expect(userTransitions("quote", "repair")).toEqual([]);
  });
});
