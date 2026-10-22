import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { fmtTime, Panel, Pill, Stat, TABLE, TwoStepNeeded } from "@/components/admin/kit";
import { PageHeader } from "@/components/ui";
import { checkHealth } from "@/server/health";
import { loadHealth, staffGate } from "@/server/staff";
import { dailyLimit, type UsageKind } from "@/server/usage";

export const metadata: Metadata = { title: "Health" };

const KIND: Record<string, string> = {
  email: "Emails",
  narrative: "AI drafts",
  transcribe: "Transcriptions",
  text: "Texts",
  call: "Calls",
};
const LIMITED = new Set<string>(["email", "transcribe", "text", "call"]);

/** For tech help across shops: services up, what failed, who's near a limit. */
export default function HealthPage() {
  return (
    <Suspense fallback={<div className="h-96" aria-label="Loading" />}>
      <HealthBody />
    </Suspense>
  );
}

async function HealthBody() {
  const gate = await staffGate("/admin/health");
  if ("needsTwoStep" in gate) return <TwoStepNeeded title="Health" />;
  const [h, status] = await Promise.all([loadHealth(), checkHealth()]);
  const usage = h.usage_today
    .map((u) => {
      const limit = LIMITED.has(u.kind) ? dailyLimit(u.kind as UsageKind) : null;
      return { ...u, limit, share: limit ? u.used / limit : 0 };
    })
    .sort((a, b) => b.share - a.share || b.used - a.used);
  const failed = h.failed_messages_24h.reduce((n, f) => n + f.n, 0);
  return (
    <>
      <PageHeader title="Health" subtitle={`Checked ${fmtTime(status.checkedAt)}.`} />
      <div className="grid grid-cols-4 gap-4">
        <Stat
          label="Services"
          value={status.ok ? "All Up" : "Problem"}
          tone={status.ok ? undefined : "fail"}
          detail={`${status.checks.filter((c) => c.ok).length} of ${status.checks.length} checks pass`}
        />
        <Stat
          label="Failed Sends"
          value={failed}
          detail="Emails and texts, last 24 hours"
          tone={failed ? "warning" : undefined}
        />
        <Stat
          label="Read-Only Shops"
          value={h.locked_shops}
          detail="Trial over or unpaid"
          href="/admin/shops?show=trial_ended"
        />
        <Stat label="Support Sessions Open" value={h.support_open} href="/admin/support" />
      </div>
      <div className="mt-6 grid grid-cols-2 gap-6">
        <Panel title="Services">
          <ul className="space-y-2">
            {status.checks.map((c) => (
              <li key={c.name} className="flex items-start justify-between gap-3">
                <span>
                  {c.name}
                  <span className="block text-[0.8125rem] text-text-muted">{c.detail}</span>
                </span>
                <Pill
                  className={
                    c.ok
                      ? "bg-status-pass/12 text-status-pass"
                      : "bg-status-fail/12 text-status-fail"
                  }
                >
                  {c.ok ? "Up" : "Down"}
                </Pill>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Map Budget" subtitle="Mapbox this month (UTC), against its cap.">
          <ul className="space-y-3">
            {h.mapbox_month.map((b) => {
              const pct = b.limit ? Math.min(100, Math.round((b.used / b.limit) * 100)) : 0;
              return (
                <li key={b.api}>
                  <div className="flex justify-between text-[0.9375rem]">
                    <span>{b.api.replace(/_/g, " ")}</span>
                    <span className="tabular-nums text-text-muted">
                      {b.used.toLocaleString()} of {b.limit.toLocaleString()} ({pct}%)
                    </span>
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-fill" aria-hidden="true">
                    <div
                      className={
                        pct >= 80
                          ? "h-2 rounded-full bg-status-warning"
                          : "h-2 rounded-full bg-chart"
                      }
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </Panel>
        <Panel title="Failed Sends" subtitle="By shop, last 24 hours.">
          {h.failed_messages_24h.length === 0 ? (
            <p className="text-text-muted">None.</p>
          ) : (
            <table className={TABLE}>
              <tbody>
                {h.failed_messages_24h.map((f) => (
                  <tr key={f.company_id}>
                    <td>
                      <Link
                        href={`/admin/shops/${f.company_id}`}
                        className="font-medium text-link hover:underline"
                      >
                        {f.name}
                      </Link>
                      {f.last_error ? (
                        <span className="block text-[0.8125rem] text-status-fail">
                          {f.last_error}
                        </span>
                      ) : null}
                    </td>
                    <td className="text-right tabular-nums">{f.n}</td>
                    <td className="whitespace-nowrap text-text-muted">{fmtTime(f.last_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
        <Panel title="Today's Allowances" subtitle="Each shop's metered use today, fullest first.">
          {usage.length === 0 ? (
            <p className="text-text-muted">Nothing used yet today.</p>
          ) : (
            <table className={TABLE}>
              <tbody>
                {usage.slice(0, 25).map((u) => (
                  <tr key={`${u.company_id}-${u.kind}`}>
                    <td>
                      <Link
                        href={`/admin/shops/${u.company_id}`}
                        className="text-link hover:underline"
                      >
                        {u.name}
                      </Link>
                    </td>
                    <td>{KIND[u.kind] ?? u.kind}</td>
                    <td
                      className={
                        u.share >= 0.8
                          ? "text-right font-semibold text-status-warning tabular-nums"
                          : "text-right tabular-nums"
                      }
                    >
                      {u.used}
                      {u.limit ? ` of ${u.limit}` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>
    </>
  );
}
