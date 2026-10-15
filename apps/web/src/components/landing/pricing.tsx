"use client";

import { useState } from "react";
import { extraUsers, formatCents, monthlyPriceCents, PLANS, type PlanId } from "@leakbook/core";
import { ButtonLink, cx } from "../ui";
import { usePackage } from "./hero";

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
  const { pkg, setPkg } = usePackage();
  const [users, setUsers] = useState(4);
  return (
    <div>
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

      <div className="mx-auto mt-10 grid max-w-4xl gap-5 md:grid-cols-2">
        {(["leak", "maintenance"] as const).map((id) => {
          const plan = PLANS[id];
          const total = monthlyPriceCents(plan, users);
          const extra = extraUsers(plan, users);
          const chosen = pkg === id;
          return (
            <section
              key={id}
              aria-labelledby={`plan-${id}`}
              data-testid={`plan-${id}`}
              onClick={() => setPkg(id)}
              className={cx(
                "card flex flex-col p-6 transition-shadow sm:p-7",
                chosen && "ring-2 ring-link",
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <h3 id={`plan-${id}`} className="font-display text-2xl font-extrabold">
                  {plan.name}
                </h3>
                {chosen ? (
                  <span className="rounded-full bg-link/12 px-3 py-1 text-[0.8125rem] font-semibold text-link">
                    Your pick
                  </span>
                ) : null}
              </div>
              <p className="text-text-muted">{BLURB[id]}</p>
              <p className="mt-5 flex items-baseline gap-1">
                <span
                  className="font-display text-5xl font-extrabold tabular-nums"
                  data-testid={`price-${id}`}
                >
                  {formatCents(total).replace(/\.00$/, "")}
                </span>
                <span className="text-text-muted">/ month</span>
              </p>
              <p className="mt-1 text-[0.9375rem] text-text-muted">
                {formatCents(plan.baseCents).replace(/\.00$/, "")} includes {plan.includedUsers}{" "}
                people, then {formatCents(plan.perUserCents).replace(/\.00$/, "")} each
                {extra
                  ? ` (${extra} more: +${formatCents(extra * plan.perUserCents).replace(/\.00$/, "")})`
                  : ""}
                .
              </p>
              <ul className="mt-6 flex-1 space-y-2.5">
                {FEATURES[id].map((f) => (
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
              <ButtonLink
                href="/sign-up"
                kind={chosen ? "primary" : "secondary"}
                className="mt-7 w-full"
              >
                Start Free Trial
              </ButtonLink>
            </section>
          );
        })}
      </div>
      <p className="mt-6 text-center text-[0.9375rem] text-text-muted">
        30 days free on either package. No card needed. Customer payments go to your own Stripe
        account at Stripe’s usual fees.
      </p>
    </div>
  );
}
