import { describe, expect, it } from "vitest";
import { wrapUp, type WrapUpInput } from "../src";

const base: WrapUpInput = {
  jobType: "detection",
  customer: "Maria Alvarez",
  reportOn: true,
  hasDraft: false,
  sentVersion: null,
  unsignedReason: null,
  findings: 0,
  tests: 0,
  signers: [],
  quotes: [],
  invoices: [],
};
const job = (o: Partial<WrapUpInput>) => wrapUp({ ...base, ...o });
const quote = (status: WrapUpInput["quotes"][number]["status"], o = {}) => ({
  id: `q-${status}`,
  number: 1006,
  status,
  total_cents: 125000,
  depositPaid: false,
  ...o,
});

describe("wrapUp", () => {
  it("starts with the report next, three steps without a quote", () => {
    const w = job({});
    expect(w.rows.map((r) => [r.title, r.detail, r.done, r.next])).toEqual([
      ["Report", "Not written yet", false, true],
      ["Customer signs", "Write the report first", false, false],
      ["Invoice", "Not started", false, false],
    ]);
    expect(w.subtitle).toBe("Maria Alvarez · 0 of 3 done");
    expect(w.next).toEqual({ step: "report", id: null, action: "Write the Draft" });
    // Nothing to sign yet: its row opens Report.
    expect(w.rows[1]!.opens).toBe("report");
    expect(w.canStartQuote).toBe(true);
  });

  it("is the sketch: report and accepted quote done, Review with Customer next", () => {
    const w = job({
      hasDraft: true,
      findings: 2,
      tests: 5,
      quotes: [quote("accepted", { depositPaid: true })],
      invoices: [
        {
          id: "i1",
          number: 1025,
          status: "draft",
          total_cents: 64900,
          amount_paid_cents: 0,
        },
      ],
    });
    expect(w.rows.map((r) => [r.number, r.title, r.detail, r.amount, r.done, r.next])).toEqual([
      [1, "Report", "Draft ready · 2 findings, 5 tests", null, true, false],
      [2, "Quote #1006", "Accepted · deposit paid", "$1,250.00", true, false],
      [3, "Customer signs", "Not yet", null, false, true],
      [4, "Invoice #1025", "Draft · not sent", "$649.00", false, false],
    ]);
    expect(w.subtitle).toBe("Maria Alvarez · 2 of 4 done");
    expect(w.next?.action).toBe("Review with Customer");
    expect(w.rows[2]!.spoken).toBe("Step 3 of 4, Customer signs, not yet, next");
    expect(w.canStartQuote).toBe(false);
  });

  it("counts a job's quotes as one step, the first unsent one next", () => {
    const w = job({
      hasDraft: true,
      quotes: [
        quote("draft", { id: "b", number: 1007 }),
        quote("declined", { id: "a", number: 1006 }),
      ],
    });
    expect(w.rows.map((r) => [r.title, r.number, r.next])).toEqual([
      ["Report", 1, false],
      ["Quote #1006", 2, false],
      ["Quote #1007", 2, true],
      ["Customer signs", 3, false],
      ["Invoice", 4, false],
    ]);
    expect(w.next).toEqual({ step: "quote", id: "b", action: "Send Quote" });
    expect(w.subtitle).toBe("Maria Alvarez · 1 of 4 done");
  });

  it("gives a repair job no quote rows and no New Quote", () => {
    const w = job({ jobType: "repair", quotes: [quote("sent")] });
    expect(w.rows.some((r) => r.step === "quote")).toBe(false);
    expect(w.canStartQuote).toBe(false);
  });

  it("says who signed, or why nobody did", () => {
    expect(job({ hasDraft: true, signers: ["Maria Alvarez"] }).rows[1]!.detail).toBe(
      "Signed by Maria Alvarez",
    );
    const away = job({ sentVersion: 2, unsignedReason: "Customer not present" });
    expect(away.rows.map((r) => r.detail)).toEqual([
      "Sent · version 2",
      "Not signed: customer not present",
      "Not started",
    ]);
    expect(away.next?.action).toBe("Send Invoice");
  });

  it("reads invoices' amounts due, and All done with no button", () => {
    const inv = (status: WrapUpInput["invoices"][number]["status"], paid = 0) =>
      job({
        invoices: [{ id: "i", number: 1025, status, total_cents: 64900, amount_paid_cents: paid }],
      }).rows.at(-1)!.detail;
    expect(inv("sent")).toBe("Sent · $649.00 due");
    expect(inv("partially_paid", 27400)).toBe("Partly paid · $375.00 due");
    expect(inv("paid", 64900)).toBe("Paid");
    const all = job({
      customer: null,
      sentVersion: 1,
      signers: ["Maria Alvarez"],
      invoices: [
        { id: "v", number: 1, status: "void", total_cents: 1, amount_paid_cents: 0 },
        { id: "i", number: 2, status: "paid", total_cents: 64900, amount_paid_cents: 64900 },
      ],
    });
    expect(all.rows).toHaveLength(3);
    expect(all.subtitle).toBe("All done");
    expect(all.next).toBeNull();
  });

  it("leaves out Report and Customer signs when the shop turned the report off", () => {
    const w = job({ reportOn: false });
    expect(w.rows.map((r) => r.step)).toEqual(["invoice"]);
    expect(w.subtitle).toBe("Maria Alvarez · 0 of 1 done");
  });
});
