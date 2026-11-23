import { describe, expect, it } from "vitest";
import {
  addMonthsUtc,
  afterTrialText,
  appliedOfferText,
  couponId,
  couponMonths,
  discountedCents,
  discountNote,
  linkCode,
  normalizeCode,
  offerFromLookup,
  pendingSignUpCode,
  signUpCodeUrl,
  offerFromRow,
  offerText,
  referralCountText,
  referralRewardText,
  shopCodeText,
  referralShareText,
  trialTerms,
  validPromoCode,
  type CodeOffer,
} from "../src";

const promo = (over: Partial<CodeOffer> = {}): CodeOffer => ({
  kind: "promo",
  code: "MEET26",
  freeMonths: 0,
  percentOff: null,
  percentMonths: null,
  ...over,
});

describe("codes as typed", () => {
  it("ignores case, spaces and punctuation", () => {
    expect(normalizeCode(" meet-26 ")).toBe("MEET26");
    expect(normalizeCode("Blue Wave Pools, LLC")).toBe("BLUEWAVEPOOLSLLC");
    expect(normalizeCode("blue wave pools")).toBe("BLUEWAVEPOOLS");
    expect(normalizeCode(null)).toBe("");
  });

  it("takes 3 to 24 letters and numbers for a promo code", () => {
    expect(validPromoCode("meet26")).toBe(true);
    expect(validPromoCode("ab")).toBe(false);
    expect(validPromoCode("- -")).toBe(false);
    expect(validPromoCode("X".repeat(25))).toBe(false);
  });
});

describe("offers in words", () => {
  it("describes free months, a percent off, and both", () => {
    expect(offerText(promo({ freeMonths: 3 }))).toBe("3 months free");
    expect(offerText(promo({ freeMonths: 1 }))).toBe("1 month free");
    expect(offerText({ ...promo({ freeMonths: 1 }), kind: "referral" })).toBe("1 extra month free");
    expect(offerText(promo({ percentOff: 20, percentMonths: 12 }))).toBe("20% off for 12 months");
    expect(offerText(promo({ percentOff: 15 }))).toBe("15% off forever");
    expect(offerText(promo({ freeMonths: 2, percentOff: 20, percentMonths: 1 }))).toBe(
      "2 months free, then 20% off for 1 month",
    );
  });

  it("confirms the code, and who referred the shop", () => {
    expect(appliedOfferText(promo({ freeMonths: 3 }))).toBe("Code MEET26: 3 months free.");
    expect(
      appliedOfferText({
        kind: "referral",
        code: "CANYONSTATEPOOLS",
        freeMonths: 1,
        percentOff: null,
        percentMonths: null,
        referrerName: "Canyon State Pools",
      }),
    ).toBe("Code CANYONSTATEPOOLS: 1 extra month free, thanks to Canyon State Pools.");
  });

  it("reads the subscription row", () => {
    expect(offerFromRow(null)).toBeNull();
    expect(offerFromRow({ promo_code: null })).toBeNull();
    expect(
      offerFromRow({
        promo_code: "MEET26",
        promo_kind: "promo",
        promo_free_months: 3,
        promo_percent_off: 20,
        promo_percent_months: 12,
      }),
    ).toEqual({
      ...promo({ freeMonths: 3, percentOff: 20, percentMonths: 12 }),
      referrerName: null,
    });
    expect(
      offerFromRow(
        { promo_code: "CANYONSTATEPOOLS", promo_kind: "referral", promo_free_months: 1 },
        "Canyon State Pools",
      ),
    ).toMatchObject({ kind: "referral", freeMonths: 1, referrerName: "Canyon State Pools" });
  });
});

