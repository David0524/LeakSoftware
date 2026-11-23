"use client";

import { useActionState, useCallback, useState } from "react";
import {
  afterTrialText,
  discountedCents,
  discountNote,
  formatCents,
  planForServices,
  planTier,
  servicesPriceCents,
  servicesPriceLines,
  TEAM_SIZE_MAX,
  TRIAL_OFFER,
  trialTerms,
  trialPackage,
  type CodeOffer,
  type Services,
} from "@leakbook/core";
import type { SubscribeState } from "@/app/actions/auth";
import { startCheckout } from "@/app/actions/onboarding";
import { AppliedCode, CodeField } from "./code-field";
import { Logo } from "./logo";
import { CheckoutPlaceholder, SubscriptionCheckout } from "./subscription-checkout";
import { TeamSizeStepper, useSettledTeamSize } from "./team-size";
import { Button, cx } from "./ui";
import { orOffline } from "@/lib/offline";

// A new shop's trial page (/welcome), straight after sign-up (owner, 2026-10-24: the
// questionnaire that came first is gone). The price for the shop's package and team (the owner
// picks how many people, owner 2026-11-12), what's included, then the card for the free trial
// (30 days; 3 months from the mailer), or a code: demo (VIP26), promo, or another shop's
// referral code, whose offer then shows in the price and trial (owner, 2026-11-23). With Stripe's
// publishable key the card form is embedded beside the offer (owner, 2026-10-24); without it
// the button opens Stripe's page. Copy: packages/core/src/trial-offer.ts.

const dollars = (c: number) => formatCents(c).replace(/\.00$/, "");
const longDate = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric" }).format(new Date(iso));

