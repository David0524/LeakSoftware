import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FEEDBACK_TITLE, FEEDBACK_WORDS, shortDate } from "@leakbook/core";
import { FeedbackCaseForm } from "@/components/feedback-case";
import { Grouped, Notice, PageHeader, Row } from "@/components/ui";
import { getOffice } from "@/lib/auth";
import { feedbackList } from "@/lib/feedback";
import { isUuid } from "@/lib/uuid";

export const metadata: Metadata = { title: "Complaint · Sundeck Pro" };

/** One complaint: what the customer said, the job and customer, and Close or Reopen with a note. */
export default async function ComplaintPage({ params }: PageProps<"/feedback/[id]">) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const office = await getOffice();
  const back = { href: "/feedback", label: FEEDBACK_TITLE };
  if (!office.isManager)
    return (
      <>
        <PageHeader title="Complaint" back={back} />
        <Notice>Only owners and admins can see customer feedback.</Notice>
      </>
    );
  const list = await feedbackList(office.company.id);
  const row = list?.rows.find((r) => r.id === id && r.rating === "down");
  if (!row) notFound();
  const tz = office.company.timezone;
  const now = new Date();
  const open = row.status === "open";
  return (
    <>
      <PageHeader
        title={row.customer_name || "A customer"}
        back={back}
        subtitle={open ? "Open complaint" : "Closed"}
      />
      <div className="max-w-xl space-y-6">
        <Grouped title="What they said">
          <Row label={row.comment || FEEDBACK_WORDS.noComment} />
        </Grouped>
        <Grouped title="Details">
          <Row label="Received" value={shortDate(row.created_at, now, tz)} />
          {row.customer_id ? (
            <Row
              label="Customer"
              value={row.customer_name || "Open"}
              href={`/customers/${row.customer_id}`}
            />
          ) : null}
          {row.job_id ? (
            <Row
              label="Job"
              value={row.job_number ? `#${row.job_number}` : "Open"}
              href={`/jobs/${row.job_id}`}
            />
          ) : null}
          {row.closed_at ? (
            <Row
              label="Closed"
              value={`${shortDate(row.closed_at, now, tz)}${row.closed_by_name ? ` by ${row.closed_by_name}` : ""}`}
            />
          ) : null}
        </Grouped>
        <FeedbackCaseForm id={row.id} open={open} note={row.office_note} />
      </div>
    </>
  );
}
