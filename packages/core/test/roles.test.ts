import { describe, expect, it } from "vitest";
import {
  assignableRoles,
  canMakeJobs,
  isManagerRole,
  roleLabel,
  seesAllJobs,
  tipFor,
} from "../src";

// Owner, Admin, Tech (owner, 2026-10-18).
describe("roles", () => {
  it("owners and admins run the shop; techs don't", () => {
    expect(isManagerRole("owner")).toBe(true);
    expect(isManagerRole("admin")).toBe(true);
    expect(isManagerRole("tech")).toBe(false);
    expect(isManagerRole(null)).toBe(false);
  });

  it("names each role", () => {
    expect(roleLabel("owner")).toBe("Owner");
    expect(roleLabel("admin")).toBe("Admin");
    expect(roleLabel("tech")).toBe("Tech");
  });

  it("only owners give someone the owner or admin role", () => {
    expect(assignableRoles("owner")).toEqual(["owner", "admin", "tech"]);
    expect(assignableRoles("admin")).toEqual(["tech"]);
    expect(assignableRoles("tech")).toEqual([]);
  });

  it("admins see every job and make jobs whatever the techs' settings", () => {
    const limited = { techs_see_all_jobs: false, techs_make_jobs: false };
    expect(seesAllJobs("admin", limited)).toBe(true);
    expect(canMakeJobs("admin", limited)).toBe(true);
    expect(seesAllJobs("tech", limited)).toBe(false);
    expect(canMakeJobs("tech", limited)).toBe(false);
  });
});

describe("tips by role", () => {
  it("admins get the owners' tips", () => {
    const tip = (role: string) =>
      tipFor({ platform: "web", screen: "schedule", role, services: "both", seen: [] })?.id ?? null;
    expect(tip("admin")).toBe(tip("owner"));
    expect(tip("admin")).not.toBeNull();
  });
});
