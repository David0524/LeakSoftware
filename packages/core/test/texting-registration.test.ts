import { describe, expect, it } from "vitest";
import { checkBusinessDetails, normalizeWebsite, registrationStatus } from "../src";

const good = {
  legal_name: " Blue Wave Pools LLC ",
  business_type: "llc",
  ein: "123456789",
  street: "123 Main St",
  city: "Las Vegas",
  state: "nv",
  postal_code: "89101",
  website: "bluewavepools.com",
  first_name: "Alex",
  last_name: "Rivera",
  title: "Owner",
  email: "alex@bluewavepools.com",
  phone: "(702) 555-0100",
};

describe("business details", () => {
  it("cleans up what's typed", () => {
    const r = checkBusinessDetails(good);
    expect("details" in r && r.details).toMatchObject({
      legal_name: "Blue Wave Pools LLC",
      ein: "12-3456789",
      state: "NV",
      website: "https://bluewavepools.com",
      phone: "+17025550100",
    });
  });

  it("needs a website (a Facebook page works)", () => {
    expect("fields" in checkBusinessDetails({ ...good, website: "" })).toBe(true);
    const r = checkBusinessDetails({ ...good, website: "facebook.com/bluewavepools" });
    expect("details" in r && r.details.website).toBe("https://facebook.com/bluewavepools");
  });

  it("says what's wrong with each field", () => {
    const r = checkBusinessDetails({
      ...good,
      ein: "12-345",
      state: "Nevada",
      postal_code: "891",
      email: "alex",
      phone: "555-0100",
      business_type: "llp",
      legal_name: "  ",
      website: "not a site",
    });
    expect("fields" in r && Object.keys(r.fields).sort()).toEqual(
      [
        "business_type",
        "ein",
        "email",
        "legal_name",
        "phone",
        "postal_code",
        "state",
        "website",
      ].sort(),
    );
  });

  it("reads web addresses", () => {
    expect(normalizeWebsite("https://www.example.com/")).toBe("https://www.example.com");
    expect(normalizeWebsite("example.com/pools")).toBe("https://example.com/pools");
    expect(normalizeWebsite("example")).toBeNull();
  });
});

describe("registration status", () => {
  it("words each stage", () => {
    expect(registrationStatus("registering", "toll_free", null, null).detail).toContain(
      "about a week",
    );
    expect(registrationStatus("registering", "own", null, null).detail).toContain(
      "Calls keep ringing",
    );
    expect(registrationStatus("ready", "local", "(702) 555-0100", null).detail).toBe(
      "Your customers can text (702) 555-0100.",
    );
    const changes = registrationStatus("needs_changes", "own", null, "The EIN doesn’t match.");
    expect(changes.title).toBe("Needs Changes");
    expect(changes.detail).toContain("The EIN doesn’t match.");
  });
});
