"use client";

import { useState } from "react";
import {
  competitorPrices,
  COMPETITORS_CHECKED,
  extraUsers,
  formatCents,
  monthlyPriceCents,
  planTier,
  PLANS,
  type PlanId,
} from "@leakbook/core";
import { ButtonLink } from "../ui";
import { PackageSwitch, signUpHref, usePackage } from "./hero";

const FEATURES: Record<PlanId, string[]> = {
  leak: [
    "Leak checklist with pressure, dye, bucket, and listening tests",
    "Findings pinned on a diagram of each pool",
    "Branded reports with photos and signatures",
    "Repair quotes with deposits, accepted online",
    "Invoices paid by card, Apple Pay, or bank",
    "Today, routes, Plan Route, and On My Way texts",
    "Office schedule, customers, and dashboard",
    "Works with no signal",
  ],
  maintenance: [
    "Weekly, every 2 weeks, or every 4 weeks plans",
    "Service checklist on every visit",
    "One invoice per customer each month, drafted for you",
    "Repair quotes with deposits, accepted online",
    "Invoices paid by card, Apple Pay, or bank",
    "Today, routes, Plan Route, and On My Way texts",
    "Office schedule, customers, and dashboard",
    "Works with no signal",
  ],
};

const BLURB: Record<PlanId, string> = {
  leak: "For shops that find and fix leaks.",
  maintenance: "For cleaning and repair routes.",
};

export function Pricing() {
  const { pkg } = usePackage();
  // Each package starts at its lowest price (owner, 2026-10-18): 2 people for Pool
  // Maintenance, 1 for Leak Detection. Each keeps its own count when switching.
  const [team, setTeam] = useState<Record<PlanId, number>>({ maintenance: 2, leak: 1 });
  const users = team[pkg];
  const setUsers = (next: (u: number) => number) => setTeam((t) => ({ ...t, [pkg]: next(t[pkg]) }));
  const plan = PLANS[pkg];
  const total = monthlyPriceCents(plan, users);
  const tier = planTier(plan, users);
  const extra = extraUsers(plan, users);
  return (
    <div>
      <div className="mb-8 flex justify-center">
        <PackageSwitch label="Show pricing for" />
      </div>
      <div className="flex flex-col items-center gap-2">
        <p id="team-size" className="font-medium">
          People on your team
        </p>
        <div
          className="flex items-center gap-1 rounded-full bg-fill p-1"
          role="group"
          aria-labelledby="team-size"
        >
          <button
            type="button"
            aria-label="Fewer people"
            disabled={users <= 1}
            onClick={() => setUsers((u) => Math.max(1, u - 1))}
            className="grid size-11 place-items-center rounded-full bg-thumb text-xl font-semibold shadow-[0_2px_6px_rgb(0_0_0/0.1)] disabled:opacity-40"
          >
            −
          </button>
          <output
            aria-live="polite"
            className="w-24 text-center font-display text-2xl font-extrabold tabular-nums"
            data-testid="team-size"
          >
            {users}
          </output>
          <button
            type="button"
            aria-label="More people"
            disabled={users >= 50}
            onClick={() => setUsers((u) => Math.min(50, u + 1))}
            className="grid size-11 place-items-center rounded-full bg-thumb text-xl font-semibold shadow-[0_2px_6px_rgb(0_0_0/0.1)] disabled:opacity-40"
          >
            +
          </button>
        </div>
        <p className="text-[0.9375rem] text-text-muted">
          Owners, office staff, and techs each count as one.
        </p>
      </div>

      <section
        key={pkg}
        aria-labelledby={`plan-${pkg}`}
        data-testid={`plan-${pkg}`}
        className="lp-rise card mx-auto mt-10 flex max-w-xl flex-col p-6 sm:p-8"
      >
        <h3 id={`plan-${pkg}`} className="font-display text-2xl font-extrabold">
          {plan.name} <span className="text-text-muted">· {tier.name}</span>
        </h3>
        <p className="text-text-muted">{BLURB[pkg]}</p>
        <p className="mt-5 flex items-baseline gap-1">
          <span className="font-display text-6xl font-extrabold tabular-nums" data-testid="price">
            {dollars(total)}
          </span>
          <span className="text-text-muted">/ month</span>
        </p>
        <p className="mt-1 text-[0.9375rem] text-text-muted" data-testid="tiers">
          {plan.tiers
            .map((t) => `${t.name} ${dollars(t.priceCents)} up to ${people(t.upTo)}`)
            .join(" · ")}
          , then {dollars(plan.perExtraCents)} for each extra person
          {extra ? ` (${extra} more: +${dollars(extra * plan.perExtraCents)})` : ""}.
          {pkg === "maintenance" ? " Unlimited pools: adding to your route never costs more." : ""}
        </p>
        <ul className="mt-6 grid gap-2.5 sm:grid-cols-2 sm:gap-x-6">
          {FEATURES[pkg].map((f) => (
            <li key={f} className="flex gap-2.5">
              <svg
                viewBox="0 0 20 20"
                className="mt-1 size-4 shrink-0 text-status-pass"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                aria-hidden="true"
              >
                <path d="M4 10.5l4 4 8-9" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>{f}</span>
            </li>
          ))}
        </ul>
        <ButtonLink href={signUpHref(pkg)} kind="accent" className="mt-7 w-full">
          Start Free Trial
        </ButtonLink>
      </section>
      {pkg === "maintenance" ? <Compare users={users} /> : null}
      <p className="mt-6 text-center text-[0.9375rem] text-text-muted">
        14 days free, then billed monthly; cancel any time. Customer payments go to your own Stripe
        account at Stripe’s usual fees.
      </p>
    </div>
  );
}

