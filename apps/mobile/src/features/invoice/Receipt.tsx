import { useState } from "react";
import { StyleSheet, View } from "react-native";
import {
  CHECK_NUMBER_HINT,
  CHECK_NUMBER_LABEL,
  PAYMENT_METHOD_CHOICES,
  PAYMENT_METHOD_LABEL,
  RECEIPT_CHANNELS,
  RECEIPT_EMAIL_LABEL,
  RECEIPT_NOT_NOW,
  RECEIPT_OFFLINE,
  RECEIPT_PHONE_LABEL,
  RECEIPT_TEXT_HINT,
  SEND_RECEIPT,
  checkNumberError,
  formatPhone,
  parseDollars,
  receiptPrompt,
  receiptRecipientError,
  receiptSentMessage,
  receiptSummary,
  toE164,
  type ManualPaymentMethod,
  type ReceiptChannel,
  friendlyError,
} from "@leakbook/core";
import { ReportServerError, call } from "../../data/reports";
import { getServices } from "../../lib/services";
import { useUnsavedChanges, ModalSheet } from "../../ui/ModalSheet";
import { Button, Field, Notice, Segmented, T } from "../../ui/components";
import { haptic, haptics } from "../../ui/haptics";
import { space } from "../../ui/theme";

// Receipts for cash and check (owner, 2026-10-22: "A receipt for cash or check"), as on the
// website (apps/web/src/components/payment-receipt.tsx): Record Payment says how it was paid,
// then offers Send Receipt; a sent invoice with a payment has Send Receipt too. Recording and
// sending are the server's, so both need a connection.

const dollars = (cents: number) => (cents / 100).toFixed(2);

/** Who the receipt goes to, as the job's customer has them, and whether the shop can text. */
export interface ReceiptContact {
  email: string | null;
  phone: string | null;
  texting: boolean;
}

/** A payment just recorded, for the Send Receipt that follows. */
export interface RecordedPayment {
  paymentId: string;
  /** The invoice's status after it ("paid", "partially_paid"). */
  status: string;
  summary: string;
  message: string;
}

/**
 * Managers: cash, a check (with its number), or anything paid outside Sundeck Pro. The Invoices
 * list's Record Payment opens this same form in a sheet (gestures spec section 12).
 */
