"use client";

import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import {
  BRAND_SWATCHES,
  calculateChemistry,
  DEPOSIT_CHOICES,
  formatCents,
  LEAK_DEMO_SPOTS,
  ONBOARDING,
  painsToAnswer,
  planForServices,
  planTier,
  servicesPriceCents,
  servicesPriceLines,
  type ChlorineProduct,
  type OnboardingAnswers,
  type OnboardingPackage,
  type Services,
} from "@leakbook/core";
import { redeemCode, saveOnboarding, startCheckout } from "@/app/actions/onboarding";
import { Logo } from "./logo";
import { Segmented } from "./segmented";
import { Button, cx } from "./ui";

// New-shop onboarding (owner, 2026-10-16), planned with the app-onboarding-questionnaire and
// apple-design skills: a goal, what's in the way, how Sundeck Pro helps, a few choices that set
// the shop up, a hands-on sample visit (Pool Maintenance) or inspection report (Leak
// Detection), then the card for the 30-day trial. Questions can be skipped; the purchase
// comes after the demo (HIG Onboarding). Copy: packages/core/src/onboarding.ts.

const STEPS = [
  "welcome",
  "goal",
  "pains",
  "how",
  "setup",
  "saving",
  "demo",
  "result",
  "card",
] as const;
type Step = (typeof STEPS)[number];

type Mark = "leaking" | "ok";

const dollars = (c: number) => formatCents(c).replace(/\.00$/, "");
const longDate = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric" }).format(new Date(iso));

