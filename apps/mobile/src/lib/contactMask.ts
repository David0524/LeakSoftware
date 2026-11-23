import { useSyncExternalStore } from "react";

// Text and Call Customers, fully off (owner, 2026-11-23; packages/core contact.ts). The server
// sends a tech without it customers' phone numbers and emails blank, and their phone starts its
// sync over when the switch changes, which replaces what it had. Until that pull finishes (or
// while offline), the screens read customers through this mask, so nothing shows in between.

/** The contact columns of each synced table, as the blanks shown in their place. */
const BLANKS: Record<string, Record<string, null | [] | "">> = {
  customer: { phone: null, email: null, cc_emails: [] },
  message: { recipient: "" },
};

let hidden = new Set<string>();
let key = "";
let version = 0;
const listeners = new Set<() => void>();

/** The shops where the signed-in person may not contact customers (set by the session). */
export function setNoContactCompanies(companyIds: string[]) {
  const next = [...companyIds].sort().join(",");
  if (next === key) return;
  key = next;
  hidden = new Set(companyIds);
  version += 1;
  for (const l of listeners) l();
}

/** Changes when the mask does, so lists read through it again. */
export function useContactMaskVersion(): number {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => version,
  );
}

/** Whether a table has columns the mask blanks. */
export const maskedTable = (table: string) => table in BLANKS;

/** A row as this person may see it. */
export function maskRow<T>(table: string, row: T): T {
  const blanks = BLANKS[table];
  const company = (row as { company_id?: string } | undefined)?.company_id;
  if (!blanks || !row || !company || !hidden.has(company)) return row;
  return { ...row, ...blanks };
}
