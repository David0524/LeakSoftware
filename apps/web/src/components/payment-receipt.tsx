"use client";

import { useState, useTransition } from "react";
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
  formatPhone,
  receiptPrompt,
  receiptRecipientError,
  toE164,
  type ManualPaymentMethod,
  type ReceiptChannel,
} from "@leakbook/core";
import { recordPaymentAction, sendReceiptAction } from "@/app/actions/invoices";
import { Segmented } from "./segmented";
import { Sheet } from "./sheet";
import { showBanner } from "./top-banner";
import { Button, Field } from "./ui";

// Receipts for cash and check (owner, 2026-10-22: "A receipt for cash or check"): Record
// Payment says how it was paid, then offers Send Receipt; a sent invoice with a payment has
// Send Receipt too. Shared by the job page's invoice and the Invoices list.

/** Who the receipt goes to, as the job's customer has them, and whether the shop can text. */
export interface ReceiptContact {
  email: string | null;
  phone: string | null;
  /** The shop has a working company number. */
  texting: boolean;
}

/** Record Payment's fields: amount, Paid by (Cash | Check | Other), and a check's number. */
export function RecordPaymentFields({
  balance,
  errors,
  autoFocus = false,
}: {
  balance: number;
  errors?: Record<string, string>;
  autoFocus?: boolean;
}) {
  const [method, setMethod] = useState<ManualPaymentMethod>("cash");
  return (
    <div className="space-y-4">
      <Field
        label="Amount received ($)"
        name="amount"
        inputMode="decimal"
        defaultValue={(balance / 100).toFixed(2)}
        hint="A check, cash, or anything paid outside Sundeck Pro."
        error={errors?.amount}
        autoFocus={autoFocus}
      />
      <Segmented
        label={PAYMENT_METHOD_LABEL}
        name="method"
        value={method}
        options={[...PAYMENT_METHOD_CHOICES]}
        onChange={setMethod}
      />
      {method === "check" ? (
        <Field
          label={CHECK_NUMBER_LABEL}
          name="check_number"
          inputMode="numeric"
          autoComplete="off"
          maxLength={21}
          hint={CHECK_NUMBER_HINT}
          error={errors?.check_number}
        />
      ) : null}
    </div>
  );
}

export interface RecordedPayment {
  paymentId: string;
  status: string;
  message: string;
}

/** Saves Record Payment's form; the result names the payment, for Send Receipt. */
export async function recordPayment(
  form: FormData,
): Promise<{ recorded: RecordedPayment } | { errors: Record<string, string> }> {
  if (typeof navigator !== "undefined" && !navigator.onLine)
    return { errors: { amount: "No connection. Try again when you’re back online." } };
  const r = await recordPaymentAction({}, form);
  if (r.fields || r.error || !r.recorded) return { errors: r.fields ?? { amount: r.error ?? "" } };
  return { recorded: { ...r.recorded, message: r.message ?? "Payment recorded." } };
}

/**
 * Send Receipt, as a sheet: Email or Text (Text only when the shop has a company number), the
 * customer's address or number filled in, then Send Receipt or Not Now. Right after Record
 * Payment it opens on its own and says what was recorded.
 */
export function SendReceiptSheet({
  invoiceId,
  jobId,
  paymentId,
  summary,
  justRecorded,
  contact,
  onClose,
}: {
  invoiceId: string;
  jobId: string;
  /** The payment just recorded; otherwise the latest received. */
  paymentId?: string | null;
  /** "$200.00 · Check #1234 · Balance remaining $449.00" */
  summary: string;
  /** The invoice's status after a payment just recorded. */
  justRecorded?: string | null;
  contact: ReceiptContact;
  onClose: () => void;
}) {
  const [channel, setChannel] = useState<ReceiptChannel>(
    !contact.email && contact.texting && contact.phone ? "text" : "email",
  );
  const [email, setEmail] = useState(contact.email ?? "");
  const phoneStart = contact.phone ? formatPhone(toE164(contact.phone) ?? contact.phone) : "";
  const [phone, setPhone] = useState(phoneStart);
  const [error, setError] = useState<string | undefined>();
  const [pending, start] = useTransition();
  const to = channel === "email" ? email : phone;

  function send() {
    const problem = receiptRecipientError(channel, to);
    if (problem) return setError(problem);
    if (typeof navigator !== "undefined" && !navigator.onLine) return setError(RECEIPT_OFFLINE);
    const form = new FormData();
    form.set("invoice", invoiceId);
    form.set("job", jobId);
    form.set("channel", channel);
    form.set("to", to.trim());
    if (paymentId) form.set("payment", paymentId);
    start(async () => {
      const r = await sendReceiptAction({}, form);
      const failed = r.fields?.to ?? r.error;
      if (failed) return setError(failed);
      onClose();
      showBanner({ tone: "success", message: r.message ?? "Receipt sent." });
    });
  }

  return (
    <Sheet open onClose={onClose} title={SEND_RECEIPT}>
      <form
        className="space-y-4"
        data-testid="send-receipt"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <div className="text-center">
          {justRecorded ? (
            <p className="font-semibold">{receiptPrompt({ status: justRecorded })}</p>
          ) : null}
          <p className="text-[0.9375rem] text-text-muted tabular-nums">{summary}</p>
        </div>
        {contact.texting ? (
          <Segmented
            label="Send by"
            name="channel"
            value={channel}
            options={[...RECEIPT_CHANNELS]}
            onChange={(c) => {
              setChannel(c);
              setError(undefined);
            }}
          />
        ) : null}
        {channel === "email" ? (
          <Field
            key="email"
            label={RECEIPT_EMAIL_LABEL}
            name="to"
            type="email"
            autoComplete="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            hint="Their other emails get it too."
            error={error}
          />
        ) : (
          <Field
            key="phone"
            label={RECEIPT_PHONE_LABEL}
            name="to"
            type="tel"
            autoComplete="off"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            hint={RECEIPT_TEXT_HINT}
            error={error}
          />
        )}
        <div className="space-y-2">
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? "Sending…" : SEND_RECEIPT}
          </Button>
          <Button
            type="button"
            kind="secondary"
            className="w-full"
            disabled={pending}
            onClick={onClose}
          >
            {RECEIPT_NOT_NOW}
          </Button>
        </div>
      </form>
    </Sheet>
  );
}
