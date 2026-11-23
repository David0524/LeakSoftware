"use client";

import { use, useState, useSyncExternalStore } from "react";
import { referralShareText } from "@leakbook/core";
import type { ReferralOffer } from "@/server/referral";
import { GiftIcon, ShareIcon } from "./icons";
import { ReferralCard } from "./referral-card";
import { Sheet } from "./sheet";
import { cx } from "./ui";

// Give a Month, Get a Month on More and in the account menu (owner, 2026-11-23: "Referral
// links should be more visible … in a color that differs from all of the other buttons
// there"). The brand's orange accent, which More uses nowhere else: a soft orange wash over
// the card color (navy text on it, 13.8:1; light text in dark mode, 11.9:1), a round orange
// gift badge and an orange Share pill with navy text (4.9:1; white on this orange is ruled out,
// brand/BRAND.md). Website only: the apps show no subscription offers (App Store 3.1.3(f)).

/** The orange wash, mixed over the card color so it reads the same on any page background. */
export const REFERRAL_TINT =
  "bg-[color-mix(in_srgb,var(--color-safety)_10%,var(--color-surface))] dark:bg-[color-mix(in_srgb,var(--color-safety)_14%,var(--color-surface))]";

export const REFERRAL_TITLE = "Give a Month, Get a Month";
export const REFERRAL_PITCH = "Share your code. They get an extra month free, and so do you.";

const noChanges = () => () => {};

/** A share sheet (phones, Safari): known only in the browser. */
function useCanShare() {
  return useSyncExternalStore(
    noChanges,
    () => "share" in navigator,
    () => false,
  );
}

/** The billing page's full card (Copy Code, Share or Copy Message, shops that used it). */
function ReferralSheet({
  offer,
  open,
  onClose,
}: {
  offer: ReferralOffer;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={REFERRAL_TITLE} doneOnly>
      <ReferralCard
        code={offer.code}
        used={offer.used}
        earned={offer.earned}
        signUpUrl={offer.signUpUrl}
      />
    </Sheet>
  );
}

function Badge({ small = false }: { small?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        "grid shrink-0 place-items-center rounded-full bg-safety text-navy",
        small ? "size-8" : "size-11",
      )}
    >
      <GiftIcon className={small ? "size-[1.125rem]" : "size-6"} />
    </span>
  );
}

/**
 * More (phones, and the Account and Help page on a computer): a tinted card near the top with
 * the code and Share. Share opens the share sheet where there is one; elsewhere, and from
 * anywhere else on the card, the sheet with Copy Code and Copy Message opens.
 */
export function ReferralOfferCard({ offer }: { offer: ReferralOffer }) {
  const [open, setOpen] = useState(false);
  const canShare = useCanShare();
  const share = async () => {
    if (!canShare) return setOpen(true);
    try {
      await navigator.share({ text: referralShareText(offer.code, offer.signUpUrl) });
    } catch {
      // Closed the share sheet.
    }
  };
  return (
    <section
      aria-label={REFERRAL_TITLE}
      data-testid="referral-offer"
      className={cx("relative overflow-hidden rounded-[1.25rem] p-4", REFERRAL_TINT)}
    >
      {/* The card body opens the sheet. It sits under the content, which lets taps through
          except on Share, so the two buttons never nest. */}
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className="absolute inset-0 rounded-[inherit] hover:bg-safety/[0.06] focus-visible:outline-3 focus-visible:-outline-offset-3 focus-visible:outline-focus active:bg-safety/10"
      >
        <span className="sr-only">
          {REFERRAL_TITLE}: your code {offer.code}, Copy Code, and shops that used it
        </span>
      </button>
      <div className="pointer-events-none relative flex items-start gap-3">
        <Badge />
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-[1.25rem] leading-tight font-bold text-text">
            {REFERRAL_TITLE}
          </h2>
          <p className="mt-0.5 text-[0.9375rem] text-text-muted">{REFERRAL_PITCH}</p>
        </div>
        <span aria-hidden="true" className="shrink-0 text-xl leading-none text-text-muted/70">
          ›
        </span>
      </div>
      {/* The code on a cut-out ticket, the card's one bit of decoration, then Share. A shop
          name makes codes up to 20 letters: longer ones get smaller type, so they stay on one
          line at phone width. */}
      <div className="pointer-events-none relative mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
        <p
          className="min-w-0 flex-1 rounded-xl border-[1.5px] border-dashed border-safety-deep/45 bg-surface px-3 py-1.5 dark:border-safety/50"
          data-testid="referral-offer-code"
        >
          <span className="block text-[0.75rem] font-semibold tracking-wide text-text-muted uppercase">
            Your code
          </span>
          <span
            className={cx(
              "block font-display leading-tight font-extrabold break-all text-text",
              offer.code.length <= 12
                ? "text-[1.75rem] tracking-wide"
                : offer.code.length <= 16
                  ? "text-[1.5rem] tracking-wide"
                  : "text-[1.3125rem] sm:text-[1.5rem]",
            )}
          >
            {offer.code}
          </span>
        </p>
        <button
          type="button"
          onClick={share}
          className="pointer-events-auto inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-full bg-safety px-6 text-[1.0625rem] font-bold text-navy transition hover:brightness-105 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus active:brightness-95"
        >
          <ShareIcon className="size-5" />
          Share
        </button>
      </div>
      <ReferralSheet offer={offer} open={open} onClose={() => setOpen(false)} />
    </section>
  );
}

/**
 * The account menu on a computer (where Contact Us lives): one tinted item that opens the
 * same sheet. The summary loads beside the page and never holds up the header; until it
 * arrives, or when there's nothing to share, the item isn't there.
 */
export function ReferralMenuItem({ offer }: { offer: Promise<ReferralOffer | null> }) {
  const found = use(offer);
  const [open, setOpen] = useState(false);
  if (!found) return null;
  return (
    <div className="px-2 pb-2">
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        data-testid="referral-menu-item"
        className={cx(
          "flex min-h-11 w-full items-center gap-3 rounded-[0.625rem] px-2.5 py-2 text-left hover:brightness-[0.98] dark:hover:brightness-110",
          REFERRAL_TINT,
        )}
      >
        <Badge small />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold whitespace-nowrap text-text">{REFERRAL_TITLE}</span>
          <span className="block truncate font-display text-[0.875rem] font-bold tracking-wide text-text-muted">
            <span className="sr-only">Your code: </span>
            {found.code}
          </span>
        </span>
      </button>
      <ReferralSheet offer={found} open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
