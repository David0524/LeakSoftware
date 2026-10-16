import { offersLeak, offersPool } from "@leakbook/core";

/**
 * The office sections, in order. Phones show four and put the rest under More. Warranties
 * are for leak repairs and the chemical calculator for pool care (company services setting).
 */
export function officeLinks(isOwner: boolean, settings: unknown) {
  return [
    { href: "/today", label: "Today" },
    { href: "/jobs", label: "Jobs" },
    { href: "/schedule", label: "Schedule" },
    { href: "/customers", label: "Customers" },
    { href: "/invoices", label: "Invoices" },
    ...(isOwner ? [{ href: "/dashboard", label: "Dashboard" }] : []),
    ...(offersPool(settings) ? [{ href: "/chemicals", label: "Chemicals" }] : []),
    ...(offersLeak(settings) ? [{ href: "/warranties", label: "Warranties" }] : []),
    ...(isOwner ? [{ href: "/settings", label: "Settings" }] : []),
  ];
}
