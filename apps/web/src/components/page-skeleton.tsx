import type { ReactNode } from "react";
import { PageHeader, cx } from "./ui";

/**
 * A soft placeholder shape: no spinner, a slow pulse (none with Reduce Motion). Never wider
 * than its column, so a fixed width in rem can't push the page sideways at large text sizes.
 */
export function Bone({ className, onWater = false }: { className?: string; onWater?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        "block max-w-full animate-pulse motion-reduce:animate-none",
        // Pills unless the caller gives a shape.
        !/(^|\s)rounded-/.test(className ?? "") && "rounded-full",
        onWater ? "bg-water/20" : "bg-text/[0.07]",
        className,
      )}
    />
  );
}

export function PageSkeleton() {
  return (
    <div aria-label="Loading" aria-busy="true">
      <div className="h-9 w-48 max-w-full animate-pulse motion-reduce:animate-none rounded-md bg-surface" />
      <div className="mt-6 h-64 animate-pulse motion-reduce:animate-none rounded-lg bg-surface" />
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
