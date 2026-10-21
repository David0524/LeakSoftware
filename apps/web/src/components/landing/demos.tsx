"use client";

import { cx } from "../ui";
import { Laptop, OfficeBar, Verdict } from "./device";
import { PhoneGlyph, PoolDiagram, Signature, SummaryTiles, usePackage } from "./hero";
import { useCountUp, useSteps } from "./motion";

// The home page's feature demos. Each loops through a few steps while it is on screen.

/** A tap: a soft ring that expands where the finger lands. */
function Tap({ show, className }: { show: boolean; className: string }) {
  if (!show) return null;
  return (
    <span
      className={cx(
        "lp-ripple pointer-events-none absolute size-12 rounded-full bg-link/40",
        className,
      )}
    />
  );
}

// ---------------------------------------------------------------------------
// Optimize
// ---------------------------------------------------------------------------

const STOPS = {
  leak: [
    { id: "a", name: "Derek Simmons", place: "Tempe" },
    { id: "b", name: "Sunrise Villas HOA", place: "Peoria" },
    { id: "c", name: "Desert Oasis Pool Service", place: "Phoenix" },
    { id: "d", name: "Leah Nguyen", place: "Gilbert" },
    { id: "e", name: "Brooks Family", place: "Gilbert" },
  ],
  maintenance: [
    { id: "a", name: "Garcia Residence", place: "Tempe" },
    { id: "b", name: "Palm Court HOA", place: "Peoria" },
    { id: "c", name: "Marcus Bell · Pump repair", place: "Phoenix" },
    { id: "d", name: "Leah Nguyen", place: "Gilbert" },
    { id: "e", name: "Brooks Family", place: "Gilbert" },
  ],
};
const BEFORE = {
  order: ["a", "b", "c", "d", "e"],
  times: ["8:30 AM", "1:36 PM", "3:42 PM", "5:56 PM", "7:26 PM"],
  legs: ["26", "22", "36", "44", "0"],
};
const AFTER = {
  order: ["a", "d", "e", "c", "b"],
  times: ["8:30 AM", "9:45 AM", "11:15 AM", "12:45 PM", "2:30 PM"],
  legs: ["26", "18", "0", "31", "29"],
};
const ROW = 58;

