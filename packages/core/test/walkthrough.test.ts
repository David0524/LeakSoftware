import { describe, expect, it } from "vitest";
import { gettingStarted, launchCards, seenTips, TIPS, tipFor, type ShopProgress } from "../src";

const fresh: ShopProgress = {
  people: 1,
  openInvites: 0,
  hasLogo: false,
  paymentsReady: false,
  customers: 0,
  visitPlans: 0,
  leakJobs: 0,
  reportsSent: 0,
  invoicesSent: 0,
};

describe("tips", () => {
  it("have unique ids and one per screen, role, and package at most", () => {
    expect(new Set(TIPS.map((t) => t.id)).size).toBe(TIPS.length);
  });

  it("follow the package", () => {
    const invoices = (services: "pool" | "leak" | "both") =>
      tipFor({ platform: "web", screen: "invoices", role: "owner", services, seen: [] })?.id;
    expect(invoices("pool")).toBe("web-invoices-pool");
    expect(invoices("leak")).toBe("web-invoices-leak");
    expect(
      tipFor({ platform: "web", screen: "chemicals", role: "tech", services: "leak", seen: [] }),
    ).toBeNull();
  });

  it("follow the role", () => {
    expect(
      tipFor({ platform: "web", screen: "dashboard", role: "tech", services: "both", seen: [] }),
    ).toBeNull();
    expect(
      tipFor({ platform: "web", screen: "messages", role: "tech", services: "pool", seen: [] })?.id,
    ).toBe("web-messages");
  });

  it("follow the job on a shop that does both, and show once", () => {
    const job = (pkg: "pool" | "leak", seen: string[] = []) =>
      tipFor({ platform: "app", screen: "job", role: "tech", services: "both", seen, pkg })?.id;
    expect(job("pool")).toBe("app-visit");
    expect(job("leak")).toBe("app-inspection");
    expect(job("leak", ["app-inspection"])).toBeUndefined();
  });

  it("read only tip ids from stored data", () => {
    expect(seenTips(["a", 2, null, "b"])).toEqual(["a", "b"]);
    expect(seenTips("nope")).toEqual([]);
  });
});

describe("first launch", () => {
  it("is three cards for each package", () => {
    for (const s of ["pool", "leak", "both"] as const) expect(launchCards(s)).toHaveLength(3);
    expect(launchCards("pool")[1]!.message).toContain("Chemical Calculator");
    expect(launchCards("leak")[1]!.message).toContain("pressure and dye tests");
  });
});

describe("getting started", () => {
  it("lists each package's first steps", () => {
    expect(gettingStarted("pool", fresh).map((s) => s.id)).toEqual([
      "invite",
      "customers",
      "plans",
      "payments",
      "invoices",
    ]);
    expect(gettingStarted("leak", fresh).map((s) => s.id)).toEqual([
      "invite",
      "logo",
      "payments",
      "job",
      "report",
    ]);
    expect(gettingStarted("both", fresh)).toHaveLength(8);
  });

  it("ticks steps off from the shop's own data", () => {
    const done = gettingStarted("pool", { ...fresh, openInvites: 1, customers: 3 })
      .filter((s) => s.done)
      .map((s) => s.id);
    expect(done).toEqual(["invite", "customers"]);
  });
});
