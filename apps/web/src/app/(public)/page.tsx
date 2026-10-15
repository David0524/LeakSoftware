import type { ReactNode } from "react";
import { ButtonLink } from "@/components/ui";
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
} from "@/components/landing/demos";
import { Hero, PackageProvider } from "@/components/landing/hero";
import { Pricing } from "@/components/landing/pricing";

// The public home page: what Tidemark does, shown with small working demos of the app, and
// the two packages' prices (owner, 2026-10-15).

export default function Home() {
  return (
    <main>
      <PackageProvider>
        <Hero />

        <Section
          id="field"
          eyebrow="In the field"
          title="Everything the tech needs. Nothing they don’t."
          sub="Tidemark is built around the truck and the deck: big buttons, short screens, and a phone that keeps working in the backyard with no signal."
        >
          <div className="grid gap-5 lg:grid-cols-2">
            <Feature
              title="Call. Text. Navigate."
              text="Every stop has one-tap directions and a call button. On My Way texts the customer your arrival time from your own phone."
            >
              <OnMyWayDemo />
            </Feature>
            <Feature
              title="Tests that do the math."
              text="Pressure, dye, bucket, and listening tests. Tidemark knows when a line held, dropped, or lost more than evaporation."
            >
              <PressureDemo />
            </Feature>
            <Feature
              title="Pin the leak on the pool."
              text="Pick the pool’s shape once. Every finding lands on it with a number, so the homeowner sees exactly where."
            >
              <DiagramDemo />
            </Feature>
            <Feature
              title="No signal? Keep working."
              text="Everything saves on the phone first and goes up on its own once you’re back in range. Nothing is lost."
            >
              <OfflineDemo />
            </Feature>
          </div>
        </Section>

        <Section
          id="reports"
          eyebrow="The report"
          title="Reports that sell the repair."
          sub="A clear summary, every item checked, the leak pinned on the pool, photos, and the homeowner’s signature. With your logo and colors, sent before you pack up."
        >
          <ReportDemo />
        </Section>

        <Section
          id="paid"
          eyebrow="Getting paid"
          title="Approved from the driveway. Paid on the spot."
          sub="Send the repair quote with the report. Customers accept it and pay the deposit online, and pay invoices by card, Apple Pay, or bank. The money goes straight to your Stripe account."
        >
          <div className="grid gap-5 md:grid-cols-2">
            <QuoteDemo />
            <PayDemo />
          </div>
        </Section>

        <Section
          id="office"
          eyebrow="In the office"
          title="Every truck. Every route. Every dollar."
          sub="Book jobs, plan each tech’s day for the least driving, and see what came in, what’s owed, and what’s waiting, from any browser."
        >
          <div className="grid items-start gap-8 lg:grid-cols-[1fr_1.35fr]">
            <Feature
              title="One click. Best route."
              text="Plan Route reorders a tech’s day for the least driving, keeps promised times where they are, and gets everyone home on time."
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
          id="maintenance"
          eyebrow="Pool maintenance"
          title="Weekly service, billed once a month."
          sub="Set a customer’s plan once: weekly, every 2 weeks, or every 4 weeks. Visits land on your techs’ routes, each with its service checklist, and each month’s visits become one invoice per customer for the office to send."
        >
          <div className="mx-auto max-w-xl">
            <PlanDemo />
          </div>
        </Section>

        <Section
          id="pricing"
          eyebrow="Pricing"
          title="Two packages. One simple price."
          sub="Pick the package for the work you do. Both include the field app, the office, and getting paid."
        >
          <Pricing />
        </Section>
      </PackageProvider>

      <Section id="faq" eyebrow="Questions" title="Good to know.">
        <div className="mx-auto max-w-3xl space-y-3">
          {FAQ.map(([q, a]) => (
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
        </div>
      </Section>

      <section className="bg-header text-on-header">
        <div className="mx-auto flex max-w-6xl flex-col items-center px-4 py-20 text-center">
          <h2 className="max-w-3xl font-display text-5xl leading-none font-extrabold tracking-tight sm:text-6xl">
            Find it. Report it. <span className="text-safety">Get paid.</span>
          </h2>
          <p className="mt-5 max-w-xl text-[1.1875rem] text-neutral-200">
            Try Tidemark free for 30 days with your whole crew. No card needed.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <ButtonLink href="/sign-up" kind="accent" className="px-7">
              Start Free Trial
            </ButtonLink>
            <ButtonLink href="/sign-in" kind="onDark" className="px-7">
              Sign In
            </ButtonLink>
          </div>
        </div>
      </section>
    </main>
  );
}

const FAQ: [string, string][] = [
  [
    "Does it work without cell service?",
    "Yes. The field app saves everything on the phone first: checklists, tests, photos, findings, signatures. It sends them when the phone is back in range.",
  ],
  [
    "Which package is right for us?",
    "Leak Detection is for shops that find and repair leaks: the leak checklist, tests, pool diagrams, and reports. Pool Maintenance is for cleaning and repair routes: service plans, the service checklist, and monthly billing. Both have routes, quotes, invoices, payments, and the office.",
  ],
  [
    "Who counts as a person on the team?",
    "Anyone who signs in: owners, office staff, and techs. Each package includes 2 people; each person after that is $25 a month on Leak Detection and $20 a month on Pool Maintenance.",
  ],
  [
    "Do my customers need an app?",
    "No. Reports, quotes, and invoices open in any browser from a text or email. Customers read, accept, and pay right there.",
  ],
  [
    "How do customer payments work?",
    "You connect your own Stripe account. Customers pay by card, Apple Pay, Google Pay, or bank, and the money goes to you at Stripe’s usual fees.",
  ],
  [
    "What happens after the free trial?",
    "Subscribe any time during the 30 days and keep everything you’ve entered. If you don’t, your shop becomes read-only; nothing is deleted.",
  ],
];

function Section({
  id,
  eyebrow,
  title,
  sub,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  sub?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-16">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:py-24">
        <div className="mx-auto max-w-3xl text-center">
          <p className="font-display text-[0.9375rem] font-bold tracking-widest text-link uppercase">
            {eyebrow}
          </p>
          <h2
            id={`${id}-title`}
            className="mt-2 font-display text-4xl leading-[1.02] font-extrabold tracking-tight text-balance sm:text-[3.25rem]"
          >
            {title}
          </h2>
          {sub ? <p className="mt-4 text-[1.1875rem] text-text-muted text-balance">{sub}</p> : null}
        </div>
        <div className="mt-12">{children}</div>
      </div>
    </section>
  );
}

function Feature({ title, text, children }: { title: string; text: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="font-display text-2xl font-bold">{title}</h3>
        <p className="mt-1 text-text-muted">{text}</p>
      </div>
      {children}
    </div>
  );
}
