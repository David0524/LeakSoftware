// Which swipe actions and touch-and-hold menu items a list row gets (owner, 2026-10-20: "Go do
// all of these"; docs/design/2026-10-20-gestures.md section 12), the same names and order on
// every platform. Pure, so it's tested without a phone; each screen maps an action's id to the
// same code as the button on the row's own page.
//
// Rules from the spec, kept here:
// - At most 3 swipe actions a side, the most used first (drawn on the outer edge).
// - Nothing destructive on a swipe's leading side; Delete and Void ask first (the screen's
//   confirm), and no swipe acts on a full swipe except Delete, which asks.
// - Actions a row can't take aren't offered (no Call without a phone, no Mark Complete on a
//   finished job).
// - Left out where the app has no such button yet (listed in each function's note).

import {
  canMoveJob,
  canRecordPayment,
  canUnschedule,
  isManagerRole,
  userTransitions,
  type JobLock,
} from "@leakbook/core";

export interface RowAction<Id extends string = string> {
  id: Id;
  /** The menu item and accessibility action, Title Case ("Mark Complete", "Move…"). */
  label: string;
  /** The swipe button's shorter label, when the menu's is too long for it ("Complete"). */
  short?: string;
  /** Red, and asks first. */
  destructive?: boolean;
  /** The current choice in a menu (a lock, a checklist answer): a check beside it. */
  checked?: boolean;
}

export interface RowActions<Id extends string = string> {
  /** Swipe right (from the leading edge). */
  leading: RowAction<Id> | null;
  /** Swipe left, first on the outer edge. */
  trailing: RowAction<Id>[];
  /** Touch and hold, in this order; the menu's title is the row's name. */
  menu: RowAction<Id>[];
}

/** At most this many swipe actions on a side. */
export const MAX_SWIPE_ACTIONS = 3;

function pick<Id extends string>(list: (RowAction<Id> | false | null | undefined)[]) {
  return list.filter((a): a is RowAction<Id> => Boolean(a));
}

function rowActions<Id extends string>(
  leading: RowAction<Id> | false | null | undefined,
  trailing: (RowAction<Id> | false | null | undefined)[],
  menu: (RowAction<Id> | false | null | undefined)[],
): RowActions<Id> {
  const lead = leading || null;
  return {
    leading: lead && !lead.destructive ? lead : null,
    trailing: pick(trailing).slice(0, MAX_SWIPE_ACTIONS),
    menu: pick(menu),
  };
}

/** The swipe actions, in the order a screen reader offers them: leading, then trailing. */
export function swipeList<Id extends string>(a: RowActions<Id>): RowAction<Id>[] {
  return [...(a.leading ? [a.leading] : []), ...a.trailing];
}

/** The menu's title: the row's name, with its number when it has one ("Lebron James · #1042"). */
export function menuTitle(name: string | null | undefined, number?: string | null): string {
  const who = name?.trim() || "Customer";
  return number ? `${who} · ${number}` : who;
}

const OPEN = { id: "open", label: "Open" } as const;
const CALL = { id: "call", label: "Call" } as const;
const MESSAGE = { id: "message", label: "Message" } as const;
const DIRECTIONS = { id: "directions", label: "Directions" } as const;

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

export type JobActionId = "open" | "call" | "message" | "directions" | "move" | "complete";

/** Whether a job's page offers Complete Job now (a maintenance visit not done yet). */
export function jobCompletable(job: { status: string; type?: string | null }): boolean {
  return userTransitions(job.status as never, job.type ?? undefined).includes("done");
}

/**
 * Jobs: swipe left Call and Directions, right Mark Complete (open visits); hold for Open, Call,
 * Message, Directions and Move…. Left out: Copy Job Number (the app has no copy button).
 */
export function jobRowActions(job: {
  status: string;
  type?: string | null;
  phone?: string | null;
  hasAddress: boolean;
  /** The job page's Schedule group shows (core jobReschedulable). */
  reschedulable: boolean;
}): RowActions<JobActionId> {
  const complete = jobCompletable(job) && {
    id: "complete" as const,
    label: "Mark Complete",
    short: "Complete",
  };
  const call = !!job.phone && CALL;
  const directions = job.hasAddress && DIRECTIONS;
  const move = job.reschedulable &&
    canMoveJob(job.status) && { id: "move" as const, label: "Move…", short: "Move" };
  return rowActions<JobActionId>(
    complete,
    [call, directions],
    [OPEN, call, !!job.phone && MESSAGE, directions, move],
  );
}

