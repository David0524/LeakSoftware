import { describe, expect, it } from "vitest";
import { maskRow, maskedTable, setNoContactCompanies } from "../src/lib/contactMask";

// Text and Call Customers, fully off (owner, 2026-11-23): until the server's blanks arrive, the
// phone shows customers without their numbers and emails.
describe("the contact mask", () => {
  const customer = {
    id: "c1",
    company_id: "shop",
    name: "Dana",
    phone: "602",
    email: "d@x.com",
    cc_emails: ["e@x.com"],
    notes: "Gate 1234",
  };

  it("blanks customers' numbers and emails in a shop where the person can't contact them", () => {
    setNoContactCompanies(["shop"]);
    expect(maskRow("customer", customer)).toEqual({
      ...customer,
      phone: null,
      email: null,
      cc_emails: [],
    });
    expect(maskedTable("job")).toBe(false);
  });

  it("leaves other shops and other people alone", () => {
    setNoContactCompanies(["other"]);
    expect(maskRow("customer", customer)).toBe(customer);
    setNoContactCompanies([]);
    expect(maskRow("customer", customer)).toBe(customer);
  });
});
