import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { formatAddress, isQuoteJob, quoteTitle } from "@leakbook/core";
import { JobQuotes } from "@/components/job-quotes";
import { AddPoolForm, DeleteQuoteButton } from "@/components/quote-screen";
import { RememberRecent } from "@/components/remember-recent";
import { SheetNotices, SheetRow } from "@/components/settings-list";
import { Grouped, PageHeader, Row } from "@/components/ui";
import { getOffice } from "@/lib/auth";
import { customerPools, getJob, getQuoteJobId, getQuotes } from "@/lib/data";

export const metadata: Metadata = { title: "Quote · Sundeck Pro" };

/**
 * The Quote screen (docs/design/2026-11-24-standalone-quotes.md): who it's for, the pool (or
 * Add Pool for a quote job with none), the job when it's on one, then the same builder and
 * sent-quote card the job page uses, and Delete Quote for a draft standalone quote.
 */
export default async function QuotePage({ params }: PageProps<"/quotes/[id]">) {
  const { id } = await params;
  const office = await getOffice();
  const jobId = await getQuoteJobId(office, id);
  if (!jobId) notFound();
  const [detail, quotes] = await Promise.all([getJob(office, jobId), getQuotes(office, jobId)]);
  const quote = quotes.find((q) => q.id === id);
  if (!detail || !quote) notFound();
  const { job } = detail;
  const standalone = isQuoteJob(job);
  const pools =
    standalone && !job.property && job.customer ? await customerPools(office, job.customer.id) : [];
  const title = quoteTitle(quote.number);

  return (
    <SheetNotices>
      <RememberRecent
        userId={office.user.id}
        item={{
          kind: "quote",
          id: quote.id,
          title,
          detail: job.customer?.name ?? null,
          open: { screen: "job", id: job.id, section: "quotes" },
        }}
      />
      <PageHeader title={title} back={{ href: "/quotes", label: "Quotes" }} />
      <div className="max-w-3xl space-y-6">
        <Grouped>
          {job.customer ? (
            <Row
              href={`/customers/${job.customer.id}`}
              label="Customer"
              value={<span className="text-text">{job.customer.name}</span>}
            />
          ) : null}
          {job.property ? (
            // The address under the label: beside it, a long one squeezed "Pool" on a phone.
            <Row
              label="Pool"
              detail={<span className="break-words text-text">{formatAddress(job.property)}</span>}
            />
          ) : standalone ? (
            <SheetRow title="Add Pool" label={<span className="text-link">Add Pool</span>}>
              <AddPoolForm
                jobId={job.id}
                quoteId={quote.id}
                pools={pools.map((p) => ({ id: p.id, label: formatAddress(p) }))}
              />
            </SheetRow>
          ) : null}
          {/* On an ordinary job, or the repair job a standalone quote became. */}
          {!standalone && job.number ? (
            <Row
              href={`/jobs/${job.id}`}
              label="Job"
              value={<span className="text-text">Job #{job.number}</span>}
            />
          ) : null}
        </Grouped>

        <JobQuotes detail={detail} only={quote.id} />

        {standalone && quote.status === "draft" ? <DeleteQuoteButton quoteId={quote.id} /> : null}
      </div>
    </SheetNotices>
  );
}
