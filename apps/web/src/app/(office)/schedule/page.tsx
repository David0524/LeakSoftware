import type { Metadata } from "next";
import Link from "next/link";
import {
  addDays,
  formatDay,
  formatTime,
  groupSchedule,
  isDateString,
  localDate,
  scheduleBounds,
  scheduleDays,
  type ScheduleView,
} from "@leakbook/core";
import { PageHeader, StatusBadge, buttonClass, cx } from "@/components/ui";
import { getOffice } from "@/lib/auth";
import { getTeam, jobsBetween, type JobRow } from "@/lib/data";

export const metadata: Metadata = { title: "Schedule · Tidemark" };

export default async function SchedulePage({ searchParams }: PageProps<"/schedule">) {
  const office = await getOffice();
  const params = await searchParams;
  const tz = office.company.timezone;
  const view: ScheduleView = params.view === "day" ? "day" : "week";
  const today = localDate(new Date(), tz);
  const date = isDateString(params.date) ? params.date : today;
  const days = scheduleDays(view, date);
  const { from, to } = scheduleBounds(days, tz);
  const [jobs, team] = await Promise.all([jobsBetween(office, from, to), getTeam(office)]);
  const grouped = groupSchedule(jobs, tz);

  // Every active tech gets a row, plus anyone with work this period and "Unassigned".
  const rows: { id: string | null; name: string }[] = [
    ...team
      .filter((t) => t.status === "active" || grouped.has(t.user_id))
      .map((t) => ({ id: t.user_id as string | null, name: t.name })),
  ];
  if (grouped.has(null)) rows.push({ id: null, name: "Unassigned" });

  const step = view === "day" ? 1 : 7;
  const href = (d: string, v: ScheduleView = view) => `/schedule?view=${v}&date=${d}`;
  const title =
    view === "day"
      ? formatDay(date, "long")
      : `${formatDay(days[0]!)} – ${formatDay(days[days.length - 1]!)}`;

  return (
    <>
      <PageHeader title="Schedule" subtitle={title} />
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <nav
          aria-label="View"
          className="inline-flex rounded-md border border-control-border bg-surface p-1"
        >
          {(["day", "week"] as const).map((v) => (
            <Link
              key={v}
              href={href(date, v)}
              aria-current={v === view ? "page" : undefined}
              className={cx(
                "min-h-11 min-w-20 content-center rounded px-3 text-center font-medium",
                v === view && "bg-text text-bg",
              )}
            >
              {v === "day" ? "Day" : "Week"}
            </Link>
          ))}
        </nav>
        <div className="flex gap-2">
          <Link
            href={href(addDays(date, -step))}
            className={buttonClass("secondary")}
            aria-label={`Previous ${view}`}
          >
            ← Previous
          </Link>
          <Link href={href(today)} className={buttonClass("secondary")}>
            Today
          </Link>
          <Link
            href={href(addDays(date, step))}
            className={buttonClass("secondary")}
            aria-label={`Next ${view}`}
          >
            Next →
          </Link>
        </div>
      </div>

      {view === "week" ? (
        <>
          {/* Phones: the week as an agenda, day by day. */}
          <div className="space-y-5 sm:hidden">
            {days.map((d) => {
              const list = jobs.filter(
                (j) => j.scheduled_start && localDate(new Date(j.scheduled_start), tz) === d,
              );
              return (
                <section key={d} aria-label={formatDay(d, "long")}>
                  <h2
                    className={cx(
                      "mb-2 font-display text-lg font-bold",
                      d === today && "text-link",
                    )}
                  >
                    <Link href={href(d, "day")} className="underline-offset-4 hover:underline">
                      {formatDay(d, "long")}
                      {d === today ? " · Today" : ""}
                    </Link>
                  </h2>
                  {list.length === 0 ? (
                    <p className="text-[15px] text-text-muted">Nothing scheduled.</p>
                  ) : (
                    <ul className="space-y-2">
                      {list.map((j) => (
                        <li key={j.id}>
                          <JobChip job={j} tz={tz} tech={j.techName ?? "Unassigned"} />
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              );
            })}
          </div>
          <div className="hidden overflow-x-auto rounded-lg border border-border bg-surface sm:block">
            <table className="w-full min-w-[760px] table-fixed text-left">
              <thead className="border-b border-border">
                <tr>
                  <th scope="col" className="w-32 px-3 py-2 font-medium text-text-muted">
                    Tech
                  </th>
                  {days.map((d) => (
                    <th
                      key={d}
                      scope="col"
                      className={cx(
                        "px-2 py-2 font-medium",
                        d === today ? "text-link" : "text-text-muted",
                      )}
                    >
                      <Link
                        href={href(d, "day")}
                        aria-current={d === today ? "date" : undefined}
                        className="underline-offset-4 hover:underline"
                      >
                        {formatDay(d)}
                        {d === today ? " · Today" : ""}
                      </Link>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id ?? "none"}
                    className="border-b border-border align-top last:border-0"
                  >
                    <th scope="row" className="px-3 py-2 font-semibold">
                      {r.name}
                    </th>
                    {days.map((d) => (
                      <td key={d} className={cx("px-2 py-2", d === today && "bg-bg")}>
                        <ul className="space-y-2">
                          {(grouped.get(r.id)?.get(d) ?? []).map((j) => (
                            <li key={j.id}>
                              <JobChip job={j} tz={tz} compact />
                            </li>
                          ))}
                        </ul>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((r) => {
            const list = grouped.get(r.id)?.get(date) ?? [];
            return (
              <section
                key={r.id ?? "none"}
                className="rounded-lg border border-border bg-surface p-4"
              >
                <h2 className="font-display text-xl font-bold">{r.name}</h2>
                {list.length === 0 ? (
                  <p className="mt-2 text-text-muted">Nothing scheduled.</p>
                ) : (
                  <ul className="mt-3 space-y-3">
                    {list.map((j) => (
                      <li key={j.id}>
                        <JobChip job={j} tz={tz} />
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}
      {jobs.length === 0 ? (
        <p className="mt-4 text-text-muted">
          No jobs scheduled {view === "day" ? "this day" : "this week"}.
        </p>
      ) : null}
    </>
  );
}

function JobChip({
  job,
  tz,
  compact = false,
  tech,
}: {
  job: JobRow;
  tz: string;
  compact?: boolean;
  /** Shown in the phone agenda, where jobs are not grouped by tech. */
  tech?: string;
}) {
  return (
    <Link
      href={`/jobs/${job.id}`}
      className="block rounded-md border border-border bg-surface p-2 hover:border-water"
    >
      <span className="block font-semibold whitespace-nowrap">
        {formatTime(job.scheduled_start!, tz)} · {job.number ? `#${job.number}` : "New"}
      </span>
      <span className="block text-[15px]">
        {job.customer?.name ?? "Customer"}
        {tech ? <span className="text-text-muted"> · {tech}</span> : null}
      </span>
      {!compact && job.property ? (
        <span className="block text-[15px] text-text-muted">{job.property.address_line1}</span>
      ) : null}
      <span className="mt-1 block">
        <StatusBadge status={job.status} />
      </span>
    </Link>
  );
}
