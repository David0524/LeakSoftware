/** The office sections, in order. Phones show four and put the rest under More. */
export function officeLinks(isOwner: boolean) {
  return [
    { href: "/jobs", label: "Jobs" },
    { href: "/schedule", label: "Schedule" },
    { href: "/customers", label: "Customers" },
    { href: "/invoices", label: "Invoices" },
    ...(isOwner ? [{ href: "/dashboard", label: "Dashboard" }] : []),
    { href: "/warranties", label: "Warranties" },
    ...(isOwner ? [{ href: "/settings", label: "Settings" }] : []),
  ];
}
