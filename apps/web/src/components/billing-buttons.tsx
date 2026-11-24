"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import {
  discountedCents,
  discountNote,
  formatCents,
  overriddenCents,
  overrideActive,
  overrideText,
  servicesPriceCents,
  TEAM_SIZE_MAX,
  type CodeOffer,
  type PriceList,
  type PriceOverride,
  type Services,
} from "@leakbook/core";
import { manageBilling, setTeamSize, subscribe } from "@/app/actions/billing";
import { CheckoutPlaceholder, SubscriptionCheckout } from "./subscription-checkout";
import { TeamSizeStepper, useSettledTeamSize } from "./team-size";
import { Button, Notice } from "./ui";
import { isNoConnection, NO_CONNECTION, orOffline } from "@/lib/offline";

/**
 * Subscribe or Manage Billing. With Stripe's publishable key, Subscribe opens Stripe's card
 * form here on the page (owner, 2026-10-24: embedded, as on the trial page); without it, and
 * for Manage Billing, Stripe's own page. Subscribe is for `teamSize` people (owner, 2026-11-12).
 */
export function BillingButton({
  kind,
  publishableKey = null,
  teamSize = 1,
}: {
  kind: "subscribe" | "manage";
  publishableKey?: string | null;
  teamSize?: number;
}) {
  const [open, setOpen] = useState(false);
  const settled = useSettledTeamSize(teamSize);
  const start = useCallback(() => subscribe(settled), [settled]);
  const [state, action, pending] = useActionState(
    orOffline(() => (kind === "subscribe" ? subscribe(teamSize) : manageBilling())),
    {},
  );
  if (kind === "subscribe" && publishableKey) {
    if (!open)
      return (
        <Button type="button" onClick={() => setOpen(true)}>
          Subscribe
        </Button>
      );
    // The card form starts again for the team size the owner settles on.
    return settled === teamSize ? (
      <SubscriptionCheckout key={settled} publishableKey={publishableKey} start={start} />
    ) : (
      <CheckoutPlaceholder />
    );
  }
  return (
    <form action={action} className="space-y-3">
      <Button
        type="submit"
        kind={kind === "subscribe" ? "primary" : "secondary"}
        disabled={pending}
      >
        {pending ? "Opening Stripe…" : kind === "subscribe" ? "Subscribe" : "Manage Billing"}
      </Button>
      {state.error ? <Notice tone="error">{state.error}</Notice> : null}
    </form>
  );
}

const people = (n: number) => (n === 1 ? "1 person" : `${n} people`);

/**
 * Sundeck Pro Billing's price and team size (owner, 2026-11-12): the owner picks how many people
 * the shop pays for, from its active people up, and the price follows. A subscribed shop's
 * change is saved as they settle on it and shows on the next bill; otherwise Subscribe takes it.
 */
export function BillingPlan({
  name,
  services,
  billed,
  active,
  subscribed,
  publishableKey,
  offer = null,
  pricing = null,
}: {
  name: string;
  services: Services;
  /** The people billed now. */
  billed: number;
  /** Active people: the fewest that can be picked. */
  active: number;
  subscribed: boolean;
  publishableKey: string | null;
  /** A promo code's percent off (owner, 2026-11-23), shown in the price. */
  offer?: CodeOffer | null;
  /** The shop's price list and staff's own price for it (owner, 2026-11-24). */
  pricing?: { prices: PriceList; override: PriceOverride | null; today: string } | null;
}) {
  const [team, setTeam] = useState(Math.max(active, billed));
  const settled = useSettledTeamSize(team);
  const saved = useRef(billed);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!subscribed || settled === saved.current) return;
    saved.current = settled;
    setTeamSize(settled).then(
      (r) => setError(r.error ?? null),
      (e) => setError(isNoConnection(e) ? NO_CONNECTION : "Couldn’t save. Try again."),
    );
  }, [settled, subscribed]);
  const fullCents = pricing
    ? overriddenCents(
        servicesPriceCents(services, team, pricing.prices),
        pricing.override,
        pricing.today,
      )
    : servicesPriceCents(services, team);
  const discount = discountNote(fullCents, offer);
  const own = pricing && overrideActive(pricing.override, pricing.today) ? pricing.override : null;
  return (
    <>
      <div>
        <p data-testid="billing-price">
          {name} · {people(team)} ·{" "}
          <span className="font-semibold">
            {formatCents(discountedCents(fullCents, offer?.percentOff))} a month
          </span>
        </p>
        {discount ? <p className="mt-1 text-[0.9375rem] text-text-muted">{discount}</p> : null}
        {own ? (
          <p className="mt-1 text-[0.9375rem] text-text-muted">Your price: {overrideText(own)}.</p>
        ) : null}
      </div>
      <div>
        <div className="flex items-center justify-between gap-2">
          <p id="billing-team-size">People on your team</p>
          <TeamSizeStepper
            value={team}
            min={active}
            max={Math.max(active, TEAM_SIZE_MAX)}
            onChange={setTeam}
            labelledBy="billing-team-size"
            size="compact"
          />
        </div>
        <p className="mt-1 text-[0.9375rem] text-text-muted">
          {subscribed
            ? "Changes, and teammates added past this, show on your next bill."
            : "Owners, office staff, and techs each count as one."}
        </p>
      </div>
      {error ? <Notice tone="error">{error}</Notice> : null}
      {subscribed ? (
        <BillingButton kind="manage" />
      ) : (
        <>
          <p className="text-text-muted">
            Billed monthly by your package and the people on your team. Any days left on your free
            trial carry over: you’re charged when the trial ends.
          </p>
          <BillingButton kind="subscribe" publishableKey={publishableKey} teamSize={team} />
        </>
      )}
    </>
  );
}
