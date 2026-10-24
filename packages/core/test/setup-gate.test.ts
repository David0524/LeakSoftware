import { describe, expect, it } from "vitest";
import { mustFinishSetup } from "../src";

describe("mustFinishSetup", () => {
  it("holds an owner whose shop hasn't finished setup", () => {
    expect(mustFinishSetup({ onboarded: false, plan: "standard" }, "owner")).toBe(true);
    expect(mustFinishSetup({ onboarded: false, plan: null }, "owner")).toBe(true);
  });
  it("lets admins and techs in, as the website does", () => {
    expect(mustFinishSetup({ onboarded: false, plan: "standard" }, "admin")).toBe(false);
    expect(mustFinishSetup({ onboarded: false, plan: "standard" }, "tech")).toBe(false);
    expect(mustFinishSetup({ onboarded: false, plan: "standard" }, null)).toBe(false);
  });
  it("never holds a set-up shop, a demo shop, or an unknown answer", () => {
    expect(mustFinishSetup({ onboarded: true, plan: "standard" }, "owner")).toBe(false);
    expect(mustFinishSetup({ onboarded: false, plan: "demo" }, "owner")).toBe(false);
    expect(mustFinishSetup({ plan: "standard" }, "owner")).toBe(false);
    expect(mustFinishSetup(null, "owner")).toBe(false);
  });
});
