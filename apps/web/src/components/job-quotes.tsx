import Link from "next/link";
import { suggestItems, type CompanySettings, type PriceBookItem } from "@leakbook/core";
import { getOffice } from "@/lib/auth";
import { getCompany, getPaymentAccount, getQuotes, listConfig, type JobDetail } from "@/lib/data";
import { siteOrigin } from "@/lib/origin";
import { QuoteBuilder, StartQuote } from "./quote-builder";
import { QuotePanel } from "./quote-panel";
import { Notice } from "./ui";

/**
 * A job's quotes: each one's builder (a draft) or its sent card, and Start Quote. The job page
 * and the Quote screen (docs/design/2026-11-24-standalone-quotes.md) share it. `only` shows one
 * quote (a Wrap-Up sheet, the Quote screen); `readOnly` leaves out Start Quote (a repair job
 * made from its own standalone quote).
 */
export async function JobQuotes({
  detail,
  only,
  readOnly = false,
}: {
  detail: JobDetail;
  only?: string;
  readOnly?: boolean;
}) {
  const office = await getOffice();
  const [quotes, account, origin, company, priceBook] = await Promise.all([
    getQuotes(office, detail.job.id),
    office.isManager ? getPaymentAccount(office) : Promise.resolve(null),
    siteOrigin(),
    getCompany(office),
    listConfig<PriceBookItem>(office, "price_book_item"),
  ]);
  const settings = company.settings as Partial<CompanySettings>;
  const live = priceBook.filter((i) => i.active);
  const typeKey = (componentId: string | null | undefined) => {
    const comp = detail.components.find((c) => c.id === componentId);
    return comp ? detail.componentTypes.get(comp.component_type_id)?.key : undefined;
  };
  const findings = detail.findings
    .filter((f) => f.status !== "repaired")
    .map((f) => ({
      id: f.id,
      title: f.title,
      items: suggestItems(live, typeKey(f.job_component_id)).map((i) => ({
        id: i.id,
        name: i.name,
        price_cents: i.price_cents,
      })),
    }));
  const hasDraft = quotes.some((q) => q.status === "draft");
  const hasAccepted = quotes.some((q) => q.status === "accepted");
  // Wrap-Up shows one quote per sheet; its list has New Quote.
  const shown = only ? quotes.filter((q) => q.id === only) : quotes;
  return (
    <div className="space-y-4">
      {office.isManager && !account?.charges_enabled && quotes.some((q) => q.status !== "draft") ? (
        <Notice tone="warning">
          Customers can accept quotes but can’t pay deposits online until payments are set up.{" "}
          <Link
            href="/settings/payments"
            className="inline-flex min-h-11 items-center font-semibold text-link underline"
          >
            Set up payments
          </Link>
        </Notice>
      ) : null}
      {!only && !readOnly && !hasDraft && !hasAccepted ? (
        <StartQuote jobId={detail.job.id} another={quotes.length > 0} />
      ) : null}
      {shown.length ? (
        <div className={only ? "grid grid-cols-1 gap-5" : "grid grid-cols-1 gap-5 xl:grid-cols-2"}>
          {shown.map((q) => (
            <QuotePanel key={q.id} quote={q} jobId={detail.job.id} origin={origin}>
              {q.status === "draft" ? (
                <QuoteBuilder
                  quote={q}
                  findings={findings}
                  priceBook={live.map((i) => ({
                    id: i.id,
                    name: i.name,
                    price_cents: i.price_cents,
                  }))}
                  settings={{
                    tax_rate_bps: settings.tax_rate_bps ?? 0,
                    deposit: settings.deposit ?? {
                      type: "percent",
                      value_bps: 0,
                      minimum_cents: 0,
                    },
                    tech_discount_limit_bps: settings.tech_discount_limit_bps ?? 0,
                  }}
                  isOwner={office.isManager}
                />
              ) : null}
            </QuotePanel>
          ))}
        </div>
      ) : null}
    </div>
  );
}
