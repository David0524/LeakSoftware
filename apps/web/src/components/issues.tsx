import { ISSUE_STATUS_LABELS, issueDetailLine, issueTitle, type Services } from "@leakbook/core";
import type { IssueRow } from "@/lib/issues";
import { ReportIssue } from "./issue-work";
import { Grouped, RowContent } from "./ui";

// Service issues in lists (docs/design/2026-11-16-service-issues.md): Jobs › Issues, a job's
// Issues group, and the customer's open issues.

const shortDay = (iso: string, timeZone: string) =>
  new Date(iso).toLocaleDateString("en-US", { timeZone, month: "short", day: "numeric" });

/** "**Customer** · Cracked skimmer throat", the suggested work, reporter and day, the status. */
export function IssueListRow({
  issue,
  timeZone,
  showCustomer = true,
}: {
  issue: IssueRow;
  timeZone: string;
  showCustomer?: boolean;
}) {
  return (
    <li>
      <RowContent
        href={`/jobs/issues/${issue.id}`}
        label={
          showCustomer ? (
            <>
              <span className="font-semibold">{issue.customer?.name ?? "Customer"}</span>
              <span className="text-text-muted"> · {issueTitle(issue.description, 60)}</span>
            </>
          ) : (
            issueTitle(issue.description)
          )
        }
        detail={issueDetailLine({
          suggested: issue.suggested_type,
          reporter: issue.reporter,
          reportedOn: shortDay(issue.reported_at, timeZone),
        })}
        value={issue.status === "open" ? null : ISSUE_STATUS_LABELS[issue.status]}
      />
    </li>
  );
}

/** A job's Issues group: those reported on it, and Report an Issue. */
export function JobIssues({
  jobId,
  issues,
  services,
  timeZone,
}: {
  jobId: string;
  issues: IssueRow[];
  services: Services;
  timeZone: string;
}) {
  return (
    <Grouped title="Issues" footer="Spotted a problem? Report it for the office to quote or book.">
      {issues.map((i) => (
        <IssueListRow key={i.id} issue={i} timeZone={timeZone} showCustomer={false} />
      ))}
      <ReportIssue jobId={jobId} services={services} />
    </Grouped>
  );
}

/** The customer's open issues, on their page (nothing when there are none). */
export function CustomerIssues({ issues, timeZone }: { issues: IssueRow[]; timeZone: string }) {
  if (issues.length === 0) return null;
  return (
    <Grouped title="Open Issues">
      {issues.map((i) => (
        <li key={i.id}>
          <RowContent
            href={`/jobs/issues/${i.id}`}
            label={issueTitle(i.description)}
            detail={[
              issueDetailLine({
                suggested: i.suggested_type,
                reporter: i.reporter,
                reportedOn: shortDay(i.reported_at, timeZone),
              }),
              i.address,
            ]
              .filter(Boolean)
              .join(" · ")}
          />
        </li>
      ))}
    </Grouped>
  );
}
