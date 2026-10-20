"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition, type KeyboardEvent } from "react";
import {
  HERO_ACTION_LABELS,
  NOT_ON_MAP,
  directionsHref,
  heroActions,
  heroDrive,
  heroTopLine,
  heroSegmentsSpoken,
  todayHero,
  type HeroStop,
  type LatLng,
  type OnMyWayVia,
} from "@leakbook/core";
import { changeJobStatus } from "@/app/actions/inspection";
import {
  CleaningIcon,
  KeyIcon,
  MessageIcon,
  NoteIcon,
  PhoneIcon,
  PinIcon,
  WarningIcon,
} from "./icons";
import { OnMyWayMessage } from "./on-my-way";
import { TodayComplete } from "./today-complete";
import type { SendPrompt } from "./job-work";
import { showBanner } from "./top-banner";
import { cx } from "./ui";
import { useSwipe } from "./use-swipe";
import { markStop } from "@/app/actions/inspection";

/**
 * The stop the card was showing, kept while the tech opens a job and comes back (section 9:
 * "Coming back to Today keeps … the card's stop"); put away when the app comes back to the front.
 */
let remembered: { id: string; day: string } | null = null;

/** The stop on the card: what the card links to and what its buttons need. */
export interface HeroJob {
  id: string;
  typeLabel: string;
  customer: string;
  address: string;
  location: LatLng | null;
  notOnMap: boolean;
  phone: string | null;
  /** The customer's notes, then the pool's (either may be empty). */
  notes: string | null;
  /** Where Message goes: the company number's conversation, else the phone's own texts. */
  textHref: string | null;
  driveMin: number | null;
  done: boolean;
  undo: "Reopen Visit" | "Mark Not Complete" | null;
  /** Asked before completing a visit whose report goes out by itself. */
  prompt: SendPrompt;
}

const ON_WATER = "bg-white text-water hover:bg-white/90";
/** Secondary text on the card: white at 92% is 4.8:1 on water blue (85% was 4.3:1). */
const SOFT = "text-white/92";
/** The card's buttons: 50 pt capsules that press in (none with Reduce Motion). */
const BUTTON =
  "inline-flex min-h-[3.125rem] w-full items-center justify-center rounded-full px-4 text-[1.0625rem] font-semibold transition active:scale-[0.96] active:opacity-85 motion-reduce:transform-none disabled:opacity-60";
const ROUND =
  "inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-white/18 text-white transition-colors hover:bg-white/28";

/** What the Message button needs to fill in On My Way (the shop, the tech, how texts go out). */
export interface HeroOnMyWay {
  tech: string;
  shop: string;
  windowMin: number;
  timeZone: string;
  via: OnMyWayVia;
  lineActive: boolean;
}

/**
 * Today's card for the stop the tech is on (owner, 2026-10-20; docs/plans/today-hero.md): the
 * Live Activity in the app, in its water blue. The name opens the job; the address opens
 * directions; the main button is the moment's (Start, Open Checklist). Owners and
 * admins looking at a tech's day get Call and Directions only.
 *
 * The card shows any stop (gestures.md section 1): swipe it, tap a segment of the bar, or use
 * the Left and Right arrow keys while it has focus; Back to Now returns to the stop the day is
 * on. It all happens here in the browser from the day's stops (core `todayHero`), with no trip to
 * the server, and the stop list below doesn't redraw.
 */