describe("prices with a percent off", () => {
  it("rounds the discount to the cent", () => {
    expect(discountedCents(7_900, 20)).toBe(6_320);
    expect(discountedCents(7_900, null)).toBe(7_900);
    expect(discountedCents(14_999, 33)).toBe(10_049);
    expect(discountedCents(7_900, 100)).toBe(0);
  });

  it("says what is paid after the trial", () => {
    expect(afterTrialText(7_900, null)).toBe("Then $79 a month.");
    expect(afterTrialText(7_900, promo({ percentOff: 20, percentMonths: 12 }))).toBe(
      "Then $63.20 a month for 12 months, then $79.",
    );
    expect(afterTrialText(7_900, promo({ percentOff: 20 }))).toBe("Then $63.20 a month.");
    expect(discountNote(7_900, promo({ percentOff: 20, percentMonths: 12 }))).toBe(
      "20% off your first 12 paid months, then $79 a month.",
    );
    expect(discountNote(7_900, promo({ percentOff: 20 }))).toBe(
      "20% off for as long as you subscribe.",
    );
    expect(discountNote(7_900, promo({ freeMonths: 3 }))).toBeNull();
  });
});

describe("trial length with a code", () => {
  it("makes a promo's free months the trial's length, like the mailer's 3 months", () => {
    expect(trialTerms(null, { kind: "promo", freeMonths: 3 })).toEqual({
      button: "Start 3-Month Free Trial",
      heading: "3 months free",
      fromToday: "3 months from today",
    });
    // Never shorter than the trial the shop already had.
    expect(trialTerms("mailer", { kind: "promo", freeMonths: 2 }).heading).toBe("3 months free");
    expect(trialTerms(null, { kind: "promo", freeMonths: 1 }).heading).toBe("30 days free");
    expect(trialTerms(null, { kind: "promo", freeMonths: 0 }).heading).toBe("30 days free");
  });

  it("adds a referral's month to the trial", () => {
    expect(trialTerms(null, { kind: "referral", freeMonths: 1 }).button).toBe(
      "Start 2-Month Free Trial",
    );
    expect(trialTerms("mailer", { kind: "referral", freeMonths: 1 }).heading).toBe("4 months free");
  });
});

describe("the Stripe coupon", () => {
  it("adds calendar months, holding the day to the month's end", () => {
    expect(addMonthsUtc(new Date("2026-01-31T12:00:00Z"), 1).toISOString()).toBe(
      "2026-02-28T12:00:00.000Z",
    );
    expect(addMonthsUtc(new Date("2026-11-23T00:00:00Z"), 14).toISOString()).toBe(
      "2028-01-23T00:00:00.000Z",
    );
  });

  it("lasts the trial's whole months plus the paid months", () => {
    const now = new Date("2026-11-23T18:00:00Z");
    // 30 days, ending at the close of day 30: one whole month of trial.
    expect(couponMonths(12, now, new Date("2026-12-24T06:59:59Z"))).toBe(13);
    // Ending just before a month is up: no whole month.
    expect(couponMonths(12, now, new Date("2026-12-22T06:59:59Z"))).toBe(12);
    // 3 months free, to the close of the day: three whole months.
    expect(couponMonths(12, now, new Date("2027-02-24T06:59:59Z"))).toBe(15);
    // No trial left: billing starts now.
    expect(couponMonths(6, now, null)).toBe(6);
  });

  it("has one id per offer", () => {
    expect(couponId(20, 15)).toBe("sundeckpro_20off_15mo");
    expect(couponId(10, null)).toBe("sundeckpro_10off_forever");
  });
});

describe("referrals", () => {
  it("shares the code with the sign-up link", () => {
    expect(referralShareText("CANYONSTATEPOOLS", "https://sundeckpro.com")).toBe(
      "Try Sundeck Pro for your pool business. Enter code CANYONSTATEPOOLS when you start your free trial and get an extra month free: https://sundeckpro.com/sign-up?code=CANYONSTATEPOOLS",
    );
    // The link carries the code, so tapping it applies the extra month (2026-11-23).
    expect(referralShareText("BLUEWAVEPOOLS", "http://localhost:3000")).toMatch(
      / http:\/\/localhost:3000\/sign-up\?code=BLUEWAVEPOOLS$/,
    );
  });

  it("counts the shops and months", () => {
    expect(referralCountText(0, 0)).toBe("No shops have used your code yet.");
    expect(referralCountText(1, 0)).toBe(
      "1 shop has used your code. Your free month comes when it starts paying.",
    );
    expect(referralCountText(3, 2)).toBe("3 shops have used your code. 2 free months earned.");
    expect(referralCountText(1, 1)).toBe("1 shop has used your code. 1 free month earned.");
  });
});

