import { formatCents, type Cents } from "./money";

// Promo and referral codes (owner, 2026-11-23; docs/design/2026-11-23-promo-and-referral-codes.md).
// One field takes every code: demo codes (no card, no charge), promo codes made by Sundeck Pro
// staff (free months and/or a percent off), and each shop's own referral code, its name
// (owner: "Maybe the companies name actually?"): an extra month for the new shop, and a free
// month for the shop that shared it once the new shop pays.
// The database (public.redeem_code) checks and applies them; this is the wording and the math
// the pages and Checkout share.

/** A shop gets this many extra free months for using another shop's referral code. */
export const REFERRAL_FREE_MONTHS = 1;
/** And the shop that shared the code gets this many when the new shop first pays. */
export const REFERRAL_REWARD_MONTHS = 1;
/** The most free months a promo code can add, and the most months a percent off can last. */
export const PROMO_MAX_FREE_MONTHS = 12;
export const PROMO_MAX_PERCENT_MONTHS = 36;

/**
 * A code as people type it: any case, spaces and punctuation ignored ("meet-26 " is MEET26,
 * "Blue Wave Pools" is BLUEWAVEPOOLS). The database's app.normalize_code does the same.
 */
export function normalizeCode(raw: string | null | undefined): string {
  return (raw ?? "").replace(/[^A-Za-z0-9]+/g, "").toUpperCase();
}

/** A promo code staff can make: 3 to 24 letters and numbers. */
export function validPromoCode(raw: string | null | undefined): boolean {
  return /^[A-Z0-9]{3,24}$/.test(normalizeCode(raw));
}

/** The offer a shop has applied, as kept on its subscription row. */
export interface CodeOffer {
  kind: "promo" | "referral";
  code: string;
  /**
   * A promo code's free months: the trial runs this many months from sign-up ("3 months
   * free", like the mailer). A referral code's: the month added to the trial.
   */
  freeMonths: number;
  /** Percent off the monthly price, or null. */
  percentOff: number | null;
  /** Paid months the percent off lasts; null with a percent off means for good. */
  percentMonths: number | null;
  /** For a referral: the shop whose code it was. */
  referrerName?: string | null;
}

/** The subscription row's promo columns (or the database's applied offer) as a CodeOffer. */
export function offerFromRow(
  row:
    | {
        promo_code?: string | null;
        promo_kind?: string | null;
        promo_free_months?: number | null;
        promo_percent_off?: number | null;
        promo_percent_months?: number | null;
      }
    | null
    | undefined,
  referrerName: string | null = null,
): CodeOffer | null {
  if (!row?.promo_code || (row.promo_kind !== "promo" && row.promo_kind !== "referral"))
    return null;
  const percent = row.promo_percent_off ?? null;
  return {
    kind: row.promo_kind,
    code: row.promo_code,
    freeMonths: Math.max(0, row.promo_free_months ?? 0),
    percentOff: percent && percent > 0 ? percent : null,
    percentMonths: percent && row.promo_percent_months ? row.promo_percent_months : null,
    referrerName: row.promo_kind === "referral" ? referrerName : null,
  };
}

const months = (n: number) => (n === 1 ? "1 month" : `${n} months`);

/** The percent off in words: "20% off for 12 months", "20% off forever". */
export function percentText(percentOff: number, percentMonths: number | null): string {
  return percentMonths
    ? `${percentOff}% off for ${months(percentMonths)}`
    : `${percentOff}% off forever`;
}

/**
 * The offer in a few words, for the pages and the Admin portal: "3 months free", "20% off for
 * 12 months", "3 months free, then 20% off for 12 months"; a referral's "1 extra month free".
 */
export function offerText(
  offer: Pick<CodeOffer, "freeMonths" | "percentOff" | "percentMonths"> & {
    kind?: CodeOffer["kind"];
  },
): string {
  const free =
    offer.freeMonths > 0
      ? offer.kind === "referral"
        ? `${offer.freeMonths === 1 ? "1 extra month" : `${offer.freeMonths} extra months`} free`
        : `${months(offer.freeMonths)} free`
      : null;
  const off = offer.percentOff ? percentText(offer.percentOff, offer.percentMonths) : null;
  if (free && off) return `${free}, then ${off}`;
  return free ?? off ?? "No offer";
}

/** The line that confirms a code on the trial page and Billing: "Code MEET26: 3 extra months free." */
export function appliedOfferText(offer: CodeOffer): string {
  const from =
    offer.kind === "referral" && offer.referrerName ? `, thanks to ${offer.referrerName}` : "";
  return `Code ${offer.code}: ${offerText(offer)}${from}.`;
}