export function TodayHeroCard({
  stops,
  jobs,
  today,
  timeZone,
  mine,
  onMyWay,
}: {
  /** The day's stops in route order, as core's rule reads them. */
  stops: HeroStop[];
  /** What the card links to and its buttons need, by stop. */
  jobs: Record<string, HeroJob>;
  today: string;
  timeZone: string;
  mine: boolean;
  onMyWay: HeroOnMyWay;
}) {
  // The day as it stands: browsing is put away when it changes (a stop started or completed,
  // a new day), and when the page comes back to the front.
  const day = useMemo(
    () => [today, ...stops.map((s) => `${s.id}:${s.status}:${s.stop_done_on ?? ""}`)].join("|"),
    [today, stops],
  );
  const [view, setView] = useState<{ id: string; day: string } | null>(() => remembered);
  useEffect(() => {
    remembered = view;
  }, [view]);
  const viewing = view?.day === day ? view.id : null;
  // Mark Complete on the card: a checkmark on the finished stop, then the next one slides in.
  const [check, setCheck] = useState<string | null>(null);
  useEffect(() => {
    if (!check) return;
    const t = setTimeout(() => setCheck(null), 1500);
    return () => clearTimeout(t);
  }, [check]);
  useEffect(() => {
    const back = () => {
      if (document.visibilityState !== "visible") return;
      setView(null);
    };
    document.addEventListener("visibilitychange", back);
    return () => document.removeEventListener("visibilitychange", back);
  }, []);
  const hero = useMemo(
    () => todayHero({ stops, today, timeZone, viewing }),
    [stops, today, timeZone, viewing],
  );
  // Where the card is in the day; after the last stop when the day is done.
  const at = hero?.stopId ? stops.findIndex((s) => s.id === hero.stopId) : stops.length;
  const [said, setSaid] = useState("");
  const show = (i: number) => {
    const s = stops[i];
    if (!s || !hero) return;
    setView(s.id === hero.currentId ? null : { id: s.id, day });
    setSaid(`Stop ${i + 1} of ${stops.length}, ${s.customer}`);
  };
  const { area, content, arm } = useSwipe<HTMLElement>({
    page: hero?.stopId ?? "day-done",
    canPrev: at > 0,
    canNext: at < stops.length - 1,
    onPrev: () => show(at - 1),
    onNext: () => show(at + 1),
  });
  if (!hero) return null;

  const job = hero.stopId ? (jobs[hero.stopId] ?? null) : null;
  const c = hero.content;
  // A finished stop shows its undo (Reopen Visit, Mark Not Complete) and no Start (core).
  const actions = heroActions(hero.moment, mine);
  const drive = job ? heroDrive(hero.moment, job.driveMin) : null;
  // "Up next" (the figure says "2 of 5"), or "At the pool · Stop 2 of 5"; no clock times
  // (gestures.md section 10). Under the name, "Leak detection · 14 min drive".
  const top = heroTopLine(hero);
  const kind = job ? [job.typeLabel, drive].filter(Boolean).join(" · ") : "";
  // Message, Call and Directions for the stop. Before the tech leaves, Message is On My Way,
  // filled in and editable (gestures.md section 2); an owner always gets a blank text.
  const contact =
    job && hero.moment !== "done" ? (
      <Contact
        job={job}
        message={
          actions.onMyWay && job.phone ? (
            <OnMyWayMessage
              {...onMyWay}
              phone={job.phone}
              customer={job.customer}
              driveMin={job.driveMin ?? 0}
              jobId={job.id}
              className={ROUND}
            />
          ) : null
        }
      />
    ) : null;
  const startRow = actions.primary === "start_job" && !!job && !actions.complete;
  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    const step = { ArrowLeft: -1, ArrowRight: 1 }[e.key];
    if (!step) return;
    const t = e.target as HTMLElement;
    if (t !== e.currentTarget && !t.closest("[data-hero-segments]")) return;
    e.preventDefault();
    show(Math.min(stops.length - 1, Math.max(0, at + step)));
  };
  return (
    <section
      ref={area}
      // The card takes focus so its arrow keys work (desktop); the bar's segments are buttons.
      tabIndex={0}
      aria-label={c.spoken}
      aria-roledescription="stops"
      onKeyDown={onKeyDown}
      className="relative mb-6 touch-pan-y overflow-hidden rounded-[22px] bg-water p-5 text-white outline-offset-2 focus-visible:outline-2 focus-visible:outline-link sm:p-6"
      data-testid="today-hero"
      // Its own swipe changes the stop; Whose Day's swipe around it leaves the card alone.
      data-no-swipe
      data-moment={hero.moment}
      data-browsing={hero.browsing || undefined}
    >
      <span role="status" className="sr-only">
        {said}
      </span>
      {check && check === hero.stopId ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-10 grid place-items-center bg-water/70 motion-safe:animate-[fade-in_0.2s_ease-out] motion-reduce:hidden"
        >
          <svg
            viewBox="0 0 24 24"
            className="size-16 text-white"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 12.5l4.5 4.5L19 7.5" pathLength={1} className="hero-check" />
          </svg>
        </span>
      ) : null}
      <div ref={content}>
        {/* The top: the moment and the stop count, the name (the card is about them), the type,
          and the figure, or Back to Now while the card shows another stop; one column at the
          largest text sizes. */}
        <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
          <div className="min-w-0 flex-[1_1_14rem]">
            <p className={cx("text-[0.9375rem] font-semibold", SOFT)}>{top}</p>
            {job ? (
              <Link
                href={`/jobs/${job.id}`}
                className="mt-0.5 line-clamp-2 font-display text-[1.75rem] leading-tight font-extrabold underline-offset-4 hover:underline"
              >
                {job.customer}
              </Link>
            ) : null}
            {kind ? <p className={cx("mt-0.5 text-[0.9375rem]", SOFT)}>{kind}</p> : null}
          </div>
          {hero.browsing ? (
            <button
              type="button"
              onClick={() => {
                setView(null);
                const now = stops.findIndex((s) => s.id === hero.currentId);
                setSaid(
                  now >= 0 ? `Stop ${now + 1} of ${stops.length}, ${stops[now]!.customer}` : "",
                );
              }}
              className="inline-flex min-h-11 shrink-0 items-center rounded-full bg-white/18 px-4 text-[0.9375rem] font-semibold text-white transition-colors hover:bg-white/28 active:bg-white/28"
            >
              Back to Now
            </button>
          ) : (
            <div className="shrink-0 text-right">
              <p
                key={c.figure}
                className={cx(
                  "font-display leading-none font-bold tabular-nums motion-safe:animate-[fade-in_0.3s_ease-out]",
                  c.figure === "✓" ? "text-[1.75rem]" : "text-[1.375rem]",
                )}
              >
                {c.figure}
              </p>
              {c.figureLabel ? (
                <p className={cx("mt-1 text-[0.8125rem]", SOFT)}>{c.figureLabel}</p>
              ) : null}
            </div>
          )}
        </div>

        {job && hero.moment !== "done" ? (
          <ul className="mt-3 space-y-1.5">
            {job.address ? (
              <Detail icon={<PinIcon className="size-[0.9375rem]" />}>
                {/* Plain text that opens directions, as iOS shows a tappable address; a warning
                  symbol after it when the map can't find it (owner, 2026-10-20). */}
                <a
                  href={directionsHref({ address: job.address, location: job.location })}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${job.address}, directions in Maps`}
                  className="text-[1.0625rem] font-medium hover:underline"
                >
                  {job.address}
                </a>
                {job.notOnMap ? (
                  <span title={NOT_ON_MAP.title} className="ml-1.5 inline-flex align-[-0.1em]">
                    <WarningIcon className="size-[1.0625rem]" />
                    <span className="sr-only">{NOT_ON_MAP.title}</span>
                  </span>
                ) : null}
              </Detail>
            ) : null}
            {c.access ? (
              <Detail icon={<KeyIcon className="size-[0.9375rem]" />}>
                <span className="text-[0.9375rem]">{c.access}</span>
              </Detail>
            ) : null}
            {/* The filter and salt cell alerts (owner, 2026-10-20: "needs to be on the new Today
              tile"): icon and how soon, soonest first, read aloud with the cleaning's name. The
              first icon sits in the symbol column; overdue is a white pill, no new color. */}
            {c.cleanings.length ? (
              <Detail
                icon={<CleaningIcon kind={c.cleanings[0]!.kind} className="size-[0.9375rem]" />}
              >
                <ul
                  aria-label="Cleanings due"
                  className="flex flex-wrap items-center gap-x-3 gap-y-1"
                >
                  {c.cleanings.map((b, i) => (
                    <li
                      key={i}
                      aria-label={b.spoken}
                      className={cx(
                        "inline-flex items-center gap-1.5 text-[0.9375rem] font-medium",
                        b.overdue && "rounded-full bg-white px-2 font-semibold text-water",
                        b.overdue && i === 0 && "-ml-2",
                      )}
                    >
                      {i > 0 ? (
                        <CleaningIcon kind={b.kind} className="size-[0.9375rem] shrink-0" />
                      ) : null}
                      <span aria-hidden="true">{b.label}</span>
                    </li>
                  ))}
                </ul>
              </Detail>
            ) : null}
            {/* The customer's notes (owner, 2026-10-20: "you have to have customer notes
              there"), two lines at most; the job has the rest. */}
            {job.notes ? (
              <Detail icon={<NoteIcon className="size-[0.9375rem]" />}>
                <span className="line-clamp-2 text-[0.9375rem]">{job.notes}</span>
              </Detail>
            ) : null}
          </ul>
        ) : null}

        {/* Before leaving and while driving, Start sits left of the round buttons on one row,
          under the next stop (owner, 2026-10-20: "Place 'Start Job' to the left of the three
          icons. Just to condense space"). On site, and for someone looking at a tech's day,
          the round buttons stay on the Next line. */}
        {startRow ? (
          <>
            {c.next ? <p className={cx("mt-3 text-[0.9375rem]", SOFT)}>{c.next}</p> : null}
            <div className="mt-3 flex items-center gap-2" data-testid="hero-start-row">
              {/* Fills the row on phones; a comfortable width, not the whole card, when wider. */}
              <div className="min-w-28 flex-1 sm:max-w-xs">
                <Primary action="start_job" job={job!} inline />
              </div>
              {contact}
            </div>
          </>
        ) : (
          <>
            {c.next || contact ? (
              <div className="mt-3 flex items-center gap-3">
                <p className={cx("min-w-0 flex-1 text-[0.9375rem]", SOFT)}>{c.next}</p>
                {contact}
              </div>
            ) : null}

            {/* One row, equal widths: style, not size, marks the main action (buttons.md). */}
            {(actions.primary && job) ||
            ((actions.complete || actions.undo) && job && (!job.done || job.undo)) ? (
              <div className="mt-4 flex gap-2.5 [&>*]:min-w-0 [&>*]:flex-1">
                {actions.primary && job ? (
                  <div>
                    <Primary action={actions.primary} job={job} />
                  </div>
                ) : null}
                {(actions.complete || actions.undo) && job ? (
                  <TodayComplete
                    jobId={job.id}
                    customer={job.customer}
                    done={job.done}
                    undo={job.undo}
                    prompt={job.prompt}
                    onCompleting={() => {
                      setCheck(job.id);
                      setView(null);
                      arm(1);
                    }}
                    onCompleted={() =>
                      showBanner({
                        message: `${job.customer} done`,
                        action: {
                          label: "Undo",
                          onAction: () => {
                            const form = new FormData();
                            form.set("job", job.id);
                            form.set("complete", "false");
                            void markStop({}, form).then((r) => {
                              if (r.error) showBanner({ tone: "error", message: r.error });
                            });
                          },
                        },
                      })
                    }
                    buttonClassName={cx(BUTTON, "bg-white/18 text-white hover:bg-white/28")}
                  />
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </div>

      {/* One segment per stop: each goes to its stop. The bar keeps its thin look; each
          segment's tap area is 44 pt tall. */}
      <div
        className="-mb-3 mt-2 flex gap-1"
        role="group"
        aria-label={heroSegmentsSpoken(hero)}
        data-testid="hero-progress"
        data-hero-segments
      >
        {hero.segments.map((seg, i) => (
          <button
            key={stops[i]?.id ?? i}
            type="button"
            aria-label={`Stop ${i + 1} of ${stops.length}, ${stops[i]?.customer ?? ""}`}
            aria-current={i === at ? "step" : undefined}
            onClick={() => show(i)}
            className="group flex h-11 flex-1 items-center"
          >
            <span
              aria-hidden="true"
              className={cx(
                "h-1 w-full rounded-full transition-colors",
                seg === "done" ? "bg-white" : seg === "current" ? "bg-white/70" : "bg-white/28",
                i === at && hero.browsing && "outline-2 outline-offset-2 outline-white/70",
              )}
            />
          </button>
        ))}
      </div>
    </section>
  );
}

/** A detail line: its symbol in a fixed column so the text lines up. */
function Detail({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <span aria-hidden="true" className="mt-[0.2rem] flex w-5 shrink-0 justify-center">
        {icon}
      </span>
      <div className="min-w-0">{children}</div>
    </li>
  );
}

/**
 * Message, Call and Directions as round buttons, each named for screen readers. `message`
 * replaces the blank text (On My Way, filled in, before the tech leaves).
 */
function Contact({ job, message }: { job: HeroJob; message?: React.ReactNode }) {
  return (
    <span className="flex shrink-0 gap-2">
      {message ??
        (job.phone && job.textHref ? (
          <a href={job.textHref} aria-label={`Text ${job.customer}`} className={ROUND}>
            <MessageIcon />
          </a>
        ) : null)}
      {job.phone ? (
        <a href={`tel:${job.phone}`} aria-label={`Call ${job.customer}`} className={ROUND}>
          <PhoneIcon />
        </a>
      ) : null}
      {job.address ? (
        <a
          href={directionsHref({ address: job.address, location: job.location })}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Directions to ${job.customer}`}
          className={ROUND}
        >
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className="size-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 11l18-8-8 18-2-8z" />
          </svg>
        </a>
      ) : null}
    </span>
  );
}

function Primary({
  action,
  job,
  inline = false,
}: {
  action: "start_job" | "open_checklist";
  job: HeroJob;
  /** Beside the round buttons: their 44 pt height, so the row lines up. */
  inline?: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const button = cx(BUTTON, ON_WATER, inline && "min-h-11");
  if (action === "open_checklist")
    return (
      <Link href={`/jobs/${job.id}#checklist`} className={button}>
        {HERO_ACTION_LABELS.open_checklist}
      </Link>
    );
  return (
    <span className="block">
      <button
        type="button"
        disabled={pending}
        className={button}
        onClick={() =>
          start(async () => {
            const form = new FormData();
            form.set("job", job.id);
            form.set("to", "in_progress");
            const r = await changeJobStatus({}, form);
            setError(r.error ?? null);
          })
        }
      >
        {pending ? "Starting…" : HERO_ACTION_LABELS.start_job}
      </button>
      {error ? (
        <span role="alert" className="mt-1 block text-[0.9375rem] font-semibold">
          {error}
        </span>
      ) : null}
    </span>
  );
}
