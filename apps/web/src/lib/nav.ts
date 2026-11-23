import { offersPool } from "@leakbook/core";

export interface OfficeLink {
  href: string;
  label: string;
  /** Other sections this one holds: its tab stays selected on them. */
  also?: string[];
  /** A count on the tab, e.g. unread conversations. */
  badge?: number;
  /** Something new since the person last looked (Activity): a dot, on More too. */
  dot?: boolean;
}

/**
 * The office sections, in order. Phones show four and put the rest under More, Customers
 * first (owner, 2026-10-18: "Move 'customers' to 'more' on desktop and mobile"). Messages, the
 * shop's shared inbox, has the unread count on its tab. The chemical calculator is for pool
 * care (company services setting). Activity, what happened in the shop, sits under More with a
 * dot when there is something new (owner, 2026-10-20). A tech without Text and Call Customers
 * (owner, 2026-11-23) has no Messages: their phone shows Today, Jobs, Schedule, and More.
 */
export function officeLinks(
  isOwner: boolean,
  settings: unknown,
  unread = 0,
  activityDot = false,
  canContact = true,
): OfficeLink[] {
  return [
    { href: "/today", label: "Today" },
    { href: "/jobs", label: "Jobs" },
    { href: "/schedule", label: "Schedule" },
    ...(canContact ? [{ href: "/messages", label: "Messages", badge: unread }] : []),
    { href: "/customers", label: "Customers" },
    { href: "/invoices", label: "Invoices" },
    { href: "/activity", label: "Activity", dot: activityDot },
    ...(isOwner ? [{ href: "/dashboard", label: "Dashboard" }] : []),
    ...(offersPool(settings) ? [{ href: "/chemicals", label: "Chemicals" }] : []),
    ...(isOwner ? [{ href: "/settings", label: "Settings" }] : []),
  ];
}

/** The phone's tabs before More; everything else is under More. */
const PHONE_TABS = ["/today", "/jobs", "/schedule", "/messages"];

/** A phone's tab bar and its More list (the same on the website, the iPhone and Android). */
export function phoneNav(links: OfficeLink[]): { tabs: OfficeLink[]; more: OfficeLink[] } {
  return {
    tabs: links.filter((l) => PHONE_TABS.includes(l.href)),
    more: links.filter((l) => !PHONE_TABS.includes(l.href)),
  };
}

/** On a computer these sit in the More menu instead of the bar (owner, 2026-10-18). */
const DESKTOP_MORE = ["/customers", "/invoices", "/activity", "/chemicals"];

/**
 * The desktop header: the main sections in the bar, Customers, Invoices, Activity, and
 * Chemicals under a More menu, and Settings as a gear (owner, 2026-10-18).
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
