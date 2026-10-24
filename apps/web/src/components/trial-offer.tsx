"use client";

import { useActionState, useState } from "react";
import {
  formatCents,
  planForServices,
  planTier,
  servicesPriceCents,
  servicesPriceLines,
  TRIAL_OFFER,
  trialPackage,
  type Services,
} from "@leakbook/core";
import { redeemCode, startCheckout } from "@/app/actions/onboarding";
import { Logo } from "./logo";
import { Button, cx } from "./ui";
import { orOffline } from "@/lib/offline";

// A new shop's trial page (/welcome), straight after sign-up (owner, 2026-10-24: the
// questionnaire that came first is gone). The price for the shop's package and team, what's
// included, then the card on Stripe's page for the 30-day free trial, or a demo code (VIP26).
// Copy: packages/core/src/trial-offer.ts.

const dollars = (c: number) => formatCents(c).replace(/\.00$/, "");
const longDate = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric" }).format(new Date(iso));

export function TrialOffer({
  services,
  people,
  trialEnds,
  billing,
}: {
  services: Services;
  /** Active people on the team: the price follows them. */
  people: number;
  trialEnds: string | null;
  /** Whether this server takes cards (Stripe billing); without it only a demo code gets in. */
  billing: boolean;
}) {
  const offer = TRIAL_OFFER[trialPackage(services)];
  const [state, act, pending] = useActionState(orOffline(startCheckout), {});
  const tier = planTier(planForServices(services), people);
  const price = dollars(servicesPriceCents(services, people));
  // Every new shop comes to this payment page (owner, 2026-10-16). Without Stripe on the
  // server, cards can't be taken yet; a demo code (VIP26) still gets a shop in.
  const [showCode, setShowCode] = useState(!billing);
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
          "sm:shadow-[0_1px_2px_rgb(18_38_58/0.06),0_6px_20px_rgb(18_38_58/0.05)]",
          "sm:[&_.card]:bg-bg sm:[&_.card]:shadow-none sm:[&_.grouped]:bg-bg",
        )}
        data-testid="trial-offer"
      >
        <h1 className="mb-6 font-display text-[2.125rem] leading-tight font-extrabold">
          {offer.promise}
        </h1>
        <div className="card p-5">
          <p className="font-display text-5xl font-extrabold" data-testid="onboarding-price">
            {price}
            <span className="font-sans text-lg font-normal text-text-muted"> / month</span>
          </p>
          <p className="mt-1 text-text-muted">
            {tier.name}, for {people === 1 ? "1 person" : `${people} people`}. The price follows the
            people on your team.
          </p>
          {/* Both: Pool Maintenance plus the leak detection add-on, spelled out (owner,
              2026-10-19). */}
          {services === "both" ? (
            <ul className="mt-3 space-y-1 text-[0.9375rem]" data-testid="onboarding-price-lines">
              {servicesPriceLines(services, people).map((l) => (
                <li key={l.label} className="flex justify-between gap-3">
                  <span>{l.label}</span>
                  <span className="tabular-nums">{dollars(l.cents)}</span>
                </li>
              ))}
            </ul>
          ) : null}
          <ul className="mt-4 space-y-2">
            {[
              ...offer.included,
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
        {state.error ? (
          <p role="alert" className="mt-4 text-status-fail">
            {state.error}
          </p>
        ) : null}
        {showCode ? <DemoCode /> : null}
        <form
          action={act}
          className="sticky bottom-0 -mx-4 mt-auto bg-bg/90 px-4 pt-6 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur sm:static sm:mx-0 sm:mt-8 sm:bg-transparent sm:p-0 sm:backdrop-blur-none"
        >
          <Button type="submit" disabled={pending || !billing} className="w-full">
            Start 30-Day Free Trial
          </Button>
          <p className="mt-3 text-center text-[0.9375rem] text-text-muted">
            {billing
              ? `Add a card on Stripe’s secure page. You won’t be charged until ${trialEnds ? longDate(trialEnds) : "30 days from today"}; cancel before then in Settings › Sundeck Pro Billing and you never will be.`
              : "Card payments aren’t connected yet. Use a demo code above to continue."}
          </p>
          {billing && !showCode ? (
            <button
              type="button"
              onClick={() => setShowCode(true)}
              className="mx-auto mt-1 block min-h-11 px-3 text-link"
            >
              Have a Demo Code?
            </button>
          ) : null}
        </form>
      </div>
    </div>
  );
}

/** A demo code instead of a card (VIP26): the shop gets in with no card and no charge. */
function DemoCode() {
  const [state, act, pending] = useActionState(orOffline(redeemCode), {});
  const error = state.fields?.code;
  return (
    <form action={act} className="mt-6">
      <label
        htmlFor="demo-code"
        className="mb-1 block px-4 text-[0.8125rem] text-text-muted uppercase"
      >
        Demo code
      </label>
      <div className="grouped flex items-center gap-2 py-1 pr-1 pl-4">
        <input
          id="demo-code"
          name="code"
          defaultValue={state.values?.code ?? ""}
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder="Enter code"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "demo-code-error" : undefined}
          className="min-h-11 min-w-0 flex-1 bg-transparent text-[1.0625rem] uppercase outline-none placeholder:normal-case"
        />
        <Button type="submit" kind="secondary" disabled={pending}>
          Apply
        </Button>
      </div>
      {error ? (
        <p
          id="demo-code-error"
          role="alert"
          className="mt-2 px-4 text-[0.9375rem] text-status-fail"
        >
          {error}
        </p>
      ) : null}
    </form>
  );
}
