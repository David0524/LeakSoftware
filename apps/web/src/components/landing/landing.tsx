"use client";

import type { ReactNode } from "react";
import type { PlanId } from "@leakbook/core";
import { CONTACT_EMAIL } from "@/lib/site";
import { ButtonLink } from "../ui";
import {
  DashboardDemo,
  DiagramDemo,
  OfflineDemo,
  OnMyWayDemo,
  PayDemo,
  PlanDemo,
  PlanRouteDemo,
  PressureDemo,
  QuoteDemo,
  ReportDemo,
  ServiceChecklistDemo,
} from "./demos";
import { Hero, PackageProvider, signUpHref, usePackage } from "./hero";
import { Reveal } from "./reveal";
import { Pricing } from "./pricing";

// The home page's body. Everything follows the package switch (Pool Maintenance first, owner
// 2026-10-15): each package shows only what applies to it. Section backgrounds alternate
// (plain, a pale water tint, one navy band) so the long page reads in chapters, and the page
// closes on water like it opens (owner, 2026-10-18: "a tad more interesting", not busy).

export function Landing() {
  return (
    <PackageProvider>
      <Hero />
      <Body />
    </PackageProvider>
  );
}

function Body() {
  const { pkg } = usePackage();
  const leak = pkg === "leak";
  return (
    <>
      <Section
        id="field"
        eyebrow="In the field"
        title="Everything the tech needs. Nothing they don’t."
        sub="Sundeck Pro is built around the truck and the backyard: big buttons, short screens, and a phone that keeps working with no signal."
      >
        <div className="grid gap-5 lg:grid-cols-2">
          <Feature
            title="Call. Text. Navigate."
            text="Every stop has one-tap directions and a call button. On My Way texts the customer your arrival time from your own phone."
          >
            <OnMyWayDemo />
          </Feature>
          {leak ? (
            <>
              <Feature
                title="Tests that do the math."
                text="Pressure, dye, bucket, and listening tests. Sundeck Pro knows when a line held, dropped, or lost more than evaporation."
              >
                <PressureDemo />
              </Feature>
              <Feature
                title="Pin the leak on the pool."
                text="Pick the pool’s shape once. Every finding lands on it with a number, so the homeowner sees exactly where."
              >
                <DiagramDemo />
              </Feature>
            </>
          ) : (
            <>
              <Feature
                title="A checklist on every visit."
                text="Skim, brush, vacuum, baskets, filter, water. Mark each one done, or flag what needs attention next time."
              >
                <ServiceChecklistDemo />
              </Feature>
              <Feature
                title="Set the plan once."
                text="Weekly, every 2 weeks, or every 4 weeks. Visits land on your techs’ routes on their own, and each month’s visits become one invoice."
              >
                <PlanDemo />
              </Feature>
            </>
          )}
          <Feature
            title="No signal? Keep working."
            text="Everything saves on the phone first and goes up on its own once you’re back in range. Nothing is lost."
          >
            <OfflineDemo />
          </Feature>
        </div>
      </Section>

      {leak ? (
        <Section
          id="reports"
          tone="tint"
          eyebrow="The report"
          title="Reports that sell the repair."
          sub="A clear summary, every item checked, the leak pinned on the pool, photos, and the homeowner’s signature. With your logo and colors, sent before you pack up."
        >
          <ReportDemo />
        </Section>
      ) : null}

      <Section
        id="paid"
        tone={leak ? "plain" : "tint"}
        eyebrow="Getting paid"
        title={
          leak
            ? "Approved from the driveway. Paid on the spot."
            : "Repairs approved. Every month paid."
        }
        sub={
          leak
            ? "Send the repair quote with the report. Customers accept it and pay the deposit online, and pay invoices by card, Apple Pay, or bank. The money goes straight to your Stripe account."
            : "Quote the pump or filter you found on the visit. Customers accept and pay the deposit online, and pay each month’s service invoice by card, Apple Pay, or bank, straight to your Stripe account."
        }
      >
        <div className="grid gap-5 md:grid-cols-2">
          <QuoteDemo />
          <PayDemo />
        </div>
      </Section>

      <Section
        id="office"
        tone="dark"
        eyebrow="In the office"
        title="Every truck. Every route. Every dollar."
        sub="Book work, plan each tech’s day for the least driving, and see what came in, what’s owed, and what’s waiting, from any browser."
      >
        <div className="grid items-start gap-8 lg:grid-cols-[1fr_1.35fr]">
          <Feature
            title="One click. Best route."
            text="Optimize reorders a tech’s day for the least driving, keeps promised times where they are, and gets everyone home on time."
          >
            <PlanRouteDemo />
          </Feature>
          <Feature
            title="Know your numbers."
            text="Collected, owed, quotes won, and every job by status, month by month."
          >
            <DashboardDemo />
          </Feature>
        </div>
      </Section>

      <Section
        id="pricing"
        eyebrow="Pricing"
        title="One simple price."
        sub="The field app, the office, and getting paid, for your whole team."
      >
        <Pricing />
      </Section>

      <Section id="faq" tone="tint" eyebrow="Questions" title="Good to know.">
        <div className="mx-auto max-w-3xl space-y-3">
          {FAQ[pkg].map(([q, a]) => (
            <details key={q} className="group card px-5 py-1 open:pb-4">
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 font-semibold [&::-webkit-details-marker]:hidden">
                {q}
                <span
                  aria-hidden="true"
                  className="text-2xl leading-none text-link transition-transform group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <p className="text-text-muted">{a}</p>
            </details>
          ))}
          {/* Contact Us (owner, 2026-10-19). */}
          <p className="pt-4 text-center text-[1.0625rem]">
            Still have a question? Contact us at{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-link underline">
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        </div>
      </Section>

      <section className="relative overflow-hidden bg-header text-on-header">
        <Water />
        <div className="relative mx-auto flex max-w-6xl flex-col items-center px-4 py-20 text-center">
          <h2 className="max-w-3xl font-display text-5xl leading-none font-extrabold tracking-tight sm:text-6xl">
            {leak ? "Find it. Report it." : "Clean it. Bill it."}{" "}
            {/* Phones: "Get paid." on a line of its own, never split. */}
            <br className="sm:hidden" />
            <span className="whitespace-nowrap text-safety">Get paid.</span>
          </h2>
          <p className="mt-5 max-w-xl text-[1.1875rem] text-neutral-200">
            Try Sundeck Pro free for 30 days with your whole crew. Cancel before then and you pay
            nothing.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <ButtonLink
              href={signUpHref(leak ? "leak" : "maintenance")}
              kind="accent"
              className="px-7"
            >
              Start Free Trial
            </ButtonLink>
            <ButtonLink href="/sign-in" kind="onDark" className="px-7">
              Sign In
            </ButtonLink>
          </div>
        </div>
      </section>
    </>
  );
}

const SHARED: [string, string][] = [
  [
    "Do my customers need an app?",
    "No. Quotes and invoices open in any browser from a text or email. Customers accept and pay right there.",
  ],
  [
    "How do customer payments work?",
    "You connect your own Stripe account. Customers pay by card, Apple Pay, Google Pay, or bank, and the money goes to you at Stripe’s usual fees.",
  ],
  [
    "What happens after the free trial?",
    "You add a card when you sign up, and the first charge is on day 31. Cancel any time before then in Settings and you won’t be charged. A canceled shop becomes read-only; nothing is deleted.",
  ],
];

const FAQ: Record<PlanId, [string, string][]> = {
  maintenance: [
    [
      "Does it work without cell service?",
      "Yes. The field app saves the checklist, photos, and notes on the phone first and sends them when it’s back in range.",
    ],
    [
      "How does monthly billing work?",
      "Each customer’s plan has a monthly price. At the start of each month Sundeck Pro drafts one invoice per customer for the month’s service, plus any extras like a filter cleaning, ready for the office to send.",
    ],
    [
      "Who counts as a person on the team?",
      "Anyone who signs in: owners, office staff, and techs. Starter is $79 for up to 2 people, Team $149 for up to 6, Fleet $249 for up to 12, then $15 a month for each extra person. Pools are unlimited.",
    ],
    ...SHARED,
  ],
  leak: [
    [
      "Does it work without cell service?",
      "Yes. The field app saves checklists, tests, photos, findings, and signatures on the phone first and sends them when it’s back in range.",
    ],
    [
      "What does the homeowner get?",
      "A report in plain words: what was checked, what passed, where the leak is on a diagram of their pool, photos, and what happens next, with your logo and colors.",
    ],
    [
      "Who counts as a person on the team?",
      "Anyone who signs in: owners, office staff, and techs. Solo is $49 for 1 person, Team $99 for up to 4, then $25 a month for each extra person.",
    ],
    ...SHARED,
  ],
};

/** Slow water lines drifting across the closing band, like the hero's pool. Still with Reduce Motion. */
function Water() {
  // One wave, drawn twice side by side, so sliding it half its width loops without a seam.
  const wave = (y: number, amp: number) =>
    Array.from({ length: 2 }, (_, k) => {
      const x = k * 1200;
      return `M${x} ${y} q150 -${amp} 300 0 t300 0 t300 0 t300 0`;
    }).join(" ");
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      {[
        { y: 30, amp: 14, speed: "lp-drift-slow", top: "top-[18%]", tone: "stroke-white/[0.07]" },
        { y: 30, amp: 20, speed: "lp-drift", top: "top-[52%]", tone: "stroke-water/40" },
        { y: 30, amp: 10, speed: "lp-drift-slow", top: "top-[78%]", tone: "stroke-white/[0.06]" },
      ].map((w) => (
        <svg
          key={w.top}
          viewBox="0 0 2400 60"
          preserveAspectRatio="none"
          className={`absolute left-0 h-16 w-[200%] max-w-none ${w.top} ${w.speed}`}
        >
          <path d={wave(w.y, w.amp)} className={`fill-none ${w.tone}`} strokeWidth="2" />
        </svg>
      ))}
    </div>
  );
}

