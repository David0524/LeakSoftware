import type { Metadata } from "next";
import {
  QUOTE_NEEDS_POOL,
  QUOTE_STATUS_LABELS,
  QUOTES_EMPTY,
  QUOTES_EMPTY_SEARCH,
  filterQuotes,
  quoteRowDetail,
  quoteWaitingForPool,
  type QuoteStatus,
} from "@leakbook/core";
import { NavPlus } from "@/components/nav-bar";
import { QuoteSegments } from "@/components/quote-segments";
import { Button, ButtonLink, Chip, Empty, Grouped, PageHeader, Row } from "@/components/ui";
import { getOffice } from "@/lib/auth";
import { listQuotes, mayMakeJobs } from "@/lib/data";
import { quoteSegmentParam } from "@/lib/quotes";

export const metadata: Metadata = { title: "Quotes · Sundeck Pro" };

/** A quote's status pill: gray to do, blue waiting, green yes, red no. */
const STATUS_FILL: Record<QuoteStatus, string> = {
  draft: "bg-status-excluded",
  sent: "bg-status-info",
  accepted: "bg-status-pass",
  declined: "bg-status-fail",
  expired: "bg-status-excluded",
};

/**
 * Every quote in the shop, standalone and on jobs, newest first, by status (docs/design/
 * 2026-11-24-standalone-quotes.md). It opens on Sent, the ones to follow up.
 */
export default async function QuotesPage({ searchParams }: PageProps<"/quotes">) {
  const office = await getOffice();
  const params = await searchParams;
  const one = (k: string) => (typeof params[k] === "string" ? (params[k] as string) : "");
  const segment = quoteSegmentParam(one("segment"));
  const q = one("q").trim();
  const [all, canAdd] = await Promise.all([listQuotes(office), mayMakeJobs(office)]);
  const quotes = filterQuotes(all, { segment, q });

  return (
    <>
      <PageHeader
        title="Quotes"
        navAction={canAdd ? <NavPlus href="/quotes/new" label="New Quote" /> : undefined}
        actions={canAdd ? <ButtonLink href="/quotes/new">New Quote</ButtonLink> : undefined}
        // Phones use the "+" in the navigation bar instead.
        actionsClassName="max-sm:hidden"
      />
      <div className="max-w-3xl space-y-4">
        <QuoteSegments key={segment} value={segment} q={q} />
        <form action="/quotes" role="search" className="flex gap-2">
          {segment !== "sent" ? <input type="hidden" name="segment" value={segment} /> : null}
          <label htmlFor="quote-q" className="sr-only">
            Search Quotes
          </label>
          <input
            id="quote-q"
            name="q"
            type="search"
            defaultValue={q}
            placeholder="Search Quotes"
            className="min-h-11 min-w-0 flex-1 truncate rounded-[10px] border border-control-border bg-surface px-3 focus:outline-3 focus:outline-focus"
          />
          <Button type="submit" kind="secondary">
            Search
          </Button>
        </form>
        {quotes.length === 0 ? (
          <Empty>{q ? QUOTES_EMPTY_SEARCH : QUOTES_EMPTY[segment]}</Empty>
        ) : (
          <Grouped>
            {quotes.map((x) => (
              <Row
                key={x.id}
                href={`/quotes/${x.id}`}
                label={<span className="font-semibold">{x.customer ?? "No name"}</span>}
                detail={
                  <>
                    <span className="block tabular-nums">{quoteRowDetail(x)}</span>
                    {quoteWaitingForPool(x) ? (
                      <span className="block">{QUOTE_NEEDS_POOL}</span>
                    ) : null}
                  </>
                }
                value={
                  <Chip label={QUOTE_STATUS_LABELS[x.status]} className={STATUS_FILL[x.status]} />
                }
              />
            ))}
          </Grouped>
        )}
      </div>
    </>
  );
}
