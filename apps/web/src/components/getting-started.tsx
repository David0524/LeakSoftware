import Link from "next/link";
import { companyServices, gettingStarted } from "@leakbook/core";
import { hideGettingStarted } from "@/app/actions/walkthrough";
import { GettingStartedDock } from "@/components/getting-started-dock";
import { getOffice, getUser } from "@/lib/auth";
import { getCompany } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";

/**
 * Owners: the shop's first steps for its package (owner, 2026-10-16), ticked off from the
 * shop's own data, until all are done or the owner hides it.
 */
export async function GettingStarted() {
  const [office, user] = await Promise.all([getOffice(), getUser()]);
  if (!office.isManager || user?.user_metadata.getting_started_hidden === true) return null;
  const supabase = await createClient();
  const co = office.company.id;
  const count = (table: string) =>
    supabase.from(table).select("id", { count: "exact", head: true }).eq("company_id", co);
  const [company, people, invites, customers, plans, leakJobs, reports, invoices, stripe] =
    await Promise.all([
      getCompany(office),
      count("membership").eq("status", "active"),
      count("invite").is("accepted_at", null).is("revoked_at", null),
      count("customer").is("deleted_at", null),
      count("service_plan").is("deleted_at", null),
      count("job").eq("type", "detection").is("deleted_at", null),
      count("report").not("sent_at", "is", null),
      count("invoice").not("sent_at", "is", null),
      supabase.from("stripe_account").select("charges_enabled").eq("company_id", co).maybeSingle(),
    ]);
  const steps = gettingStarted(companyServices(company.settings), {
    people: people.count ?? 1,
    openInvites: invites.count ?? 0,
    hasLogo: Boolean(company.logo_path),
    paymentsReady: Boolean(stripe.data?.charges_enabled),
    customers: customers.count ?? 0,
    visitPlans: plans.count ?? 0,
    leakJobs: leakJobs.count ?? 0,
    reportsSent: reports.count ?? 0,
    invoicesSent: invoices.count ?? 0,
  });
  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) return null;
  return (
    <>
      {/* Wider screens: a panel in the corner, so the page's own information stays on top. */}
      <GettingStartedDock steps={steps} />
      <section
        aria-labelledby="getting-started"
        data-testid="getting-started"
        className="card mb-6 max-w-2xl overflow-hidden sm:hidden"
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-4">
          <div>
            <h2 id="getting-started" className="font-display text-xl font-bold">
              Getting Started
            </h2>
            <p className="text-[0.9375rem] text-text-muted">
              {done} of {steps.length} done
            </p>
          </div>
          <form action={hideGettingStarted}>
            <button type="submit" className="-mr-2 min-h-11 px-3 text-link">
              Hide
            </button>
          </form>
        </div>
        <div
          role="progressbar"
          aria-label="Getting Started progress"
          aria-valuemin={0}
          aria-valuemax={steps.length}
          aria-valuenow={done}
          className="mx-5 mt-2 h-1.5 overflow-hidden rounded-full bg-fill"
        >
          <div
            className="h-1.5 rounded-full bg-status-pass"
            style={{ width: `${(done / steps.length) * 100}%` }}
          />
        </div>
        <ul className="mt-3">
          {steps.map((s) => (
            <li key={s.id} className="border-t-[0.5px] border-separator first:border-t-0">
              <Link
                href={s.href}
                className="flex min-h-12 items-center gap-3 px-5 py-2.5 hover:bg-text/[0.03] active:bg-text/[0.06]"
              >
                <span
                  aria-hidden="true"
                  className={
                    s.done
                      ? "inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-status-pass text-[0.8125rem] text-white"
                      : "size-6 shrink-0 rounded-full border-2 border-control-border"
                  }
                >
                  {s.done ? "✓" : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={s.done ? "block text-text-muted line-through" : "block"}>
                    {s.label}
                    <span className="sr-only">{s.done ? " (done)" : ""}</span>
                  </span>
                  {s.done ? null : (
                    <span className="block text-[0.9375rem] text-text-muted">{s.detail}</span>
                  )}
                </span>
                <span aria-hidden="true" className="text-xl leading-none text-text-muted/70">
                  ›
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
