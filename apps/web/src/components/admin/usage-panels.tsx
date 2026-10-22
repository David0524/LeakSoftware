import Link from "next/link";
import { featureLabel, formatScreenTime, screenLabel } from "@leakbook/core";
import type { Usage } from "@/server/staff";
import { cx, SEGMENT_TRACK, segmentClass } from "@/components/ui";
import { BarChart, fmtTime, Panel, relDays, Stat, TABLE } from "./kit";

// Usage in the Admin portal (owner, 2026-10-22: "track screen time, how users use the app").
// One set of panels for everyone, a shop, or a person.

export const USAGE_PERIODS = [7, 30, 90] as const;
export type UsagePeriod = (typeof USAGE_PERIODS)[number];

export function usagePeriod(raw: string | string[] | undefined): UsagePeriod {
  const n = Number(Array.isArray(raw) ? raw[0] : raw);
  return (USAGE_PERIODS as readonly number[]).includes(n) ? (n as UsagePeriod) : 30;
}

const PLATFORM: Record<string, string> = { web: "Website", ios: "iPhone", android: "Android" };
export const platformLabel = (p: string) => PLATFORM[p] ?? p;

/** 7 Days · 30 Days · 90 Days, as links (a segmented control). */
export function PeriodControl({ days, href }: { days: UsagePeriod; href: (d: number) => string }) {
  return (
    <nav aria-label="Period" className={SEGMENT_TRACK}>
      {USAGE_PERIODS.map((d) => (
        <Link
          key={d}
          href={href(d)}
          aria-current={d === days ? "page" : undefined}
          className={segmentClass(d === days)}
        >
          {d} Days
        </Link>
      ))}
    </nav>
  );
}

const dayFmt = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

/** The numbers and the two daily charts. `person`: one person's (no "people active"). */
export function UsageSummary({ u, person = false }: { u: Usage; person?: boolean }) {
  const perDay = u.person_days ? u.screen_ms / u.person_days : 0;
  const daily = u.by_day.map((d) => ({
    key: d.day,
    label: dayFmt.format(new Date(d.day)),
    short: dayFmt.format(new Date(d.day)),
  }));
  return (
    <>
      <div className="grid grid-cols-4 gap-4">
        {person ? (
          <Stat label="Active Days" value={u.person_days} detail={`Of the last ${u.days}`} />
        ) : (
          <Stat
            label="People Active"
            value={u.people_active}
            detail={`Used Sundeck Pro in the last ${u.days} days`}
          />
        )}
        <Stat
          label="Screen Time"
          value={formatScreenTime(u.screen_ms)}
          detail={`In front and in use, last ${u.days} days`}
        />
        <Stat
          label={person ? "A Day" : "A Person a Day"}
          value={formatScreenTime(perDay)}
          detail="On the days used"
        />
        <Stat
          label="Sessions"
          value={u.sessions}
          detail={
            u.platforms.length === 0
              ? "No use yet"
              : person
                ? `On ${u.platforms.map((p) => platformLabel(p.platform)).join(", ")}`
                : `People: ${u.platforms.map((p) => `${platformLabel(p.platform)} ${p.people}`).join(" · ")}`
          }
        />
      </div>
      <div className="mt-6 grid grid-cols-2 gap-6">
        <Panel title="Screen Time" subtitle="By day.">
          <BarChart
            label="Screen time by day"
            bars={u.by_day.map((d, i) => ({
              ...daily[i]!,
              value: d.ms,
              display: formatScreenTime(d.ms),
            }))}
          />
        </Panel>
        {person ? (
          <Panel title="Platforms" subtitle="Where the time was spent.">
            <PlatformList u={u} />
          </Panel>
        ) : (
          <Panel title="People Active" subtitle="By day.">
            <BarChart
              label="People active by day"
              bars={u.by_day.map((d, i) => ({
                ...daily[i]!,
                value: d.people,
                display: String(d.people),
              }))}
            />
          </Panel>
        )}
      </div>
    </>
  );
}