export function TrialOffer({
  services,
  people,
  teamSize,
  trialEnds,
  heardFrom = null,
  billing,
  publishableKey = null,
  offer = null,
  canEnterCode = true,
  refusedCode = null,
}: {
  services: Services;
  /** Active people on the team: the fewest the owner can pick. */
  people: number;
  /** The team size to start from: the one picked before, or the active people. */
  teamSize: number;
  trialEnds: string | null;
  /** The shop's answer to "How did you hear about us?": the mailer's shops get 3 months. */
  heardFrom?: string | null;
  /** Whether this server takes cards (Stripe billing); without it only a demo code gets in. */
  billing: boolean;
  /** Stripe's publishable key: with it (and billing), the card form is on this page. */
  publishableKey?: string | null;
  /** The promo or referral code applied, if any. */
  offer?: CodeOffer | null;
  /** Whether a code can still be entered (one per shop). */
  canEnterCode?: boolean;
  /** A sign-up link's code that couldn't be applied, shown in the open field with why. */
  refusedCode?: { code: string; error: string } | null;
}) {
  const pkg = TRIAL_OFFER[trialPackage(services)];
  const terms = trialTerms(heardFrom, offer);
  const [team, setTeam] = useState(Math.max(people, teamSize));
  // The card form is started for the team size the owner settles on.
  const settled = useSettledTeamSize(team);
  const startEmbedded = useCallback(() => startCheckout(settled), [settled]);
  const [state, act, pending] = useActionState(
    orOffline((_: SubscribeState, form: FormData) => startCheckout(Number(form.get("team_size")))),
    {},
  );
  const tier = planTier(planForServices(services), team);
  const fullCents = servicesPriceCents(services, team);
  const price = dollars(discountedCents(fullCents, offer?.percentOff));
  const discount = discountNote(fullCents, offer);
  // Every new shop comes to this payment page (owner, 2026-10-16). Without Stripe on the
  // server, cards can't be taken yet; a demo code (VIP26) still gets a shop in.
  const [showCode, setShowCode] = useState(!billing || Boolean(refusedCode));
  const embedded = billing && Boolean(publishableKey);
  const chargeNote = `You won’t be charged until ${trialEnds ? longDate(trialEnds) : terms.fromToday}; cancel before then in Settings › Sundeck Pro Billing and you never will be.`;
  const codeLink =
    billing && !showCode && canEnterCode ? (
      <button
        type="button"
        onClick={() => setShowCode(true)}
        className="mx-auto mt-1 block min-h-11 px-3 text-link"
      >
        Have a Code?
      </button>
    ) : null;
  // Phones: full screen, the button pinned above the home indicator. Wider screens: a window
  // centered under the logo, like a Mac setup assistant.
  return (
    <div className="flex flex-1 flex-col sm:items-center sm:px-6 sm:pb-12">
      <div className="mt-10 mb-6 hidden sm:block">
        <Logo height={36} />
      </div>
      <div
        className={cx(
          "mx-auto flex w-full max-w-md flex-1 flex-col px-4 pt-10 pb-8",
          "sm:max-w-lg sm:flex-none sm:rounded-[1.25rem] sm:bg-surface sm:px-10 sm:pt-8 sm:pb-10",
          // Embedded: the offer and the card form side by side on wide screens, stacked below.
          embedded && "lg:grid lg:max-w-5xl lg:grid-cols-2 lg:items-start lg:gap-x-10",
          "sm:shadow-[0_1px_2px_rgb(18_38_58/0.06),0_6px_20px_rgb(18_38_58/0.05)]",
          "sm:[&_.card]:bg-bg sm:[&_.card]:shadow-none sm:[&_.grouped]:bg-bg",
        )}
        data-testid="trial-offer"
      >
        <div>
          <h1 className="mb-6 font-display text-[2.125rem] leading-tight font-extrabold">
            {pkg.promise}
          </h1>
          <div className="card p-5">
            {/* The code used, first, so it's seen with the price it changed (2026-11-23). */}
            {offer ? <AppliedCode offer={offer} className="mb-3 font-semibold" /> : null}
            <p className="font-display text-5xl font-extrabold" data-testid="onboarding-price">
              {price}
              <span className="font-sans text-lg font-normal text-text-muted"> / month</span>
            </p>
            {discount ? (
              <p className="mt-1 font-semibold" data-testid="onboarding-discount">
                {discount}
              </p>
            ) : null}
            <p className="mt-1 text-text-muted">
              {tier.name}, for {team === 1 ? "1 person" : `${team} people`}.
            </p>
            <div className="mt-4 flex items-center justify-between gap-2">
              <p id="trial-team-size">People on your team</p>
              <TeamSizeStepper
                value={team}
                min={people}
                max={Math.max(people, TEAM_SIZE_MAX)}
                onChange={setTeam}
                labelledBy="trial-team-size"
                size="compact"
              />
            </div>
            <p className="mt-1 text-[0.9375rem] text-text-muted">
              Owners, office staff, and techs each count as one.
            </p>
            {/* Both: Pool Maintenance plus the leak detection add-on, spelled out (owner,
              2026-10-19). */}
            {services === "both" ? (
              <ul className="mt-3 space-y-1 text-[0.9375rem]" data-testid="onboarding-price-lines">
                {servicesPriceLines(services, team).map((l) => (
                  <li key={l.label} className="flex justify-between gap-3">
                    <span>{l.label}</span>
                    <span className="tabular-nums">{dollars(l.cents)}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            <ul className="mt-4 space-y-2">
              {[
                ...pkg.included,
                ...(services === "both"
                  ? ["Leak detection: inspections, tests, reports, and repair quotes"]
                  : []),
              ].map((f) => (
                <li key={f} className="flex gap-3">
                  <span aria-hidden="true" className="text-status-pass">
                    ✓
                  </span>
                  {f}
                </li>
              ))}
            </ul>
          </div>
        </div>
        {embedded ? (
          <div className="mt-6 lg:mt-0" data-testid="trial-checkout">
            <h2 className="mb-1 font-display text-[1.75rem] leading-tight font-extrabold">
              {terms.heading}
            </h2>
            <p className="mb-4 text-text-muted">
              {afterTrialText(fullCents, offer)} Add a card to start.
            </p>
            {settled === team ? (
              <SubscriptionCheckout
                // Starts again for a new team size or a code just applied.
                key={`${settled}-${offer?.code ?? ""}`}
                publishableKey={publishableKey!}
                start={startEmbedded}
              />
            ) : (
              <CheckoutPlaceholder />
            )}
            <p className="mt-3 text-center text-[0.9375rem] text-text-muted">{chargeNote}</p>
            {showCode && canEnterCode ? (
              <CodeField from="welcome" refused={refusedCode} />
            ) : (
              codeLink
            )}
          </div>
        ) : null}
        {embedded ? null : state.error ? (
          <p role="alert" className="mt-4 text-status-fail">
            {state.error}
          </p>
        ) : null}
        {embedded ? null : showCode && canEnterCode ? (
          <CodeField from="welcome" refused={refusedCode} />
        ) : null}
        {embedded ? null : (
          <form
            action={act}
            className="sticky bottom-0 -mx-4 mt-auto bg-bg/90 px-4 pt-6 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur sm:static sm:mx-0 sm:mt-8 sm:bg-transparent sm:p-0 sm:backdrop-blur-none"
          >
            <input type="hidden" name="team_size" value={team} />
            <Button type="submit" disabled={pending || !billing} className="w-full">
              {terms.button}
            </Button>
            <p className="mt-3 text-center text-[0.9375rem] text-text-muted">
              {billing
                ? `Add a card on Stripe’s secure page. ${chargeNote}`
                : "Card payments aren’t connected yet. Use a code above to continue."}
            </p>
            {codeLink}
          </form>
        )}
      </div>
    </div>
  );
}
