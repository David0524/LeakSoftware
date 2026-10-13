import { describe, expect, it } from "vitest";
import { warrantyEndsText, warrantyState } from "../src";

describe("warranties", () => {
  it("is active, expiring within 60 days, or expired", () => {
    expect(warrantyState("2027-10-13", "2026-10-13")).toBe("active");
    expect(warrantyState("2026-12-12", "2026-10-13")).toBe("expiring");
    expect(warrantyState("2026-10-13", "2026-10-13")).toBe("expiring");
    expect(warrantyState("2026-10-12", "2026-10-13")).toBe("expired");
  });
  it("says when it ends", () => {
    expect(warrantyEndsText("2026-10-13", "2026-10-13")).toBe("Ends today");
    expect(warrantyEndsText("2026-10-14", "2026-10-13")).toBe("Ends in 1 day");
    expect(warrantyEndsText("2026-10-10", "2026-10-13")).toBe("Ended 3 days ago");
  });
});
