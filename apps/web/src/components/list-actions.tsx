"use client";

import { useState, useTransition, type ReactNode } from "react";
import {
  SEND_RECEIPT,
  canRecordPayment,
  directionsHref,
  formatCents,
  parseDollars,
  receiptBalanceText,
  receiptSummary,
  type LatLng,
} from "@leakbook/core";
import { changeJobStatus } from "@/app/actions/inspection";
import { buzz } from "@/lib/haptics";
import { voidInvoiceAction } from "@/app/actions/invoices";
import {
  RecordPaymentFields,
  SendReceiptSheet,
  recordPayment,
  type ReceiptContact,
} from "./payment-receipt";
import { sendReportAction, sendVisitReportAction } from "@/app/actions/reports";
import { CheckIcon, DirectionsIcon, MessageIcon, PhoneIcon } from "./icons";
import {
  RowActions,
  bannerFor,
  copyWithBanner,
  formOf,
  type MenuEntry,
  type SwipeAction,
} from "./row-actions";
import { Sheet, useConfirm } from "./sheet";
import { saveFailed, useJobStatus, useSetJobStatus } from "./instant";
import { showBanner } from "./top-banner";
import { NO_CONNECTION, whenOffline } from "@/lib/offline";
import { Button } from "./ui";

// The office lists' swipe actions and menus (gestures.md section 12): Jobs, Invoices, Reports,
// and Customers. Each list page is a server component; these are its rows' small client parts.
// Every action calls what the row's own page calls.

type As = "li" | "tr";

/** A text from the company number (Messages) when there is one, else the phone's own app. */
function textHref(phone: string, inbox: string | null) {
  return inbox ?? `sms:${phone.replace(/[^\d+]/g, "")}`;
}

const callAction = (phone: string): SwipeAction => ({
  label: "Call",
  tone: "green",
  icon: <PhoneIcon />,
  href: `tel:${phone}`,
  external: true,
});

const directionsAction = (address: string, location: LatLng | null): SwipeAction => ({
  label: "Directions",
  tone: "blue",
  icon: <DirectionsIcon />,
  href: directionsHref({ address, location }),
  external: true,
});

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

export interface JobRowData {
  id: string;
  number: number | null;
  customer: string;
  phone: string | null;
  /** Messages' new text to this customer, when the shop has a company number. */
  inboxHref: string | null;
  address: string | null;
  location: LatLng | null;
  /** The job page's Complete Job applies (an open maintenance visit). */
  canComplete: boolean;
  /** Asked first when completing sends the visit report, as on the job page. */
  completePrompt: { title: string; message: string; confirmLabel: string } | null;
  /** The job page has its Schedule section (Move… goes there). */
  canMove: boolean;
}

/** A job in Jobs: swipe Mark Complete (right) and Call and Directions (left), and its menu. */
export function JobActions({
  as,
  job: j,
  className,
  children,
}: {
  as: As;
  job: JobRowData;
  className?: string;
  children: ReactNode;
}) {
  const [, start] = useTransition();
  const [confirm, confirmSheet] = useConfirm();
  const title = `${j.customer}${j.number ? ` · Job #${j.number}` : ""}`;
  const setStatus = useSetJobStatus();
  const done = useJobStatus(j.id, null) === "done";

  // Completed at once (owner, 2026-10-22): the row's status changes and the banner says so;
  // a failed save puts it back and says why.
  async function complete() {
    if (j.completePrompt && !(await confirm({ ...j.completePrompt, alert: true }))) return;
    start(async () => {
      setStatus(j.id, "done");
      showBanner({ message: "Completed." });
      const r = await whenOffline(changeJobStatus({}, formOf({ job: j.id, to: "done" })), {
        error: NO_CONNECTION,
      });
      const error = r.error ?? Object.values(r.fields ?? {})[0];
      if (error) saveFailed(error);
      else buzz("jobCompleted");
    });
  }

  const call = j.phone ? callAction(j.phone) : null;
  const directions = j.address ? directionsAction(j.address, j.location) : null;
  const markComplete: SwipeAction | null =
    j.canComplete && !done
      ? {
          label: "Mark Complete",
          tone: "green",
          icon: <CheckIcon />,
          onSelect: () => void complete(),
        }
      : null;

  const menu: MenuEntry[] = [
    { label: "Open", href: `/jobs/${j.id}` },
    call && { label: "Call", href: call.href, external: true },
    j.phone && {
      label: "Message",
      href: textHref(j.phone, j.inboxHref),
      external: !j.inboxHref,
    },
    directions && { label: "Directions", href: directions.href, external: true },
    j.canMove && { label: "Move…", href: `/jobs/${j.id}#schedule` },
    j.number != null && {
      label: "Copy Job Number",
      onSelect: () => copyWithBanner(String(j.number), `Copied job number ${j.number}.`),
    },
    // The leading swipe's action, so keyboards and screen readers have it too.
    markComplete && "separator",
    markComplete && { label: "Mark Complete", onSelect: markComplete.onSelect },
  ];

  return (
    <>
      <RowActions
        as={as}
        title={title}
        menu={menu}
        leading={markComplete ? [markComplete] : []}
        trailing={[call, directions].filter((a): a is SwipeAction => !!a)}
        button={as === "tr" ? "none" : "overlay"}
        className={className}
      >
        {children}
      </RowActions>
      {confirmSheet}
    </>
  );
}

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------

