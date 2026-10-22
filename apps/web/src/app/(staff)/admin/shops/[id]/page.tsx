import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import {
  formatCents,
  formatPhone,
  servicesLabel,
  shopPriceCents,
  shopStanding,
} from "@leakbook/core";
import { DemoToggle, ExtendTrial, OpenShop, ShopNoteForm } from "@/components/admin/actions";
import {
  Facts,
  fmtBytes,
  fmtDate,
  fmtTime,
  Panel,
  Pill,
  relDays,
  StandingPill,
  Stat,
  SupportTable,
  TABLE,
  TwoStepNeeded,
} from "@/components/admin/kit";
import { MailIcon, PhoneIcon } from "@/components/icons";
import { CopyLink } from "@/components/settings-forms";
import { iconButtonClass, PageHeader } from "@/components/ui";
import { siteOrigin } from "@/lib/origin";
import { dailyLimit } from "@/server/usage";
import { loadShop, staffGate } from "@/server/staff";

export const metadata: Metadata = { title: "Shop" };

const ROLE = { owner: "Owner", admin: "Admin", tech: "Tech" } as const;
const ACTIVITY: Record<string, string> = {
  quote_accepted: "Quote accepted",
  payment_received: "Payment received",
  report_signed: "Report signed",
  report_sent: "Report sent",
  job_completed: "Job completed",
  job_assigned: "Job assigned",
  job_moved: "Job moved",
  text_received: "Text received",
};
const LIMITED = [
  ["email", "Emails"],
  ["transcribe", "Transcriptions"],
  ["text", "Texts"],
  ["call", "Calls"],
] as const;

/** One shop, for helping it: who, what it pays, its team, how it uses Sundeck Pro, support. */
export default function ShopPage({ params }: PageProps<"/admin/shops/[id]">) {
  return (
    <Suspense fallback={<div className="h-96" aria-label="Loading" />}>
      <Shop params={params} />
    </Suspense>
  );
}

