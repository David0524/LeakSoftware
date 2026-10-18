import { offersPool } from "@leakbook/core";

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
 * the unread count on the tab. The chemical calculator is for pool care (company services
 * setting).
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
    ...(isOwner ? [{ href: "/settings", label: "Settings" }] : []),
  ];
}

/** On a computer these sit in the More menu instead of the bar (owner, 2026-10-18). */
const DESKTOP_MORE = ["/invoices", "/chemicals"];

/**
 * The desktop header: the main sections in the bar, Invoices and Chemicals under a More menu,
 * and Settings as a gear (owner, 2026-10-18).
 */
export function desktopNav(links: OfficeLink[]): {
  main: OfficeLink[];
  more: OfficeLink[];
  settings: OfficeLink | null;
} {
  return {
    main: links.filter((l) => !DESKTOP_MORE.includes(l.href) && l.href !== "/settings"),
    more: links.filter((l) => DESKTOP_MORE.includes(l.href)),
    settings: links.find((l) => l.href === "/settings") ?? null,
  };
}
