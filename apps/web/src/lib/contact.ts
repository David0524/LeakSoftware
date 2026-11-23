// Customers' phone numbers and emails are for people with Text and Call Customers (owner,
// 2026-11-23: "The contact permission would be fully off"; core contact.ts). The database blanks
// them on a tech's phone (sync_pull); the website blanks them here, on the server, before a page
// is drawn, so they never reach the browser. Used on what the customer and job loaders return,
// which hold customers (never teammates' profiles).

const BLANK: Record<string, null | []> = {
  phone: null,
  email: null,
  cc_emails: [],
  customerPhone: null,
  customerEmail: null,
};

function blank(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(blank);
  if (value === null || typeof value !== "object" || value instanceof Date) return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) out[k] = k in BLANK ? BLANK[k] : blank(v);
  return out;
}

/** `value` with every customer phone number and email blank, unless this person may see them. */
export function blankContact<T>(canContact: boolean | undefined, value: T): T {
  return canContact === false ? (blank(value) as T) : value;
}
