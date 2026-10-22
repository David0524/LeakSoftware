import { describe, expect, it } from "vitest";
import { gettingStarted, type ShopProgress } from "../src";

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

describe("getting started", () => {
  it("lists each package's first steps", () => {
    expect(gettingStarted("pool", fresh).map((s) => s.id)).toEqual([
      "account",
      "invite",
      "customers",
      "plans",
      "payments",
      "invoices",
    ]);
    expect(gettingStarted("leak", fresh).map((s) => s.id)).toEqual([
      "account",
      "invite",
      "logo",
      "payments",
      "job",
      "report",
    ]);
    expect(gettingStarted("both", fresh)).toHaveLength(9);
  });

  it("starts with a head start: the account is done", () => {
    const steps = gettingStarted("pool", fresh);
    expect(steps[0]).toMatchObject({ id: "account", label: "Account created", done: true });
    expect(steps.filter((s) => s.done)).toHaveLength(1);
  });

  it("ticks steps off from the shop's own data", () => {
    const done = gettingStarted("pool", { ...fresh, openInvites: 1, customers: 3 })
      .filter((s) => s.done)
      .map((s) => s.id);
    expect(done).toEqual(["account", "invite", "customers"]);
  });
});
