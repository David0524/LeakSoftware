"use client";

import { useActionState, useRef, useState, startTransition } from "react";
import {
  AUTOPAY_TEXT,
  autopayGroupFooter,
  autopayInvoiceLine,
  autopayStatus,
  chargeConfirm,
  savedMethodDetail,
  savedMethodLabel,
  type AutopayInvoice,
  type SavedMethod,
} from "@leakbook/core";
import { autopayAction, chargeCardAction, type AutopayState } from "@/app/actions/autopay";
import type { FormState } from "@/app/actions/auth";
import { orOffline } from "@/lib/offline";
import { Banner } from "./doc-ui";
import { CopyLink } from "./settings-forms";
import { SheetRow, useSheetNotice } from "./settings-list";
import { useConfirm } from "./sheet";
import { Button, Grouped, Row, cx } from "./ui";

// Autopay (docs/design/2026-11-16-autopay.md): the customer page's Autopay group, and Charge
// Card on File on an invoice. The apps draw the same rows with the same words.

const ROW_BUTTON =
  "flex min-h-11 w-full items-center px-4 py-2.5 text-left active:bg-text/[0.06] hover:bg-text/[0.03] disabled:opacity-50";

/** One action row (Turn Off Autopay, Remove Card): asks first when `confirm` is given. */
function ActionRow({
  customer,
  action,
  label,
  confirm,
  destructive = false,
}: {
  customer: string;
  action: "turn_off" | "turn_on" | "remove";
  label: string;
  confirm?: { title: string; message: string; confirmLabel: string };
  destructive?: boolean;
}) {
  const notify = useSheetNotice();
  const [ask, confirmSheet] = useConfirm();
  const [state, run, pending] = useActionState(async (prev: AutopayState, data: FormData) => {
    const next = await orOffline(autopayAction)(prev, data);
    if (next.message && !next.error) notify(next.message);
    return next;
  }, {});
  return (
    <li>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          if (confirm && !(await ask({ ...confirm, destructive }))) return;
          startTransition(() => run(data));
        }}
      >
        <input type="hidden" name="customer" value={customer} />
        <input type="hidden" name="action" value={action} />
        <button
          type="submit"
          disabled={pending}
          className={cx(ROW_BUTTON, destructive ? "text-status-fail" : "text-link")}
        >
          {label}
        </button>
      </form>
      {state.error ? (
        <div className="px-4 pb-3">
          <Banner tone="error">{state.error}</Banner>
        </div>
      ) : null}
      {confirmSheet}
    </li>
  );
}

/** Request Card on File's sheet: by email, by text from the shop's number, or a link to copy. */
function RequestCard({
  customer,
  email,
  phone,
  texting,
}: {
  customer: string;
  email: string | null;
  phone: string | null;
  texting: boolean;
}) {
  const notify = useSheetNotice();
  const channel = useRef<"email" | "text" | "link">("link");
  // Which button is sending, for its "Sending…" (a ref can't be read while drawing).
  const [sending, setSending] = useState<"email" | "text" | "link">("link");
  const [state, run, pending] = useActionState(async (prev: AutopayState, data: FormData) => {
    const next = await orOffline(autopayAction)(prev, data);
    if (next.message && !next.error && data.get("channel") !== "link") notify(next.message);
    return next;
  }, {});
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        data.set("channel", channel.current);
        setSending(channel.current);
        startTransition(() => run(data));
      }}
    >
      <input type="hidden" name="customer" value={customer} />
      <input type="hidden" name="action" value="request" />
      <p className="px-4 sm:px-0">
        The customer gets a secure link to save a card or bank account with Stripe. Nothing is
        charged until an invoice is sent.
      </p>
      {state.error ? <Banner tone="error">{state.error}</Banner> : null}
      <div className="space-y-3">
        {email ? (
          <Button
            type="submit"
            disabled={pending}
            className="w-full"
            onClick={() => (channel.current = "email")}
          >
            {pending && sending === "email" ? "Sending…" : `Email ${email}`}
          </Button>
        ) : null}
        {texting && phone ? (
          <Button
            type="submit"
            kind={email ? "secondary" : "primary"}
            disabled={pending}
            className="w-full"
            onClick={() => (channel.current = "text")}
          >
            {pending && sending === "text" ? "Sending…" : `Text ${phone}`}
          </Button>
        ) : null}
        {state.link ? (
          <CopyLink url={state.link} label="Card on file link" />
        ) : (
          <Button
            type="submit"
            kind="secondary"
            disabled={pending}
            className="w-full"
            onClick={() => (channel.current = "link")}
          >
            Get Link to Share
          </Button>
        )}
      </div>
    </form>
  );
}