// ---------------------------------------------------------------------------
// Schedule cards
// ---------------------------------------------------------------------------

export type StopActionId =
  "open" | "move" | "lock" | "lockDay" | "lockTime" | "unschedule" | "directions";

/** The lock after Lock Day or Lock Time is toggled (the job page's Lock picker, one part). */
export function toggleLock(lock: JobLock, part: "day" | "time"): JobLock {
  const day = lock === "day" || lock === "both";
  const time = lock === "time" || lock === "both";
  const nextDay = part === "day" ? !day : day;
  const nextTime = part === "time" ? !time : time;
  return nextDay && nextTime ? "both" : nextDay ? "day" : nextTime ? "time" : "none";
}

/**
 * Schedule cards: swipe left Move…, right Lock…; hold for Open, Move…, Lock
 * Day, Lock Time, Take Off Schedule and Directions.
 */
export function stopRowActions(stop: {
  status: string;
  lock: JobLock;
  /** On a tech's day now (not waiting in Needs a Time). */
  scheduled: boolean;
  hasAddress: boolean;
}): RowActions<StopActionId> {
  const movable = canMoveJob(stop.status);
  const day = stop.lock === "day" || stop.lock === "both";
  const time = stop.lock === "time" || stop.lock === "both";
  const move = movable && { id: "move" as const, label: "Move…", short: "Move" };
  return rowActions<StopActionId>(
    movable && { id: "lock", label: "Lock…", short: stop.lock === "none" ? "Lock" : "Locked" },
    [move],
    [
      OPEN,
      move,
      movable && { id: "lockDay", label: day ? "Unlock Day" : "Lock Day" },
      movable && { id: "lockTime", label: time ? "Unlock Time" : "Lock Time" },
      movable &&
        stop.scheduled &&
        canUnschedule(stop.status) && { id: "unschedule", label: "Take Off Schedule" },
      stop.hasAddress && DIRECTIONS,
    ],
  );
}

// ---------------------------------------------------------------------------
// Messages (conversations)
// ---------------------------------------------------------------------------

export type ConversationActionId = "open" | "call" | "toggle" | "customer";

/**
 * Messages: swipe left Read or Unread, right Call (from the company number, as the thread's
 * phone button); hold for Open, Call, Mark Read or Mark Unread, and Open Customer.
 */
export function conversationRowActions(c: {
  unread: boolean;
  /** The company number works, so the thread offers Call. */
  canCall: boolean;
  customerId: string | null;
}): RowActions<ConversationActionId> {
  const toggle = {
    id: "toggle" as const,
    label: c.unread ? "Mark Read" : "Mark Unread",
    short: c.unread ? "Read" : "Unread",
  };
  const call = c.canCall && CALL;
  return rowActions<ConversationActionId>(
    call,
    [toggle],
    [OPEN, call, toggle, !!c.customerId && { id: "customer", label: "Open Customer" }],
  );
}

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

export type CustomerActionId = "open" | "call" | "message" | "directions";

/**
 * Customers: swipe left Call and Message; hold for Open, Call, Message and Directions (their
 * pool). Left out: New Job (the customer's page has no New Job for them yet).
 */
export function customerRowActions(c: {
  phone?: string | null;
  hasPoolAddress: boolean;
}): RowActions<CustomerActionId> {
  const call = !!c.phone && CALL;
  const message = !!c.phone && MESSAGE;
  return rowActions<CustomerActionId>(
    null,
    [call, message],
    [OPEN, call, message, c.hasPoolAddress && DIRECTIONS],
  );
}

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------

export type InvoiceActionId = "open" | "share" | "record" | "receipt" | "void";

/**
 * Invoices: swipe right Record Payment (unpaid; anyone on the team, techs too since 2026-10-22,
 * core canRecordPayment); hold for Open, Share Payment Link,
 * Record Payment, Send Receipt (a payment received, 2026-10-22) and Void…, each as the invoice's
 * own card offers it. Left out: Send Reminder
 * (the app sends no reminders by hand) and Copy Payment Link (no copy button; Share Link's
 * sheet has Copy).
 */
