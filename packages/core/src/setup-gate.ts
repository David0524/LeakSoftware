import type { CompanyAccess } from "./billing";

/**
 * A new shop's setup must be finished before its owner works in it (owner, 2026-10-24: "shops
 * should have to submit a credit card for the trial"). The website sends that owner to the
 * trial page (/welcome: a card on Stripe's page, or a demo code); the iPhone and Android apps
 * show a plain screen instead, with no link to the website or the price (App Store rule
 * 3.1.1). One rule for all of them, from public.company_access.
 *
 * - Only owners are held, as on the website: only an owner can finish setup. Admins and techs
 *   get in; until the card is in, the database keeps the shop read-only and the banner (the
 *   sync bar in the apps) says so.
 * - `onboarded` is set when the card is in or a demo code is used. Shops from before onboarding
 *   existed were backfilled (20261012003600_onboarding.sql), and the demo shop is seeded with it.
 * - A demo shop never needs a card, including one made a demo in the Admin portal before its
 *   owner finished setup.
 * - Unknown (no answer yet, an older server without `onboarded`): let in. The database still
 *   refuses changes to a shop that needs its card.
 */
export function mustFinishSetup(
  access: Pick<CompanyAccess, "onboarded" | "plan"> | null | undefined,
  role: string | null | undefined,
): boolean {
  if (!access || role !== "owner") return false;
  if (access.plan === "demo") return false;
  return access.onboarded === false;
}

/** The apps' screen for an owner whose shop isn't set up yet. */
export const FINISH_SETUP_TITLE = "Finish Setting Up Your Account";
export const FINISH_SETUP_BODY =
  "Your shop’s setup isn’t finished yet. Sign in on a computer to finish it, then come back here.";
/** After Check Again, when setup still isn't finished. */
export const FINISH_SETUP_STILL = "Setup isn’t finished yet. Check again once it’s done.";
/** After Check Again without a connection. */
export const FINISH_SETUP_OFFLINE = "No connection. Try again when you’re online.";
/** After Check Again, when the server couldn't answer. */
export const FINISH_SETUP_FAILED = "Couldn’t check right now. Try again in a minute.";
