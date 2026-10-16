import { describe, expect, it } from "vitest";
import { leadPaid, leadsCsv, leadStage, type LeadRow } from "../src";

const base: LeadRow = {
  id: "1",
  email: "pat@pools.test",
  name: "Pat",
  company_name: "Pat's Pools",
  phone: "+16025550123",
  services: "pool",
  notes: null,
  created_at: "2026-10-16T12:00:00Z",
  updated_at: "2026-10-16T12:00:00Z",
  contacted_at: null,
  user_id: null,
  email_confirmed_at: null,
  company_id: null,
  company: null,
  status: null,
  plan: null,
  access_code: null,
  trial_ends_at: null,
  onboarded_at: null,
  card_in: null,
  reached_payment: null,
  people: null,
  goal: null,
};

describe("leads", () => {
  it("say how far someone got", () => {
    expect(leadStage(base)).toBe("form");
    expect(leadStage({ ...base, user_id: "u" })).toBe("no_shop");
    const shop = { ...base, user_id: "u", company_id: "c", status: "trialing", card_in: false };
    expect(leadStage(shop)).toBe("setup");
    expect(leadStage({ ...shop, reached_payment: true })).toBe("payment");
    expect(leadStage({ ...shop, card_in: true })).toBe("paid");
    expect(leadStage({ ...shop, plan: "demo", access_code: "VIP26" })).toBe("code");
    expect(leadStage({ ...shop, status: "canceled", card_in: true })).toBe("canceled");
    expect(leadPaid({ ...shop, card_in: true })).toBe(true);
    expect(leadPaid({ ...shop, reached_payment: true })).toBe(false);
  });

  it("export as a spreadsheet-safe CSV", () => {
    const csv = leadsCsv([{ ...base, name: "=HYPERLINK(1)", notes: 'Said "call Tuesday", busy' }]);
    expect(csv.split("\n")[0]).toBe(
      "Name,Company,Email,Phone,Package,People,Stage,Signed up,Called,Notes",
    );
    expect(csv).toContain("'=HYPERLINK(1)");
    expect(csv).toContain('"Said ""call Tuesday"", busy"');
    expect(csv).toContain("Left the sign-up form");
  });
});
