import { describe, expect, it } from "vitest";
import { canContactCustomers, teamRoleLine } from "../src";

describe("Text and Call Customers", () => {
  it("owners and admins always have it; techs unless it's off", () => {
    expect(canContactCustomers("owner", false)).toBe(true);
    expect(canContactCustomers("admin", false)).toBe(true);
    expect(canContactCustomers("tech", true)).toBe(true);
    expect(canContactCustomers("tech", null)).toBe(true);
    expect(canContactCustomers("tech", undefined)).toBe(true);
    expect(canContactCustomers("tech", false)).toBe(false);
  });

  it("the Team list says when a tech can't", () => {
    expect(teamRoleLine("tech", true)).toBe("Tech");
    expect(teamRoleLine("tech", false)).toBe("Tech · No customer contact");
    expect(teamRoleLine("admin", false)).toBe("Admin");
  });
});
