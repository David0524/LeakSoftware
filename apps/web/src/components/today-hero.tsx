"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import {
  HERO_ACTION_LABELS,
  NOT_ON_MAP,
  directionsHref,
  heroActions,
  heroDrive,
  heroSegmentsSpoken,
  heroSubtitle,
  type LatLng,
  type TodayHero,
} from "@leakbook/core";
import { changeJobStatus } from "@/app/actions/inspection";
import { KeyIcon, PhoneIcon } from "./icons";
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
  driveMin: number | null;
  done: boolean;
  undo: "Reopen Visit" | "Mark Not Complete" | null;
  /** Asked before completing a visit whose report goes out by itself. */
  prompt: SendPrompt;
}

const ON_WATER = "bg-white text-water hover:bg-white/90";
const ROUND =
  "inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-white/18 text-white transition-colors hover:bg-white/28";

/**
 * Today's card for the stop the tech is on (owner, 2026-10-20; docs/plans/today-hero.md): the
 * Live Activity in the app, in its water blue. The name opens the job; the address opens
 * directions; the main button is the moment's (On My Way, Start Job, Open Checklist). Owners and
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
  const subtitle = job ? heroSubtitle(job.typeLabel, hero) : "";
  return (
    <section
      aria-label={c.spoken}
      className="mb-6 rounded-[22px] bg-water p-5 text-white sm:p-6"
      data-testid="today-hero"
      data-moment={hero.moment}
    >
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-[0.9375rem] font-semibold text-white/85">{c.headline}</p>
          {job ? (
            <Link
              href={`/jobs/${job.id}`}
              className="mt-0.5 block font-display text-[1.75rem] leading-tight font-extrabold underline-offset-4 hover:underline"
            >
              {job.customer}
            </Link>
          ) : null}
          {subtitle ? <p className="mt-0.5 text-[0.9375rem] text-white/85">{subtitle}</p> : null}
        </div>
        <div className="shrink-0 text-right">
          <p
            className={cx(
              "font-display leading-none font-extrabold tabular-nums",
              c.figure === "✓" ? "text-[2.5rem]" : "text-[2.25rem]",
            )}
          >
            {c.figure}
          </p>
          {c.figureLabel ? (
            <p className="mt-1 text-[0.9375rem] text-white/85">{c.figureLabel}</p>
          ) : null}
        </div>
      </div>

      {job && hero.moment !== "done" ? (
        <div className="mt-3 space-y-1.5">
          {job.address ? (
            <p className="text-[1.0625rem]">
              <a
                href={directionsHref({ address: job.address, location: job.location })}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${job.address}, directions in Maps`}
                className="font-medium underline decoration-white/50 underline-offset-4"
              >
                {job.address}
              </a>
              {drive ? <span className="text-white/85"> · {drive}</span> : null}
            </p>
          ) : null}
          {job.notOnMap ? (
            <p className="text-[0.9375rem] font-semibold text-white">⚠ {NOT_ON_MAP.title}</p>
          ) : null}
          {c.access ? (
            <p className="flex items-start gap-2 text-[0.9375rem]">
              <KeyIcon className="mt-0.5 size-4 shrink-0 text-[#FFD67A]" />
              <span>{c.access}</span>
            </p>
          ) : null}
        </div>
      ) : null}
      {c.next ? <p className="mt-2 text-[0.9375rem] text-white/85">{c.next}</p> : null}

      {target || actions.complete ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {actions.primary && target ? (
            <Primary action={actions.primary} job={target} onMyWay={onMyWay} />
          ) : null}
          {actions.complete && job ? (
            <TodayComplete
              jobId={job.id}
              customer={job.customer}
              done={job.done}
              undo={job.undo}
              prompt={job.prompt}
              buttonClassName="inline-flex min-h-11 items-center justify-center rounded-full bg-white/18 px-5 text-[1.0625rem] font-semibold text-white transition-colors hover:bg-white/28 disabled:opacity-60"
            />
          ) : null}
          {target && hero.moment !== "done" ? (
            <span className="ml-auto flex gap-2">
              {target.phone ? (
                <a
                  href={`tel:${target.phone}`}
                  aria-label={`Call ${target.customer}`}
                  className={ROUND}
                >
                  <PhoneIcon />
                </a>
              ) : null}
              {target.address ? (
                <a
                  href={directionsHref({ address: target.address, location: target.location })}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Directions to ${target.customer}`}
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
          ) : null}
        </div>
      ) : null}

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

function Primary({
  action,
  job,
  onMyWay,
}: {
  action: "on_my_way" | "start_job" | "open_checklist";
  job: HeroJob;
  onMyWay: Omit<
    React.ComponentProps<typeof OnMyWay>,
    "phone" | "customer" | "driveMin" | "jobId" | "buttonClassName"
  >;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const button = cx(
    "inline-flex min-h-11 items-center justify-center rounded-full px-6 text-[1.0625rem] font-semibold transition-colors disabled:opacity-60",
    ON_WATER,
  );
  if (action === "on_my_way")
    return (
      <OnMyWay
        {...onMyWay}
        phone={job.phone}
        customer={job.customer}
        driveMin={job.driveMin ?? 0}
        jobId={job.id}
        buttonClassName={button}
      />
    );
  if (action === "open_checklist")
    return (
      <Link href={`/jobs/${job.id}#checklist`} className={button}>
        {HERO_ACTION_LABELS.open_checklist}
      </Link>
    );
  return (
    <span>
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