export function RecordPayment({
  invoice,
  balance,
  onRecorded,
}: {
  invoice: { id: string; total_cents: number; amount_paid_cents: number };
  balance: number;
  /** Called once the payment is saved, to offer Send Receipt. */
  onRecorded: (r: RecordedPayment) => void;
}) {
  const [amount, setAmount] = useState<string | null>(null);
  const [method, setMethod] = useState<ManualPaymentMethod>("cash");
  const [checkNumber, setCheckNumber] = useState("");
  // An amount typed but not recorded asks before leaving (owner, 2026-10-20).
  useUnsavedChanges(Boolean(amount?.trim()) || Boolean(checkNumber.trim()));
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function record() {
    const cents = parseDollars(amount ?? dollars(balance));
    if (cents === null || cents <= 0) return setErrors({ amount: "Enter an amount like 649." });
    const number = method === "check" ? checkNumber.trim() : "";
    const bad = checkNumberError(number);
    if (bad) return setErrors({ check_number: bad });
    setBusy(true);
    setErrors({});
    try {
      const { supabase, sync } = getServices();
      const { data, error } = await supabase.rpc("record_invoice_payment", {
        target_invoice: invoice.id,
        amount: cents,
        method,
        check_number: number || null,
      });
      if (error) throw new Error(error.message);
      void sync.syncNow();
      const r = data as { status: string; payment_id: string };
      setAmount(null);
      setCheckNumber("");
      haptic("paymentRecorded");
      onRecorded({
        paymentId: r.payment_id,
        status: r.status,
        summary: receiptSummary(
          { amount_cents: cents, method, check_number: number || null },
          {
            total_cents: invoice.total_cents,
            amount_paid_cents: invoice.amount_paid_cents + cents,
          },
        ),
        message: r.status === "paid" ? "Paid in full." : "Payment recorded.",
      });
    } catch (e) {
      const text = e instanceof Error ? e.message : String(e);
      setErrors({
        amount: /network|fetch|connection/i.test(text)
          ? "No connection. Try again when you have signal."
          : friendlyError(text),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.stack}>
      <Field
        label="Amount received ($)"
        keyboardType="decimal-pad"
        value={amount ?? dollars(balance)}
        onChangeText={setAmount}
        hint="A check, cash, or anything paid outside Sundeck Pro."
        error={errors.amount}
      />
      <Segmented
        label={PAYMENT_METHOD_LABEL}
        options={[...PAYMENT_METHOD_CHOICES]}
        value={method}
        onChange={setMethod}
      />
      {method === "check" ? (
        <Field
          label={CHECK_NUMBER_LABEL}
          keyboardType="number-pad"
          value={checkNumber}
          onChangeText={setCheckNumber}
          maxLength={21}
          hint={CHECK_NUMBER_HINT}
          error={errors.check_number}
        />
      ) : null}
      <Button
        title={busy ? "Saving…" : "Record Payment"}
        kind="secondary"
        disabled={busy}
        onPress={() => void record()}
      />
    </View>
  );
}

/** The server sends the receipt (the latest payment when none is named). */
export async function sendReceipt(
  invoiceId: string,
  channel: ReceiptChannel,
  to: string,
  paymentId: string | null,
) {
  return call<{ channel: string; to: string }>(`/api/invoices/${invoiceId}/receipt`, {
    channel,
    to: to.trim(),
    paymentId,
  });
}

/**
 * Send Receipt, as a sheet: Email or Text (Text only when the shop has a company number), the
 * customer's address or number filled in, then Send Receipt or Not Now. Right after Record
 * Payment it says what was recorded first. Offline, it says so and stays open; Send Receipt
 * stays on the invoice for later.
 */
export function SendReceiptSheet({
  visible,
  invoiceId,
  paymentId,
  summary,
  justRecorded,
  contact,
  onClose,
  onSent,
}: {
  visible: boolean;
  invoiceId: string;
  paymentId: string | null;
  summary: string;
  justRecorded: string | null;
  contact: ReceiptContact;
  onClose: () => void;
  onSent: (message: string) => void;
}) {
  const [channel, setChannel] = useState<ReceiptChannel>(
    !contact.email && contact.texting && contact.phone ? "text" : "email",
  );
  const [email, setEmail] = useState(contact.email ?? "");
  const [phone, setPhone] = useState(
    contact.phone ? formatPhone(toE164(contact.phone) ?? contact.phone) : "",
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const to = channel === "email" ? email : phone;

  async function send() {
    const problem = receiptRecipientError(channel, to);
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    try {
      await sendReceipt(invoiceId, channel, to, paymentId);
      haptics.success();
      onSent(receiptSentMessage(channel, to));
    } catch (e) {
      setError(
        e instanceof ReportServerError && e.status === null && /connection/i.test(e.message)
          ? RECEIPT_OFFLINE
          : friendlyError(e),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalSheet visible={visible} onClose={onClose} title={SEND_RECEIPT}>
      <View style={styles.stack} testID="send-receipt">
        <View style={styles.center}>
          {justRecorded ? (
            <T variant="bodyEmphasis" style={styles.centerText}>
              {receiptPrompt({ status: justRecorded })}
            </T>
          ) : null}
          <T variant="secondary" muted style={styles.centerText}>
            {summary}
          </T>
        </View>
        {contact.texting ? (
          <Segmented
            label="Send by"
            options={[...RECEIPT_CHANNELS]}
            value={channel}
            onChange={(c) => {
              setChannel(c);
              setError(null);
            }}
          />
        ) : null}
        {channel === "email" ? (
          <Field
            key="email"
            label={RECEIPT_EMAIL_LABEL}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            value={email}
            onChangeText={setEmail}
            hint="Their other emails get it too."
          />
        ) : (
          <Field
            key="phone"
            label={RECEIPT_PHONE_LABEL}
            keyboardType="phone-pad"
            value={phone}
            onChangeText={setPhone}
            hint={RECEIPT_TEXT_HINT}
          />
        )}
        {error ? <Notice tone="error">{error}</Notice> : null}
        <Button
          title={busy ? "Sending…" : SEND_RECEIPT}
          disabled={busy}
          onPress={() => void send()}
        />
        <Button title={RECEIPT_NOT_NOW} kind="secondary" disabled={busy} onPress={onClose} />
      </View>
    </ModalSheet>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space[3] },
  center: { alignItems: "center", gap: space[1] },
  centerText: { textAlign: "center" },
});