/** The monthly price with the percent off, in cents (rounded as Stripe rounds a discount). */
export function discountedCents(cents: Cents, percentOff: number | null | undefined): Cents {
  if (!percentOff) return cents;
  return cents - Math.round((cents * Math.min(100, Math.max(0, percentOff))) / 100);
}

const dollars = (c: Cents) => formatCents(c).replace(/\.00$/, "");

/**
 * Under the price when a percent off applies: "20% off your first 12 paid months, then $79 a
 * month." or "20% off for as long as you subscribe." Null without one.
 */
export function discountNote(fullCents: Cents, offer: CodeOffer | null): string | null {
  if (!offer?.percentOff) return null;
  if (!offer.percentMonths) return `${offer.percentOff}% off for as long as you subscribe.`;
  return `${offer.percentOff}% off your first ${offer.percentMonths === 1 ? "paid month" : `${offer.percentMonths} paid months`}, then ${dollars(fullCents)} a month.`;
}

/**
 * What the shop pays once the trial ends: "Then $79 a month.", "Then $63.20 a month for 12
 * months, then $79.", "Then $63.20 a month."
 */
export function afterTrialText(fullCents: Cents, offer: CodeOffer | null): string {
  if (!offer?.percentOff) return `Then ${dollars(fullCents)} a month.`;
  const paid = dollars(discountedCents(fullCents, offer.percentOff));
  return offer.percentMonths
    ? `Then ${paid} a month for ${months(offer.percentMonths)}, then ${dollars(fullCents)}.`
    : `Then ${paid} a month.`;
}

/** `date` plus `n` calendar months in UTC, the day held to the month's last (Jan 31 + 1 = Feb 28). */
export function addMonthsUtc(date: Date, n: number): Date {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + n;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(
    Date.UTC(
      y,
      m,
      Math.min(date.getUTCDate(), last),
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
      date.getUTCMilliseconds(),
    ),
  );
}

/**
 * How many months the Stripe coupon must last so the percent off covers exactly `paidMonths`
 * paid bills. A repeating coupon's months count from when it's applied (Checkout, the start of
 * the trial), so the whole months of trial left are added: a 30-day trial (which Checkout ends
 * at the close of day 30, just past a calendar month) and "20% off for 12 months" is a
 * 13-month coupon, ending before the 13th paid bill.
 */
export function couponMonths(paidMonths: number, now: Date, trialEnd: Date | null): number {
  let trial = 0;
  if (trialEnd) while (addMonthsUtc(now, trial + 1).getTime() <= trialEnd.getTime()) trial++;
  return paidMonths + trial;
}

/** The Stripe coupon's id: made once per offer and reused ("sundeckpro_20off_13mo"). */
export function couponId(percentOff: number, durationMonths: number | null): string {
  return `sundeckpro_${percentOff}off_${durationMonths ? `${durationMonths}mo` : "forever"}`;
}

/** The share text for a shop's referral code. */
export function referralShareText(code: string, signUpUrl: string): string {
  return `Try Sundeck Pro for your pool business. Enter code ${code} when you start your free trial and get an extra month free: ${signUpUrl}`;
}

/** Under the referral code: how many shops used it and the months earned. */
export function referralCountText(used: number, earned: number): string {
  if (used <= 0) return "No shops have used your code yet.";
  const shops = used === 1 ? "1 shop has" : `${used} shops have`;
  if (earned <= 0)
    return `${shops} used your code. Your free month comes when ${used === 1 ? "it starts" : "each starts"} paying.`;
  return `${shops} used your code. ${earned === 1 ? "1 free month" : `${earned} free months`} earned.`;
}

/** The Admin portal's line for the code a shop used: "MEET26 · 3 months free", "… · referred by …". */
export function shopCodeText(s: {
  promo_code?: string | null;
  promo_kind?: string | null;
  promo_free_months?: number | null;
  promo_percent_off?: number | null;
  promo_percent_months?: number | null;
  referred_by_name?: string | null;
}): string | null {
  const offer = offerFromRow(s, s.referred_by_name ?? null);
  if (!offer) return null;
  if (offer.kind === "referral")
    return `${offer.code} · referred by ${offer.referrerName ?? "a closed shop"}`;
  return `${offer.code} · ${offerText(offer)}`;
}

/** The referring shop's free month, for the Admin portal. */
export function referralRewardText(
  reward: "credit" | "trial" | "none" | null | undefined,
  cents: number | null | undefined,
): string {
  switch (reward) {
    case "credit":
      return `${formatCents(cents ?? 0)} credit in Stripe`;
    case "trial":
      return "A month added to its trial";
    case "none":
      return "None (demo or canceled shop)";
    default:
      return "Waiting for the first payment";
  }
}