/** The customer page's Autopay group. */
export function AutopayGroup({
  customerId,
  autopay,
  method,
  shopOn,
  email,
  phone,
  texting,
  canEdit,
  today,
}: {
  customerId: string;
  autopay: boolean;
  method: SavedMethod | null;
  shopOn: boolean;
  email: string | null;
  phone: string | null;
  /** The shop has a working company number. */
  texting: boolean;
  /** Owners and admins. */
  canEdit: boolean;
  today: string;
}) {
  const status = autopayStatus(autopay, method);
  return (
    <Grouped
      title={AUTOPAY_TEXT.group}
      footer={canEdit ? autopayGroupFooter(shopOn, autopay, method) : null}
    >
      <Row label={AUTOPAY_TEXT.status} value={status.value} />
      {method ? (
        <Row label={savedMethodLabel(method)} detail={savedMethodDetail(method, today)} />
      ) : (
        <Row label={<span className="text-text-muted">{AUTOPAY_TEXT.noMethod}</span>} />
      )}
      {canEdit && method && autopay ? (
        <ActionRow
          customer={customerId}
          action="turn_off"
          label={AUTOPAY_TEXT.turnOff}
          confirm={{
            title: AUTOPAY_TEXT.turnOffTitle,
            message: AUTOPAY_TEXT.turnOffMessage,
            confirmLabel: AUTOPAY_TEXT.turnOff,
          }}
        />
      ) : null}
      {canEdit && method && !autopay && shopOn ? (
        <ActionRow customer={customerId} action="turn_on" label={AUTOPAY_TEXT.turnOn} />
      ) : null}
      {canEdit ? (
        <SheetRow
          title={AUTOPAY_TEXT.requestTitle}
          label={<span className="text-link">{AUTOPAY_TEXT.request}</span>}
        >
          <RequestCard customer={customerId} email={email} phone={phone} texting={texting} />
        </SheetRow>
      ) : null}
      {canEdit && method ? (
        <ActionRow
          customer={customerId}
          action="remove"
          label={AUTOPAY_TEXT.remove}
          destructive
          confirm={{
            title: AUTOPAY_TEXT.removeTitle,
            message: AUTOPAY_TEXT.removeMessage,
            confirmLabel: AUTOPAY_TEXT.remove,
          }}
        />
      ) : null}
    </Grouped>
  );
}

/**
 * An invoice's automatic charge ("Paid automatically with Visa •••• 4242", or the failure),
 * and Charge Card on File for owners and admins while something is owed.
 */
export function InvoiceAutopay({
  invoice,
  jobId,
  method,
  balanceCents,
  feeBps,
  customer,
  canCharge,
}: {
  invoice: AutopayInvoice & { id: string; status: string };
  jobId: string;
  method: SavedMethod | null;
  balanceCents: number;
  feeBps: number;
  customer: string;
  canCharge: boolean;
}) {
  const [ask, confirmSheet] = useConfirm();
  const [state, run, pending] = useActionState(orOffline(chargeCardAction), {} as FormState);
  const line = autopayInvoiceLine(invoice);
  const owed =
    (invoice.status === "sent" || invoice.status === "partially_paid") && balanceCents > 0;
  const show = canCharge && method && owed && invoice.autopay_status !== "processing";
  if (!line && !show) return null;
  const confirm = method ? chargeConfirm({ method, balanceCents, feeBps, customer }) : null;
  return (
    <div className="space-y-3" data-testid="invoice-autopay">
      {line ? (
        <p
          className={cx(
            "text-[0.9375rem]",
            invoice.autopay_status === "failed" ? "text-status-fail" : "text-text-muted",
          )}
        >
          {line}
        </p>
      ) : null}
      {show && confirm ? (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            if (
              !(await ask({
                title: confirm.title,
                message: confirm.message,
                confirmLabel: confirm.confirm,
              }))
            )
              return;
            startTransition(() => run(data));
          }}
        >
          <input type="hidden" name="invoice" value={invoice.id} />
          <input type="hidden" name="job" value={jobId} />
          <Button type="submit" kind="secondary" disabled={pending}>
            {pending ? "Charging…" : AUTOPAY_TEXT.charge}
          </Button>
        </form>
      ) : null}
      {state.error ? <Banner tone="error">{state.error}</Banner> : null}
      {state.message ? <Banner tone="success">{state.message}</Banner> : null}
      {confirmSheet}
    </div>
  );
}
