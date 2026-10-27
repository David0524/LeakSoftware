import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  INVOICE_STATUS_LABELS,
  SEND_RECEIPT,
  canSendReceipt,
  formatCents,
  latestReceiptPayment,
  paymentMethodLabel,
  parseDollars,
  receiptSummary,
  jobFeeLabel,
  invoiceBalance,
  invoiceShareText,
  invoiceTotals,
  canRecordPayment,
  isManagerRole,
  lineTotal,
  type Customer,
  type Job,
  friendlyError,
} from "@leakbook/core";
import {
  createJobInvoice,
  sendJobInvoice,
  useJobInvoices,
  type JobInvoice,
} from "../../data/invoices";
import { reportsOnline } from "../../data/reports";
import { API_URL } from "../../lib/config";
import { getServices } from "../../lib/services";
import { useCompany, useSession } from "../../state/session";
import { Button, Card, Empty, Field, Notice, T, Toggle } from "../../ui/components";
import { confirmDestructive } from "../../ui/confirm";
import { parseLineQuantity } from "../../lib/lineQuantity";
import { discountTooLarge, lineDescriptionError } from "../../lib/limits";
import { haptics } from "../../ui/haptics";
import { color, face, MAX_TEXT_SCALE, space, tabular } from "../../ui/theme";
import { Divider } from "../report/ReportTab";
import { DateField } from "../schedule/DateField";
import { LinkRow } from "../quote/QuoteTab";
import { DraftNote } from "../../ui/DraftNote";
import { useUnsavedChanges } from "../../ui/ModalSheet";
import { useDraft } from "../../ui/useDraft";
import { useLine } from "../../data/texting";
import { RecordPayment, SendReceiptSheet } from "./Receipt";
import { shareLink } from "../../lib/shareLink";

const INVOICEABLE = ["in_progress", "report_sent", "quote_sent", "quote_accepted", "invoiced"];

const PAYMENT_STATUS: Record<string, string> = {
  pending: "processing",
  succeeded: "received",
  failed: "failed",
  refunded: "refunded",
};

const dollars = (cents: number) => (cents / 100).toFixed(2);

type Message = { tone: "success" | "error"; text: string } | null;

/**
 * Invoice (spec 5.4 Wrap-Up), as on the website: Create Invoice once the job has started (the
 * server builds it from the fee or the accepted quote); a draft's lines, Add a Line, Details
 * and Send; a sent invoice's payments, customer link, Record Payment (anyone on the team, techs
 * too, 2026-10-22) and Void Invoice for managers. Lines and details are saved through the sync layer; creating, sending, payments
 * and void are the server's.
 */
