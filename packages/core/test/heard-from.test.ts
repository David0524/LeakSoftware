import { describe, expect, it } from "vitest";
import {
  HEARD_FROM_OPTIONS,
  heardFromCounts,
  heardFromLink,
  heardFromOther,
  heardFromText,
  parseHeardFrom,
} from "../src";

describe("How did you hear about us?", () => {
  it("lists the owner's options in order, Other last", () => {
    expect(HEARD_FROM_OPTIONS.map((o) => o.label)).toEqual([
      "Google",
      "App Store or Google Play",
      "Another Pool Pro",
      "Customer Referral",
      "Pool Supplier",
      "Route Broker",
      "Social Media",
      "Industry Group or Forum",
      "Trade Show or Event",
      "Advertisement",
      "Laminate Card",
      "Other",
    ]);
    // Keys are the database's shape and a link's ?from=.
    for (const o of HEARD_FROM_OPTIONS) expect(o.key).toMatch(/^[a-z][a-z0-9_]{0,39}$/);
  });

  it("keeps known keys only", () => {
    expect(parseHeardFrom(" Card ")).toBe("card");
    expect(parseHeardFrom("google")).toBe("google");
    expect(parseHeardFrom("Laminate Card")).toBeNull();
    expect(parseHeardFrom("")).toBeNull();
    expect(parseHeardFrom(null)).toBeNull();
    expect(parseHeardFrom(3)).toBeNull();
  });

  it("keeps Other's text only for Other, on one short line", () => {
    expect(heardFromOther("other", "  a  truck\nwrap ")).toBe("a truck wrap");
    expect(heardFromOther("other", "   ")).toBeNull();
    expect(heardFromOther("google", "ignored")).toBeNull();
    expect(heardFromOther(null, "ignored")).toBeNull();
    expect(heardFromOther("other", "x".repeat(150))).toHaveLength(100);
  });

  it("reads a sign-up link's ?from= or ?ref=", () => {
    expect(heardFromLink({ from: "card" })).toBe("card");
    expect(heardFromLink({ ref: "card" })).toBe("card");
    expect(heardFromLink({ from: ["trade_show", "card"] })).toBe("trade_show");
    expect(heardFromLink({ from: "nope", ref: "google" })).toBe("google");
    expect(heardFromLink({ from: "nope" })).toBeNull();
    expect(heardFromLink({})).toBeNull();
  });

  it("names a shop's answer for staff", () => {
    expect(heardFromText("card")).toBe("Laminate Card");
    expect(heardFromText("other", "Truck wrap")).toBe("Other: Truck wrap");
    expect(heardFromText("other", null)).toBe("Other");
    expect(heardFromText("retired_key")).toBe("retired_key");
    expect(heardFromText(null)).toBeNull();
  });

  it("counts shops by source, most first, unanswered last", () => {
    expect(
      heardFromCounts([
        { heard_from: "card" },
        { heard_from: null },
        { heard_from: "google" },
        { heard_from: "card" },
        { heard_from: "google" },
        { heard_from: "other" },
        {},
      ]),
    ).toEqual([
      { key: "google", label: "Google", count: 2 },
      { key: "card", label: "Laminate Card", count: 2 },
      { key: "other", label: "Other", count: 1 },
      { key: null, label: "No answer", count: 2 },
    ]);
    expect(heardFromCounts([])).toEqual([]);
  });
});
