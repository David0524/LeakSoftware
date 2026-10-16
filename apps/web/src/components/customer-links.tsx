import { getOffice } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { TurnOffLink } from "./turn-off-link";
import { Grouped } from "./ui";

interface LinkRow {
  id: string;
  report_id: string | null;
  quote_id: string | null;
  invoice_id: string | null;
  created_at: string;
  expires_at: string | null;
  last_viewed_at: string | null;
  view_count: number;
}

/**
 * The job's customer links that still work (owner, 2026-10-16): what each opens, whether the
 * customer has looked, when it stops working, and Turn Off for a link sent to the wrong
 * person or forwarded too far. Links last 180 days; sending again makes a new one.
 */
export async function CustomerLinks({ jobId, tz }: { jobId: string; tz: string }) {
  const office = await getOffice();
  const { data } = await (
    await createClient()
  )
    .from("share_link")
    .select(
      "id, report_id, quote_id, invoice_id, created_at, expires_at, last_viewed_at, view_count",
    )
    .eq("company_id", office.company.id)
    .eq("job_id", jobId)
    .is("revoked_at", null)
    .is("deleted_at", null)
    // Past their date but not yet turned off by the daily job.
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .order("created_at", { ascending: false });
  const live = (data ?? []) as LinkRow[];
  if (!live.length) return null;
  const day = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: tz });
  return (
    <Grouped
      title="Customer links"
      footer="Anyone with a link can open it, so turn one off if it went to the wrong person. Links stop working after 180 days; sending again makes a new one."
    >
      {live.map((l) => {
        const what = l.report_id
          ? "Report"
          : l.quote_id
            ? "Quote"
            : l.invoice_id
              ? "Invoice"
              : "Link";
        const seen = l.view_count
          ? `Opened ${l.view_count === 1 ? "once" : `${l.view_count} times`}${l.last_viewed_at ? `, last ${day.format(new Date(l.last_viewed_at))}` : ""}`
          : "Not opened yet";
        return (
          <li
            key={l.id}
            className="flex min-h-11 items-center gap-3 px-4 py-2.5"
            data-testid="customer-link"
          >
            <span className="min-w-0 flex-1">
              <span className="block">{what}</span>
              <span className="block text-[0.9375rem] text-text-muted">
                {seen}
                {l.expires_at ? ` · Works until ${day.format(new Date(l.expires_at))}` : ""}
              </span>
            </span>
            <TurnOffLink id={l.id} jobId={jobId} what={what} />
          </li>
        );
      })}
    </Grouped>
  );
}