const dollars = (c: number) => formatCents(c).replace(/\.00$/, "");
const people = (n: number) => (n === 1 ? "1 person" : `${n} people`);

/**
 * What the same pool company pays elsewhere (owner, 2026-10-16), for the team size above and a
 * route size chosen here. Sundeck Pro's price never depends on pools; Skimmer's does. Prices are
 * the competitors' public pricing, dated in the fine print.
 */
function Compare({ users }: { users: number }) {
  const [pools, setPools] = useState(150);
  const ours = monthlyPriceCents(PLANS.maintenance, users);
  const rows = [
    { name: "Sundeck Pro", basis: "Flat price, unlimited pools", monthlyCents: ours, us: true },
    ...competitorPrices(users, pools).map((c) => ({ ...c, us: false })),
  ];
  const top = Math.max(...rows.map((r) => r.monthlyCents));
  const others = rows.filter((r) => !r.us);
  const cheapest = Math.min(...others.map((r) => r.monthlyCents));
  const yearly = (cheapest - ours) * 12;
  return (
    <section
      aria-labelledby="compare-title"
      data-testid="compare"
      className="card mx-auto mt-6 flex max-w-xl flex-col gap-5 p-6 sm:p-8"
    >
      <div>
        <h3 id="compare-title" className="font-display text-2xl font-extrabold">
          Compare What You’d Pay
        </h3>
        <p className="text-text-muted">
          For {people(users)} and the pools on your route, per month.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="compare-pools" className="flex items-baseline justify-between font-medium">
          <span>Pools on your route</span>
          <output
            htmlFor="compare-pools"
            className="font-display text-2xl font-extrabold tabular-nums"
          >
            {pools}
          </output>
        </label>
        <input
          id="compare-pools"
          type="range"
          min={10}
          max={600}
          step={10}
          value={pools}
          onChange={(e) => setPools(Number(e.target.value))}
          className="w-full accent-primary"
        />
      </div>
      <ul className="flex flex-col gap-3" aria-label="Monthly price by company">
        {rows.map((r) => (
          <li key={r.name} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-3">
              <span className={r.us ? "font-semibold" : undefined}>
                {r.name}
                <span className="block text-[0.8125rem] text-text-muted">{r.basis}</span>
              </span>
              <span
                className={`font-display text-xl font-extrabold tabular-nums${r.us ? " text-link" : ""}`}
              >
                {dollars(r.monthlyCents)}
              </span>
            </div>
            <div className="h-2 rounded-full bg-fill" aria-hidden="true">
              <div
                className={`h-2 rounded-full ${r.us ? "bg-primary" : "bg-text-muted/45"}`}
                style={{ width: `${Math.max(3, (r.monthlyCents / top) * 100)}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
      {yearly > 0 ? (
        <p className="rounded-2xl bg-link/10 px-4 py-3 font-semibold" data-testid="savings">
          You’d save {dollars(yearly)} a year compared with the next lowest price.
        </p>
      ) : null}
      <p className="text-[0.8125rem] text-text-muted">
        Other prices from each company’s public pricing as of {COMPETITORS_CHECKED}:{" "}
        {others.map((o) => `${o.name}, ${o.basis}`).join("; ")}. Pool Brain counts everyone but one
        office person as a field tech. Prices change; check each company for its current price.
      </p>
    </section>
  );
}