export interface InvoiceRowData {
  id: string;
  jobId: string;
  number: number | null;
  customer: string;
  status: string;
  /** Left to pay, in cents. */
  balance: number;
  /** The customer's link, once sent. */
  link: string | null;
  /** Owners and admins void (as on the job page). */
  canManage: boolean;
  /** The person's role: anyone on the team records payments (owner, 2026-10-22). */
  role: string;
  /** Nothing paid yet, so it can be voided. */
  unpaid: boolean;
  /** The total and what's paid, in cents, for Send Receipt's line. */
  total: number;
  paid: number;
  /** Where Send Receipt goes. */
  contact: ReceiptContact;
}

/** An invoice in Invoices: swipe Record Payment (right), and its menu. */
export function InvoiceActions({
  as,
  invoice: i,
  className,
  children,
}: {
  as: As;
  invoice: InvoiceRowData;
  className?: string;
  children: ReactNode;
}) {
  const [pending, start] = useTransition();
  const [confirm, confirmSheet] = useConfirm();
  const [paying, setPaying] = useState(false);
  // Send Receipt: right after Record Payment (that payment), or later (the latest).
  const [receipt, setReceipt] = useState<{
    paymentId: string | null;
    status: string | null;
    summary: string;
  } | null>(null);
  const title = `${i.customer}${i.number ? ` · Invoice #${i.number}` : ""}`;
  const live = i.status !== "draft" && i.status !== "void";
  const canPay = canRecordPayment(i.role, {
    status: i.status,
    total_cents: i.total,
    amount_paid_cents: i.paid,
  });
  const canVoid = i.canManage && live && i.unpaid;
  const canReceipt = live && i.paid > 0;

  async function voidIt() {
    const ok = await confirm({
      title: `Void invoice${i.number ? ` #${i.number}` : ""}?`,
      message: "The customer’s link will show it as void.",
      confirmLabel: "Void Invoice",
      destructive: true,
    });
    if (!ok) return;
    start(async () => {
      bannerFor(await voidInvoiceAction({}, formOf({ invoice: i.id, job: i.jobId })), "Voided.");
    });
  }

  const recordPayment: SwipeAction | null = canPay
    ? { label: "Record Payment", tone: "green", onSelect: () => setPaying(true) }
    : null;
  const menu: MenuEntry[] = [
    { label: "Open", href: `/jobs/${i.jobId}?tab=wrap-up` },
    live &&
      i.link && {
        label: "Copy Payment Link",
        onSelect: () => copyWithBanner(i.link!, "Copied the payment link."),
      },
    recordPayment && { label: "Record Payment…", onSelect: () => setPaying(true) },
    canReceipt && {
      label: `${SEND_RECEIPT}…`,
      onSelect: () =>
        setReceipt({
          paymentId: null,
          status: null,
          summary: `${formatCents(i.paid)} paid · ${receiptBalanceText({ total_cents: i.total, amount_paid_cents: i.paid })}`,
        }),
    },
    canVoid && "separator",
    canVoid && { label: "Void…", destructive: true, onSelect: () => void voidIt() },
  ];

  return (
    <>
      <RowActions
        as={as}
        title={title}
        menu={menu}
        disabled={pending}
        leading={recordPayment ? [recordPayment] : []}
        button={as === "tr" ? "none" : "overlay"}
        className={className}
      >
        {children}
      </RowActions>
      {confirmSheet}
      {paying ? (
        <RecordPaymentSheet
          invoice={i}
          title={title}
          onClose={() => setPaying(false)}
          onRecorded={(r) => {
            setPaying(false);
            setReceipt(r);
          }}
        />
      ) : null}
      {receipt ? (
        <SendReceiptSheet
          invoiceId={i.id}
          jobId={i.jobId}
          paymentId={receipt.paymentId}
          summary={receipt.summary}
          justRecorded={receipt.status}
          contact={i.contact}
          onClose={() => setReceipt(null)}
        />
      ) : null}
    </>
  );
}

