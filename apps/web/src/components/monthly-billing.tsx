import { billingMonthDetail, billingMonthName, type BillingMonth } from "@leakbook/core";
import { Grouped, Row } from "./ui";

/**
 * Owners and admins: Invoices › Monthly Billing (owner, 2026-11-15; was Maintenance to Bill).
 * A row per month with drafts to send or customers not invoiced yet; each opens the month's
 * page, where the drafts are reviewed, charges added, and all sent at once.
 */
export function MonthlyBilling({ months }: { months: BillingMonth[] }) {
  if (months.length === 0) return null;
  return (
    <Grouped
      title="Monthly Billing"
      className="mb-6"
      footer="Each customer’s month is drafted on their invoice day. Review the drafts, add any charges, then send them all at once."
    >
      {months.map((m) => (
        <Row
          key={m.month}
          href={`/invoices/month/${m.month}`}
          label={<span className="font-medium">{billingMonthName(m.month)}</span>}
          detail={billingMonthDetail(m)}
        />
      ))}
    </Grouped>
  );
}