export function invoiceRowActions(i: {
  status: string;
  balanceCents: number;
  /** The person's role: anyone records payments; only owners and admins void. */
  role: string | null | undefined;
  /** A payment succeeded or is pending: no Void. */
  hasPayments: boolean;
  hasLink: boolean;
  /** A payment was received, so a receipt can be sent. */
  hasReceipt?: boolean;
}): RowActions<InvoiceActionId> {
  const issued = i.status !== "draft" && i.status !== "void";
  const manager = isManagerRole(i.role);
  // The balance is what's owed, so it stands in for the total less what's paid.
  const record = canRecordPayment(i.role, {
    status: i.status,
    total_cents: i.balanceCents,
    amount_paid_cents: 0,
  }) && { id: "record" as const, label: "Record Payment", short: "Payment" };
  return rowActions<InvoiceActionId>(
    record,
    [],
    [
      OPEN,
      issued && i.hasLink && { id: "share", label: "Share Payment Link" },
      record,
      issued && i.hasReceipt && { id: "receipt", label: "Send Receipt" },
      manager && issued && !i.hasPayments && { id: "void", label: "Void…", destructive: true },
    ],
  );
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

/** Reports: hold for Open. Left out: Copy Customer Link and Resend (not in the app yet). */
export function reportRowActions(): RowActions<"open"> {
  return rowActions<"open">(null, [], [OPEN]);
}

// ---------------------------------------------------------------------------
// Settings lists, findings and photos
// ---------------------------------------------------------------------------

export type EditActionId = "edit" | "delete";

/**
 * Settings lists (checklist items, test types, severities, exclusion reasons, the price book,
 * saved reports) and findings: swipe left Delete… (asks first); hold for Edit and Delete….
 * `deleteLabel` is the row's own button ("Remove", "Remove Test Type"). Left out: Duplicate,
 * Move Up and Move Down (the app orders by each row's Order field). Checklist items in
 * Settings are removed by turning them off, so they get Edit only.
 */
export function editRowActions(opts: {
  deleteLabel?: string | null;
  editLabel?: string;
}): RowActions<EditActionId> {
  const del = opts.deleteLabel
    ? {
        id: "delete" as const,
        label: `${opts.deleteLabel}…`,
        short: opts.deleteLabel.split(" ")[0],
        destructive: true,
      }
    : null;
  return rowActions<EditActionId>(
    null,
    [del],
    [{ id: "edit", label: opts.editLabel ?? "Edit" }, del],
  );
}

/**
 * A photo, video or voice note on the job page: hold for Mark Up (photos; Edit Markup once it
 * has some) and Delete…. Left out: Set as Pool Photo (the app has no pool photo).
 */
export function mediaRowActions(m: {
  kind: string;
  kindLabel: string;
  hasMarkup: boolean;
  /** The photo is on the phone, so Mark Up can open. */
  ready: boolean;
}): RowActions<"markup" | "delete"> {
  const del = {
    id: "delete" as const,
    label: `Delete ${m.kindLabel}…`,
    short: "Delete",
    destructive: true,
  };
  return rowActions<"markup" | "delete">(
    null,
    [del],
    [
      m.kind === "photo" &&
        m.ready && { id: "markup", label: m.hasMarkup ? "Edit Markup" : "Mark Up" },
      del,
    ],
  );
}

// ---------------------------------------------------------------------------
// Checklist rows
// ---------------------------------------------------------------------------

/**
 * A checklist row on the job page: swipe right for its first answer (Done, Not Leaking, No);
 * hold for each of its answers (the current one checked), then Not Done to put it back to do,
 * as tapping the chosen answer again does.
 */
export function checklistRowActions(
  options: { value: string; label: string }[],
  current: string | null,
): RowActions<string> {
  const first = options[0];
  return rowActions<string>(
    first && current !== first.value && { id: `answer:${first.value}`, label: first.label },
    [],
    [
      ...options.map((o) => ({
        id: `answer:${o.value}`,
        label: o.label,
        checked: o.value === current,
      })),
      current !== null && { id: "clear", label: "Not Done" },
    ],
  );
}

// ---------------------------------------------------------------------------
// Routes: customers
// ---------------------------------------------------------------------------

/**
 * Schedule › Routes' customers: hold for Change Day… and Change Tech… (both open the card's
 * Move sheet, which sets the day and the tech). Left out: Open Plan (a route card doesn't
 * link to its plan in the app).
 */
export function routePlanRowActions(canMove: boolean): RowActions<"day" | "tech"> {
  return rowActions<"day" | "tech">(
    null,
    [],
    [
      canMove && { id: "day", label: "Change Day…" },
      canMove && { id: "tech", label: "Change Tech…" },
    ],
  );
}
