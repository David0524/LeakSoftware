import { describe, expect, it } from "vitest";
import {
  businessChoices,
  businessIdentity,
  hasSecondBusiness,
  jobBusiness,
  jobBusinessName,
  showsTechOnReports,
  techCardLine,
  techInitial,
  workBusiness,
  type BusinessCompany,
} from "./business";

const nick: BusinessCompany = {
  name: "All In Pool Solutions",
  phone: "702-555-0199",
  email: "office@allin.example",
  logo_path: "c/logo-1.png",
  brand_primary: "#12263A",
  review_url: "https://g.page/allin",
  settings: { services: "both" },
  second_name: "Southern Nevada Leak Detection",
  second_phone: "702-555-0100",
  second_email: " ",
  second_logo_path: "c/logo2-1.png",
  second_for: "leak",
};

describe("second business", () => {
  it("needs Both and a name", () => {
    expect(hasSecondBusiness(nick)).toBe(true);
    expect(hasSecondBusiness({ ...nick, settings: { services: "pool" } })).toBe(false);
    expect(hasSecondBusiness({ ...nick, second_name: "  " })).toBe(false);
    expect(hasSecondBusiness({ ...nick, settings: null })).toBe(true);
  });

  it("follows Cole's rules", () => {
    expect(jobBusiness(nick, { type: "detection" })).toBe("second");
    expect(jobBusiness(nick, { type: "inspection" })).toBe("second");
    expect(jobBusiness(nick, { type: "maintenance" })).toBe("main");
    expect(jobBusiness(nick, { type: "repair" }, { type: "detection" })).toBe("second");
    expect(jobBusiness(nick, { type: "repair" }, { type: "maintenance" })).toBe("main");
    expect(jobBusiness(nick, { type: "repair" })).toBe("main");
    expect(jobBusiness(nick, { type: "repair" }, { type: "maintenance", business: "second" })).toBe(
      "second",
    );
    expect(jobBusiness(nick, { type: "detection", business: "main" })).toBe("main");
    expect(jobBusiness({ ...nick, second_for: "pool" }, { type: "maintenance" })).toBe("second");
    expect(jobBusiness({ ...nick, settings: { services: "leak" } }, { type: "detection" })).toBe(
      "main",
    );
    expect(workBusiness(nick, "pool")).toBe("main");
  });

  it("shows the second business's info, falling back to the shop's", () => {
    expect(businessIdentity(nick, "second")).toEqual({
      business: "second",
      name: "Southern Nevada Leak Detection",
      phone: "702-555-0100",
      email: "office@allin.example",
      logoPath: "c/logo2-1.png",
      brandPrimary: "#12263A",
      reviewUrl: "https://g.page/allin",
    });
    expect(businessIdentity({ ...nick, second_logo_path: null }, "second").logoPath).toBeNull();
    expect(jobBusinessName(nick, { type: "detection" })).toBe("Southern Nevada Leak Detection");
    expect(jobBusinessName(nick, null)).toBe("All In Pool Solutions");
    expect(businessChoices(nick).map((c) => c.label)).toEqual([
      "All In Pool Solutions",
      "Southern Nevada Leak Detection",
    ]);
    expect(businessChoices({ ...nick, second_name: null })).toEqual([]);
  });
});

describe("the tech on reports", () => {
  it("is off unless turned on", () => {
    expect(showsTechOnReports(null)).toBe(false);
    expect(showsTechOnReports({ tech_on_reports: "true" })).toBe(false);
    expect(showsTechOnReports({ tech_on_reports: true })).toBe(true);
  });

  it("says who did the work", () => {
    expect(techCardLine("maintenance", ["Brian Smith"])).toBe("Your pool was serviced by Brian");
    expect(techCardLine("detection", ["Brian", "Cole Jones"])).toBe(
      "Your leak detection was done by Brian and Cole",
    );
    expect(techCardLine("repair", ["Brian"])).toBe("Your repair was done by Brian");
    expect(techCardLine("inspection", ["Brian"])).toBe("Your pool inspection was done by Brian");
    expect(techCardLine("maintenance", ["brian@example.com"])).toBeNull();
    expect(techInitial(" brian")).toBe("B");
    expect(techInitial(null)).toBe("?");
  });
});
