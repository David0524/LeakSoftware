"use client";

import { createContext, useContext, useId, useState, type ReactNode } from "react";
import type { PlanId } from "@leakbook/core";
import { ButtonLink, cx, SEGMENT_TRACK, segmentClass } from "../ui";
import { KIDNEY, Phone, Pin, ScreenTitle, TabBar, Verdict } from "./device";
import { useSteps } from "./motion";
import { SIGNATURE_PATH } from "./signature-path";

// The home page's package choice (Leak Detection or Pool Maintenance), shared by the hero and
// the pricing section so both follow the visitor's pick.
const PackageContext = createContext<{ pkg: PlanId; setPkg: (p: PlanId) => void }>({
  pkg: "leak",
  setPkg: () => {},
});
export const usePackage = () => useContext(PackageContext);
export function PackageProvider({ children }: { children: ReactNode }) {
  const [pkg, setPkg] = useState<PlanId>("leak");
  return <PackageContext value={{ pkg, setPkg }}>{children}</PackageContext>;
}

export const PACKAGE_OPTIONS: { value: PlanId; label: string }[] = [
  { value: "leak", label: "Leak Detection" },
  { value: "maintenance", label: "Pool Maintenance" },
];

/** The package switch: a segmented control, as in the app. */
export function PackageSwitch({ label, className }: { label: string; className?: string }) {
  const { pkg, setPkg } = usePackage();
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cx(SEGMENT_TRACK, "flex-nowrap", className)}
    >
      {PACKAGE_OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={pkg === o.value}
          onClick={() => setPkg(o.value)}
          className={segmentClass(pkg === o.value, "px-5")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const COPY: Record<PlanId, { title: [string, string]; sub: string; demo: string }> = {
  leak: {
    title: ["Find the leak.", "Not the paperwork."],
    sub: "Run the inspection on your phone, pin every leak on the pool, and send the report and the repair quote before you leave the driveway.",
    demo: "A tech’s day in Tidemark: today’s route, a pressure test marking Return 3 as leaking, the leak pinned on a diagram of the pool, and the report sent to the homeowner.",
  },
  maintenance: {
    title: ["Clean the pool.", "Skip the paperwork."],
    sub: "Routes for every crew, a service checklist on every visit, and one invoice per customer each month, drafted for you.",
    demo: "A cleaning day in Tidemark: the route, the service checklist marked done, the visit finished, and the month’s invoice paid by card.",
  },
};

export function Hero() {
  const { pkg } = usePackage();
  const copy = COPY[pkg];
  return (
    <section className="relative overflow-hidden">
      <div className="relative mx-auto flex max-w-6xl flex-col items-center px-4 pt-14 pb-20 text-center sm:pt-20">
        <PackageSwitch label="Show Tidemark for" />
        <h1
          key={pkg}
          className="lp-rise mt-8 max-w-4xl font-display text-[2.9rem] leading-[0.98] font-extrabold tracking-tight text-balance sm:text-7xl"
        >
          {copy.title[0]} <span className="block text-link">{copy.title[1]}</span>
        </h1>
        <p className="mt-6 max-w-2xl text-[1.1875rem] text-text-muted text-balance">{copy.sub}</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <ButtonLink href="/sign-up" className="px-7">
            Start Free Trial
          </ButtonLink>
          <ButtonLink href="#pricing" kind="secondary" className="px-7">
            See Pricing
          </ButtonLink>
        </div>
        <p className="mt-3 text-[0.9375rem] text-text-muted">30 days free. No card needed.</p>

        <figure className="relative mt-14">
          <PoolBackdrop />
          <HeroPhone key={pkg} pkg={pkg} />
          <figcaption className="sr-only">{copy.demo}</figcaption>
          <Floater className="top-24 -left-52" delay={0.6}>
            <Verdict tone="pass">Not Leaking</Verdict>
          </Floater>
          <Floater className="top-56 -right-56" delay={1.1}>
            <span className="text-status-pass">✓</span>{" "}
            {pkg === "leak" ? "Report sent to Sam" : "Visit done · 28 min"}
          </Floater>
          <Floater className="bottom-28 -left-60" delay={1.6}>
            {pkg === "leak" ? "Deposit paid · $187.50" : "October invoice paid · $225.00"}
          </Floater>
        </figure>
      </div>
    </section>
  );
}

/** A frosted note floating beside the hero phone (wide screens only). */
function Floater({
  children,
  className,
  delay,
}: {
  children: ReactNode;
  className: string;
  delay: number;
}) {
  return (
    <div
      aria-hidden="true"
      style={{ animationDelay: `${delay}s` }}
      className={cx(
        "glass lp-rise absolute z-10 hidden rounded-full px-4 py-2 text-[0.9375rem] font-semibold whitespace-nowrap lg:flex lg:items-center lg:gap-2",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** The hero's backdrop: the app's pool diagram, drawn large in flat water colors. */
function PoolBackdrop() {
  return (
    <svg
      aria-hidden="true"
      viewBox="20 0 340 220"
      className="pointer-events-none absolute top-1/2 left-1/2 w-[760px] max-w-none sm:w-[1180px] -translate-x-1/2 -translate-y-[46%]"
    >
      <path d={KIDNEY} className="fill-diagram-water stroke-water/25" strokeWidth="1.2" />
      <path
        d={KIDNEY}
        className="fill-none stroke-water/15"
        strokeWidth="0.6"
        transform="translate(18 12) scale(0.9)"
      />
      <circle
        cx="318"
        cy="52"
        r="20"
        className="fill-diagram-water stroke-water/25"
        strokeWidth="1.2"
      />
    </svg>
  );
}

const LEAK_STEPS = [2800, 3600, 3200, 3400];
const CLEAN_STEPS = [2800, 3600, 2600, 3400];

function HeroPhone({ pkg }: { pkg: PlanId }) {
  const { ref, step } = useSteps<HTMLDivElement>(pkg === "leak" ? LEAK_STEPS : CLEAN_STEPS, 1);
  const screens =
    pkg === "leak"
      ? [
          <LeakToday key="a" />,
          <LeakChecklist key="b" />,
          <LeakFindings key="c" />,
          <LeakReport key="d" />,
        ]
      : [
          <CleanToday key="a" />,
          <CleanChecklist key="b" />,
          <CleanDone key="c" />,
          <CleanInvoice key="d" />,
        ];
  return (
    <div ref={ref} className="relative">
      <Phone>
        {screens.map((s, i) => (
          <div
            key={i}
            className={cx(
              "absolute inset-0 transition-all duration-500",
              i === step ? "opacity-100" : "pointer-events-none translate-y-2 opacity-0",
            )}
          >
            {i === step ? s : null}
          </div>
        ))}
        <TabBar active={step === 0 ? "Today" : "Jobs"} />
      </Phone>
      <StepDots n={screens.length} step={step} />
    </div>
  );
}

export function StepDots({ n, step }: { n: number; step: number }) {
  return (
    <div aria-hidden="true" className="mt-5 flex justify-center gap-1.5">
      {Array.from({ length: n }, (_, i) => (
        <span
          key={i}
          className={cx(
            "h-1.5 rounded-full transition-all duration-300",
            i === step ? "w-6 bg-link" : "w-1.5 bg-text/20",
          )}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Leak detection screens
// ---------------------------------------------------------------------------

export function StopCard({
  n,
  time,
  name,
  place,
  next,
  done,
  tag,
  delay = 0,
}: {
  n: number;
  time: string;
  name: string;
  place: string;
  next?: boolean;
  done?: boolean;
  tag?: string;
  delay?: number;
}) {
  return (
    <div
      style={{ animationDelay: `${delay}s` }}
      className={cx("lp-rise card p-2.5", next && "ring-2 ring-link", done && "opacity-60")}
    >
      <div className="flex items-center gap-2">
        <span
          className={cx(
            "grid size-6 place-items-center rounded-full font-display text-[0.75rem] font-bold",
            next ? "bg-link text-bg" : "bg-bg",
          )}
        >
          {n}
        </span>
        <span className="font-display text-[0.85rem] font-bold">{time}</span>
        {tag ? (
          <span className="rounded-full bg-fill px-2 py-0.5 text-[0.62rem] font-semibold">
            {tag}
          </span>
        ) : null}
        {next ? (
          <span className="ml-auto flex gap-1.5">
            <span className="grid size-7 place-items-center rounded-full bg-link/10 text-link">
              <PhoneGlyph />
            </span>
            <span className="rounded-full bg-link/10 px-2.5 py-1.5 text-[0.65rem] font-semibold text-link">
              On My Way
            </span>
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-[0.8rem] font-semibold">{name}</p>
      {done ? null : <p className="truncate text-[0.7rem] text-link">{place}</p>}
    </div>
  );
}

export const PhoneGlyph = () => (
  <svg
    viewBox="0 0 24 24"
    className="size-3.5"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
  >
    <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />
  </svg>
);

function Leg({ text }: { text: string }) {
  return (
    <p className="flex items-center gap-1.5 py-0.5 pl-3 text-[0.65rem] text-text-muted">
      <span className="h-2.5 border-l-2 border-dotted border-text-muted" />
      {text}
    </p>
  );
}

function LeakToday() {
  return (
    <div>
      <ScreenTitle title="Today" sub="Thursday, October 15 · 62° Sunny" />
      <div className="px-3">
        <span className="lp-rise inline-flex rounded-full bg-link/12 px-3 py-1.5 text-[0.72rem] font-semibold text-link">
          Next Stop in Apple Maps
        </span>
        <p className="mt-2 text-[0.7rem] text-text-muted">
          4 stops · 1 hr 52 min driving · back by 4:40 PM
        </p>
        <div className="mt-1">
          <Leg text="18 min from the shop" />
          <StopCard n={1} time="8:30 AM" name="Derek Simmons" place="" done delay={0.05} />
          <Leg text="22 min drive" />
          <StopCard
            n={2}
            time="10:15 AM"
            name="Sunrise Villas HOA"
            place="9800 W Sunrise Blvd, Peoria"
            next
            delay={0.15}
          />
          <Leg text="31 min drive" />
          <StopCard
            n={3}
            time="1:00 PM"
            name="Desert Oasis Pool Service"
            place="4410 N 32nd St, Phoenix"
            delay={0.25}
          />
          <Leg text="26 min drive" />
          <StopCard
            n={4}
            time="3:15 PM"
            name="Leah Nguyen"
            place="3352 E Page Ave, Gilbert"
            delay={0.35}
          />
        </div>
      </div>
    </div>
  );
}

function JobHeader({ tab }: { tab: string }) {
  return (
    <div className="glass-bar px-3 pt-1 pb-2">
      <div className="flex items-center justify-between text-[0.75rem]">
        <span className="text-link">‹ Jobs</span>
        <span className="font-semibold">Job #1038</span>
        <span className="w-8" />
      </div>
      <div className="mt-2 flex gap-0.5 rounded-full bg-fill p-0.5 text-[0.6rem]">
        {["Details", "Checklist", "Findings", "Wrap-Up"].map((t) => (
          <span
            key={t}
            className={cx(
              "flex-1 rounded-full py-1 text-center",
              t === tab && "bg-thumb font-semibold shadow-[0_2px_6px_rgb(0_0_0/0.12)]",
            )}
          >
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

const LEAK_ROWS: {
  name: string;
  test: string;
  tone: "pass" | "fail" | "na";
  label: string;
  note?: string;
}[] = [
  { name: "Skimmer 1", test: "Pressure test", tone: "pass", label: "Not Leaking" },
  { name: "Skimmer 2", test: "Pressure test", tone: "pass", label: "Not Leaking" },
  { name: "Return 1", test: "Pressure test", tone: "pass", label: "Not Leaking" },
  { name: "Return 2", test: "Pressure test", tone: "pass", label: "Not Leaking" },
  {
    name: "Return 3",
    test: "Pressure test",
    tone: "fail",
    label: "Leaking",
    note: "Under the deck, 6 ft from the fitting",
  },
  { name: "Main drain", test: "No diver on site", tone: "na", label: "N/A" },
];

function LeakChecklist() {
  return (
    <div>
      <JobHeader tab="Checklist" />
      <div className="px-3 pt-2">
        <p className="font-display text-[1.05rem] font-bold">Plumbing Static Test</p>
        <div className="card mt-2 divide-y divide-separator px-3">
          {LEAK_ROWS.map((r, i) => (
            <div key={r.name} className="py-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-[0.78rem] font-semibold">{r.name}</p>
                  <p className="text-[0.62rem] text-text-muted">{r.test}</p>
                </div>
                <Verdict
                  tone={r.tone}
                  className="lp-pop"
                  style={{ animationDelay: `${0.3 + i * 0.38}s` }}
                >
                  {r.label}
                </Verdict>
              </div>
              {r.note ? (
                <p
                  className="lp-rise mt-1.5 rounded-lg border border-control-border px-2 py-1 text-[0.62rem]"
                  style={{ animationDelay: `${0.5 + i * 0.38}s` }}
                >
                  {r.note}
                </p>
              ) : null}
            </div>
          ))}
        </div>
        <div
          className="lp-rise card mt-2 flex items-center justify-between p-2.5"
          style={{ animationDelay: "2.6s" }}
        >
          <div>
            <p className="text-[0.7rem] text-text-muted">Pressure test · Return 3</p>
            <p className="text-[0.8rem] font-semibold">Dropped 8 PSI in 15 min</p>
          </div>
          <span className="rounded-full bg-status-fail px-2 py-0.5 text-[0.62rem] font-bold text-white">
            Fail
          </span>
        </div>
      </div>
    </div>
  );
}

/** The pool diagram with its pins dropping in. */
export function PoolDiagram({ className, pins = true }: { className?: string; pins?: boolean }) {
  return (
    <div className={cx("relative", className)}>
      <svg viewBox="0 0 360 220" className="w-full">
        <path d={KIDNEY} className="fill-diagram-water stroke-water" strokeWidth="3" />
        <circle
          cx="318"
          cy="52"
          r="20"
          className="fill-diagram-water stroke-water"
          strokeWidth="3"
        />
        <text x="318" y="57" textAnchor="middle" className="fill-water text-[13px] font-bold">
          SPA
        </text>
      </svg>
      {pins ? (
        <>
          <span
            className="lp-drop absolute"
            style={{ left: "44%", top: "8%", animationDelay: "0.5s" }}
          >
            <Pin n={1} />
          </span>
          <span
            className="lp-drop absolute"
            style={{ left: "84%", top: "62%", animationDelay: "1s" }}
          >
            <Pin n={2} tone="minor" />
          </span>
        </>
      ) : null}
    </div>
  );
}

function LeakFindings() {
  return (
    <div>
      <JobHeader tab="Findings" />
      <div className="px-3 pt-2">
        <p className="font-display text-[1.05rem] font-bold">Findings</p>
        <div className="card mt-2 p-3">
          <PoolDiagram />
        </div>
        {[
          {
            n: 1,
            t: "Return 3 line break",
            d: "Major · Under the deck, 6 ft from the fitting",
            tone: "fail" as const,
          },
          {
            n: 2,
            t: "Light niche seal worn",
            d: "Minor · Pool light niche · recheck",
            tone: "minor" as const,
          },
        ].map((f, i) => (
          <div
            key={f.n}
            className="lp-rise card mt-2 flex gap-2 p-2.5"
            style={{ animationDelay: `${1.4 + i * 0.3}s` }}
          >
            <Pin n={f.n} tone={f.tone} />
            <div>
              <p className="text-[0.78rem] font-semibold">{f.t}</p>
              <p className="text-[0.65rem] text-text-muted">{f.d}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** The summary tiles a report opens with. */
export function SummaryTiles({ small = false }: { small?: boolean }) {
  const tiles = [
    { n: 10, l: "Items Pass", c: "text-status-pass", bg: "bg-status-pass/10" },
    { n: 1, l: "Needs Attention", c: "text-status-warning", bg: "bg-status-warning/10" },
    { n: 1, l: "Leaking", c: "text-status-fail", bg: "bg-status-fail/10" },
  ];
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {tiles.map((t, i) => (
        <div
          key={t.l}
          className={cx("lp-pop rounded-xl p-2", t.bg)}
          style={{ animationDelay: `${0.3 + i * 0.15}s` }}
        >
          <p
            className={cx("font-display font-extrabold", t.c, small ? "text-[1.1rem]" : "text-2xl")}
          >
            {t.n}
          </p>
          <p className={cx("leading-tight", small ? "text-[0.58rem]" : "text-[0.8rem]")}>{t.l}</p>
        </div>
      ))}
    </div>
  );
}

/** The customer's signature, written left to right. */
export function Signature({ className, delay = 0 }: { className?: string; delay?: number }) {
  const id = useId();
  return (
    <svg viewBox="0 0 4050 1001" className={className}>
      <clipPath id={id}>
        <rect
          className="lp-wipe"
          style={{ animationDelay: `${delay}s` }}
          width="4050"
          height="1001"
        />
      </clipPath>
      <path
        d={SIGNATURE_PATH}
        clipPath={`url(#${id})`}
        className="fill-current stroke-current"
        strokeWidth="6"
      />
    </svg>
  );
}

function LeakReport() {
  return (
    <div className="relative h-full">
      <div className="bg-header px-4 pt-3 pb-3 text-on-header">
        <p className="font-display text-[0.95rem] font-bold">Demo Leak Co.</p>
        <p className="text-[0.62rem] opacity-80">Leak Detection Report · October 15</p>
      </div>
      <div className="px-3 pt-3">
        <div className="card p-3">
          <p className="font-display text-[0.95rem] font-bold">Summary</p>
          <p className="mt-0.5 text-[0.65rem] text-text-muted">
            We checked 12 of 13 items: 10 passed, 1 needs attention, and 1 is leaking.
          </p>
          <div className="mt-2">
            <SummaryTiles small />
          </div>
        </div>
        <div className="card mt-2 p-3">
          <PoolDiagram />
        </div>
        <div className="card mt-2 p-3">
          <Signature className="h-10 text-text" delay={0.8} />
          <div className="mt-1 border-t border-separator pt-1 text-[0.62rem] text-text-muted">
            Sam Sample · Inspection acknowledged
          </div>
        </div>
      </div>
      <div
        className="glass lp-drop absolute inset-x-4 top-3 z-20 flex items-center gap-2 rounded-2xl px-3 py-2.5 text-[0.75rem] font-semibold"
        style={{ animationDelay: "2.2s" }}
      >
        <span className="grid size-5 place-items-center rounded-full bg-status-pass text-[0.7rem] text-white">
          ✓
        </span>
        Report sent to Sam Sample
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pool maintenance screens
// ---------------------------------------------------------------------------

function CleanToday() {
  return (
    <div>
      <ScreenTitle title="Today" sub="Thursday, October 15 · 62° Sunny" />
      <div className="px-3">
        <span className="lp-rise inline-flex rounded-full bg-link/12 px-3 py-1.5 text-[0.72rem] font-semibold text-link">
          Next Stop in Apple Maps
        </span>
        <p className="mt-2 text-[0.7rem] text-text-muted">
          9 stops · 1 hr 34 min driving · back by 3:10 PM
        </p>
        <div className="mt-1">
          <Leg text="12 min from the shop" />
          <StopCard
            n={1}
            time="7:30 AM"
            name="Garcia Residence"
            place=""
            done
            tag="Pool Service"
            delay={0.05}
          />
          <Leg text="6 min drive" />
          <StopCard
            n={2}
            time="8:10 AM"
            name="Palm Court HOA"
            place="2150 W Palm Ln, Phoenix"
            next
            tag="Pool Service"
            delay={0.15}
          />
          <Leg text="9 min drive" />
          <StopCard
            n={3}
            time="8:55 AM"
            name="Brooks Family"
            place="6015 W Cholla St, Glendale"
            tag="Pool Service"
            delay={0.25}
          />
          <Leg text="11 min drive" />
          <StopCard
            n={4}
            time="9:40 AM"
            name="Marcus Bell"
            place="8821 W Rose Ln, Glendale"
            tag="Repair"
            delay={0.35}
          />
        </div>
      </div>
    </div>
  );
}

const CLEAN_ROWS: { name: string; tone: "pass" | "warn"; label: string }[] = [
  { name: "Skim the surface", tone: "pass", label: "Done" },
  { name: "Brush walls and steps", tone: "pass", label: "Done" },
  { name: "Vacuum", tone: "pass", label: "Done" },
  { name: "Empty baskets", tone: "pass", label: "Done" },
  { name: "Filter pressure", tone: "warn", label: "Attention" },
  { name: "Test and balance water", tone: "pass", label: "Done" },
  { name: "Check equipment", tone: "pass", label: "Done" },
];

function CleanChecklist() {
  return (
    <div>
      <div className="glass-bar px-3 pt-1 pb-2 text-[0.75rem]">
        <div className="flex items-center justify-between">
          <span className="text-link">‹ Today</span>
          <span className="font-semibold">Palm Court HOA</span>
          <span className="w-10" />
        </div>
      </div>
      <div className="px-3 pt-2">
        <p className="font-display text-[1.05rem] font-bold">Service Checklist</p>
        <p className="text-[0.65rem] text-text-muted">Weekly · Thursdays · 30 min</p>
        <div className="card mt-2 divide-y divide-separator px-3">
          {CLEAN_ROWS.map((r, i) => (
            <div key={r.name} className="flex items-center justify-between py-2">
              <p className="text-[0.78rem] font-semibold">{r.name}</p>
              <Verdict
                tone={r.tone}
                className="lp-pop min-w-[5.6rem]"
                style={{ animationDelay: `${0.3 + i * 0.32}s` }}
              >
                {r.label}
              </Verdict>
            </div>
          ))}
        </div>
        <p
          className="lp-rise mt-2 rounded-lg border border-control-border bg-surface px-2 py-1.5 text-[0.65rem]"
          style={{ animationDelay: "2.6s" }}
        >
          Filter at 24 PSI. Clean it next visit.
        </p>
      </div>
    </div>
  );
}

function CleanDone() {
  return (
    <div className="flex h-full flex-col items-center px-5 pt-16 text-center">
      <span className="lp-pop grid size-20 place-items-center rounded-full bg-status-pass text-4xl text-white">
        ✓
      </span>
      <p
        className="lp-rise mt-4 font-display text-[1.4rem] font-extrabold"
        style={{ animationDelay: "0.3s" }}
      >
        Visit Done
      </p>
      <p className="lp-rise text-[0.78rem] text-text-muted" style={{ animationDelay: "0.45s" }}>
        Palm Court HOA · 28 min
      </p>
      <div className="lp-rise card mt-5 w-full p-3 text-left" style={{ animationDelay: "0.7s" }}>
        <p className="text-[0.65rem] text-text-muted">Next visit</p>
        <p className="text-[0.85rem] font-semibold">Thursday, October 22</p>
        <p className="text-[0.65rem] text-text-muted">Weekly plan · $45.00 a visit</p>
      </div>
      <div
        className="lp-rise mt-2 w-full rounded-full bg-link/12 py-2.5 text-[0.8rem] font-semibold text-link"
        style={{ animationDelay: "0.9s" }}
      >
        Next Stop: Brooks Family
      </div>
    </div>
  );
}

function CleanInvoice() {
  const visits = ["Oct 1", "Oct 8", "Oct 15", "Oct 22", "Oct 29"];
  return (
    <div className="relative h-full">
      <div className="bg-header px-4 pt-3 pb-3 text-on-header">
        <p className="font-display text-[0.95rem] font-bold">Demo Pool Co.</p>
        <p className="text-[0.62rem] opacity-80">Invoice #2210 · October service</p>
      </div>
      <div className="px-3 pt-3">
        <div className="card divide-y divide-separator px-3">
          {visits.map((d, i) => (
            <div
              key={d}
              className="lp-rise flex justify-between py-1.5 text-[0.72rem]"
              style={{ animationDelay: `${0.2 + i * 0.12}s` }}
            >
              <span>Pool service, {d}</span>
              <span className="tabular-nums">$45.00</span>
            </div>
          ))}
          <div className="flex justify-between py-2 text-[0.82rem] font-bold">
            <span>Total</span>
            <span className="tabular-nums">$225.00</span>
          </div>
        </div>
        <div
          className="lp-rise mt-3 rounded-full bg-black py-2.5 text-center text-[0.8rem] font-semibold text-white"
          style={{ animationDelay: "1s" }}
        >
          Apple Pay
        </div>
        <div
          className="lp-rise mt-1.5 grid grid-cols-2 gap-1.5 text-center text-[0.72rem] font-semibold"
          style={{ animationDelay: "1.1s" }}
        >
          <span className="rounded-full bg-fill py-2">Card</span>
          <span className="rounded-full bg-fill py-2">Bank</span>
        </div>
      </div>
      <div
        className="glass lp-drop absolute inset-x-4 top-3 z-20 flex items-center gap-2 rounded-2xl px-3 py-2.5 text-[0.75rem] font-semibold"
        style={{ animationDelay: "2s" }}
      >
        <span className="grid size-5 place-items-center rounded-full bg-status-pass text-[0.7rem] text-white">
          ✓
        </span>
        Paid · $225.00
      </div>
    </div>
  );
}
