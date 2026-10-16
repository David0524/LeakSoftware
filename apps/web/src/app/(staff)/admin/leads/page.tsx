import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import {
  formatPhone,
  LEAD_STAGE_LABELS,
  leadPaid,
  leadStage,
  SERVICES_LABELS,
  parseServices,
  type LeadRow,
} from "@leakbook/core";
import { saveLeadNotes } from "@/app/actions/leads";
import { MailIcon, PhoneIcon } from "@/components/icons";
import {
  Button,
  cx,
  Empty,
  iconButtonClass,
  PageHeader,
  SEGMENT_TRACK,
  segmentClass,
} from "@/components/ui";
import { getUser } from "@/lib/auth";
import { adminClient } from "@/server/admin";
import { isStaff } from "@/server/leads";

export const metadata: Metadata = { title: "Leads · Tidemark Staff", robots: { index: false } };

const VIEWS = { call: "To Call", unpaid: "Not Paid", all: "All" } as const;
type View = keyof typeof VIEWS;

/**
 * Leads (owner, 2026-10-16: "If someone puts their name/email in and doesn't pay, I want that
 * information, so we can call them"). Staff only, after two-step sign-in.
 */
export default function LeadsPage({ searchParams }: PageProps<"/admin/leads">) {
  return (
    <Suspense fallback={<div className="h-64" aria-label="Loading" />}>
      <Leads searchParams={searchParams} />
    </Suspense>
  );
}

async function Leads({
  searchParams,
}: {
  searchParams: PageProps<"/admin/leads">["searchParams"];
}) {
  const user = await getUser();
  if (!user) redirect("/sign-in?next=/admin/leads");
  if (!isStaff(user)) redirect("/home");
  if (user.aal !== "aal2")
    return (
      <>
        <PageHeader title="Leads" />
        <Empty>
          Leads are people’s contact details, so this page needs two-step sign-in. Turn it on in{" "}
          <Link href="/more/two-step" className="text-link underline">
            More › Two-Step Sign-In
          </Link>
          , then sign in again.
        </Empty>
      </>
    );
  const admin = adminClient();
  const { data } = admin ? await admin.rpc("lead_list") : { data: [] };
  const all = (data ?? []) as LeadRow[];
  const { show } = await searchParams;
  const view: View = show === "unpaid" || show === "all" ? show : "call";
  const unpaid = all.filter((l) => !leadPaid(l));
  const lists: Record<View, LeadRow[]> = {
    call: unpaid.filter((l) => !l.contacted_at),
    unpaid,
    all,
  };
  const rows = lists[view];
  const day = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "America/Phoenix",
  });
  return (
    <>
      <PageHeader
        title="Leads"
        subtitle="Everyone who started signing up. Call the ones who didn’t pay."
        actions={
          <a href="/admin/leads/export" className="min-h-11 content-center px-3 text-link">
            Export CSV
          </a>
        }
      />
      <nav aria-label="Show" className={cx(SEGMENT_TRACK, "mb-5")}>
        {(Object.keys(VIEWS) as View[]).map((v) => (
          <Link
            key={v}
            href={`/admin/leads?show=${v}`}
            aria-current={v === view ? "page" : undefined}
            className={segmentClass(v === view)}
          >
            {VIEWS[v]} ({lists[v].length})
          </Link>
        ))}
      </nav>
      {rows.length === 0 ? (
        <Empty>{view === "call" ? "Nobody left to call." : "No leads yet."}</Empty>
      ) : (
        <ul className="space-y-3" aria-label="Leads">
          {rows.map((l) => {
            const stage = leadStage(l);
            const pkg = parseServices(l.services);
            return (
              <li key={l.id} className="card p-4" data-testid="lead">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">
                      {l.name ?? "No name"}
                      <span className="font-normal text-text-muted">
                        {" "}
                        · {l.company ?? l.company_name ?? "No company"}
                      </span>
                    </p>
                    <p className="text-[0.9375rem] text-text-muted">
                      {[
                        pkg ? SERVICES_LABELS[pkg] : null,
                        l.people ? `${l.people} people` : null,
                        `Signed up ${day.format(new Date(l.created_at))}`,
                        l.contacted_at ? `Called ${day.format(new Date(l.contacted_at))}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    <p className="mt-1">
                      <span
                        className={cx(
                          "inline-flex rounded-full px-2.5 py-0.5 text-[0.8125rem] font-semibold",
                          leadPaid(l)
                            ? "bg-status-pass/12 text-status-pass"
                            : "bg-status-warning/12 text-status-warning",
                        )}
                      >
                        {LEAD_STAGE_LABELS[stage]}
                      </span>
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-right text-[0.9375rem]">
                      {l.phone ? formatPhone(l.phone) : "No phone"}
                      <span className="block text-text-muted">{l.email}</span>
                    </span>
                    {l.phone ? (
                      <a
                        href={`tel:${l.phone}`}
                        aria-label={`Call ${l.name ?? l.email}`}
                        className={iconButtonClass()}
                      >
                        <PhoneIcon />
                      </a>
                    ) : null}
                    <a
                      href={`mailto:${l.email}`}
                      aria-label={`Email ${l.name ?? l.email}`}
                      className={iconButtonClass()}
                    >
                      <MailIcon />
                    </a>
                  </div>
                </div>
                <form action={saveLeadNotes} className="mt-3 flex flex-wrap items-end gap-2">
                  <input type="hidden" name="id" value={l.id} />
                  <label className="min-w-0 flex-1">
                    <span className="sr-only">Notes for {l.name ?? l.email}</span>
                    <textarea
                      name="notes"
                      defaultValue={l.notes ?? ""}
                      rows={1}
                      placeholder="Notes from the call"
                      className="min-h-11 w-full rounded-[10px] border border-control-border bg-surface px-3 py-2"
                    />
                  </label>
                  <Button type="submit" kind="secondary">
                    Save
                  </Button>
                  {l.contacted_at ? null : (
                    <Button type="submit" name="called" value="1">
                      Mark Called
                    </Button>
                  )}
                </form>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
