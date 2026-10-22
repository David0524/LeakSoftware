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

describe("the sample report step (owner, 2026-10-22: first win)", () => {
  it("comes right after the account, while the shop has its sample", () => {
    const steps = gettingStarted("leak", { ...fresh, sample: { jobId: "j1", done: false } });
    expect(steps.map((s) => s.id).slice(0, 3)).toEqual(["account", "sample", "invite"]);
    expect(steps[1]).toMatchObject({
      label: "Send yourself the sample report",
      href: "/jobs/j1",
      done: false,
    });
  });

  it("is done once sent, or once the sample is deleted", () => {
    const sent = gettingStarted("leak", { ...fresh, sample: { jobId: "j1", done: true } });
    expect(sent.find((s) => s.id === "sample")?.done).toBe(true);
    const deleted = gettingStarted("leak", { ...fresh, sample: { jobId: null, done: true } });
    expect(deleted.find((s) => s.id === "sample")).toMatchObject({ done: true, href: "/jobs" });
  });

  it("is left out for shops without a sample", () => {
    expect(gettingStarted("leak", fresh).some((s) => s.id === "sample")).toBe(false);
    expect(gettingStarted("pool", { ...fresh, sample: null }).some((s) => s.id === "sample")).toBe(
      false,
    );
  });
});
