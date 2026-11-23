import { describe, expect, it } from "vitest";
import { blankContact } from "../src/lib/contact";
import { officeLinks, phoneNav } from "../src/lib/nav";

// Text and Call Customers (owner, 2026-11-23: "fully off").
describe("a tech without Text and Call Customers", () => {
  const job = {
    id: "j1",
    customer: { name: "Dana", phone: "602", email: "d@x.com", cc_emails: ["e@x.com"] },
    property: { address_line1: "1 Main", access_notes: "Gate 1234" },
  };

  it("gets customers' numbers and emails blank, and keeps the rest", () => {
    expect(blankContact(false, [job])).toEqual([
      {
        id: "j1",
        customer: { name: "Dana", phone: null, email: null, cc_emails: [] },
        property: { address_line1: "1 Main", access_notes: "Gate 1234" },
      },
    ]);
  });

  it("everyone else sees them as they are", () => {
    expect(blankContact(true, job)).toBe(job);
  });

  it("has no Messages tab: Today, Jobs, Schedule, then More", () => {
    const links = officeLinks(false, {}, 0, false, false);
    expect(links.some((l) => l.href === "/messages")).toBe(false);
    expect(phoneNav(links).tabs.map((l) => l.href)).toEqual(["/today", "/jobs", "/schedule"]);
    expect(phoneNav(links).more[0]?.href).toBe("/customers");
    expect(phoneNav(officeLinks(false, {})).tabs.map((l) => l.href)).toEqual([
      "/today",
      "/jobs",
      "/schedule",
      "/messages",
    ]);
  });
});
