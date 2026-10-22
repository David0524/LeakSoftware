import { describe, expect, it } from "vitest";
import {
  LINE_DESCRIPTION_MAX,
  discountTooLarge,
  friendlyDbError,
  isWebUrl,
  jobDateError,
  lineDescriptionError,
  malformedLink,
  scheduleDate,
} from "../src/lib/limits";
import { dbFailure } from "../src/server/failures";

// Edge inputs from break testing (2026-10-20).

describe("discounts", () => {
  it("can be up to the subtotal, never more", () => {
    expect(discountTooLarge(0, 10_000)).toBeNull();
    expect(discountTooLarge(10_000, 10_000)).toBeNull();
    expect(discountTooLarge(500_000, 10_000)).toMatch(/more than the subtotal/);
    expect(discountTooLarge(1, 0)).toMatch(/more than the subtotal/);
  });
});

describe("line descriptions", () => {
  it("need words, and not too many", () => {
    expect(lineDescriptionError("   ")).toBe("Describe the work.");
    expect(lineDescriptionError("Replace skimmer lid")).toBeNull();
    expect(lineDescriptionError("L".repeat(LINE_DESCRIPTION_MAX))).toBeNull();
    expect(lineDescriptionError("L".repeat(10_000))).toMatch(/under 500 characters/);
  });
});

describe("job dates", () => {
  it("are real days from 2000 through 2100", () => {
    expect(jobDateError("2026-10-21")).toBeNull();
    expect(jobDateError("2028-02-29")).toBeNull();
    expect(jobDateError("2027-02-29")).toBe("Pick a date.");
    expect(jobDateError("2026-02-31")).toBe("Pick a date.");
    expect(jobDateError("2026-13-45")).toBe("Pick a date.");
    expect(jobDateError("9999-12-31")).toMatch(/between 2000 and 2100/);
    expect(jobDateError("0001-01-01")).toMatch(/between 2000 and 2100/);
    expect(jobDateError("")).toBe("Pick a date.");
  });

  it("in a schedule link fall back to today when bad", () => {
    expect(scheduleDate("2026-10-21")).toBe("2026-10-21");
    for (const bad of ["9999-99-99", "2026-02-31", "abc", "", undefined, null])
      expect(scheduleDate(bad)).toBeNull();
  });
});

describe("review links", () => {
  it("are web addresses only", () => {
    expect(isWebUrl("https://g.page/r/demo")).toBe(true);
    expect(isWebUrl("http://example.com")).toBe(true);
    expect(isWebUrl("javascript:alert(document.cookie)")).toBe(false);
    expect(isWebUrl("data:text/html,<script>alert(1)</script>")).toBe(false);
    expect(isWebUrl("g.page/r/demo")).toBe(false);
  });
});

describe("database messages", () => {
  it("read as not found or too large, not as Postgres", () => {
    expect(friendlyDbError('invalid input syntax for type uuid: "x"', "Quote not found")).toBe(
      "Quote not found",
    );
    expect(friendlyDbError('value "9999999999900" is out of range for type integer')).toBe(
      "That number is too large.",
    );
    expect(friendlyDbError("Only owners can record payments")).toBe(
      "Only owners can record payments",
    );
  });

  it("from the phone's routes too", () => {
    expect(
      dbFailure({ message: 'invalid input syntax for type uuid: "x"', code: "22P02" }).message,
    ).toBe("That wasn’t found.");
  });
});

describe("malformed links", () => {
  it("answer 404 before the page streams", () => {
    expect(malformedLink("/customers/not-a-uuid")).toBe(true);
    expect(malformedLink("/messages/not-a-uuid")).toBe(true);
    expect(malformedLink("/jobs/not-a-uuid")).toBe(true);
    expect(malformedLink("/q/abc")).toBe(true);
    expect(malformedLink("/i/%00%27--")).toBe(true);
    expect(malformedLink("/r/abc/pdf")).toBe(true);
    expect(malformedLink("/stop/abc")).toBe(true);
  });

  it("let real ones and the pages beside them through", () => {
    const id = "01a15974-b9a3-739e-9438-f21be4493f96";
    for (const path of [
      `/customers/${id}`,
      `/messages/${id}`,
      "/messages/new",
      `/jobs/${id}`,
      "/jobs/new",
      "/jobs/reports",
      "/q/88f473afec9be82464d213d698ca7bdc",
      "/i/88f473afec9be82464d213d698ca7bdc/pdf",
      "/customers",
      "/invoices",
      "/customers/email",
    ])
      expect(malformedLink(path)).toBe(false);
  });
});
