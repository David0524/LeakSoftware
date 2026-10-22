import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { formatPhone } from "@leakbook/core";
import { TwoStepOff } from "@/components/admin/actions";
import {
  Facts,
  fmtDate,
  fmtTime,
  Panel,
  relDays,
  TABLE,
  TwoStepNeeded,
} from "@/components/admin/kit";
import { MailIcon, PhoneIcon } from "@/components/icons";
import { CopyLink } from "@/components/settings-forms";
import { iconButtonClass, PageHeader } from "@/components/ui";
import { siteOrigin } from "@/lib/origin";
import { loadPerson, loadStaffActions, staffGate } from "@/server/staff";

export const metadata: Metadata = { title: "Person" };

const ROLE: Record<string, string> = { owner: "Owner", admin: "Admin", tech: "Tech" };

/** One account: their shops, devices, invites, and the help staff can give them. */
export default function PersonPage({ params }: PageProps<"/admin/people/[id]">) {
  return (
    <Suspense fallback={<div className="h-96" aria-label="Loading" />}>
      <Person params={params} />
    </Suspense>
  );
}

async function Person({ params }: Pick<PageProps<"/admin/people/[id]">, "params">) {
  const { id } = await params;
  const gate = await staffGate(`/admin/people/${id}`);
  if ("needsTwoStep" in gate) return <TwoStepNeeded title="Person" />;
  const [p, origin] = await Promise.all([loadPerson(id), siteOrigin()]);
  if (!p) notFound();
  const help = (await loadStaffActions({ limit: 500 })).filter((a) => a.target_user === p.id);
  const now = new Date().getTime();
  const openInvites = p.invites.filter(
    (i) => !i.accepted_at && !i.revoked_at && Date.parse(i.expires_at) > now,
  );
  return (
    <>
      <PageHeader
        title={p.name ?? p.email}
        back={{ href: "/admin/people", label: "People" }}
        subtitle={`${p.email} · signed up ${fmtDate(p.created_at)}`}
        actions={p.two_step ? <TwoStepOff userId={p.id} email={p.email} /> : null}
      />
      <div className="grid grid-cols-3 gap-6">
        <Panel title="Account" className="col-span-2">
          <Facts
            rows={[
              ["Email", p.email],
              ["Phone", p.phone ? formatPhone(p.phone) : null],
              ["Last sign-in", `${relDays(p.last_sign_in_at)} (${fmtTime(p.last_sign_in_at)})`],
              ["Two-step", p.two_step ? "On (authenticator app)" : "Off"],
              [
                "Signed up from",
                p.lead
                  ? `The sign-up form, ${fmtDate(p.lead.created_at)}${p.lead.contacted_at ? ` · called ${fmtDate(p.lead.contacted_at)}` : ""}`
                  : "An invite",
              ],
            ]}
          />
          <div className="mt-4 flex gap-2">
            {p.phone ? (
              <a
                href={`tel:${p.phone}`}
                className={iconButtonClass()}
                aria-label={`Call ${p.name ?? p.email}`}
              >
                <PhoneIcon />
              </a>
            ) : null}
            <a
              href={`mailto:${p.email}`}
              className={iconButtonClass()}
              aria-label={`Email ${p.name ?? p.email}`}
            >
              <MailIcon />
            </a>
          </div>
          <p className="mt-4 text-[0.9375rem] text-text-muted">
            Forgot their password? They choose Email Me a Sign-In Link on the sign-in page.
          </p>
        </Panel>

        <Panel title="Devices" subtitle="Phones with notifications on.">
          {p.devices.length === 0 ? (
            <p className="text-text-muted">Website only.</p>
          ) : (
            <ul className="space-y-2 text-[0.9375rem]">
              {p.devices.map((d, i) => (
                <li key={i}>
                  <span className="font-medium">{d.app ?? d.service}</span>
                  <span className="block text-text-muted">
                    Last seen {relDays(d.last_seen_at).toLowerCase()} · added{" "}
                    {fmtDate(d.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Shops" className="col-span-3">
          {p.shops.length === 0 ? (
            <p className="text-text-muted">Not in any shop.</p>
          ) : (
            <table className={TABLE}>
              <thead className="border-b border-border text-text-muted">
                <tr>
                  <th scope="col" className="px-3 py-2 font-semibold">
                    Shop
                  </th>
                  <th scope="col" className="px-3 py-2 font-semibold">
                    Role
                  </th>
                  <th scope="col" className="px-3 py-2 font-semibold">
                    Joined
                  </th>
                </tr>
              </thead>
              <tbody>
                {p.shops.map((s) => (
                  <tr key={s.company_id}>
                    <td>
                      <Link
                        href={`/admin/shops/${s.company_id}`}
                        className="font-medium text-link hover:underline"
                      >
                        {s.company_name}
                      </Link>
                    </td>
                    <td>
                      {ROLE[s.role] ?? s.role}
                      {s.status === "disabled" ? " (off)" : ""}
                    </td>
                    <td>{fmtDate(s.joined_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>

        {openInvites.length ? (
          <Panel
            title="Waiting Invites"
            className="col-span-3"
            subtitle="Invites aren't emailed: copy the link and send it to them."
          >
            <div className="space-y-3">
              {openInvites.map((i) => (
                <div key={i.id}>
                  <p className="mb-1 text-[0.9375rem]">
                    {i.company_name} · {ROLE[i.role] ?? i.role} · expires {fmtDate(i.expires_at)}
                  </p>
                  <CopyLink url={`${origin}/invite/${i.token}`} />
                </div>
              ))}
            </div>
          </Panel>
        ) : null}

        <Panel title="Help Given" className="col-span-3" subtitle="Staff actions on this account.">
          {help.length === 0 ? (
            <p className="text-text-muted">None.</p>
          ) : (
            <ul className="space-y-2 text-[0.9375rem]">
              {help.map((a) => (
                <li key={a.id}>
                  {a.action === "two_step_off" ? "Two-step turned off" : a.action} by{" "}
                  {a.staff_email} · {fmtTime(a.created_at)}
                  {a.reason ? <span className="block text-text-muted">{a.reason}</span> : null}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
