import { isManagerRole, roleLabel } from "./models";

// Per-person "Text and Call Customers" (owner, 2026-11-23: "some of the less trustworthy techs
// shouldn't have access to messaging and calling customers, but some should"). A switch on a
// tech's profile in Settings › Team (membership.can_contact_customers, default on). Owners and
// admins always have it. Off, a tech:
//   - doesn't see Messages, nor the call, text and email buttons for customers, and their phone
//     drops the inbox's rows (the database stops sending them: 20261022005000_contact_customers);
//   - can't text or call from the company number (the server refuses), and isn't rung for
//     incoming calls or told about incoming texts.
// "Fully off" (owner, 2026-11-23): they don't see customers' phone numbers or emails either
// (blank on their phone and the website; 20261022005000_contact_customers.sql). What's part of
// the work still goes out, to what's on file: sent reports, visit reports, invoices, receipts,
// and what the shop sends by itself. On My Way needs the customer's number, so it isn't offered
// to them. The same rules on the website, the iPhone app (SundeckCore/Contact.swift) and
// Android.

/** The switch on a tech's profile. */
export const CONTACT_SWITCH_LABEL = "Text and Call Customers";

/** Under the switch. */
export const CONTACT_SWITCH_FOOTER =
  "When it’s off, they don’t see Messages or customers’ phone numbers and emails, can’t call, text, or email customers, and calls to the company number don’t ring them. Reports and invoices still go to the customer.";

/** After the role on the Team list, for a tech without it: "Tech · No customer contact". */
export const NO_CONTACT_NOTE = "No customer contact";

/** What the server says when someone without it tries to text or call a customer. */
export const NO_CONTACT_MESSAGE =
  "Texting and calling customers is turned off for you. Ask an owner or admin.";

/**
 * Where a report, visit report, invoice, or receipt goes when the sender can't see the
 * customer's contact details: the address on file, which the server fills in.
 */
export const ON_FILE_NOTE = "Goes to the customer’s email on file.";

/** After such a send. */
export const ON_FILE_SENT = "Sent to the customer’s email on file.";

/** Whether this person may text, call, and email customers, and see Messages. */
export function canContactCustomers(
  role: string | null | undefined,
  allowed: boolean | null | undefined,
): boolean {
  return isManagerRole(role) || allowed !== false;
}

/** The line under a name on the Team list: "Tech", or "Tech · No customer contact". */
export function teamRoleLine(
  role: string | null | undefined,
  allowed: boolean | null | undefined,
): string {
  return canContactCustomers(role, allowed)
    ? roleLabel(role)
    : `${roleLabel(role)} · ${NO_CONTACT_NOTE}`;
}