async function Shop({ params }: Pick<PageProps<"/admin/shops/[id]">, "params">) {
  const { id } = await params;
  const gate = await staffGate(`/admin/shops/${id}`);
  if ("needsTwoStep" in gate) return <TwoStepNeeded title="Shop" />;
  const [d, origin] = await Promise.all([loadShop(id), siteOrigin()]);
  if (!d) notFound();
  const s = d.shop;
  const standing = shopStanding(s);
  const stripeBills = Boolean(s.stripe_subscription_id);
  const address = [
    s.address_line1,
    s.address_line2,
    [s.city, s.state].filter(Boolean).join(", "),
    s.postal_code,
  ]
    .filter(Boolean)
    .join(" · ");
  const u = d.usage;
  const open = d.support.find((x) => !x.ended_at && Date.parse(x.ends_at) > new Date().getTime());

  return (
    <>
      <PageHeader
        title={s.name}
        back={{ href: "/admin/shops", label: "Shops" }}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <StandingPill standing={standing} />
            {s.locked ? (
              <Pill className="bg-status-warning/14 text-status-warning">Read-Only</Pill>
            ) : null}
            <span>
              {servicesLabel(s.services)} · {s.people} {s.people === 1 ? "person" : "people"} ·{" "}
              {formatCents(shopPriceCents(s))} a month · Signed up {fmtDate(s.created_at)}
            </span>
          </span>
        }
        actions={
          <>
            {standing !== "demo" && !stripeBills ? <ExtendTrial companyId={s.id} /> : null}
            {!stripeBills ? <DemoToggle companyId={s.id} demo={standing === "demo"} /> : null}
            <OpenShop companyId={s.id} name={s.name} />
          </>
        }
      />

      {open ? (
        <p className="mb-4 rounded-2xl bg-navy px-4 py-3 text-white" role="status">
          {open.staff_email} has this shop open (
          {open.access === "view" ? "View Only" : "Can Make Changes"}) until {fmtTime(open.ends_at)}
          .
        </p>
      ) : null}

      <div className="grid grid-cols-4 gap-4">
        <Stat
          label="Jobs Finished"
          value={u.jobs_done_month}
          detail={`This month · ${u.jobs_total} in all`}
        />
        <Stat label="Open Jobs" value={u.jobs_open} />
        <Stat label="Customers" value={u.customers} detail={`${u.pools} pools`} />
        <Stat
          label="Collected"
          value={formatCents(u.collected_cents)}
          detail={`${formatCents(u.outstanding_cents)} owed to the shop`}
        />
      </div>

      <div className="mt-6 grid grid-cols-3 gap-6">
        <Panel title="Contact" className="col-span-2">
          <Facts
            rows={[
              [
                "Owner",
                s.owner_name || s.owner_email ? (
                  <span className="flex flex-wrap items-center gap-2">
                    <span>
                      {s.owner_id ? (
                        <Link
                          href={`/admin/people/${s.owner_id}`}
                          className="text-link hover:underline"
                        >
                          {s.owner_name ?? s.owner_email}
                        </Link>
                      ) : (
                        s.owner_name
                      )}
                      {s.owner_name && s.owner_email ? ` · ${s.owner_email}` : null}
                      {s.owner_phone ? ` · ${formatPhone(s.owner_phone)}` : null}
                    </span>
                  </span>
                ) : null,
              ],
              ["Shop email", s.email],
              ["Shop phone", s.phone ? formatPhone(s.phone) : null],
              ["Legal name", s.legal_name],
              ["Address", address || null],
              ["Time zone", s.timezone],
              ["Last active", relDays(s.last_active_at)],
            ]}
          />
          <div className="mt-4 flex gap-2">
            {(s.owner_phone ?? s.phone) ? (
              <a
                href={`tel:${s.owner_phone ?? s.phone}`}
                className={iconButtonClass()}
                aria-label={`Call ${s.owner_name ?? s.name}`}
              >
                <PhoneIcon />
              </a>
            ) : null}
            {(s.owner_email ?? s.email) ? (
              <a
                href={`mailto:${s.owner_email ?? s.email}`}
                className={iconButtonClass()}
                aria-label={`Email ${s.owner_name ?? s.name}`}
              >
                <MailIcon />
              </a>
            ) : null}
          </div>
        </Panel>

        <Panel title="Subscription">
          <Facts
            rows={[
              ["Standing", <StandingPill key="s" standing={standing} />],
              ["Price", `${formatCents(shopPriceCents(s))} a month`],
              ["Trial ends", s.trial_ends_at ? fmtDate(s.trial_ends_at) : null],
              ["Paid through", s.current_period_end ? fmtDate(s.current_period_end) : null],
              ["Demo code", s.access_code],
              [
                "Stripe",
                s.stripe_customer_id ? (
                  <a
                    href={`https://dashboard.stripe.com/customers/${s.stripe_customer_id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-link hover:underline"
                  >
                    Customer in Stripe ↗
                  </a>
                ) : (
                  "Not billed yet"
                ),
              ],
            ]}
          />
          {stripeBills ? (
            <p className="mt-3 text-[0.8125rem] text-text-muted">
              Stripe bills this shop: change its trial or plan in the Stripe dashboard.
            </p>
          ) : null}
        </Panel>

        <Panel
          title="Team"
          className="col-span-2"
          subtitle={`${s.people} active · the price counts them`}
        >
          <table className={TABLE}>
            <thead className="border-b border-border text-text-muted">
              <tr>
                <th scope="col" className="px-3 py-2 font-semibold">
                  Person
                </th>
                <th scope="col" className="px-3 py-2 font-semibold">
                  Role
                </th>
                <th scope="col" className="px-3 py-2 font-semibold">
                  Last Sign-In
                </th>
                <th scope="col" className="px-3 py-2 font-semibold">
                  Apps
                </th>
                <th scope="col" className="px-3 py-2 font-semibold">
                  Two-Step
                </th>
              </tr>
            </thead>
            <tbody>
              {d.team.map((m) => (
                <tr
                  key={m.user_id}
                  className={m.status === "disabled" ? "text-text-muted" : undefined}
                >
                  <td>
                    <Link
                      href={`/admin/people/${m.user_id}`}
                      className="font-medium text-link hover:underline"
                    >
                      {m.name ?? m.email}
                    </Link>
                    <span className="block text-[0.8125rem] text-text-muted">{m.email}</span>
                  </td>
                  <td>
                    {ROLE[m.role]}
                    {m.status === "disabled" ? " (off)" : ""}
                  </td>
                  <td className="whitespace-nowrap">{relDays(m.last_sign_in_at)}</td>
                  <td>{m.apps.length ? m.apps.join(", ") : "Website"}</td>
                  <td>{m.two_step ? "On" : "Off"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {d.invites.length ? (
            <div className="mt-4 space-y-3">
              <h3 className="font-semibold">Waiting Invites</h3>
              {d.invites.map((i) => (
                <div key={i.id}>
                  <p className="mb-1 text-[0.9375rem]">
                    {i.email} · {ROLE[i.role as keyof typeof ROLE] ?? i.role} · expires{" "}
                    {fmtDate(i.expires_at)}
                  </p>
                  <CopyLink
                    url={`${origin}/invite/${i.token}`}
                    label={`Invite link for ${i.email}`}
                  />
                </div>
              ))}
            </div>
          ) : null}
        </Panel>

        <Panel
          title="Payments Setup"
          subtitle="The shop's own Stripe, for its customers' payments."
        >
          <Facts
            rows={[
              ["Connected", s.stripe_account_id ? "Yes" : "No"],
              ["Charges", s.payments_on ? "On" : "Off"],
              ["Payouts", s.payouts_on ? "On" : "Off"],
              ["Details sent", s.payments_details_submitted ? "Yes" : "No"],
              [
                "Account",
                s.stripe_account_id ? (
                  <a
                    href={`https://dashboard.stripe.com/connect/accounts/${s.stripe_account_id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-link hover:underline"
                  >
                    {s.stripe_account_id} ↗
                  </a>
                ) : null,
              ],
            ]}
          />
        </Panel>

        <Panel title="Usage" className="col-span-2">
          <Facts
            rows={[
              ["Reports sent", u.reports_sent],
              [
                "Quotes",
                `${u.quotes_sent} sent · ${u.quotes_accepted} accepted${u.quotes_sent ? ` (${Math.round((u.quotes_accepted / u.quotes_sent) * 100)}%)` : ""}`,
              ],
              ["Invoices sent", u.invoices_sent],
              ["Photos", `${u.photos} · ${fmtBytes(u.storage_bytes)} stored`],
              [
                "Today",
                [
                  ...LIMITED.map(([k, label]) => `${label} ${d.today[k] ?? 0} of ${dailyLimit(k)}`),
                  `AI drafts ${d.today.narrative ?? 0}`,
                ].join(" · "),
              ],
            ]}
          />
        </Panel>

        <Panel title="Problems" subtitle="Emails and texts that failed, last 30 days.">
          {d.failed_messages.length === 0 ? (
            <p className="text-text-muted">None.</p>
          ) : (
            <ul className="space-y-2 text-[0.9375rem]">
              {d.failed_messages.map((f, i) => (
                <li key={i}>
                  <span className="font-medium">{f.recipient}</span> · {f.template} ·{" "}
                  {fmtTime(f.created_at)}
                  {f.error ? <span className="block text-status-fail">{f.error}</span> : null}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Recent Activity" className="col-span-2" subtitle="The shop's own feed.">
          {d.activity.length === 0 ? (
            <p className="text-text-muted">Nothing yet.</p>
          ) : (
            <ul className="divide-y divide-border/60 text-[0.9375rem]">
              {d.activity.map((a, i) => (
                <li key={i} className="flex min-h-10 items-center justify-between gap-3 py-1.5">
                  <span>
                    {ACTIVITY[a.kind] ?? a.kind}
                    {a.customer_name ? ` · ${a.customer_name}` : ""}
                    {a.job_number ? ` · job ${a.job_number}` : ""}
                    {a.amount_cents ? ` · ${formatCents(a.amount_cents)}` : ""}
                    {a.preview ? ` · “${a.preview}”` : ""}
                  </span>
                  <span className="shrink-0 text-text-muted">{fmtTime(a.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Staff Notes">
          <ShopNoteForm companyId={s.id} />
          {d.notes.length ? (
            <ul className="mt-4 space-y-3">
              {d.notes.map((n) => (
                <li key={n.id} className="rounded-xl bg-text/[0.04] p-3">
                  <p className="whitespace-pre-line">{n.note}</p>
                  <p className="mt-1 text-[0.8125rem] text-text-muted">
                    {n.staff_email} · {fmtTime(n.created_at)}
                  </p>
                </li>
              ))}
            </ul>
          ) : null}
        </Panel>

        <Panel title="Support History" className="col-span-3">
          {d.support.length === 0 ? (
            <p className="text-text-muted">No one from Sundeck Pro has opened this shop.</p>
          ) : (
            <SupportTable rows={d.support} />
          )}
        </Panel>
      </div>
    </>
  );
}