describe("the Admin portal's lines", () => {
  it("names the code and offer, or who referred the shop", () => {
    expect(shopCodeText({ promo_code: "MEET26", promo_kind: "promo", promo_free_months: 3 })).toBe(
      "MEET26 · 3 months free",
    );
    expect(
      shopCodeText({
        promo_code: "BLUEWAVEPOOLS",
        promo_kind: "referral",
        promo_free_months: 1,
        referred_by_name: "Blue Wave Pools",
      }),
    ).toBe("BLUEWAVEPOOLS · referred by Blue Wave Pools");
    expect(shopCodeText({ promo_code: null })).toBeNull();
  });

  it("says how the referring shop was given its month", () => {
    expect(referralRewardText("credit", 7_900)).toBe("$79.00 credit in Stripe");
    expect(referralRewardText("trial", null)).toBe("A month added to its trial");
    expect(referralRewardText(null, null)).toBe("Waiting for the first payment");
  });
});

describe("a sign-up link that carries a code", () => {
  it("reads the code in any case, spaces and dashes ignored", () => {
    expect(linkCode("CANNONBALL90")).toBe("CANNONBALL90");
    expect(linkCode("cannonball90")).toBe("CANNONBALL90");
    expect(linkCode(" Cannonball-90 ")).toBe("CANNONBALL90");
    expect(linkCode(["meet26", "other"])).toBe("MEET26");
  });

  it("ignores nothing, too short, too long, or not text", () => {
    expect(linkCode(undefined)).toBeNull();
    expect(linkCode("")).toBeNull();
    expect(linkCode("ab")).toBeNull();
    expect(linkCode("A".repeat(41))).toBeNull();
    expect(linkCode(42)).toBeNull();
  });

  it("makes the card's link", () => {
    expect(signUpCodeUrl("cannonball90")).toBe("https://sundeckpro.com/sign-up?code=CANNONBALL90");
    expect(signUpCodeUrl("MEET26", "http://localhost:3000")).toBe(
      "http://localhost:3000/sign-up?code=MEET26",
    );
  });

  it("shows the database's offer with the trial page's wording", () => {
    const promo = offerFromLookup({
      kind: "promo",
      code: "CANNONBALL90",
      free_months: 3,
      percent_off: null,
      percent_months: null,
    });
    expect(promo && appliedOfferText(promo)).toBe("Code CANNONBALL90: 3 months free.");
    const referral = offerFromLookup({
      kind: "referral",
      code: "BLUEWAVEPOOLS",
      free_months: 1,
      percent_off: null,
      percent_months: null,
      referrer_name: "Blue Wave Pools",
    });
    expect(referral && appliedOfferText(referral)).toBe(
      "Code BLUEWAVEPOOLS: 1 extra month free, thanks to Blue Wave Pools.",
    );
    expect(offerFromLookup(null)).toBeNull();
    expect(offerFromLookup({ kind: "demo", code: "VIP26" })).toBeNull();
  });

  it("carries the code only to the shop its account made", () => {
    const meta = { promo_code: "CANNONBALL90", promo_company: "shop-1" };
    expect(pendingSignUpCode(meta, "shop-1")).toBe("CANNONBALL90");
    // Joined another team by invite: never applied there.
    expect(pendingSignUpCode(meta, "shop-2")).toBeNull();
    // Before the shop is made.
    expect(pendingSignUpCode({ promo_code: "CANNONBALL90" }, "shop-1")).toBeNull();
    expect(pendingSignUpCode({ promo_code: null, promo_company: "shop-1" }, "shop-1")).toBeNull();
    expect(pendingSignUpCode(undefined, "shop-1")).toBeNull();
  });
});
