import Link from "next/link";
import type { ReactNode } from "react";
import { NavBar } from "./nav-bar";
import { PageHeader, cx } from "./ui";

/**
 * A soft placeholder shape: no spinner, a highlight that sweeps across it (globals.css ›
 * .shimmer; none with Reduce Motion). Never wider than its column, so a fixed width in rem
 * can't push the page sideways at large text sizes.
 */
export function Bone({ className, onWater = false }: { className?: string; onWater?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        "shimmer block max-w-full",
        // Pills unless the caller gives a shape.
        !/(^|\s)rounded-/.test(className ?? "") && "rounded-full",
        onWater ? "bg-water/20" : "bg-text/[0.07]",
        className,
      )}
    />
  );
}

/**
 * Any office page while it loads (owner, 2026-10-22: "Skeleton screens, not spinners"): a
 * large title, then a grouped list of rows, the shape most pages have.
 */
export function PageSkeleton() {
  return (
    <div aria-busy="true">
      <p className="sr-only" role="status">
        Loading…
      </p>
      <div className="mb-4 sm:mb-6">
        <Bone className="h-10 w-48 rounded-xl" />
        <Bone className="mt-2 h-4 w-40" />
      </div>
      <div className="max-w-3xl space-y-6">
        <GroupBone rows={4} />
        <GroupBone rows={3} />
      </div>
    </div>
  );
}

/** One row of a grouped list: one or two lines, and a pill at the end when the rows have one. */
function RowBone({ i, pill = false, dot = false }: { i: number; pill?: boolean; dot?: boolean }) {
  // Widths vary row to row, as real names do.
  const w = ["w-2/5", "w-1/2", "w-1/3", "w-3/5", "w-2/5", "w-1/2"][i % 6];
  return (
    <li className="flex min-h-11 items-center gap-3 px-4 py-3">
      {dot ? <Bone className="size-2.5 shrink-0" /> : null}
      <span className="min-w-0 flex-1 space-y-2">
        <Bone className={cx("h-4", w)} />
        <Bone className={cx("h-3.5", i % 2 ? "w-3/4" : "w-2/3")} />
      </span>
      {pill ? <Bone className="h-6 w-20 shrink-0" /> : null}
    </li>
  );
}

/** A grouped list's shape: an optional section title, then its rows on one rounded block. */
export function GroupBone({
  rows,
  title = false,
  pill = false,
  dot = false,
  className,
}: {
  rows: number;
  title?: boolean;
  pill?: boolean;
  dot?: boolean;
  className?: string;
}) {
  return (
    <div className={className} aria-hidden="true">
      {title ? <Bone className="mb-2 ml-4 h-3 w-24" /> : null}
      <ul className="grouped">
        {Array.from({ length: rows }, (_, i) => (
          <RowBone key={i} i={i} pill={pill} dot={dot} />
        ))}
      </ul>
    </div>
  );
}

/** Pills in a row: filters, or a job's sections on phones. */
function PillsBone({ count, className }: { count: number; className?: string }) {
  return (
    <div className={cx("flex gap-2 overflow-hidden", className)} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <Bone key={i} className={cx("h-11 shrink-0", i === 0 ? "w-24" : "w-20")} />
      ))}
    </div>
  );
}

/**
 * A list page (Jobs, Customers): its real title, the filters and search when it has them, then
 * rows as the list draws them.
 */
export function ListSkeleton({
  title,
  filters = 0,
  search = false,
  pill = false,
}: {
  title: string;
  filters?: number;
  search?: boolean;
  /** The rows end in a status pill (Jobs). */
  pill?: boolean;
}) {
  return (
    <Skeleton title={title}>
      {filters ? <PillsBone count={filters} className="mb-5" /> : null}
      {search ? (
        <div className="mb-5 flex gap-3" aria-hidden="true">
          <Bone className="h-11 flex-1 rounded-[10px] max-md:hidden" />
          <Bone className="h-11 w-24" />
        </div>
      ) : null}
      <GroupBone rows={7} pill={pill} className="max-w-3xl" />
    </Skeleton>
  );
}

/**
 * A pushed page (a job, a customer) whose title is still on its way: Back, a title-sized
 * shape, then the page's groups.
 */