export function InvoiceSection({ job, customer }: { job: Job; customer: Customer | undefined }) {
  const company = useCompany();
  const invoices = useJobInvoices(company.id, job.id);
  const current = invoices.find((i) => i.status !== "void");
  const voided = invoices.filter((i) => i.status === "void");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);

  async function create() {
    setBusy(true);
    setMessage(null);
    try {
      await createJobInvoice(job.id);
      setMessage({ tone: "success", text: "Invoice drafted. Check it, then send it." });
    } catch (e) {
      setMessage({ tone: "error", text: friendlyError(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.stack}>
      {current ? (
        <InvoiceCard invoice={current} customer={customer} />
      ) : job.type === "maintenance" ? (
        <Empty>
          {job.billed_invoice_id
            ? "This visit is on the customer’s monthly invoice. Find it on the Invoices page."
            : "Finished visits are billed once a month, one invoice per customer, from the Invoices page."}
        </Empty>
      ) : INVOICEABLE.includes(job.status) ? (
        <Card style={styles.stack}>
          <T muted>
            {job.type === "repair"
              ? "Copies the accepted quote and credits the deposit already paid. You can change it before sending."
              : job.fee_cents
                ? `Bills the ${jobFeeLabel(job.type).toLowerCase()} of ${formatCents(job.fee_cents)}. You can add lines before sending.`
                : "Starts an empty invoice. Add the lines before sending."}
          </T>
          <Button
            title={busy ? "Creating…" : "Create Invoice"}
            kind="secondary"
            disabled={busy || !reportsOnline}
            onPress={() => void create()}
          />
          {!reportsOnline ? <Notice>Invoices need the Sundeck Pro server.</Notice> : null}
          {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
        </Card>
      ) : (
        <Empty>Start the job before invoicing it.</Empty>
      )}
      {voided.length ? (
        <T variant="secondary" muted>
          {`Voided: ${voided.map((i) => `#${i.number ?? ""} (${formatCents(i.total_cents)})`).join(", ")}`}
        </T>
      ) : null}
    </View>
  );
}

function InvoiceCard({ invoice, customer }: { invoice: JobInvoice; customer?: Customer }) {
  const company = useCompany();
  const { services, membership } = useSession();
  const manager = isManagerRole(membership?.role);
  const rate = company.settings.tax_rate_bps ?? 0;
  const draft = invoice.status === "draft";
  const totals = draft ? invoiceTotals(invoice.lines, invoice.discount_cents, rate) : invoice;
  const balance = invoiceBalance(invoice);
  const hasPayments = invoice.payments.some(
    (p) => p.status === "succeeded" || p.status === "pending",
  );
  const link = invoice.token && API_URL ? `${API_URL}/i/${invoice.token}` : null;
  // Send Receipt (2026-10-22): right after Record Payment (that payment), or the latest.
  const [receipt, setReceipt] = useState<{
    paymentId: string | null;
    status: string | null;
    summary: string;
  } | null>(null);
  const line = useLine(company.id);
  const [sent, setSent] = useState<string | null>(null);

  function removeLine(id: string) {
    services.sync.write("invoice_line_item", id, company.id, {
      deleted_at: new Date().toISOString(),
    });
  }

  return (
    <Card style={styles.card}>
      <View style={styles.titleRow}>
        <T variant="cardTitle" style={{ flexShrink: 1 }}>
          {`Invoice${invoice.number ? ` #${invoice.number}` : ""} · ${INVOICE_STATUS_LABELS[invoice.status]}`}
        </T>
        <Text style={[styles.total, { color: color.text }]} maxFontSizeMultiplier={MAX_TEXT_SCALE}>
          {formatCents(totals.total_cents)}
        </Text>
      </View>

      <View>
        {invoice.lines.map((l, i) => (
          <View key={l.id}>
            {i > 0 ? <Divider /> : null}
            <View style={styles.line}>
              <T style={{ flex: 1 }}>
                {`${l.description}${l.quantity !== 1 ? ` × ${l.quantity}` : ""}`}
                {l.kind === "item" && !l.taxable && rate > 0 ? (
                  <T variant="secondary" muted>
                    {" · no tax"}
                  </T>
                ) : null}
              </T>
              <T style={tabular}>{formatCents(lineTotal(l))}</T>
              {draft && l.kind === "item" ? (
                <Button
                  title="Remove"
                  kind="quiet"
                  small
                  onPress={() =>
                    confirmDestructive({
                      title: `Remove “${l.description}” from the invoice?`,
                      confirm: "Remove Line",
                      onConfirm: () => removeLine(l.id),
                    })
                  }
                />
              ) : null}
            </View>
          </View>
        ))}
      </View>

      <View style={styles.totals}>
        <Divider />
        <Amount label="Subtotal" value={formatCents(totals.subtotal_cents)} />
        {totals.discount_cents > 0 ? (
          <Amount label="Discount" value={`−${formatCents(totals.discount_cents)}`} />
        ) : null}
        {totals.tax_cents > 0 ? <Amount label="Tax" value={formatCents(totals.tax_cents)} /> : null}
        {totals.credit_cents > 0 ? (
          <Amount label="Deposit paid" value={`−${formatCents(totals.credit_cents)}`} />
        ) : null}
        <Amount label="Total" value={formatCents(totals.total_cents)} strong />
        {!draft ? (
          <>
            <Amount label="Paid" value={formatCents(invoice.amount_paid_cents)} />
            <Amount label="Balance due" value={formatCents(balance)} strong />
          </>
        ) : null}
      </View>

      {receipt ? (
        <SendReceiptSheet
          visible
          invoiceId={invoice.id}
          paymentId={receipt.paymentId}
          summary={receipt.summary}
          justRecorded={receipt.status}
          contact={{
            email: customer?.email ?? null,
            phone: customer?.phone ?? null,
            texting: line?.status === "active",
          }}
          onClose={() => setReceipt(null)}
          onSent={(message) => {
            setReceipt(null);
            setSent(message);
          }}
        />
      ) : null}
      {draft ? (
        <DraftParts invoice={invoice} customer={customer} />
      ) : (
        <View style={styles.stack}>
          {invoice.payments.length ? (
            <View style={{ gap: 4 }}>
              {invoice.payments.map((p) => (
                <T key={p.id} variant="secondary">
                  {`${formatCents(p.amount_cents)} · ${paymentMethodLabel(p.method, p.check_number, "office")} · ${PAYMENT_STATUS[p.status] ?? p.status}${
                    p.paid_at
                      ? ` · ${new Date(p.paid_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
                      : ""
                  }`}
                </T>
              ))}
            </View>
          ) : null}
          {link && invoice.status !== "void" ? (
            <LinkRow url={link} message={invoiceShareText(company.name, link)} />
          ) : null}
          {canRecordPayment(membership?.role, invoice) ? (
            <RecordPayment
              invoice={invoice}
              balance={balance}
              onRecorded={(r) => {
                setSent(r.message);
                setReceipt({ paymentId: r.paymentId, status: r.status, summary: r.summary });
              }}
            />
          ) : null}
          {canSendReceipt(invoice, invoice.payments) ? (
            <Button
              title={SEND_RECEIPT}
              kind="secondary"
              onPress={() => {
                setSent(null);
                const p = latestReceiptPayment(invoice.payments);
                setReceipt({
                  paymentId: null,
                  status: null,
                  summary: p ? receiptSummary(p, invoice) : "",
                });
              }}
            />
          ) : null}
          {sent ? <Notice tone="success">{sent}</Notice> : null}
          {manager && !hasPayments && invoice.status !== "void" ? (
            <VoidButton
              invoiceId={invoice.id}
              title="Void Invoice"
              question="Void this invoice? The customer's link will show it as void."
            />
          ) : null}
        </View>
      )}
    </Card>
  );
}

function Amount({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <View style={styles.amount}>
      <T variant="secondary" style={strong && face.bold}>
        {label}
      </T>
      <T variant="secondary" style={[tabular, strong && face.bold]}>
        {value}
      </T>
    </View>
  );
}

/** A draft: Add a Line, Details, Send, then Delete Draft. */
function DraftParts({ invoice, customer }: { invoice: JobInvoice; customer?: Customer }) {
  const company = useCompany();
  const { services } = useSession();
  const sync = services.sync;
  const [line, setLine] = useState({ description: "", quantity: "1", price: "", taxable: true });
  const [lineErrors, setLineErrors] = useState<Record<string, string>>({});
  const [discount, setDiscount] = useState(
    invoice.discount_cents ? dollars(invoice.discount_cents) : "",
  );
  const [due, setDue] = useState(invoice.due_date ?? "");
  const [notes, setNotes] = useState(invoice.notes ?? "");
  const [detailsMessage, setDetailsMessage] = useState<Message>(null);
  const [to, setTo] = useState<string | null>(null);
  const email = (to ?? customer?.email ?? "").trim();
  const [busy, setBusy] = useState<"email" | "link" | null>(null);
  const [sendMessage, setSendMessage] = useState<Message>(null);
  // The typed text is kept as drafts until the line is added or the details saved (owner,
  // 2026-10-27).
  const lineDraft = useDraft({
    form: "invoice-line",
    id: invoice.id,
    fields: { description: line.description, price: line.price },
    restore: (c) => setLine((l) => ({ ...l, ...c })),
  });
  const detailsDraft = useDraft({
    form: "invoice-details",
    id: invoice.id,
    fields: { notes },
    restore: (c) => {
      if (c.notes !== undefined) setNotes(c.notes);
    },
  });
  // A line or details typed but not added or saved ask before leaving (owner, 2026-10-20).
  useUnsavedChanges(
    Boolean(line.description.trim() || line.price.trim()) ||
      (line.quantity.trim() !== "1" && line.quantity.trim() !== "") ||
      (discount.trim() ? parseDollars(discount) : 0) !== (invoice.discount_cents ?? 0) ||
      due.trim() !== (invoice.due_date ?? "") ||
      notes.trim() !== (invoice.notes ?? "").trim(),
    {
      clear: () => {
        lineDraft.clear();
        detailsDraft.clear();
      },
    },
  );

  function addLine() {
    const quantity = parseLineQuantity(line.quantity);
    const price = parseDollars(line.price);
    const errors: Record<string, string> = {};
    const described = lineDescriptionError(line.description);
    if (described) errors.description = described;
    if (quantity === null) errors.quantity = "Enter a quantity like 1 or 2.5.";
    if (price === null || price < 0) errors.price = "Enter a price like 125.";
    setLineErrors(errors);
    if (Object.keys(errors).length) return;
    sync.insert("invoice_line_item", company.id, {
      invoice_id: invoice.id,
      kind: "item",
      description: line.description.trim(),
      quantity,
      unit_price_cents: price,
      taxable: line.taxable,
      sort_order: invoice.lines.filter((l) => l.kind === "item").length + 1,
    });
    setLine({ description: "", quantity: "1", price: "", taxable: true });
    lineDraft.clear();
    haptics.success();
  }

  function saveDetails() {
    const cents = discount.trim() ? parseDollars(discount) : 0;
    if (cents === null || cents < 0)
      return setDetailsMessage({
        tone: "error",
        text: "Enter an amount like 50, or leave it empty.",
      });
    const tooLarge = discountTooLarge(cents, invoiceTotals(invoice.lines, 0, 0).subtotal_cents);
    if (tooLarge) return setDetailsMessage({ tone: "error", text: tooLarge });
    if (due.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(due.trim()))
      return setDetailsMessage({ tone: "error", text: "Enter the due date like 2026-11-01." });
    sync.write("invoice", invoice.id, company.id, {
      discount_cents: cents,
      due_date: due.trim() || null,
      notes: notes.trim() || null,
    });
    setDetailsMessage({ tone: "success", text: "Saved." });
    detailsDraft.clear();
    haptics.success();
  }

  async function send(channel: "email" | "link") {
    setBusy(channel);
    setSendMessage(null);
    try {
      if (channel === "email" && !/^\S+@\S+\.\S+$/.test(email))
        throw new Error("Enter the customer’s email.");
      const r = await sendJobInvoice(
        invoice.id,
        channel === "email" ? "email" : "sms_device",
        channel === "email" ? email : (customer?.phone ?? null),
      );
      if (channel === "link") {
        await shareLink(r.message);
        setSendMessage({
          tone: "success",
          text: "Invoice sent. Share the link with the customer.",
        });
      } else setSendMessage({ tone: "success", text: `Sent to ${email}.` });
    } catch (e) {
      setSendMessage({ tone: "error", text: friendlyError(e) });
    } finally {
      setBusy(null);
    }
  }

  return (
    <View style={styles.parts}>
      <View style={styles.stack}>
        <DraftNote draft={lineDraft} />
        <T variant="subHeading">Add a Line</T>
        <Field
          label="Description"
          value={line.description}
          onChangeText={(v) => setLine((l) => ({ ...l, description: v }))}
          error={lineErrors.description}
        />
        <View style={styles.pair}>
          <View style={{ flex: 1 }}>
            <Field
              label="Quantity"
              keyboardType="decimal-pad"
              value={line.quantity}
              onChangeText={(v) => setLine((l) => ({ ...l, quantity: v }))}
              error={lineErrors.quantity}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Field
              label="Price ($)"
              keyboardType="decimal-pad"
              value={line.price}
              onChangeText={(v) => setLine((l) => ({ ...l, price: v }))}
              error={lineErrors.price}
            />
          </View>
        </View>
        <Toggle
          label="Taxable"
          value={line.taxable}
          onChange={(v) => setLine((l) => ({ ...l, taxable: v }))}
        />
        <Button title="Add Line" kind="secondary" onPress={addLine} />
      </View>

      <View style={styles.stack}>
        <T variant="subHeading">Details</T>
        <View style={styles.pair}>
          <View style={{ flex: 1 }}>
            <Field
              label="Discount ($)"
              keyboardType="decimal-pad"
              value={discount}
              onChangeText={setDiscount}
            />
          </View>
          <View style={{ flex: 1 }}>
            <DateField
              label="Due date"
              value={due}
              onChange={setDue}
              placeholder="On receipt"
              hint="Empty: due on receipt."
              clearLabel="Due on Receipt"
            />
          </View>
        </View>
        <DraftNote draft={detailsDraft} />
        <Field label="Note to the customer" value={notes} onChangeText={setNotes} multiline />
        <View style={styles.row}>
          <Button title="Save" kind="secondary" onPress={saveDetails} />
          {detailsMessage ? (
            <T
              variant="secondary"
              style={{ color: detailsMessage.tone === "error" ? color.fail : color.pass }}
            >
              {detailsMessage.text}
            </T>
          ) : null}
        </View>
      </View>

      <View style={styles.stack}>
        <T variant="subHeading">Send</T>
        <Field
          label="Customer email"
          value={to ?? customer?.email ?? ""}
          onChangeText={setTo}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          autoComplete="off"
          textContentType="none"
          hint="Their other emails get it too."
        />
        <View style={styles.row}>
          <Button
            title={busy === "email" ? "Sending…" : "Send by Email"}
            disabled={busy !== null || !reportsOnline}
            onPress={() => void send("email")}
          />
          <Button
            title="Send Without Email"
            kind="secondary"
            disabled={busy !== null || !reportsOnline}
            onPress={() => void send("link")}
          />
        </View>
        <T variant="secondary" muted>
          Sending locks the invoice.
        </T>
        {sendMessage ? <Notice tone={sendMessage.tone}>{sendMessage.text}</Notice> : null}
      </View>

      <VoidButton
        invoiceId={invoice.id}
        title="Delete Draft"
        question="Delete this draft invoice?"
      />
    </View>
  );
}

export { RecordPayment } from "./Receipt";

/** The server voids the invoice (or deletes a draft); it syncs down. */
export async function voidInvoice(invoiceId: string) {
  const { supabase, sync } = getServices();
  const { error } = await supabase.rpc("void_invoice", { target_invoice: invoiceId });
  if (error) throw new Error(error.message);
  await sync.syncNow();
}

/** Void Invoice (sent) or Delete Draft: the server voids it, after asking. */
function VoidButton({
  invoiceId,
  title,
  question,
}: {
  invoiceId: string;
  title: string;
  question: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <View style={styles.stack}>
      <Button
        title={title}
        kind="danger"
        disabled={busy}
        onPress={() =>
          confirmDestructive({
            title: question,
            confirm: title,
            onConfirm: () => {
              setBusy(true);
              setError(null);
              voidInvoice(invoiceId)
                .catch((e: unknown) => setError(friendlyError(e)))
                .finally(() => setBusy(false));
            },
          })
        }
      />
      {error ? <Notice tone="error">{error}</Notice> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space["3"] },
  card: { gap: space["3"] },
  parts: { gap: space["6"], marginTop: space["2"] },
  titleRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "baseline",
    justifyContent: "space-between",
    columnGap: space["3"],
  },
  total: { ...face.semiBold, fontSize: 20, lineHeight: 28, fontVariant: ["tabular-nums"] },
  line: {
    flexDirection: "row",
    alignItems: "center",
    gap: space["2"],
    paddingVertical: space["2"],
  },
  totals: { gap: 4 },
  amount: { flexDirection: "row", justifyContent: "space-between", gap: space["4"] },
  pair: { flexDirection: "row", gap: space["3"] },
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space["3"] },
});
