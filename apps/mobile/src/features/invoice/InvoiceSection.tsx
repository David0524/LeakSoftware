import { useState } from "react";
import { Share, type ViewStyle } from "react-native";
import {
  INVOICE_STATUS_LABELS,
  formatCents,
  invoiceBalance,
  invoiceShareText,
  invoiceTotals,
  lineTotal,
  type Customer,
  type Job,
} from "@leakbook/core";
import { createJobInvoice, sendJobInvoice, useJobInvoices } from "../../data/invoices";
import { reportsOnline } from "../../data/reports";
import { API_URL } from "../../lib/config";
import { useCompany } from "../../state/session";
import { Button, Card, Field, Notice, Row, Section, T } from "../../ui/components";
import { space } from "../../ui/theme";

/** Send by Email and Send by Text share one row. */
const halfButton: ViewStyle = { flex: 1, paddingHorizontal: space["2"] };

const INVOICEABLE = ["in_progress", "report_sent", "quote_sent", "quote_accepted", "invoiced"];

/** Invoice the job once the work is done: the server builds it, the tech sends it (M9). */
export function InvoiceSection({ job, customer }: { job: Job; customer: Customer | undefined }) {
  const company = useCompany();
  const invoices = useJobInvoices(company.id, job.id);
  const invoice = invoices.find((i) => i.status !== "void");
  const [to, setTo] = useState<string | null>(null);
  const [busy, setBusy] = useState<"create" | "email" | "text" | "share" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const email = (to ?? customer?.email ?? "").trim();

  if (!invoice && !INVOICEABLE.includes(job.status)) return null;

  async function run(kind: "create" | "email" | "text" | "share") {
    setBusy(kind);
    setError(null);
    setMessage(null);
    try {
      if (kind === "create") {
        await createJobInvoice(job.id);
        setMessage("Invoice ready. Check it, then send it.");
      } else if (kind === "share") {
        if (invoice?.token && API_URL)
          await Share.share({
            message: invoiceShareText(company.name, `${API_URL}/i/${invoice.token}`),
          });
      } else {
        if (kind === "email" && !/^\S+@\S+\.\S+$/.test(email))
          throw new Error("Enter the customer’s email.");
        const r = await sendJobInvoice(
          invoice!.id,
          kind === "email" ? "email" : "sms_device",
          kind === "email" ? email : (customer?.phone ?? null),
        );
        if (kind === "text") {
          await Share.share({ message: r.message });
          setMessage("Invoice sent.");
        } else {
          setMessage(`Sent to ${email}.`);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  if (!invoice) {
    return (
      <Section title="Invoice">
        <Card>
          <T variant="muted">
            {job.type === "repair"
              ? "Copies the accepted quote and credits the deposit already paid."
              : job.fee_cents
                ? `Bills the detection fee of ${formatCents(job.fee_cents)}.`
                : "No detection fee is set. The office can add lines before sending."}
          </T>
          <Button
            title="Create Invoice"
            kind="secondary"
            loading={busy === "create"}
            disabled={busy !== null || !reportsOnline}
            onPress={() => void run("create")}
          />
          {!reportsOnline ? <Notice>Invoices need the Tidemark server.</Notice> : null}
          {error ? <Notice tone="error">{error}</Notice> : null}
        </Card>
      </Section>
    );
  }

  const rate = company.settings.tax_rate_bps ?? 0;
  const draft = invoice.status === "draft";
  const totals = draft ? invoiceTotals(invoice.lines, invoice.discount_cents, rate) : invoice;
  const balance = invoiceBalance(invoice);

  return (
    <Section title="Invoice">
      <Card>
        <Row style={{ justifyContent: "space-between" }}>
          <T variant="heading">
            #{invoice.number ?? ""} · {INVOICE_STATUS_LABELS[invoice.status]}
          </T>
          <T variant="strong">{formatCents(totals.total_cents)}</T>
        </Row>
        {invoice.lines.map((l) => (
          <Row key={l.id} style={{ justifyContent: "space-between" }}>
            <T variant="small" style={{ flex: 1 }}>
              {l.description}
              {l.quantity !== 1 ? ` × ${l.quantity}` : ""}
            </T>
            <T variant="small">{formatCents(lineTotal(l))}</T>
          </Row>
        ))}
        {totals.tax_cents > 0 ? (
          <T variant="muted">Includes {formatCents(totals.tax_cents)} tax</T>
        ) : null}
        {!draft ? (
          <T variant="strong">
            {invoice.status === "paid" ? "Paid in full" : `Balance due ${formatCents(balance)}`}
          </T>
        ) : null}
      </Card>

      {draft ? (
        <Card>
          <T variant="muted">
            Sending locks the invoice. To change lines, use the office view before sending.
          </T>
          <Field
            label="Customer email"
            value={to ?? customer?.email ?? ""}
            onChangeText={setTo}
            keyboardType="email-address"
            autoCapitalize="none"
            textContentType="emailAddress"
          />
          <Row style={{ gap: space["2"] }}>
            <Button
              title="Send by Email"
              style={halfButton}
              loading={busy === "email"}
              disabled={busy !== null || !reportsOnline}
              onPress={() => void run("email")}
            />
            <Button
              title="Send by Text"
              kind="secondary"
              style={halfButton}
              loading={busy === "text"}
              disabled={busy !== null || !reportsOnline}
              onPress={() => void run("text")}
            />
          </Row>
        </Card>
      ) : invoice.token && invoice.status !== "paid" ? (
        <Button
          title="Share Payment Link"
          kind="secondary"
          loading={busy === "share"}
          disabled={busy !== null}
          onPress={() => void run("share")}
        />
      ) : null}
      {message ? <Notice>{message}</Notice> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
    </Section>
  );
}