export function PlanRouteDemo() {
  const { ref, step } = useSteps<HTMLDivElement>([2600, 700, 3800], 2);
  const { pkg } = usePackage();
  const stops = STOPS[pkg];
  const after = step === 2;
  const plan = after ? AFTER : BEFORE;
  return (
    <div ref={ref} aria-hidden="true" className="relative card overflow-hidden p-4 select-none">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-lg font-bold">Jake Turner</p>
          <p className="text-[0.8rem] text-text-muted tabular-nums">
            5 stops · {after ? "2 hr 18 min" : "2 hr 56 min"} driving · back by{" "}
            {after ? "4:34 PM" : "8:44 PM"}
          </p>
          <p
            className={cx(
              "overflow-hidden text-[0.8rem] font-semibold text-status-warning transition-all duration-500",
              after ? "max-h-0 opacity-0" : "max-h-12 opacity-100",
            )}
          >
            Runs 3 hr 44 min past the end of the day.
          </p>
        </div>
        <span className="relative">
          <span
            className={cx(
              "inline-flex rounded-full bg-link/12 px-4 py-2 text-[0.85rem] font-semibold text-link transition-transform",
              step === 1 && "scale-95",
            )}
          >
            Optimize
          </span>
          <Tap show={step === 1} className="-top-1 left-6" />
        </span>
      </div>
      <div className="relative mt-3" style={{ height: ROW * stops.length }}>
        {stops.map((s) => {
          const i = plan.order.indexOf(s.id);
          const moved = BEFORE.order.indexOf(s.id) !== AFTER.order.indexOf(s.id);
          return (
            <div
              key={s.id}
              className="absolute inset-x-0 transition-transform duration-[900ms] ease-[cubic-bezier(0.3,0.8,0.2,1)]"
              style={{ transform: `translateY(${i * ROW}px)`, zIndex: moved ? 2 : 1 }}
            >
              <p className="flex items-center gap-1.5 pl-3 text-[0.7rem] text-text-muted">
                <span className="h-2.5 border-l-2 border-dotted border-text-muted" />
                {plan.legs[i]} min {i === 0 ? "from the shop" : "drive"}
              </p>
              <div className="well flex items-center gap-3 px-3 py-1.5">
                <span className="w-16 font-semibold tabular-nums text-[0.8rem]">
                  {plan.times[i]}
                </span>
                <span className="min-w-0 flex-1 truncate text-[0.85rem]">{s.name}</span>
                <span className="text-[0.75rem] text-text-muted">{s.place}</span>
              </div>
            </div>
          );
        })}
      </div>
      {/* The result, as the app shows it: a short banner at the top. */}
      <div
        className={cx(
          "glass absolute inset-x-6 top-3 z-10 flex items-center gap-2.5 rounded-full py-1.5 pr-4 pl-1.5 text-[0.8rem] font-semibold transition-all duration-500",
          after ? "translate-y-0 opacity-100" : "-translate-y-3 opacity-0",
        )}
      >
        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-status-pass text-white">
          <svg
            viewBox="0 0 24 24"
            className="size-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        </span>
        <span className="min-w-0 truncate">Optimized · 38 min less driving · Back by 4:34 PM</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Call, text, navigate
// ---------------------------------------------------------------------------

export function OnMyWayDemo() {
  const { ref, step } = useSteps<HTMLDivElement>([1800, 700, 3400, 1600], 2);
  const { pkg } = usePackage();
  const texted = step >= 2;
  return (
    <div ref={ref} aria-hidden="true" className="relative select-none">
      <div className="card p-3">
        <div className="flex items-center gap-2">
          <span className="grid size-7 place-items-center rounded-full bg-link font-display text-[0.8rem] font-bold text-bg">
            2
          </span>
          <span className="font-display font-bold">10:15 AM</span>
          <span className="ml-auto flex gap-2">
            <span className="grid size-10 place-items-center rounded-full bg-link/10 text-link">
              <PhoneGlyph />
            </span>
            <span className="relative">
              <span
                className={cx(
                  "inline-flex h-10 items-center rounded-full bg-link/10 px-4 text-[0.85rem] font-semibold text-link transition-transform",
                  step === 1 && "scale-95",
                )}
              >
                {texted ? "Texted ✓" : "On My Way"}
              </span>
              <Tap show={step === 1} className="top-0 left-8" />
            </span>
          </span>
        </div>
        <p className="mt-1 font-semibold">
          {pkg === "leak" ? "Sunrise Villas HOA" : "Palm Court HOA"}
        </p>
        <p className="text-[0.85rem] text-link underline-offset-4">
          {pkg === "leak" ? "9800 W Sunrise Blvd, Peoria, AZ" : "2150 W Palm Ln, Phoenix, AZ"}
        </p>
      </div>
      <div
        className={cx(
          "mt-3 flex justify-end transition-all duration-500",
          texted ? "opacity-100" : "translate-y-3 opacity-0",
        )}
      >
        <div className="max-w-[85%] rounded-[1.25rem] rounded-br-md bg-[#0a84ff] px-4 py-2.5 text-[0.9rem] text-white">
          Hi, this is Jake from {SHOP[pkg]}. I’m on my way and should be there about 10:15 AM.
        </div>
      </div>
      <p
        className={cx(
          "mt-1 text-right text-[0.7rem] text-text-muted transition-opacity",
          texted ? "opacity-100" : "opacity-0",
        )}
      >
        Sent from Jake’s phone
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pressure test
// ---------------------------------------------------------------------------

export function PressureDemo() {
  const { ref, step } = useSteps<HTMLDivElement>([800, 3200, 3200], 2);
  const running = step >= 1;
  const drop = useCountUp(8, running, 2800);
  const psi = 20 - drop;
  const done = step === 2;
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <div ref={ref} aria-hidden="true" className="card flex items-center gap-5 p-4 select-none">
      <div className="relative size-32 shrink-0">
        <svg viewBox="0 0 120 120" className="size-full -rotate-90">
          <circle cx="60" cy="60" r={r} className="fill-none stroke-fill" strokeWidth="10" />
          <circle
            cx="60"
            cy="60"
            r={r}
            className={cx(
              "fill-none transition-[stroke] duration-500",
              done ? "stroke-status-fail" : "stroke-link",
            )}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - psi / 20)}
          />
        </svg>
        <div className="absolute inset-0 grid place-items-center text-center">
          <div>
            <p className="font-display text-4xl leading-none font-extrabold tabular-nums">{psi}</p>
            <p className="text-[0.75rem] text-text-muted">PSI</p>
          </div>
        </div>
      </div>
      <div className="min-w-0">
        <p className="text-[0.85rem] text-text-muted">Pressure test · Return 3</p>
        <p className="font-semibold">
          {done ? "Dropped 8 PSI in 15 min" : running ? "Holding 15 min…" : "Started at 20 PSI"}
        </p>
        <div
          className={cx("mt-2 transition-opacity duration-300", done ? "opacity-100" : "opacity-0")}
        >
          <Verdict tone="fail" className="lp-pop">
            Leaking
          </Verdict>
        </div>
      </div>
    </div>
  );
}

export function DiagramDemo() {
  const { ref, step } = useSteps<HTMLDivElement>([4200, 600], 0);
  return (
    <div ref={ref} aria-hidden="true" className="card p-4 select-none">
      {step === 0 ? <PoolDiagram /> : <PoolDiagram pins={false} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Works with no signal
// ---------------------------------------------------------------------------

const OFFLINE_ROWS = {
  leak: ["Return 3 · Leaking", "Photo · Return 3 fitting", "Finding · Return 3 line break"],
  maintenance: ["Vacuum · Done", "Photo · Filter gauge at 24 PSI", "Visit done · Palm Court HOA"],
};

export function OfflineDemo() {
  const { ref, step } = useSteps<HTMLDivElement>([1200, 1200, 1200, 1400, 2600], 4);
  const { pkg } = usePackage();
  const offline = step < 3;
  const queued = Math.min(step + 1, 3);
  return (
    <div ref={ref} aria-hidden="true" className="card p-4 select-none">
      <div className="flex items-center justify-between text-[0.85rem] font-semibold">
        <span className="flex items-center gap-2">
          <span className="flex items-end gap-[2px]">
            {[5, 8, 11, 14].map((h, i) => (
              <span
                key={h}
                className={cx(
                  "w-[4px] rounded-[1px] bg-current transition-opacity duration-500",
                  offline && i > 0 && "opacity-20",
                )}
                style={{ height: h }}
              />
            ))}
          </span>
          {offline ? "No Service" : "LTE"}
        </span>
        <span
          className={cx(
            "rounded-full px-3 py-1 text-[0.75rem] transition-colors duration-500",
            offline
              ? "bg-status-warning/12 text-status-warning"
              : "bg-status-pass/12 text-status-pass",
          )}
        >
          {offline ? `${queued} change${queued === 1 ? "" : "s"} saved on this phone` : "Synced ✓"}
        </span>
      </div>
      <div className="mt-3 space-y-1.5">
        {OFFLINE_ROWS[pkg].map((t, i) => (
          <div
            key={t}
            className={cx(
              "well flex items-center justify-between px-3 py-2 text-[0.85rem] transition-all duration-500",
              i < queued || !offline ? "opacity-100" : "translate-y-1 opacity-0",
            )}
          >
            {t}
            <span
              className={cx("text-[0.75rem]", offline ? "text-text-muted" : "text-status-pass")}
            >
              {offline ? "Waiting" : "Sent"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The report
// ---------------------------------------------------------------------------

export function ReportDemo() {
  const { ref, step } = useSteps<HTMLDivElement>([5200, 900], 0);
  return (
    <div ref={ref} aria-hidden="true" className="card overflow-hidden select-none">
      {step === 0 ? (
        <div>
          <div className="flex items-start justify-between bg-header px-5 py-4 text-on-header">
            <div>
              <p className="font-display text-lg font-bold">Demo Leak Co.</p>
              <p className="text-[0.8rem] opacity-80">(602) 555-0142 · office@demo.leakbook.test</p>
            </div>
            <div className="text-right">
              <p className="font-display font-bold">Leak Detection Report</p>
              <p className="text-[0.8rem] opacity-80">October 15, 2026</p>
            </div>
          </div>
          <div className="grid gap-4 p-5 sm:grid-cols-[1fr_15rem]">
            <div>
              <p className="font-display text-lg font-bold">Summary</p>
              <p className="lp-rise text-[0.9rem] text-text-muted">
                We checked 12 of 13 items: 10 passed, 1 needs attention, and 1 is leaking. We
                recorded 2 findings.
              </p>
              <div className="mt-3">
                <SummaryTiles />
              </div>
              <p className="mt-4 font-display text-lg font-bold">What we found</p>
              <div className="mt-1 space-y-2 text-[0.9rem]">
                <p className="lp-rise" style={{ animationDelay: "0.9s" }}>
                  <b>1 · Return 3 line break</b> (major). Under the deck, about 6 ft from the
                  fitting. Lost 8 PSI in 15 minutes; dye confirms it.
                </p>
                <p className="lp-rise" style={{ animationDelay: "1.1s" }}>
                  <b>2 · Light niche seal worn</b> (minor). No draw today; recheck at the next
                  visit.
                </p>
              </div>
            </div>
            <div>
              <PoolDiagram />
              <div className="mt-4">
                <Signature className="h-14 text-text" delay={1.6} />
                <p className="border-t border-separator pt-1 text-[0.8rem] text-text-muted">
                  Sam Sample · Inspection acknowledged
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="h-[30rem]" />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Quote and pay
// ---------------------------------------------------------------------------

const SHOP = { leak: "Demo Leak Co.", maintenance: "Demo Pool Co." };
const QUOTE = {
  leak: {
    lines: [
      ["Repair Return 3 line under the deck", "$1,150.00"],
      ["Pressure test after repair", "$125.00"],
      ["Replace light niche seal", "$185.00"],
    ],
    total: "$1,460.00",
    deposit: "$730.00",
  },
  maintenance: {
    lines: [
      ["Replace pump motor, 1.5 HP", "$685.00"],
      ["Replace filter cartridges", "$210.00"],
      ["Labor", "$150.00"],
    ],
    total: "$1,045.00",
    deposit: "$522.50",
  },
};

export function QuoteDemo() {
  const { ref, step } = useSteps<HTMLDivElement>([1600, 900, 700, 3600], 3);
  const { pkg } = usePackage();
  const q = QUOTE[pkg];
  const on = step >= 1;
  const accepted = step === 3;
  return (
    <div ref={ref} aria-hidden="true" className="relative card p-5 select-none">
      <p className="font-display text-lg font-bold">Repair Quote #1002</p>
      <div className="mt-3 space-y-1.5 text-[0.9rem]">
        {q.lines.map(([l, p]) => (
          <div key={l} className="flex justify-between gap-3">
            <span>{l}</span>
            <span className="tabular-nums">{p}</span>
          </div>
        ))}
        <div className="flex justify-between border-t border-separator pt-2 font-bold">
          <span>Total</span>
          <span className="tabular-nums">{q.total}</span>
        </div>
        <div className="flex justify-between text-text-muted">
          <span>Deposit due when you accept</span>
          <span className="tabular-nums">{q.deposit}</span>
        </div>
      </div>
      <div className="well mt-4 flex items-center justify-between gap-3 px-4 py-3 text-[0.9rem]">
        <span>I accept this quote and ask {SHOP[pkg]} to do the work.</span>
        <span
          className={cx(
            "relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors duration-300",
            on ? "bg-status-pass" : "bg-fill",
          )}
        >
          <span
            className={cx(
              "absolute top-[2px] size-[27px] rounded-full bg-white shadow transition-all duration-300",
              on ? "left-[22px]" : "left-[2px]",
            )}
          />
        </span>
      </div>
      <div className="relative mt-3">
        <div
          className={cx(
            "rounded-full py-3 text-center font-semibold transition-all duration-300",
            accepted ? "bg-status-pass text-white" : "bg-primary text-on-primary",
            step === 2 && "scale-[0.98]",
          )}
        >
          {accepted ? `Accepted · Deposit ${q.deposit} paid ✓` : "Accept Quote"}
        </div>
        <Tap show={step === 2} className="top-0 left-1/2" />
      </div>
    </div>
  );
}

export function PayDemo() {
  const { ref, step } = useSteps<HTMLDivElement>([1800, 700, 3200], 2);
  const { pkg } = usePackage();
  const leak = pkg === "leak";
  const amount = leak ? "$375.00" : "$225.00";
  const paid = step === 2;
  return (
    <div ref={ref} aria-hidden="true" className="relative card p-5 select-none">
      <div className="flex justify-between">
        <p className="font-display text-lg font-bold">{leak ? "Invoice #1024" : "Invoice #2210"}</p>
        <span
          className={cx(
            "rounded-full px-3 py-1 text-[0.8rem] font-semibold transition-colors duration-500",
            paid
              ? "bg-status-pass/12 text-status-pass"
              : "bg-status-warning/12 text-status-warning",
          )}
        >
          {paid ? "Paid" : "Due on receipt"}
        </span>
      </div>
      <div className="mt-3 flex justify-between text-[0.9rem]">
        <span>{leak ? "Leak detection" : "Pool service, October · 5 visits"}</span>
        <span className="tabular-nums">{amount}</span>
      </div>
      <div className="mt-1 flex justify-between font-bold">
        <span>Balance due</span>
        <span className="tabular-nums">{paid ? "$0.00" : amount}</span>
      </div>
      <div className="relative mt-4">
        <div
          className={cx(
            "rounded-full bg-black py-3 text-center font-semibold text-white transition-transform dark:bg-white dark:text-black",
            step === 1 && "scale-[0.98]",
          )}
        >
          Apple Pay
        </div>
        <Tap show={step === 1} className="top-0 left-1/2" />
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-center text-[0.85rem] font-semibold">
        {["Card", "Google Pay", "Bank"].map((t) => (
          <span key={t} className="rounded-full bg-fill py-2">
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Office dashboard
// ---------------------------------------------------------------------------

const MONTHS = [
  ["May", 39200],
  ["Jun", 46900],
  ["Jul", 50150],
  ["Aug", 44800],
  ["Sep", 42100],
  ["Oct", 38050],
] as const;
const STATUS = [
  ["Scheduled", 26],
  ["In progress", 5],
  ["Quote accepted", 9],
  ["Invoiced", 14],
  ["Paid", 61],
] as const;

export function DashboardDemo() {
  const { ref, step } = useSteps<HTMLDivElement>([5600, 500], 0);
  const run = step === 0;
  const collected = useCountUp(261200, run, 1600);
  const owed = useCountUp(16450, run, 1600);
  const rate = useCountUp(74, run, 1600);
  const invoiced = useCountUp(277650, run, 1600);
  const max = Math.max(...MONTHS.map((m) => m[1]));
  const money = (v: number) => `$${v.toLocaleString("en-US")}`;
  return (
    <div ref={ref}>
      <Laptop>
        <OfficeBar active="Dashboard" />
        <div className="p-4 sm:p-5">
          <p className="font-display text-xl font-extrabold">Dashboard</p>
          <p className="text-[0.75rem] text-text-muted">Last 6 months · May 2026 – Oct 2026</p>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ["Collected", money(collected)],
              ["Owed to you", money(owed)],
              ["Quotes accepted", `${rate}%`],
              ["Invoiced", money(invoiced)],
            ].map(([l, v]) => (
              <div key={l} className="card p-3">
                <p className="text-[0.7rem] text-text-muted">{l}</p>
                <p className="font-display text-[1.35rem] font-extrabold tabular-nums">{v}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <div className="card p-3">
              <p className="font-display text-[0.95rem] font-bold">Collected by Month</p>
              <div className="mt-2 flex h-28 items-end gap-2 border-b border-border">
                {run
                  ? MONTHS.map(([m, v], i) => (
                      <span
                        key={m}
                        className="lp-bar mx-auto w-full max-w-8 rounded-t bg-chart"
                        style={{
                          height: `${(v / max) * 100}%`,
                          animationDelay: `${0.1 + i * 0.08}s`,
                        }}
                      />
                    ))
                  : null}
              </div>
              <div className="mt-1 flex gap-2 text-center text-[0.65rem] text-text-muted">
                {MONTHS.map(([m]) => (
                  <span key={m} className="flex-1">
                    {m}
                  </span>
                ))}
              </div>
            </div>
            <div className="card p-3">
              <p className="font-display text-[0.95rem] font-bold">Jobs by Status</p>
              <div className="mt-2 space-y-1.5">
                {STATUS.map(([s, n], i) => (
                  <div
                    key={s}
                    className="grid grid-cols-[6.5rem_1fr_1.5rem] items-center gap-2 text-[0.7rem]"
                  >
                    <span>{s}</span>
                    <span className="h-2 rounded-r bg-transparent">
                      {run ? (
                        <span
                          className="lp-grow block h-full rounded-r bg-chart"
                          style={{
                            width: `${(n / 61) * 100}%`,
                            animationDelay: `${0.2 + i * 0.08}s`,
                          }}
                        />
                      ) : null}
                    </span>
                    <span className="text-right font-semibold tabular-nums">{n}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </Laptop>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pool maintenance: plans and monthly billing
// ---------------------------------------------------------------------------

export function PlanDemo() {
  const { ref, step } = useSteps<HTMLDivElement>([1400, 2600, 3400], 2);
  const days = Array.from({ length: 31 }, (_, i) => i + 1);
  const visits = [1, 8, 15, 22, 29];
  return (
    <div ref={ref} aria-hidden="true" className="card p-5 select-none">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-lg font-bold">Palm Court HOA</p>
          <p className="text-[0.85rem] text-text-muted">2150 W Palm Ln, Phoenix</p>
        </div>
        <span className="rounded-full bg-link/12 px-3 py-1 text-[0.8rem] font-semibold text-link">
          Weekly · Thursdays
        </span>
      </div>
      <div className="mt-4 grid grid-cols-7 gap-1 text-center text-[0.75rem]">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <span key={i} className="text-text-muted">
            {d}
          </span>
        ))}
        {[0, 0, 0, 0].map((_, i) => (
          <span key={`b${i}`} />
        ))}
        {days.map((d) => {
          const v = visits.indexOf(d);
          return (
            <span key={d} className="relative grid h-8 place-items-center">
              {v >= 0 && step >= 1 ? (
                <span
                  className="lp-pop absolute size-7 rounded-full bg-link"
                  style={{ animationDelay: `${v * 0.18}s` }}
                />
              ) : null}
              <span
                className={cx(
                  "relative tabular-nums",
                  v >= 0 && step >= 1 && "font-semibold text-white",
                )}
              >
                {d}
              </span>
            </span>
          );
        })}
      </div>
      <div
        className={cx(
          "well mt-4 px-4 py-3 transition-all duration-500",
          step === 2 ? "opacity-100" : "translate-y-2 opacity-0",
        )}
      >
        <div className="flex justify-between text-[0.9rem]">
          <span>October invoice · 5 visits × $45.00</span>
          <span className="font-bold tabular-nums">$225.00</span>
        </div>
        <p className="text-[0.8rem] text-text-muted">Drafted November 1 for the office to send</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pool maintenance: the service checklist
// ---------------------------------------------------------------------------

const SERVICE = [
  { name: "Skim the surface", tone: "pass" as const, label: "Done" },
  { name: "Brush walls and steps", tone: "pass" as const, label: "Done" },
  { name: "Vacuum", tone: "pass" as const, label: "Done" },
  { name: "Empty baskets", tone: "pass" as const, label: "Done" },
  { name: "Filter pressure", tone: "warn" as const, label: "Attention" },
  { name: "Test and balance water", tone: "pass" as const, label: "Done" },
];

export function ServiceChecklistDemo() {
  const { ref, step } = useSteps<HTMLDivElement>([4600, 600], 0);
  return (
    <div ref={ref} aria-hidden="true" className="card px-4 py-2 select-none">
      {step === 0 ? (
        <div className="divide-y divide-separator">
          {SERVICE.map((r, i) => (
            <div key={r.name} className="flex items-center justify-between gap-3 py-2">
              <span className="text-[0.95rem]">{r.name}</span>
              <Verdict
                tone={r.tone}
                className="lp-pop min-w-[6.4rem]"
                style={{ animationDelay: `${0.2 + i * 0.35}s` }}
              >
                {r.label}
              </Verdict>
            </div>
          ))}
        </div>
      ) : (
        <div className="h-[18.5rem]" />
      )}
    </div>
  );
}