function DetailSkeleton({
  back,
  label,
  children,
}: {
  back: { href: string; label: string };
  label: string;
  children: ReactNode;
}) {
  return (
    <div aria-busy="true">
      <NavBar title="" titleId="title-loading" back={back} />
      <p className="mb-2 max-sm:hidden">
        <Link
          href={back.href}
          className="inline-flex min-h-11 items-center gap-1 text-link underline-offset-4 hover:underline"
        >
          ← {back.label}
        </Link>
      </p>
      <p className="sr-only" role="status">
        Loading {label}…
      </p>
      <div id="title-loading" className="mb-4 sm:mb-6" aria-hidden="true">
        <Bone className="h-10 w-56 rounded-xl" />
        <div className="mt-2 flex gap-3">
          <Bone className="h-6 w-20" />
          <Bone className="h-6 w-24" />
          <Bone className="h-6 w-32" />
        </div>
      </div>
      {children}
    </div>
  );
}

/** A job: Back to Jobs, the sections on phones, then Details' groups (two columns when wide). */
export function JobSkeleton() {
  return (
    <DetailSkeleton back={{ href: "/jobs", label: "Jobs" }} label="the job">
      <PillsBone count={5} className="mb-4 sm:hidden" />
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <GroupBone rows={3} title />
          <GroupBone rows={2} title />
        </div>
        <div className="space-y-6">
          <GroupBone rows={4} title />
        </div>
      </div>
    </DetailSkeleton>
  );
}

/** A customer: Back to Customers, then Contact, the pool, and their jobs (three columns wide). */
export function CustomerSkeleton() {
  return (
    <DetailSkeleton back={{ href: "/customers", label: "Customers" }} label="the customer">
      <div className="grid items-start gap-8 lg:grid-cols-3">
        <GroupBone rows={3} title />
        <GroupBone rows={3} title />
        <GroupBone rows={3} title pill />
      </div>
    </DetailSkeleton>
  );
}

/** Messages: the conversations (an unread dot, the name, the last line), the thread beside. */
export function MessagesSkeleton() {
  return (
    <Skeleton title="Messages">
      <div className="grid max-w-5xl gap-6 md:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <GroupBone rows={7} dot />
        <div className="card space-y-4 p-5 max-md:hidden" aria-hidden="true">
          <Bone className="h-10 w-3/5 rounded-2xl" />
          <Bone className="ml-auto h-10 w-1/2 rounded-2xl" />
          <Bone className="h-16 w-2/3 rounded-2xl" />
          <Bone className="ml-auto h-10 w-2/5 rounded-2xl" />
        </div>
      </div>
    </Skeleton>
  );
}

/** A settings section: its real title, then a grouped list. */
export function SettingsSkeleton({ title }: { title: string }) {
  return (
    <Skeleton title={title}>
      <div className="max-w-2xl space-y-6">
        <GroupBone rows={5} />
        <GroupBone rows={2} />
      </div>
    </Skeleton>
  );
}

/** Settings before it knows who's looking: the sections' sidebar when wide, and a section. */
export function SettingsShellSkeleton() {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-8 md:grid-cols-[232px_minmax(0,1fr)]">
      <div className="space-y-3 max-md:hidden" aria-hidden="true">
        {Array.from({ length: 9 }, (_, i) => (
          <Bone key={i} className={cx("h-5", i % 3 === 0 ? "w-32" : "w-40")} />
        ))}
      </div>
      <PageSkeleton />
    </div>
  );
}

/**
 * A screen that's still loading, drawn as it will look (loading.md › show something as soon as
 * possible): the real title, then placeholder cards where the content goes, so nothing jumps
 * when it arrives.
 */
function Skeleton({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div aria-busy="true">
      <PageHeader title={title} subtitle={<Bone className="mt-1.5 h-4 w-44" />} />
      <p className="sr-only" role="status">
        Loading {title}…
      </p>
      {children}
    </div>
  );
}

/** A stop: its round number, two lines, and a pill, as the cards are. */
function StopBone({ wide = false }: { wide?: boolean }) {
  return (
    <div className="card flex items-start gap-3 p-3">
      <Bone className="size-8 shrink-0" />
      <div className="min-w-0 flex-1 space-y-2 py-0.5">
        <Bone className="h-4 w-20" />
        <Bone className={cx("h-4", wide ? "w-3/4" : "w-1/2")} />
        <Bone className="h-5 w-28" />
      </div>
      <Bone className="mt-1.5 size-8 shrink-0" />
    </div>
  );
}

