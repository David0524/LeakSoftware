import { offersLeak, offersPool } from "@leakbook/core";

export interface OfficeLink {
  href: string;
  label: string;
  /** Other sections this one holds: its tab stays selected on them. */
  also?: string[];
  /** A count on the tab, e.g. unread conversations. */
  badge?: number;
}

/**
 * The office sections, in order. Phones show four and put the rest under More. Messages, the
 * shop's shared inbox, holds Customers (owner, 2026-10-16: "shared with the contacts tab";
 * "Messages should be the main side"), with a Messages | Customers switch on both pages and
 * the unread count on the tab. Warranties are for leak repairs and the chemical calculator for pool care (company
 * services setting).
 */
export function officeLinks(isOwner: boolean, settings: unknown, unread = 0): OfficeLink[] {
  return [
    { href: "/today", label: "Today" },
    { href: "/jobs", label: "Jobs" },
    { href: "/schedule", label: "Schedule" },
    { href: "/messages", label: "Messages", also: ["/customers"], badge: unread },
    { href: "/invoices", label: "Invoices" },
    ...(isOwner ? [{ href: "/dashboard", label: "Dashboard" }] : []),
    ...(offersPool(settings) ? [{ href: "/chemicals", label: "Chemicals" }] : []),
    ...(offersLeak(settings) ? [{ href: "/warranties", label: "Warranties" }] : []),
    ...(isOwner ? [{ href: "/settings", label: "Settings" }] : []),
  ];
}
