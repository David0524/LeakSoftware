import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { appliedOfferText } from "@leakbook/core";
import { applySignUpCode, keepSignUpCodeFor, lookUpSignUpCode } from "../src/server/sign-up-code";

// A sign-up link that carries a code (owner, 2026-11-23): the sign-up page shows its offer,
// the account keeps it until its shop exists, and the trial page applies it once.

type Rpc = { name: string; args: Record<string, unknown> };

function fakeDb(opts: {
  rpc?: (name: string, args: Record<string, unknown>) => { data: unknown; error: unknown };
  metadata?: Record<string, unknown>;
}) {
  const rpcs: Rpc[] = [];
  const updates: Record<string, unknown>[] = [];
  let metadata = { ...(opts.metadata ?? {}) };
  const db = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpcs.push({ name, args });
      return opts.rpc?.(name, args) ?? { data: null, error: null };
    },
    auth: {
      getUser: async () => ({ data: { user: { id: "u1", user_metadata: metadata } }, error: null }),
      updateUser: async ({ data }: { data: Record<string, unknown> }) => {
        updates.push(data);
        metadata = { ...metadata, ...data };
        return { data: { user: { user_metadata: metadata } }, error: null };
      },
    },
  };
  return { db: db as unknown as SupabaseClient, rpcs, updates, meta: () => metadata };
}

const CANNONBALL = {
  kind: "promo",
  code: "CANNONBALL90",
  free_months: 3,
  percent_off: null,
  percent_months: null,
};

describe("the sign-up page's code", () => {
  it("asks the database for one code, normalized, and shows its offer", async () => {
    const { db, rpcs } = fakeDb({ rpc: () => ({ data: CANNONBALL, error: null }) });
    const offer = await lookUpSignUpCode("cannonball90", db);
    expect(rpcs).toEqual([{ name: "code_offer", args: { code: "CANNONBALL90" } }]);
    expect(offer && appliedOfferText(offer)).toBe("Code CANNONBALL90: 3 months free.");
  });

  it("shows nothing for an unknown code, a failed lookup, or no code", async () => {
    const unknown = fakeDb({ rpc: () => ({ data: null, error: null }) });
    expect(await lookUpSignUpCode("NOPE", unknown.db)).toBeNull();
    const failed = fakeDb({ rpc: () => ({ data: null, error: { message: "boom" } }) });
    expect(await lookUpSignUpCode("CANNONBALL90", failed.db)).toBeNull();
    const none = fakeDb({});
    expect(await lookUpSignUpCode(undefined, none.db)).toBeNull();
    expect(await lookUpSignUpCode("x", none.db)).toBeNull();
    expect(none.rpcs).toEqual([]);
    expect(await lookUpSignUpCode("CANNONBALL90", null)).toBeNull();
  });
});

describe("keeping the code until the shop exists", () => {
  it("marks it for the shop the person just made", async () => {
    const { db, updates } = fakeDb({});
    await keepSignUpCodeFor(db, "shop-1", null, "CANNONBALL90");
    expect(updates).toEqual([{ promo_code: "CANNONBALL90", promo_company: "shop-1" }]);
  });

  it("after the email confirmation, takes it from the account", async () => {
    const { db, updates } = fakeDb({});
    await keepSignUpCodeFor(db, "shop-1", { promo_code: "CANNONBALL90", full_name: "Robin" });
    expect(updates).toEqual([{ promo_code: "CANNONBALL90", promo_company: "shop-1" }]);
  });

  it("does nothing without a code", async () => {
    const { db, updates } = fakeDb({});
    await keepSignUpCodeFor(db, "shop-1", { full_name: "Robin" });
    expect(updates).toEqual([]);
  });
});

describe("the trial page applies it", () => {
  it("through redeem_code, once, then clears it", async () => {
    const { db, rpcs, meta } = fakeDb({
      metadata: { promo_code: "CANNONBALL90", promo_company: "shop-1" },
      rpc: () => ({ data: { kind: "promo", code: "CANNONBALL90" }, error: null }),
    });
    expect(await applySignUpCode(db, "shop-1")).toEqual({ kind: "applied" });
    expect(rpcs).toEqual([
      { name: "redeem_code", args: { target_company: "shop-1", code: "CANNONBALL90" } },
    ]);
    expect(meta()).toMatchObject({ promo_code: null, promo_company: null });
    // A second visit: nothing more.
    expect(await applySignUpCode(db, "shop-1")).toEqual({ kind: "none" });
    expect(rpcs).toHaveLength(1);
  });

  it("never for a team the person joined by invite", async () => {
    const { db, rpcs } = fakeDb({
      metadata: { promo_code: "CANNONBALL90", promo_company: "shop-1" },
    });
    expect(await applySignUpCode(db, "other-shop")).toEqual({ kind: "none" });
    const notMade = fakeDb({ metadata: { promo_code: "CANNONBALL90" } });
    expect(await applySignUpCode(notMade.db, "shop-1")).toEqual({ kind: "none" });
    expect([...rpcs, ...notMade.rpcs]).toEqual([]);
  });

  it("hands a refusal to the code field, and doesn't try again", async () => {
    const { db, meta } = fakeDb({
      metadata: { promo_code: "CANNONBALL90", promo_company: "shop-1" },
      rpc: () => ({ data: null, error: { code: "22023", message: "That code isn’t valid." } }),
    });
    expect(await applySignUpCode(db, "shop-1")).toEqual({
      kind: "refused",
      code: "CANNONBALL90",
      error: "That code isn’t valid.",
    });
    expect(meta()).toMatchObject({ promo_code: null });
    const broken = fakeDb({
      metadata: { promo_code: "CANNONBALL90", promo_company: "shop-1" },
      rpc: () => ({ data: null, error: { code: "08006", message: "connection lost" } }),
    });
    expect(await applySignUpCode(broken.db, "shop-1")).toEqual({
      kind: "refused",
      code: "CANNONBALL90",
      error: "Couldn’t check the code. Try again.",
    });
  });

  it("says when it was a demo code", async () => {
    const { db } = fakeDb({
      metadata: { promo_code: "VIP26", promo_company: "shop-1" },
      rpc: () => ({ data: { kind: "demo", code: "VIP26" }, error: null }),
    });
    expect(await applySignUpCode(db, "shop-1")).toEqual({ kind: "demo" });
  });
});
