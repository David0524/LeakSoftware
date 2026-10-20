"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  HERO_ACTION_LABELS,
  NOT_ON_MAP,
  directionsHref,
  heroActions,
  heroDrive,
  heroHeadline,
  heroSegmentsSpoken,
  type LatLng,
  type TodayHero,
} from "@leakbook/core";
import { changeJobStatus } from "@/app/actions/inspection";
import { KeyIcon, MessageIcon, NoteIcon, PhoneIcon, PinIcon, WarningIcon } from "./icons";
import { OnMyWay } from "./on-my-way";
import { TodayComplete } from "./today-complete";
import type { SendPrompt } from "./job-work";
import { cx } from "./ui";

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

/**
 * Today's card for the stop the tech is on (owner, 2026-10-20; docs/plans/today-hero.md): the
 * Live Activity in the app, in its water blue. The name opens the job; the address opens
 * directions; the main button is the moment's (Start, Open Checklist). Owners and
 * admins looking at a tech's day get Call and Directions only.
 */
export function TodayHeroCard({
  hero,
  job,
  next,
  mine,
  onMyWay,
}: {
  hero: TodayHero;
  job: HeroJob | null;
  /** The next stop, for On My Way from a done card. */
  next: HeroJob | null;
  mine: boolean;
  /** What On My Way needs besides the job (the shop, the tech, how texts go out). */
  onMyWay: Omit<
    React.ComponentProps<typeof OnMyWay>,
    "phone" | "customer" | "driveMin" | "jobId" | "buttonClassName"
  >;
}) {
  const c = hero.content;
  const actions = heroActions(hero.moment, mine);
  const target = hero.moment === "done" ? next : job;
  const drive = job ? heroDrive(hero.moment, job.driveMin) : null;
  // "At the pool · Stop 2 of 3"; under the name, "Leak detection · 14 min drive".
  const top =
    hero.moment === "day_done"
      ? heroHeadline(hero)
      : `${heroHeadline(hero)} · Stop ${hero.stop} of ${hero.stops}`;
  const kind = job ? [job.typeLabel, drive].filter(Boolean).join(" · ") : "";
  // Message, Call and Directions (and On My Way when it's the tech's to send) for the stop.
  const contact =
    target && hero.moment !== "done" ? (
      <Contact
        job={target}
        onMyWay={
          actions.onMyWay ? (
            <OnMyWay
              {...onMyWay}
              icon
              phone={target.phone}
              customer={target.customer}
              driveMin={target.driveMin ?? 0}
              jobId={target.id}
              buttonClassName={ROUND}
            />
          ) : null
        }
      />
    ) : null;
  const startRow = actions.primary === "start_job" && !!target && !actions.complete;
  return (
    <section
      aria-label={c.spoken}
      className="mb-6 rounded-[22px] bg-water p-5 text-white sm:p-6"
      data-testid="today-hero"
      data-moment={hero.moment}
    >
      {/* The top: the moment and the stop count, the name (the card is about them), the type,
          and the figure; one column at the largest text sizes. */}
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
              <Primary action="start_job" job={target!} inline />
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
          {(actions.primary && target) || (actions.complete && job) ? (
            <div className="mt-4 flex gap-2.5 [&>*]:min-w-0 [&>*]:flex-1">
              {actions.primary && target ? (
                <div>
                  <Primary action={actions.primary} job={target} />
                </div>
              ) : null}
              {actions.complete && job ? (
                <TodayComplete
                  jobId={job.id}
                  customer={job.customer}
                  done={job.done}
                  undo={job.undo}
                  prompt={job.prompt}
                  buttonClassName={cx(BUTTON, "bg-white/18 text-white hover:bg-white/28")}
                />
              ) : null}
            </div>
          ) : null}
        </>
      )}

      <div
        className="mt-5 flex gap-1"
        role="img"
        aria-label={heroSegmentsSpoken(hero)}
        data-testid="hero-progress"
      >
        {hero.segments.map((s, i) => (
          <span
            key={i}
            className={cx(
              "h-1.5 flex-1 rounded-full",
              s === "done" ? "bg-white" : s === "current" ? "bg-white/70" : "bg-white/28",
            )}
          />
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
      <span className="min-w-0">{children}</span>
    </li>
  );
}

/** On My Way (when it's the tech's to send), Message, Call and Directions as round buttons, each named for screen readers. */
function Contact({ job, onMyWay }: { job: HeroJob; onMyWay?: React.ReactNode }) {
  return (
    <span className="flex shrink-0 gap-2">
      {onMyWay}
      {job.phone && job.textHref ? (
        <a href={job.textHref} aria-label={`Text ${job.customer}`} className={ROUND}>
          <MessageIcon />
        </a>
      ) : null}
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