function PlatformList({ u }: { u: Usage }) {
  if (u.platforms.length === 0) return <p className="text-text-muted">No use yet.</p>;
  const total = u.platforms.reduce((n, p) => n + Number(p.ms), 0) || 1;
  return (
    <ul className="space-y-3">
      {u.platforms.map((p) => (
        <li key={p.platform}>
          <div className="flex justify-between text-[0.9375rem]">
            <span>{platformLabel(p.platform)}</span>
            <span className="text-text-muted tabular-nums">{formatScreenTime(Number(p.ms))}</span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-fill" aria-hidden="true">
            <div
              className="h-2 rounded-full bg-chart"
              style={{ width: `${Math.round((Number(p.ms) / total) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Screens by time, features by use, app versions, errors. */
export function UsageDetail({ u, showPlatforms = true }: { u: Usage; showPlatforms?: boolean }) {
  const maxScreen = Math.max(1, ...u.screens.map((s) => Number(s.ms)));
  return (
    <div className="mt-6 grid grid-cols-2 gap-6">
      <Panel title="Screens" subtitle="Where the time goes, most first.">
        {u.screens.length === 0 ? (
          <p className="text-text-muted">No use yet.</p>
        ) : (
          <table className={TABLE}>
            <thead className="border-b border-border text-text-muted">
              <tr>
                <th scope="col" className="px-3 py-2 font-semibold">
                  Screen
                </th>
                <th scope="col" className="w-1/3 px-3 py-2 font-semibold">
                  <span className="sr-only">Share</span>
                </th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">
                  Time
                </th>
                <th scope="col" className="px-3 py-2 text-right font-semibold whitespace-nowrap">
                  Views
                </th>
              </tr>
            </thead>
            <tbody>
              {u.screens.slice(0, 15).map((s) => (
                <tr key={s.screen}>
                  <td title={s.screen}>{screenLabel(s.screen)}</td>
                  <td aria-hidden="true">
                    <div
                      className="h-2 rounded-r bg-chart"
                      style={{ width: `${Math.max(2, (Number(s.ms) / maxScreen) * 100)}%` }}
                    />
                  </td>
                  <td className="text-right whitespace-nowrap tabular-nums">
                    {formatScreenTime(Number(s.ms))}
                  </td>
                  <td className="text-right tabular-nums">{s.views}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
      <Panel title="What They Did" subtitle="From the shop’s own history, on every platform.">
        {u.features.length === 0 ? (
          <p className="text-text-muted">Nothing yet.</p>
        ) : (
          <table className={TABLE}>
            <thead className="border-b border-border text-text-muted">
              <tr>
                <th scope="col" className="px-3 py-2 font-semibold">
                  Feature
                </th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">
                  Times
                </th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">
                  People
                </th>
                <th scope="col" className="px-3 py-2 font-semibold whitespace-nowrap">
                  Last
                </th>
              </tr>
            </thead>
            <tbody>
              {u.features.map((f) => (
                <tr key={f.feature}>
                  <td>{featureLabel(f.feature)}</td>
                  <td className="text-right tabular-nums">{f.n}</td>
                  <td className="text-right tabular-nums">{f.people}</td>
                  <td className="whitespace-nowrap">{relDays(f.last_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
      {showPlatforms ? (
        <Panel title="App Versions" subtitle="iPhone and Android, who runs which.">
          {u.versions.length === 0 ? (
            <p className="text-text-muted">No app use yet.</p>
          ) : (
            <table className={TABLE}>
              <tbody>
                {u.versions.map((v) => (
                  <tr key={`${v.platform}-${v.version}`}>
                    <td>{platformLabel(v.platform)}</td>
                    <td className="font-medium tabular-nums">{v.version}</td>
                    <td className="text-right tabular-nums">
                      {v.people} {v.people === 1 ? "person" : "people"}
                    </td>
                    <td className="whitespace-nowrap text-text-muted">
                      Last {relDays(v.last_at).toLowerCase()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      ) : null}
      <Panel
        title="Errors"
        subtitle="Error screens and changes that didn’t save, newest first."
        className={cx(!showPlatforms && "col-span-2")}
      >
        {u.errors.length === 0 ? (
          <p className="text-text-muted">None.</p>
        ) : (
          <ul className="divide-y divide-border/60 text-[0.9375rem]">
            {u.errors.slice(0, 20).map((e, i) => (
              <li key={i} className="py-2">
                <span className="font-medium">{e.detail ?? "Error"}</span>
                <span className="block text-text-muted">
                  {screenLabel(e.screen)} · {platformLabel(e.platform)} · {e.n}{" "}
                  {e.n === 1 ? "time" : "times"}, {e.people} {e.people === 1 ? "person" : "people"}{" "}
                  · last {fmtTime(e.last_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

/** People by screen time, linking to each one's page. */
export function UsagePeople({ u, showShops = true }: { u: Usage; showShops?: boolean }) {
  return (
    <Panel
      title="People"
      subtitle="Most screen time first. Open someone for their screens and what they did."
      className="mt-6"
    >
      {u.people.length === 0 ? (
        <p className="text-text-muted">No use yet.</p>
      ) : (
        <table className={TABLE}>
          <thead className="border-b border-border text-text-muted">
            <tr>
              <th scope="col" className="px-3 py-2 font-semibold">
                Person
              </th>
              {showShops ? (
                <th scope="col" className="px-3 py-2 font-semibold">
                  Shop
                </th>
              ) : null}
              <th scope="col" className="px-3 py-2 text-right font-semibold whitespace-nowrap">
                Screen Time
              </th>
              <th scope="col" className="px-3 py-2 text-right font-semibold whitespace-nowrap">
                Active Days
              </th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">
                Sessions
              </th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">
                Actions
              </th>
              <th scope="col" className="px-3 py-2 font-semibold">
                Uses
              </th>
              <th scope="col" className="px-3 py-2 font-semibold whitespace-nowrap">
                Last Seen
              </th>
            </tr>
          </thead>
          <tbody>
            {u.people.map((p) => (
              <tr key={p.user_id} data-testid="usage-person">
                <td>
                  <Link
                    href={`/admin/people/${p.user_id}`}
                    className="font-medium text-link hover:underline"
                  >
                    {p.name ?? p.email}
                  </Link>
                  <span className="block text-[0.8125rem] text-text-muted">{p.email}</span>
                </td>
                {showShops ? <td>{p.shops ?? "—"}</td> : null}
                <td className="text-right whitespace-nowrap tabular-nums">
                  {formatScreenTime(Number(p.ms))}
                </td>
                <td className="text-right tabular-nums">{p.active_days}</td>
                <td className="text-right tabular-nums">{p.sessions}</td>
                <td className="text-right tabular-nums">{p.actions}</td>
                <td>{(p.platforms ?? []).map(platformLabel).join(", ")}</td>
                <td className="whitespace-nowrap">{relDays(p.last_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}