/**
 * Record Payment, as on the job page: the amount received (the balance to start), how it was
 * paid, and a check's number. Then Send Receipt for that payment.
 */
function RecordPaymentSheet({
  invoice: i,
  title,
  onClose,
  onRecorded,
}: {
  invoice: InvoiceRowData;
  title: string;
  onClose: () => void;
  onRecorded: (r: { paymentId: string; status: string; summary: string }) => void;
}) {
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<Record<string, string> | undefined>();
  return (
    <Sheet open onClose={onClose} title="Record Payment">
      <form
        className="space-y-4"
        data-testid="record-payment"
        onSubmit={(e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          start(async () => {
            const r = await recordPayment(form);
            if ("errors" in r) return setErrors(r.errors);
            const amount = parseDollars(String(form.get("amount") ?? "")) ?? 0;
            onRecorded({
              paymentId: r.recorded.paymentId,
              status: r.recorded.status,
              summary: receiptSummary(
                {
                  amount_cents: amount,
                  method: String(form.get("method") ?? "other"),
                  check_number: String(form.get("check_number") ?? "") || null,
                },
                { total_cents: i.total, amount_paid_cents: i.paid + amount },
              ),
            });
          });
        }}
      >
        <p className="text-center text-[0.9375rem] text-text-muted">{title}</p>
        <input type="hidden" name="invoice" value={i.id} />
        <input type="hidden" name="job" value={i.jobId} />
        <RecordPaymentFields balance={i.balance} errors={errors} autoFocus />
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "Saving…" : "Record Payment"}
        </Button>
      </form>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export interface ReportRowData {
  id: string;
  jobId: string;
  title: string;
  template: string;
  /** The customer's link, once sent. */
  link: string | null;
  /** Resend goes by email to this address, as the job page's Send by Email does. */
  resendTo: string | null;
}

/** A report in Reports: its menu (no swipes). */
export function ReportActions({
  report: r,
  children,
}: {
  report: ReportRowData;
  children: ReactNode;
}) {
  const [pending, start] = useTransition();
  function resend() {
    const to = r.resendTo!;
    start(async () => {
      const result =
        r.template === "maintenance"
          ? await sendVisitReportAction({}, formOf({ job: r.jobId, channel: "email", to }))
          : await sendReportAction(
              {},
              formOf({ job: r.jobId, report: r.id, channel: "email", to }),
            );
      bannerFor(result, `Sent to ${to}.`);
      if (!result.error) buzz("reportSent");
    });
  }
  const menu: MenuEntry[] = [
    { label: "Open", href: `/jobs/${r.jobId}?tab=wrap-up` },
    r.link && {
      label: "Copy Customer Link",
      onSelect: () => copyWithBanner(r.link!, "Copied the customer link."),
    },
    r.resendTo && { label: "Resend", onSelect: resend },
  ];
  return (
    <RowActions as="li" title={r.title} menu={menu} disabled={pending}>
      {children}
    </RowActions>
  );
}

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

export interface CustomerRowData {
  id: string;
  name: string;
  phone: string | null;
  inboxHref: string | null;
  /** Their pool, for Directions. */
  address: string | null;
  location: LatLng | null;
}

/** A customer in Customers: swipe Call and Message (left), and its menu. */
export function CustomerActions({
  customer: c,
  children,
}: {
  customer: CustomerRowData;
  children: ReactNode;
}) {
  const call = c.phone ? callAction(c.phone) : null;
  const message: SwipeAction | null = c.phone
    ? {
        label: "Message",
        tone: "blue",
        icon: <MessageIcon />,
        href: textHref(c.phone, c.inboxHref),
        external: !c.inboxHref,
      }
    : null;
  const menu: MenuEntry[] = [
    { label: "Open", href: `/customers/${c.id}` },
    call && { label: "Call", href: call.href, external: true },
    message && { label: "Message", href: message.href, external: message.external },
    c.address && {
      label: "Directions",
      href: directionsHref({ address: c.address, location: c.location }),
      external: true,
    },
  ];
  return (
    <RowActions
      as="li"
      title={c.name}
      menu={menu}
      trailing={[call, message].filter((a): a is SwipeAction => !!a)}
    >
      {children}
    </RowActions>
  );
}
