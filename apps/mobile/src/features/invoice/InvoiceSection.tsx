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
import {
  AmountRow,
  Block,
  Button,
  Card,
  FieldGroup,
  FieldRow,
  Group,
  Notice,
  Pill,
  Row,
  Section,
  T,
} from "../../ui/components";
import { INVOICE_STATUS_COLOR, ios, space } from "../../ui/theme";

/** Send by Email and Send by Text share one row (Android). */
const halfButton: ViewStyle = { flex: 1, paddingHorizontal: space["2"] };

/** On iPhone, text outside grouped blocks lines up with the rows' text. */
const inset = ios ? { paddingHorizontal: space["4"] } : null;

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
      <Section title="Invoice" grouped>
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

  const heading = (
    <Row style={[{ justifyContent: "space-between" }, inset]}>
      <T variant="heading" style={{ flexShrink: 1 }}>{`#${invoice.number ?? ""}`}</T>
      <Pill
        label={INVOICE_STATUS_LABELS[invoice.status]}
        color={INVOICE_STATUS_COLOR[invoice.status]}
      />
    </Row>
  );
  const taxNote =
    totals.tax_cents > 0 ? `Includes ${formatCents(totals.tax_cents)} tax` : undefined;
  const lineLabel = (l: (typeof invoice.lines)[number]) =>
    `${l.description}${l.quantity !== 1 ? ` × ${l.quantity}` : ""}`;
  const sendButtons = [
    <Button
      key="email"
      title="Send by Email"
      style={ios ? undefined : halfButton}
      loading={busy === "email"}
      disabled={busy !== null || !reportsOnline}
      onPress={() => void run("email")}
    />,
    <Button
      key="text"
      title="Send by Text"
      kind="secondary"
      style={ios ? undefined : halfButton}
      loading={busy === "text"}
      disabled={busy !== null || !reportsOnline}
      onPress={() => void run("text")}
    />,
  ];

  return (
    <Section title="Invoice" grouped>
      {ios ? (
        // iPhone: number and status, then lines and the total as a grouped list.
        <>
          {heading}
          <Group>
            {invoice.lines.map((l) => (
              <AmountRow key={l.id} label={lineLabel(l)} value={formatCents(lineTotal(l))} />
            ))}
            <AmountRow label="Total" value={formatCents(totals.total_cents)} strong />
            {!draft ? (
              <AmountRow
                label={invoice.status === "paid" ? "Paid in full" : "Balance due"}
                value={invoice.status === "paid" ? undefined : formatCents(balance)}
                strong
              />
            ) : null}
          </Group>
          {taxNote ? (
            <T variant="muted" style={inset}>
              {taxNote}
            </T>
          ) : null}
        </>
      ) : (
        <Card>
          <Row style={{ justifyContent: "space-between" }}>
            {heading}
            <T variant="strong">{formatCents(totals.total_cents)}</T>
          </Row>
          {invoice.lines.map((l) => (
            <Row key={l.id} style={{ justifyContent: "space-between" }}>
              <T variant="small" style={{ flex: 1 }}>
                {lineLabel(l)}
              </T>
              <T variant="small">{formatCents(lineTotal(l))}</T>
            </Row>
          ))}
          {taxNote ? <T variant="muted">{taxNote}</T> : null}
          {!draft ? (
            <T variant="strong">
              {invoice.status === "paid" ? "Paid in full" : `Balance due ${formatCents(balance)}`}
            </T>
          ) : null}
        </Card>
      )}

      {draft ? (
        <Block note="Sending locks the invoice. To change lines, use the office view before sending.">
          {/* The customer's address, so iPhone doesn't offer to fill in the tech's own. */}
          <FieldGroup>
            <FieldRow
              label="Customer email"
              layout="stacked"
              value={to ?? customer?.email ?? ""}
              onChangeText={setTo}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              autoComplete="off"
              textContentType="none"
              returnKeyType="done"
            />
          </FieldGroup>
          {ios ? sendButtons : <Row style={{ gap: space["2"] }}>{sendButtons}</Row>}
        </Block>
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
