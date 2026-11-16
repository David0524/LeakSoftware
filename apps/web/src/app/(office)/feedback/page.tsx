import type { Metadata } from "next";
import {
  FEEDBACK_EMPTY,
  FEEDBACK_OFFLINE,
  FEEDBACK_TITLE,
  feedbackFilter,
  feedbackOpenLabel,
  type FeedbackFilter,
} from "@leakbook/core";
import { FeedbackRowItem, FeedbackTabs } from "@/components/feedback-rows";
import { Empty, Notice, PageHeader } from "@/components/ui";
import { getOffice } from "@/lib/auth";
import { feedbackList } from "@/lib/feedback";

export const metadata: Metadata = { title: "Customer Feedback · Sundeck Pro" };

const SHOWS: FeedbackFilter[] = ["open", "closed", "up"];

/**
 * Customer Feedback (owner's competitor notes, 2026-11-16): the thumbs customers give from their
 * report page or the review request. A thumbs down is a private complaint, open until closed
 * here with a note. Owners and admins.
 */
export default async function FeedbackPage({ searchParams }: PageProps<"/feedback">) {
  const office = await getOffice();
  const back = { href: "/dashboard", label: "Dashboard" };
  if (!office.isManager)
    return (
      <>
        <PageHeader title={FEEDBACK_TITLE} back={back} />
        <Notice>Only owners and admins can see customer feedback.</Notice>
      </>
    );
  const { show } = await searchParams;
  const current = SHOWS.find((s) => s === show) ?? "open";
  const list = await feedbackList(office.company.id);
  const rows = list ? feedbackFilter(list.rows, current) : [];
  const now = new Date();
  return (
    <>
      <PageHeader
        title={FEEDBACK_TITLE}
        back={back}
        subtitle={list ? feedbackOpenLabel(list.open_count) : undefined}
      />
      <div className="max-w-2xl">
        <FeedbackTabs current={current} />
        {!list ? (
          <Empty>{FEEDBACK_OFFLINE}</Empty>
        ) : rows.length === 0 ? (
          <Empty>{FEEDBACK_EMPTY[current]}</Empty>
        ) : (
          <ul className="grouped">
            {rows.map((r) => (
              <FeedbackRowItem key={r.id} row={r} timeZone={office.company.timezone} now={now} />
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