export function Onboarding({
  pkg,
  services,
  company,
  billing,
  trialEnds,
  saved,
  startAt,
}: {
  pkg: OnboardingPackage;
  services: Services;
  company: string;
  /** Whether this server takes cards (Stripe billing); without it the last step just finishes. */
  billing: boolean;
  trialEnds: string | null;
  saved: OnboardingAnswers | null;
  startAt: "card" | null;
}) {
  const content = ONBOARDING[pkg];
  const [step, setStep] = useState<Step>(startAt === "card" && saved ? "card" : "welcome");
  const [answers, setAnswers] = useState<OnboardingAnswers>(
    () =>
      saved ?? {
        package: pkg,
        goal: null,
        pains: [],
        people: 1,
        color: BRAND_SWATCHES[0].hex,
        ...(pkg === "leak" ? { depositBps: 0 } : { chlorine: "liquid12" as ChlorineProduct }),
      },
  );
  const [readings, setReadings] = useState({ fc: 0.5, ph: 8.0, ta: 70 });
  const [marks, setMarks] = useState<Partial<Record<string, Mark>>>({});
  const heading = useRef<HTMLHeadingElement>(null);
  const shown = useRef(step);

  const index = STEPS.indexOf(step);
  const go = (to: Step) => setStep(to);
  const next = () => go(STEPS[index + 1]!);
  const back = () => go(STEPS[step === "demo" ? STEPS.indexOf("setup") : index - 1]!);
  const set = (patch: Partial<OnboardingAnswers>) => setAnswers((a) => ({ ...a, ...patch }));

  // Each new step starts at the top with its title read out, like a pushed screen. Not the
  // first one: the page opens there anyway.
  useEffect(() => {
    if (shown.current === step) return;
    shown.current = step;
    window.scrollTo({ top: 0 });
    heading.current?.focus();
  }, [step]);

  const title = (text: ReactNode, sub?: ReactNode) => (
    <div className="mb-6">
      <h1
        ref={heading}
        tabIndex={-1}
        className="font-display text-[2.125rem] leading-tight font-extrabold outline-none"
      >
        {text}
      </h1>
      {sub ? <p className="mt-2 text-text-muted">{sub}</p> : null}
    </div>
  );

  let body: ReactNode;
  let action: ReactNode = null;
  switch (step) {
    case "welcome":
      body = (
        <>
          {title(content.welcome.title, content.welcome.body)}
          <Preview pkg={pkg} company={company} />
        </>
      );
      action = <Button onClick={next}>Get Started</Button>;
      break;
    case "goal":
      body = (
        <>
          {title(content.goalQuestion, "Pick the one that matters most.")}
          <ChoiceList
            label={content.goalQuestion}
            multiple={false}
            options={content.goals.map((g) => ({ id: g.id, label: g.label, emoji: g.emoji }))}
            chosen={answers.goal ? [answers.goal] : []}
            onToggle={(id) => set({ goal: id })}
          />
        </>
      );
      action = (
        <Button onClick={next} disabled={!answers.goal}>
          Continue
        </Button>
      );
      break;
    case "pains":
      body = (
        <>
          {title(content.painQuestion, "Pick any that sound familiar.")}
          <ChoiceList
            label={content.painQuestion}
            multiple
            options={content.pains.map((p) => ({ id: p.id, label: p.label }))}
            chosen={answers.pains}
            onToggle={(id) =>
              set({
                pains: answers.pains.includes(id)
                  ? answers.pains.filter((p) => p !== id)
                  : [...answers.pains, id],
              })
            }
          />
        </>
      );
      action = <Button onClick={next}>Continue</Button>;
      break;
    case "how":
      body = (
        <>
          {title("Here’s how Sundeck Pro helps.")}
          <ul className="grouped">
            {painsToAnswer(pkg, answers.pains).map((p) => (
              <li key={p.id} className="flex gap-3 px-4 py-3">
                <span aria-hidden="true" className="mt-0.5 text-status-pass">
                  ✓
                </span>
                <span>
                  <span className="block text-[0.9375rem] text-text-muted">{p.label}</span>
                  <span className="block font-semibold">{p.answer}</span>
                </span>
              </li>
            ))}
          </ul>
        </>
      );
      action = <Button onClick={next}>Set Up My Shop</Button>;
      break;
    case "setup":
      body = (
        <>
          {title(`Set up ${company}`, "You can change any of this later in Settings.")}
          <SetupChoices pkg={pkg} services={services} answers={answers} set={set} />
        </>
      );
      action = <Button onClick={next}>Save and Continue</Button>;
      break;
    case "saving":
      body = <Saving company={company} answers={answers} onDone={next} onBack={back} />;
      break;
    case "demo":
      body =
        pkg === "maintenance" ? (
          <>
            {title(content.demoTitle, content.demoIntro)}
            <VisitDemo
              readings={readings}
              setReadings={setReadings}
              chlorine={answers.chlorine ?? "liquid12"}
            />
          </>
        ) : (
          <>
            {title(content.demoTitle, content.demoIntro)}
            <InspectionDemo marks={marks} setMarks={setMarks} />
          </>
        );
      {
        const left = LEAK_DEMO_SPOTS.filter((s) => !marks[s]).length;
        action =
          pkg === "maintenance" ? (
            <Button onClick={next}>Finish Visit</Button>
          ) : (
            <Button onClick={next} disabled={left > 0}>
              {left ? `Mark ${left} More` : "Write Report"}
            </Button>
          );
      }
      break;
    case "result":
      body = (
        <>
          {title(
            "Your homeowner gets this.",
            pkg === "maintenance"
              ? "Sent when the visit is finished, in your color."
              : "Written from your checklist, in your color.",
          )}
          {pkg === "maintenance" ? (
            <VisitSummary
              company={company}
              color={answers.color}
              readings={readings}
              chlorine={answers.chlorine ?? "liquid12"}
            />
          ) : (
            <ReportSummary company={company} color={answers.color} marks={marks} />
          )}
        </>
      );
      action = <Button onClick={next}>Keep Going</Button>;
      break;
    case "card":
      body = (
        <TrialOffer
          pkg={pkg}
          services={services}
          people={answers.people}
          trialEnds={trialEnds}
          billing={billing}
          title={title}
        />
      );
      break;
  }

  const showBack = index > 0 && step !== "saving";
  const canSkip = step === "goal" || step === "pains" || step === "how";
  // Phones: full screen, the action pinned above the home indicator. Wider screens: a setup
  // window centered under the logo, like a Mac setup assistant, with the action inside it.
  return (
    <div className="flex flex-1 flex-col sm:items-center sm:px-6 sm:pb-12">
      <div className="mt-10 mb-6 hidden sm:block">
        <Logo height={36} />
      </div>
      <div
        className={cx(
          "mx-auto flex w-full max-w-md flex-1 flex-col px-4 pb-8",
          "sm:max-w-lg sm:flex-none sm:rounded-[1.25rem] sm:bg-surface sm:px-10 sm:pt-6 sm:pb-10",
          "sm:shadow-[0_1px_2px_rgb(18_38_58/0.06),0_6px_20px_rgb(18_38_58/0.05)]",
          // Lists and cards inside the window sit on the page gray, as in a grouped sheet.
          "sm:[&_.card]:bg-bg sm:[&_.card]:shadow-none sm:[&_.grouped]:bg-bg",
        )}
      >
        <nav
          aria-label="Setup"
          className="sticky top-0 z-10 -mx-4 bg-bg/90 px-4 backdrop-blur sm:static sm:mx-0 sm:bg-transparent sm:px-0 sm:backdrop-blur-none"
        >
          <div className="flex min-h-11 items-center justify-between">
            {showBack ? (
              <button
                type="button"
                onClick={back}
                className="-ml-2 min-h-11 px-2 text-[1.0625rem] text-link"
              >
                ‹ Back
              </button>
            ) : (
              <span />
            )}
            {canSkip ? (
              <button
                type="button"
                onClick={() => go("setup")}
                className="-mr-2 min-h-11 px-2 text-[1.0625rem] text-link"
              >
                Skip
              </button>
            ) : null}
          </div>
          <div
            role="progressbar"
            aria-label="Setup progress"
            aria-valuemin={1}
            aria-valuemax={STEPS.length}
            aria-valuenow={index + 1}
            className="h-1 overflow-hidden rounded-full bg-fill"
          >
            <div
              className="h-1 rounded-full bg-primary transition-[width] duration-300 motion-reduce:transition-none"
              style={{ width: `${((index + 1) / STEPS.length) * 100}%` }}
            />
          </div>
        </nav>
        <div className="flex-1 pt-6" data-testid={`onboarding-${step}`}>
          {body}
        </div>
        {action ? (
          <div className="sticky bottom-0 -mx-4 mt-6 bg-bg/90 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur sm:static sm:mx-0 sm:mt-8 sm:bg-transparent sm:p-0 sm:backdrop-blur-none [&>button]:w-full">
            {action}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** What the app looks like at its best, drawn with the app's own parts. */
function Preview({ pkg, company }: { pkg: OnboardingPackage; company: string }) {
  const rows =
    pkg === "maintenance"
      ? [
          { name: "Rivera", note: "Done · 9:12 AM", done: true },
          { name: "Okafor", note: "Done · 9:40 AM", done: true },
          { name: "Lindqvist", note: "Next · 10:05 AM", done: false },
        ]
      : [
          { name: "Skimmer", note: "Leaking: throat seam", done: false },
          { name: "Main drain", note: "Not leaking", done: true },
          { name: "Return lines", note: "Not leaking: pressure held", done: true },
        ];
  return (
    <div className="card p-4" aria-label="A preview of Sundeck Pro">
      <p className="text-[0.8125rem] font-semibold tracking-wide text-text-muted uppercase">
        {company} · {pkg === "maintenance" ? "Today’s route" : "Leak inspection"}
      </p>
      <ul className="grouped mt-3 bg-bg">
        {rows.map((r) => (
          <li key={r.name} className="flex min-h-11 items-center gap-3 px-4 py-2">
            <span
              aria-hidden="true"
              className={cx(
                "inline-flex size-6 items-center justify-center rounded-full text-[0.8125rem] text-white",
                r.done ? "bg-status-pass" : pkg === "leak" ? "bg-status-fail" : "bg-text-muted/50",
              )}
            >
              {r.done ? "✓" : pkg === "leak" ? "!" : ""}
            </span>
            <span>
              <span className="block font-medium">{r.name}</span>
              <span className="block text-[0.9375rem] text-text-muted">{r.note}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** An inset grouped list of choices with a checkmark on the chosen ones (iOS). */
function ChoiceList({
  label,
  multiple,
  options,
  chosen,
  onToggle,
}: {
  label: string;
  multiple: boolean;
  options: { id: string; label: string; emoji?: string }[];
  chosen: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <ul className="grouped" role={multiple ? "group" : "radiogroup"} aria-label={label}>
      {options.map((o) => {
        const on = chosen.includes(o.id);
        return (
          <li key={o.id}>
            <button
              type="button"
              role={multiple ? "checkbox" : "radio"}
              aria-checked={on}
              onClick={() => onToggle(o.id)}
              className="flex min-h-12 w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-text/[0.03] active:bg-text/[0.06]"
            >
              {o.emoji ? (
                <span aria-hidden="true" className="text-xl">
                  {o.emoji}
                </span>
              ) : null}
              <span className="flex-1">{o.label}</span>
              <span
                aria-hidden="true"
                className={cx("text-lg font-semibold text-link", on ? "" : "invisible")}
              >
                ✓
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function SetupChoices({
  pkg,
  services,
  answers,
  set,
}: {
  pkg: OnboardingPackage;
  services: Services;
  answers: OnboardingAnswers;
  set: (patch: Partial<OnboardingAnswers>) => void;
}) {
  const plan = planForServices(services);
  const tier = planTier(plan, answers.people);
  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-1 px-4 text-[0.8125rem] text-text-muted uppercase">Your team</h2>
        <div className="grouped flex min-h-12 items-center justify-between gap-3 px-4 py-2">
          <span id="people-label">People, counting you</span>
          <span className="flex items-center gap-3">
            <button
              type="button"
              aria-label="Fewer people"
              disabled={answers.people <= 1}
              onClick={() => set({ people: answers.people - 1 })}
              className="inline-flex size-11 items-center justify-center rounded-full bg-fill text-xl disabled:opacity-40"
            >
              −
            </button>
            <output
              aria-labelledby="people-label"
              data-testid="onboarding-people"
              className="w-8 text-center font-display text-xl font-extrabold tabular-nums"
            >
              {answers.people}
            </output>
            <button
              type="button"
              aria-label="More people"
              disabled={answers.people >= 50}
              onClick={() => set({ people: answers.people + 1 })}
              className="inline-flex size-11 items-center justify-center rounded-full bg-fill text-xl disabled:opacity-40"
            >
              +
            </button>
          </span>
        </div>
        <p className="mt-2 px-4 text-[0.8125rem] text-text-muted">
          {tier.name}: {dollars(servicesPriceCents(services, answers.people))} a month. You’ll
          invite them after setup.
        </p>
      </section>

      <section>
        <h2 id="color-label" className="mb-1 px-4 text-[0.8125rem] text-text-muted uppercase">
          Color for your {pkg === "leak" ? "reports" : "visit summaries"}
        </h2>
        <div
          role="radiogroup"
          aria-labelledby="color-label"
          className="grouped flex flex-wrap gap-3 px-4 py-3"
        >
          {BRAND_SWATCHES.map((s) => (
            <button
              key={s.hex}
              type="button"
              role="radio"
              aria-checked={answers.color === s.hex}
              aria-label={s.name}
              onClick={() => set({ color: s.hex })}
              className={cx(
                "size-11 rounded-full outline-offset-2",
                answers.color === s.hex ? "outline-3 outline-link" : "",
              )}
              style={{ background: s.hex }}
            />
          ))}
        </div>
        <p className="mt-2 px-4 text-[0.8125rem] text-text-muted">
          Add your logo in Settings › Company.
        </p>
      </section>

      {/* Pool shops pick their chlorine in the Chemical screen, not here (owner, 2026-10-19). */}
      {pkg === "maintenance" ? null : (
        <section className="grouped px-4 py-3">
          <Segmented
            label="Deposit on repairs"
            name="deposit"
            value={String(answers.depositBps ?? 0)}
            options={DEPOSIT_CHOICES.map((d) => ({ value: String(d.bps), label: d.label }))}
            onChange={(v) => set({ depositBps: Number(v) })}
          />
          <p className="mt-2 text-[0.8125rem] text-text-muted">
            Paid by card or bank when a homeowner accepts a quote.
          </p>
        </section>
      )}
    </div>
  );
}

/** Keeps the answers, then moves on. Only as long as the save takes (and long enough to read). */
function Saving({
  company,
  answers,
  onDone,
  onBack,
}: {
  company: string;
  answers: OnboardingAnswers;
  onDone: () => void;
  onBack: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const latest = useRef({ answers, onDone });
  useEffect(() => {
    latest.current = { answers, onDone };
  });
  useEffect(() => {
    let live = true;
    const started = Date.now();
    void saveOnboarding(latest.current.answers).then(
      (r) => {
        if (!live) return;
        if (r.error) return setError(r.error);
        setTimeout(
          () => live && latest.current.onDone(),
          Math.max(0, 900 - (Date.now() - started)),
        );
      },
      () => live && setError("Couldn’t save. Check your connection and try again."),
    );
    return () => {
      live = false;
    };
  }, [attempt]);
  return (
    <div className="flex flex-col items-center pt-16 text-center" role="status">
      {error ? (
        <>
          <p className="font-semibold">{error}</p>
          <div className="mt-6 flex gap-3">
            <Button kind="secondary" onClick={onBack}>
              Back
            </Button>
            <Button
              onClick={() => {
                setError(null);
                setAttempt((n) => n + 1);
              }}
            >
              Try Again
            </Button>
          </div>
        </>
      ) : (
        <>
          <span
            aria-hidden="true"
            className="size-10 animate-spin rounded-full border-4 border-fill border-t-primary motion-reduce:animate-none"
          />
          <p className="mt-6 font-display text-2xl font-extrabold">Setting up {company}…</p>
        </>
      )}
    </div>
  );
}

const DEMO_READINGS = [
  { key: "fc", label: "Free chlorine", unit: "ppm", step: 0.5, min: 0, max: 10 },
  { key: "ph", label: "pH", unit: "", step: 0.1, min: 6.8, max: 8.4 },
  { key: "ta", label: "Alkalinity", unit: "ppm", step: 10, min: 40, max: 200 },
] as const;
type DemoReadings = { fc: number; ph: number; ta: number };

function demoChemistry(readings: DemoReadings, chlorine: ChlorineProduct) {
  return calculateChemistry({
    gallons: 18_000,
    readings: { ...readings, cya: 40 },
    chlorine,
    acid: "muriatic31",
  });
}

const fmt = (key: string, v: number) => (key === "ph" ? v.toFixed(1) : String(v));

function VisitDemo({
  readings,
  setReadings,
  chlorine,
}: {
  readings: DemoReadings;
  setReadings: (r: DemoReadings) => void;
  chlorine: ChlorineProduct;
}) {
  const result = demoChemistry(readings, chlorine);
  return (
    <div className="space-y-6">
      <ul className="grouped" aria-label="Today’s readings">
        {DEMO_READINGS.map((r) => {
          const v = readings[r.key];
          const change = (d: number) =>
            setReadings({
              ...readings,
              [r.key]: Math.min(r.max, Math.max(r.min, Math.round((v + d) * 10) / 10)),
            });
          return (
            <li key={r.key} className="flex min-h-12 items-center justify-between gap-3 px-4 py-2">
              <span id={`demo-${r.key}`}>{r.label}</span>
              <span className="flex items-center gap-3">
                <button
                  type="button"
                  aria-label={`Lower ${r.label}`}
                  onClick={() => change(-r.step)}
                  disabled={v <= r.min}
                  className="inline-flex size-11 items-center justify-center rounded-full bg-fill text-xl disabled:opacity-40"
                >
                  −
                </button>
                <output
                  aria-labelledby={`demo-${r.key}`}
                  className="w-12 text-center font-display text-xl font-extrabold tabular-nums"
                >
                  {fmt(r.key, v)}
                </output>
                <button
                  type="button"
                  aria-label={`Raise ${r.label}`}
                  onClick={() => change(r.step)}
                  disabled={v >= r.max}
                  className="inline-flex size-11 items-center justify-center rounded-full bg-fill text-xl disabled:opacity-40"
                >
                  +
                </button>
              </span>
            </li>
          );
        })}
      </ul>
      <section aria-live="polite">
        <h2 className="mb-1 px-4 text-[0.8125rem] text-text-muted uppercase">What to add</h2>
        <ul className="grouped" data-testid="demo-steps">
          {result.steps.length ? (
            result.steps.map((s) => (
              <li key={s.key + s.product} className="px-4 py-3">
                <span className="block font-semibold">
                  {s.measure ?? s.amount} {s.measure || s.amount ? "·" : ""} {s.product}
                </span>
                <span className="block text-[0.9375rem] text-text-muted">{s.why}</span>
              </li>
            ))
          ) : (
            <li className="px-4 py-3">Nothing to add: the water’s balanced.</li>
          )}
        </ul>
      </section>
    </div>
  );
}

function InspectionDemo({
  marks,
  setMarks,
}: {
  marks: Partial<Record<string, Mark>>;
  setMarks: (m: Partial<Record<string, Mark>>) => void;
}) {
  return (
    <ul className="grouped">
      {LEAK_DEMO_SPOTS.map((spot, i) => (
        <li key={spot} className="px-4 py-3">
          <Segmented
            label={spot}
            name={`spot-${i}`}
            value={(marks[spot] ?? "") as Mark}
            options={[
              { value: "ok", label: "Not Leaking" },
              { value: "leaking", label: "Leaking" },
            ]}
            onChange={(v) => setMarks({ ...marks, [spot]: v })}
          />
        </li>
      ))}
    </ul>
  );
}

function SummaryCard({
  company,
  color,
  kind,
  children,
}: {
  company: string;
  color: string;
  kind: string;
  children: ReactNode;
}) {
  return (
    <article className="card overflow-hidden p-0" data-testid="onboarding-sample">
      <header className="px-5 py-4 text-white" style={{ background: color }}>
        <p className="font-display text-xl font-extrabold">{company}</p>
        <p className="text-[0.9375rem] opacity-90">{kind} · The Rivera pool · Sample</p>
      </header>
      <div className="space-y-4 px-5 py-4">{children}</div>
    </article>
  );
}

function VisitSummary({
  company,
  color,
  readings,
  chlorine,
}: {
  company: string;
  color: string;
  readings: DemoReadings;
  chlorine: ChlorineProduct;
}) {
  const result = demoChemistry(readings, chlorine);
  const added = result.steps.map((s) =>
    s.measure || s.amount
      ? `${s.measure ?? s.amount} of ${s.product.charAt(0).toLowerCase()}${s.product.slice(1)}`
      : s.product,
  );
  return (
    <>
      <SummaryCard company={company} color={color} kind="Pool service">
        <section>
          <h2 className="font-semibold">Done today</h2>
          <p className="text-text-muted">Skimmed, brushed, baskets emptied, filter checked.</p>
        </section>
        <section>
          <h2 className="font-semibold">Water</h2>
          <p className="text-text-muted">
            Chlorine {fmt("fc", readings.fc)} · pH {fmt("ph", readings.ph)} · Alkalinity{" "}
            {readings.ta}
          </p>
        </section>
        <section>
          <h2 className="font-semibold">Added</h2>
          <p className="text-text-muted">{added.length ? added.join(", ") : "Nothing needed."}</p>
        </section>
      </SummaryCard>
    </>
  );
}

function ReportSummary({
  company,
  color,
  marks,
}: {
  company: string;
  color: string;
  marks: Partial<Record<string, Mark>>;
}) {
  const leaks = LEAK_DEMO_SPOTS.filter((s) => marks[s] === "leaking");
  const passed = LEAK_DEMO_SPOTS.length - leaks.length;
  const lower = (s: string) => s.toLowerCase();
  const found = leaks.length
    ? `We found ${leaks.length === 1 ? "a leak" : `${leaks.length} leaks`}: ${leaks.map(lower).join(" and ")}.`
    : "We found no leaks at the spots we checked.";
  const next = leaks.length
    ? `We’ll send a quote to repair the ${leaks.map(lower).join(" and ")}. You can accept it and pay the deposit online.`
    : "If the pool keeps losing water, we’ll check the plumbing under pressure.";
  return (
    <>
      <SummaryCard company={company} color={color} kind="Leak inspection">
        <section>
          <h2 className="font-semibold">What we found</h2>
          <p className="text-text-muted">
            We checked {LEAK_DEMO_SPOTS.length} spots. {passed} passed. {found}
          </p>
        </section>
        <ul className="space-y-1">
          {LEAK_DEMO_SPOTS.map((s) => (
            <li key={s} className="flex justify-between gap-3">
              <span>{s}</span>
              <span
                className={cx(
                  "font-semibold",
                  marks[s] === "leaking" ? "text-status-fail" : "text-status-pass",
                )}
              >
                {marks[s] === "leaking" ? "Leaking" : "Not leaking"}
              </span>
            </li>
          ))}
        </ul>
        <section>
          <h2 className="font-semibold">What happens next</h2>
          <p className="text-text-muted">{next}</p>
        </section>
      </SummaryCard>
    </>
  );
}

function TrialOffer({
  pkg,
  services,
  people,
  trialEnds,
  billing,
  title,
}: {
  pkg: OnboardingPackage;
  services: Services;
  people: number;
  trialEnds: string | null;
  billing: boolean;
  title: (text: ReactNode, sub?: ReactNode) => ReactNode;
}) {
  const content = ONBOARDING[pkg];
  const [state, act, pending] = useActionState(startCheckout, {});
  const tier = planTier(planForServices(services), people);
  const price = dollars(servicesPriceCents(services, people));
  // Every new shop ends on this payment page (owner, 2026-10-16). Without Stripe on the
  // server, cards can't be taken yet; a demo code (VIP26) still gets a shop in.
  const [showCode, setShowCode] = useState(!billing);
  return (
    <div>
      {title(content.promise)}
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
            ...content.included,
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
        className="sticky bottom-0 -mx-4 mt-6 bg-bg/90 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur sm:static sm:mx-0 sm:mt-8 sm:bg-transparent sm:p-0 sm:backdrop-blur-none"
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
  );
}

/** A demo code instead of a card (VIP26): the shop gets in with no card and no charge. */
function DemoCode() {
  const [state, act, pending] = useActionState(redeemCode, {});
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