/** Today: the summary line, the stop's card in its water blue, then the stops. */
export function TodaySkeleton() {
  return (
    <Skeleton title="Today">
      {/* Computers: the day on the left, Today's Map on the right (owner, 2026-10-21). */}
      <div className="max-w-2xl lg:grid lg:max-w-none lg:grid-cols-2 lg:items-start lg:gap-8">
        <div className="min-w-0">
          <Bone className="mb-4 h-4 w-60" />
          <div className="mb-6 rounded-[22px] bg-water/15 p-5 sm:p-6" aria-hidden="true">
            <Bone className="h-4 w-40" onWater />
            <Bone className="mt-3 h-7 w-56" onWater />
            <Bone className="mt-2 h-4 w-36" onWater />
            <Bone className="mt-5 h-4 w-64" onWater />
            <div className="mt-4 flex gap-2">
              <Bone className="h-11 flex-1" onWater />
              <Bone className="size-11" onWater />
              <Bone className="size-11" onWater />
              <Bone className="size-11" onWater />
            </div>
          </div>
          <div className="space-y-3">
            <StopBone wide />
            <StopBone />
            <StopBone wide />
          </div>
        </div>
        <div className="hidden lg:block">
          <Bone className="aspect-[2/1] rounded-[1.25rem]" />
        </div>
      </div>
    </Skeleton>
  );
}

/** Schedule: the date row, the week, the map, then a day of stops (columns when wider). */
export function ScheduleSkeleton() {
  return (
    <Skeleton title="Schedule">
      {/* One row: previous, the date, next, and Day / Week / Month at the far right. */}
      <div className="mb-3 flex items-center gap-2">
        <Bone className="size-11" />
        <Bone className="h-11 w-11 sm:w-40" />
        <Bone className="size-11" />
        <Bone className="ml-auto h-10 w-44 sm:w-56" />
      </div>
      <div className="mb-4 flex gap-1 sm:hidden">
        {Array.from({ length: 7 }, (_, i) => (
          <Bone key={i} className="h-14 flex-1 rounded-2xl" />
        ))}
      </div>
      <div className="mb-4 flex gap-2 sm:hidden">
        <Bone className="h-11 w-14" />
        <Bone className="h-11 w-32" />
        <Bone className="h-11 w-32" />
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 md:grid-cols-[repeat(2,minmax(0,1fr))] xl:grid-cols-[repeat(3,minmax(0,1fr))]">
        {[0, 1, 2].map((c) => (
          <div
            key={c}
            className={cx(
              "space-y-2 rounded-[22px] sm:bg-text/[0.03] sm:p-3",
              c > 0 && "max-sm:hidden",
              c > 1 && "max-xl:hidden",
            )}
          >
            <Bone className="h-6 w-32" />
            <Bone className="h-4 w-56" />
            <div className="grid grid-cols-2 gap-2 pt-1">
              <Bone className="h-11" />
              <Bone className="h-11" />
            </div>
            <Bone className="aspect-[2/1] h-auto w-full rounded-[1.25rem]" />
            <div className="space-y-2 pt-1">
              <StopBone wide />
              <StopBone />
              <StopBone />
            </div>
          </div>
        ))}
      </div>
    </Skeleton>
  );
}

/**
 * A customer's quote or invoice while it loads: the shop's header, the line items and the
 * total on one card, then the pay button's place.
 */
export function DocSkeleton({ label }: { label: string }) {
  return (
    <div aria-busy="true" className="mx-auto w-full max-w-2xl px-4 py-6 sm:py-10">
      <p className="sr-only" role="status">
        Loading {label}…
      </p>
      <div className="card space-y-4 p-5 sm:p-8" aria-hidden="true">
        <div className="flex items-center gap-3">
          <Bone className="size-12 shrink-0 rounded-xl" />
          <span className="flex-1 space-y-2">
            <Bone className="h-5 w-1/2" />
            <Bone className="h-3.5 w-1/3" />
          </span>
        </div>
        <Bone className="h-7 w-2/3 rounded-lg" />
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <Bone className={cx("h-4 flex-1", i % 2 ? "max-w-[55%]" : "max-w-[70%]")} />
            <Bone className="ml-auto h-4 w-16" />
          </div>
        ))}
        <div className="flex justify-end pt-2">
          <Bone className="h-6 w-28" />
        </div>
      </div>
      <Bone className="mt-5 h-12 w-full" />
    </div>
  );
}

/** A one-card page (email preferences): a title, two lines, and its button. */
export function CardSkeleton() {
  return (
    <div aria-busy="true" className="mx-auto max-w-lg p-4 sm:p-10">
      <p className="sr-only" role="status">
        Loading…
      </p>
      <div className="card space-y-4 p-5" aria-hidden="true">
        <Bone className="h-7 w-4/5 rounded-lg" />
        <Bone className="h-4 w-full" />
        <Bone className="h-4 w-3/4" />
        <Bone className="h-11 w-48" />
      </div>
    </div>
  );
}