type Tone = "plain" | "tint" | "dark";

const TONE: Record<Tone, { section: string; eyebrow: string; muted: string }> = {
  plain: { section: "", eyebrow: "text-link", muted: "text-text-muted" },
  // A pale band of pool water (the diagram's water color, light and dark).
  tint: { section: "bg-diagram-water/45", eyebrow: "text-link", muted: "text-text-muted" },
  // Navy, like the closing band; the demos' white cards sit on it.
  dark: {
    section: "bg-header text-on-header [&_.card]:text-text [&_.lp-feature-text]:text-neutral-300",
    eyebrow: "text-neutral-300",
    muted: "text-neutral-300",
  },
};

function Section({
  id,
  tone = "plain",
  eyebrow,
  title,
  sub,
  children,
}: {
  id: string;
  tone?: Tone;
  eyebrow: string;
  title: string;
  sub?: string;
  children: ReactNode;
}) {
  const t = TONE[tone];
  return (
    <section id={id} aria-labelledby={`${id}-title`} className={`scroll-mt-16 ${t.section}`}>
      <div className="mx-auto max-w-6xl px-4 py-20 sm:py-24">
        <Reveal className="mx-auto max-w-3xl text-center">
          <p
            className={`font-display text-[0.9375rem] font-bold tracking-widest uppercase ${t.eyebrow}`}
          >
            {eyebrow}
          </p>
          <h2
            id={`${id}-title`}
            className="mt-2 font-display text-4xl leading-[1.02] font-extrabold tracking-tight text-balance sm:text-[3.25rem]"
          >
            {title}
          </h2>
          {sub ? <p className={`mt-4 text-[1.1875rem] text-balance ${t.muted}`}>{sub}</p> : null}
        </Reveal>
        <Reveal className="mt-12" delay={120}>
          {children}
        </Reveal>
      </div>
    </section>
  );
}

function Feature({ title, text, children }: { title: string; text: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="font-display text-2xl font-bold">{title}</h3>
        <p className="lp-feature-text mt-1 text-text-muted">{text}</p>
      </div>
      {children}
    </div>
  );
}
