import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it } from "vitest";
import { dailyLimit, takeAllowance } from "../src/server/usage";

// Mass email has its own daily allowance, apart from reports, quotes, invoices and receipts
// (owner, 2026-10-22: "Give mass email its own limit").

afterEach(() => {
  delete process.env.DAILY_LIMIT_EMAIL;
  delete process.env.DAILY_LIMIT_MASS_EMAIL;
});

describe("daily allowances", () => {
  it("gives mass email its own default and override", () => {
    expect(dailyLimit("email")).toBe(300);
    expect(dailyLimit("mass_email")).toBe(2000);
    process.env.DAILY_LIMIT_MASS_EMAIL = "5000";
    expect(dailyLimit("mass_email")).toBe(5000);
    expect(dailyLimit("email")).toBe(300);
    process.env.DAILY_LIMIT_EMAIL = "500";
    expect(dailyLimit("email")).toBe(500);
    expect(dailyLimit("mass_email")).toBe(5000);
    process.env.DAILY_LIMIT_MASS_EMAIL = "lots";
    expect(dailyLimit("mass_email")).toBe(2000);
  });

  it("counts each kind under its own name and limit", async () => {
    const calls: { fn: string; args: Record<string, unknown> }[] = [];
    const db = {
      rpc: async (fn: string, args: Record<string, unknown>) => {
        calls.push({ fn, args });
        return { data: true, error: null };
      },
    } as unknown as SupabaseClient;
    expect(await takeAllowance("c1", "mass_email", 42, db)).toBe(true);
    expect(await takeAllowance("c1", "email", 1, db)).toBe(true);
    expect(calls).toEqual([
      {
        fn: "use_allowance",
        args: { target_company: "c1", use_kind: "mass_email", how_many: 42, day_limit: 2000 },
      },
      {
        fn: "use_allowance",
        args: { target_company: "c1", use_kind: "email", how_many: 1, day_limit: 300 },
      },
    ]);
  });
});
