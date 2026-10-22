import Link from "next/link";
import type { ReactNode } from "react";
import { STANDING_LABELS, type Standing } from "@leakbook/core";
import { cx, Empty, PageHeader } from "@/components/ui";

// Pieces of the Admin portal (desktop only): stat cards, simple bar charts, sortable tables,
// and dates. Charts are one series in the chart token, like the owner dashboard: hover shows
// a bar's value, and a table view (Show Numbers) has every value.

const TZ = "America/Phoenix";
const dateFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: TZ,
});
const timeFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: TZ,
});

export function fmtDate(iso: string | null | undefined): string {
  return iso ? dateFmt.format(new Date(iso)) : "—";
}

export function fmtTime(iso: string | null | undefined): string {
  return iso ? timeFmt.format(new Date(iso)) : "—";
}

/** "3 days ago", "in 5 days", "today". */
export function relDays(iso: string | null | undefined, now = new Date().getTime()): string {
  if (!iso) return "Never";
  const days = Math.round((Date.parse(iso) - now) / 86_400_000);
  if (days === 0) return "Today";
  if (days === -1) return "Yesterday";
  if (days === 1) return "Tomorrow";
  return days < 0 ? `${-days} days ago` : `In ${days} days`;
}

export function fmtBytes(n: number): string {
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

const STANDING_STYLE: Record<Standing, string> = {
  trial: "bg-status-info/12 text-status-info",
  trial_ended: "bg-status-warning/14 text-status-warning",
  paying: "bg-status-pass/12 text-status-pass",
  past_due: "bg-status-fail/12 text-status-fail",
  canceled: "bg-text/[0.07] text-text-muted",
  demo: "bg-link/10 text-link",
};

/** A shop's standing as a pill (the word carries it, not only the color). */
export function StandingPill({ standing }: { standing: Standing }) {
  return <Pill className={STANDING_STYLE[standing]}>{STANDING_LABELS[standing]}</Pill>;
}

export function Pill({ className, children }: { className: string; children: ReactNode }) {
  return (
    <span
      className={cx(
        "inline-flex rounded-full px-2.5 py-0.5 text-[0.8125rem] font-semibold whitespace-nowrap",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** A number with what it is and the period it covers. Links to the list behind it. */
export function Stat({
  label,
  value,
  detail,
  href,
  tone,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  href?: string;
  tone?: "warning" | "fail";
}) {
  const body = (
    <>
      <span className="block text-[0.9375rem] text-text-muted">{label}</span>
      <span
        className={cx(
          "mt-1 block font-display text-3xl font-extrabold tabular-nums",
          tone === "warning" && "text-status-warning",
          tone === "fail" && "text-status-fail",
        )}
      >
        {value}
      </span>
      {detail ? (
        <span className="mt-1 block text-[0.8125rem] text-text-muted">{detail}</span>
      ) : null}
    </>
  );
  return href ? (
    <Link href={href} className="card block p-5 transition-colors hover:bg-text/[0.03]">
      {body}
    </Link>
  ) : (
    <div className="card p-5">{body}</div>
  );
}

export function Panel({
  title,
  subtitle,
  actions,
  children,
  className,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const id = `panel-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <section aria-labelledby={id} className={cx("card p-5", className)}>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 id={id} className="font-display text-xl font-bold">
            {title}
          </h2>
          {subtitle ? <p className="text-[0.9375rem] text-text-muted">{subtitle}</p> : null}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

/**
 * One series of bars (weeks or months). The last bar is labeled; hover shows any bar's value;
 * Show Numbers opens the same values as a table.
 */
export function BarChart({
  label,
  bars,
}: {
  label: string;
  bars: { key: string; label: string; short: string; value: number; display: string }[];
}) {
  const max = Math.max(1, ...bars.map((b) => b.value));
  const last = bars[bars.length - 1];
  return (
    <figure>
      <ol className="flex h-40 items-end gap-0.5 border-b border-border" aria-hidden="true">
        {bars.map((b) => (
          <li key={b.key} className="group relative flex h-full flex-1 flex-col justify-end px-px">
            {b === last && b.value ? (
              <span className="mb-1 text-center text-[0.8125rem] font-semibold whitespace-nowrap tabular-nums">
                {b.display}
              </span>
            ) : null}
            <span
              className="mx-auto w-full max-w-10 rounded-t bg-chart transition-opacity group-hover:opacity-80"
              style={{ height: `${Math.max((b.value / max) * 100, b.value ? 2 : 0)}%` }}
            />
            <span className="pointer-events-none absolute -top-8 left-1/2 z-10 hidden -translate-x-1/2 rounded bg-text px-2 py-1 text-[0.8125rem] whitespace-nowrap text-bg group-hover:block">
              {b.label}: {b.display}
            </span>
          </li>
        ))}
      </ol>
      <ol
        className="mt-1 flex gap-0.5 text-center text-[0.75rem] text-text-muted"
        aria-hidden="true"
      >
        {bars.map((b, i) => (
          // About 8 labels, counted back from the last bar, so 31 days don't crowd.
          <li key={b.key} className="flex-1 overflow-visible whitespace-nowrap">
            {(bars.length - 1 - i) % Math.max(2, Math.ceil(bars.length / 8)) === 0 ? b.short : ""}
          </li>
        ))}
      </ol>
      <details className="mt-3 text-[0.9375rem]">
        <summary className="min-h-11 cursor-pointer content-center text-link">Show Numbers</summary>
        <table className="mt-2 w-full">
          <caption className="sr-only">{label}</caption>
          <tbody>
            {bars.map((b) => (
              <tr key={b.key} className="border-t border-border/60">
                <th scope="row" className="py-1 text-left font-normal text-text-muted">
                  {b.label}
                </th>
                <td className="py-1 text-right tabular-nums">{b.display}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

const weekFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});
const monthFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

export function weekBar(week: string, value: number, display = String(value)) {
  const d = new Date(week);
  return {
    key: week,
    label: `Week of ${weekFmt.format(d)}`,
    short: weekFmt.format(d),
    value,
    display,
  };
}

export function monthBar(month: string, value: number, display: string) {
  const d = new Date(month);
  return {
    key: month,
    label: monthFmt.format(d),
    short: monthFmt.format(d).split(" ")[0]!,
    value,
    display,
  };
}

/**
 * A table column header that sorts by its column (click again to reverse), as desktop tables
 * do (lists-and-tables.md › Desktop). Plain links, so sorting works without scripts.
 */
export function SortHeader({
  label,
  column,
  sort,
  desc,
  href,
  align = "left",
}: {
  label: string;
  column: string;
  sort: string;
  desc: boolean;
  href: (column: string, desc: boolean) => string;
  align?: "left" | "right";
}) {
  const active = sort === column;
  return (
    <th
      scope="col"
      aria-sort={active ? (desc ? "descending" : "ascending") : undefined}
      className={cx("px-3 py-2 font-semibold whitespace-nowrap", align === "right" && "text-right")}
    >
      <Link
        href={href(column, active ? !desc : column !== "name")}
        className={cx(
          "inline-flex min-h-11 items-center gap-1 hover:text-link",
          active ? "text-text" : "text-text-muted",
        )}
      >
        {label}
        <span aria-hidden="true" className={cx("text-[0.75rem]", !active && "invisible")}>
          {desc ? "▼" : "▲"}
        </span>
      </Link>
    </th>
  );
}

/** A table's own classes: alternate rows tinted, hairlines, rows that highlight on hover. */
export const TABLE =
  "w-full border-collapse text-left text-[0.9375rem] [&_tbody_tr:nth-child(even)]:bg-text/[0.025] [&_tbody_tr]:border-t [&_tbody_tr]:border-border/60 [&_tbody_tr:hover]:bg-link/[0.05] [&_td]:px-3 [&_td]:py-2.5";

/** A search field over a list (a plain GET form; Return searches). */
export function SearchForm({
  action,
  value,
  placeholder,
  hidden = {},
}: {
  action: string;
  value: string;
  placeholder: string;
  hidden?: Record<string, string>;
}) {
  return (
    <form action={action} role="search" className="w-full max-w-md">
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <label className="sr-only" htmlFor={`search-${action}`}>
        {placeholder}
      </label>
      <input
        id={`search-${action}`}
        type="search"
        name="q"
        defaultValue={value}
        placeholder={placeholder}
        className="min-h-11 w-full rounded-full bg-fill px-4 placeholder:text-placeholder focus-visible:outline-3 focus-visible:outline-focus"
      />
    </form>
  );
}

/** What a portal page shows before the staff person has passed two-step. */
export function TwoStepNeeded({ title }: { title: string }) {
  return (
    <>
      <PageHeader title={title} />
      <Empty>
        The admin portal shows shops’ and people’s details, so it needs two-step sign-in. Turn it on
        in{" "}
        <Link href="/more/two-step" className="text-link underline">
          More › Two-Step Sign-In
        </Link>
        , then sign in again.
      </Empty>
    </>
  );
}

/** Label: value rows in a card (a shop's or person's details). */
export function Facts({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[minmax(9rem,max-content)_1fr] gap-x-6 gap-y-2 text-[0.9375rem]">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-text-muted">{k}</dt>
          <dd className="min-w-0 break-words">{v ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Support sessions, newest first (a shop's history, or every shop's on the Support page). */
export function SupportTable({
  rows,
  showShop = false,
}: {
  rows: {
    id: string;
    staff_email: string;
    reason: string;
    access: "view" | "edit";
    started_at: string;
    ends_at: string;
    ended_at: string | null;
    company_ref?: string;
    company_name?: string | null;
  }[];
  showShop?: boolean;
}) {
  const now = new Date().getTime();
  return (
    <table className={TABLE}>
      <thead className="border-b border-border text-text-muted">
        <tr>
          {showShop ? (
            <th scope="col" className="px-3 py-2 font-semibold">
              Shop
            </th>
          ) : null}
          <th scope="col" className="px-3 py-2 font-semibold">
            Staff
          </th>
          <th scope="col" className="px-3 py-2 font-semibold">
            Reason
          </th>
          <th scope="col" className="px-3 py-2 font-semibold">
            Access
          </th>
          <th scope="col" className="px-3 py-2 font-semibold">
            Started
          </th>
          <th scope="col" className="px-3 py-2 font-semibold">
            Ended
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const live = !r.ended_at && Date.parse(r.ends_at) > now;
          return (
            <tr key={r.id}>
              {showShop ? (
                <td>
                  {r.company_ref ? (
                    <Link
                      href={`/admin/shops/${r.company_ref}`}
                      className="text-link hover:underline"
                    >
                      {r.company_name ?? "Shop"}
                    </Link>
                  ) : (
                    r.company_name
                  )}
                </td>
              ) : null}
              <td>{r.staff_email}</td>
              <td className="max-w-md">{r.reason}</td>
              <td className="whitespace-nowrap">
                {r.access === "view" ? "View Only" : "Can Make Changes"}
              </td>
              <td className="whitespace-nowrap">{fmtTime(r.started_at)}</td>
              <td className="whitespace-nowrap">
                {live ? (
                  <Pill className="bg-status-pass/12 text-status-pass">
                    Open until {fmtTime(r.ends_at)}
                  </Pill>
                ) : (
                  fmtTime(r.ended_at ?? r.ends_at)
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
