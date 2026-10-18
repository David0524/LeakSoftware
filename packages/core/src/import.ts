import { parseDollars } from "./money";
import { addDays } from "./office";
import { weekday } from "./route-plan";
import { toE164 } from "./texting";
import type { Services } from "./models";

// Importing a shop's customers (owner, 2026-10-16: "build the importer"): a CSV exported from
// Skimmer, Pool Brain, Jobber, QuickBooks, or a spreadsheet becomes customers, their pools,
// and (pool care) visit plans. The shop matches the columns, sees what will be made, then
// imports it all at once. No I/O here; the website and the database do the rest.

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

/** Rows of cells from CSV text (RFC 4180 quotes; comma, semicolon, or tab; BOM and CRLF). */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, "");
  const firstLine = src.slice(0, src.search(/\r?\n|$/));
  const count = (ch: string) => firstLine.split(ch).length - 1;
  const sep = [",", ";", "\t"].reduce((a, b) => (count(b) > count(a) ? b : a), ",");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === sep) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  // Blank lines carry nothing.
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

// ---------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------

export const IMPORT_FIELDS = {
  skip: "Don’t import",
  name: "Customer name",
  first_name: "First name",
  last_name: "Last name",
  company_name: "Company",
  email: "Email",
  phone: "Phone",
  address: "Full address",
  address_line1: "Street address",
  address_line2: "Unit or suite",
  city: "City",
  state: "State",
  postal_code: "ZIP code",
  gallons: "Pool gallons",
  pool_type: "Pool type",
  access_notes: "Gate code or access",
  notes: "Notes",
  visit_day: "Service day",
  frequency: "How often",
  price: "Price per visit",
  monthly_price: "Monthly price",
  tech: "Tech",
} as const;
export type ImportField = keyof typeof IMPORT_FIELDS;

/** Header words for each field, most specific first (lowercase, letters and digits only). */
const SYNONYMS: [ImportField, string[]][] = [
  ["first_name", ["firstname", "first", "givenname"]],
  ["last_name", ["lastname", "last", "surname", "familyname"]],
  ["company_name", ["companyname", "company", "business", "businessname", "organization"]],
  ["email", ["email", "emailaddress", "email1", "primaryemail"]],
  [
    "phone",
    [
      "phone",
      "mobile",
      "cell",
      "phonenumber",
      "mobilephone",
      "cellphone",
      "telephone",
      "primaryphone",
      "phone1",
    ],
  ],
  ["address_line2", ["address2", "addressline2", "unit", "apt", "suite"]],
  [
    "address_line1",
    [
      "street",
      "streetaddress",
      "address1",
      "addressline1",
      "serviceaddress",
      "serviceaddress1",
      "billingaddress",
      "billingstreet",
    ],
  ],
  ["address", ["address", "fulladdress", "location", "propertyaddress"]],
  ["city", ["city", "town", "servicecity", "billingcity"]],
  ["state", ["state", "province", "st", "servicestate", "billingstate", "region"]],
  ["postal_code", ["zip", "zipcode", "postalcode", "postcode", "servicezip", "billingzip"]],
  ["gallons", ["gallons", "poolgallons", "poolsize", "volume", "gallonage", "size"]],
  ["pool_type", ["pooltype", "surface", "finish", "pooltype1", "interior"]],
  ["access_notes", ["gatecode", "gate", "access", "accessnotes", "entry", "entrynotes", "lockbox"]],
  ["visit_day", ["serviceday", "day", "routeday", "visitday", "dayofweek", "weekday"]],
  ["frequency", ["frequency", "servicefrequency", "every", "schedule", "interval"]],
  [
    "monthly_price",
    ["monthlyrate", "monthlyprice", "monthly", "permonth", "monthlycharge", "monthlyfee"],
  ],
  ["price", ["pricepervisit", "pervisit", "visitprice", "rate", "price", "servicerate", "charge"]],
  [
    "tech",
    ["tech", "technician", "assignedtech", "assignedto", "employee", "route", "servicetech"],
  ],
  ["notes", ["notes", "note", "comments", "comment", "instructions", "customernotes"]],
  [
    "name",
    [
      "name",
      "customername",
      "customer",
      "fullname",
      "client",
      "clientname",
      "displayname",
      "contact",
      "contactname",
    ],
  ],
];

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** The likeliest field for each column, each field used once. */
export function guessMapping(headers: string[]): ImportField[] {
  const used = new Set<ImportField>();
  const pick = headers.map(() => "skip" as ImportField);
  // Exact matches first, then a header that contains a field word ("Customer Email").
  for (const exact of [true, false]) {
    headers.forEach((h, i) => {
      if (pick[i] !== "skip") return;
      const k = squash(h);
      if (!k) return;
      for (const [field, words] of SYNONYMS) {
        if (used.has(field)) continue;
        const hit = exact ? words.includes(k) : words.some((w) => w.length >= 5 && k.includes(w));
        if (hit) {
          pick[i] = field;
          used.add(field);
          return;
        }
      }
    });
  }
  return pick;
}

// ---------------------------------------------------------------------------
// Values
// ---------------------------------------------------------------------------

const DAYS: [number, RegExp][] = [
  [0, /^su(n(day)?)?$/],
  [1, /^m(o(n(day)?)?)?$/],
  [2, /^tu(e(s(day)?)?)?$/],
  [3, /^w(e(d(nesday)?)?)?$/],
  [4, /^th(u(r(s(day)?)?)?)?$/],
  [5, /^f(r(i(day)?)?)?$/],
  [6, /^sa(t(urday)?)?$/],
];

/** Day of the week (0 Sunday … 6 Saturday) from "Mon", "monday", "Thurs"; the first of several. */
export function parseWeekday(v: string): { day: number; several: boolean } | null {
  const parts = v
    .toLowerCase()
    .split(/[\s,/&+]+|\band\b/)
    .map((p) => p.replace(/\./g, "").trim())
    .filter(Boolean);
  const days = parts
    .map((p) => DAYS.find(([, re]) => re.test(p))?.[0])
    .filter((d): d is number => d !== undefined);
  return days.length ? { day: days[0]!, several: days.length > 1 } : null;
}

/** Weeks between visits (1 to 4) from "Weekly", "every other week", "Bi-weekly", "2", "Monthly". */
export function parseFrequency(v: string): number | null {
  const s = v.toLowerCase().trim();
  if (!s) return null;
  if (/^1$|^weekly$|every\s*week$|once a week|^1\s*(x|w)/.test(s)) return 1;
  if (/^2$|bi-?weekly|every\s*(other|2|two)\s*weeks?|fortnight/.test(s)) return 2;
  if (/^3$|every\s*(3|three)\s*weeks?/.test(s)) return 3;
  if (/^4$|monthly|every\s*(4|four)\s*weeks?|once a month/.test(s)) return 4;
  if (/week/.test(s)) return 1;
  return null;
}

/** Gallons from "20,000", "20k", "20000 gal". */
export function parseGallons(v: string): number | null {
  const s = v.toLowerCase().replace(/[,\s]|gal(lons?)?/g, "");
  const m = /^(\d+(?:\.\d+)?)(k)?$/.exec(s);
  if (!m) return null;
  const n = Math.round(Number(m[1]) * (m[2] ? 1000 : 1));
  return n > 0 && n < 5_000_000 ? n : null;
}

export function parsePoolType(
  v: string,
): "gunite_plaster" | "vinyl" | "fiberglass" | "other" | null {
  const s = v.toLowerCase();
  if (!s.trim()) return null;
  if (/vinyl|liner/.test(s)) return "vinyl";
  if (/fiber ?glass/.test(s)) return "fiberglass";
  if (/plaster|gunite|shotcrete|pebble|quartz|concrete|tile/.test(s)) return "gunite_plaster";
  return "other";
}

/** "123 Main St, Apt 4, Mesa, AZ 85201" → its parts (best effort; the shop checks the preview). */
export function parseAddress(v: string): {
  address_line1: string;
  address_line2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
} | null {
  const parts = v
    .split(/,|\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (!parts.length) return null;
  const out: ReturnType<typeof parseAddress> = { address_line1: parts[0]! };
  let rest = parts.slice(1);
  // The last part may be "AZ 85201", "Arizona 85201-1234", or "Mesa AZ 85201".
  const last = rest.at(-1) ?? "";
  const m = /^(?:(.*?)\s+)?([A-Za-z]{2}|[A-Za-z][A-Za-z ]+)\s+(\d{5}(?:-\d{4})?)$/.exec(last);
  if (m) {
    out.state = m[2]!.length === 2 ? m[2]!.toUpperCase() : m[2]!;
    out.postal_code = m[3]!;
    rest = rest.slice(0, -1);
    if (m[1]) rest.push(m[1]);
  } else if (/^[A-Za-z]{2}$/.test(last)) {
    out.state = last.toUpperCase();
    rest = rest.slice(0, -1);
  }
  if (rest.length) out.city = rest.pop();
  if (rest.length) out.address_line2 = rest.join(", ");
  return out;
}

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

export interface ImportRecord {
  /** The row in the file (1 is the first row after the header). */
  row: number;
  customer: {
    name: string;
    company_name: string | null;
    email: string | null;
    phone: string | null;
    notes: string | null;
  };
  property: {
    address_line1: string;
    address_line2: string | null;
    city: string | null;
    state: string | null;
    postal_code: string | null;
    approx_gallons: number | null;
    pool_type: string | null;
    access_notes: string | null;
  } | null;
  /** Pool care: a visit plan. */
  plan: {
    weekday: number;
    interval_weeks: number;
    price_cents: number | null;
    tech_id: string | null;
  } | null;
  warnings: string[];
}

export interface ImportProblem {
  row: number;
  message: string;
}

export interface ImportTeamMember {
  id: string;
  name: string | null;
  email: string | null;
}

export const IMPORT_MAX_ROWS = 2000;

/** The file's rows (after the header) as customers, pools, and plans, with what's wrong. */
export function buildImport(
  rows: string[][],
  mapping: ImportField[],
  opts: { services: Services; team: ImportTeamMember[] },
): { records: ImportRecord[]; problems: ImportProblem[] } {
  const records: ImportRecord[] = [];
  const problems: ImportProblem[] = [];
  const pool = opts.services !== "leak";
  const col = (r: string[], f: ImportField) => {
    const i = mapping.indexOf(f);
    return i < 0 ? "" : (r[i] ?? "").trim();
  };
  const techByName = (v: string) => {
    const s = v.toLowerCase().trim();
    if (!s) return null;
    const exact = opts.team.filter(
      (t) => t.name?.toLowerCase() === s || t.email?.toLowerCase() === s,
    );
    if (exact.length === 1) return exact[0]!.id;
    const first = opts.team.filter(
      (t) => t.name?.toLowerCase().split(/\s+/)[0] === s.split(/\s+/)[0],
    );
    return first.length === 1 ? first[0]!.id : null;
  };

  rows.slice(0, IMPORT_MAX_ROWS).forEach((r, i) => {
    const row = i + 1;
    const name =
      col(r, "name") || [col(r, "first_name"), col(r, "last_name")].filter(Boolean).join(" ");
    const company = col(r, "company_name");
    if (!name && !company) {
      problems.push({ row, message: "No name, so it was skipped." });
      return;
    }
    const warnings: string[] = [];
    const emailRaw = col(r, "email").toLowerCase();
    const email = /^\S+@\S+\.\S+$/.test(emailRaw) ? emailRaw.slice(0, 200) : null;
    if (emailRaw && !email) warnings.push(`Email “${emailRaw}” isn’t valid, so it was left out.`);
    const phoneRaw = col(r, "phone");
    const phone = phoneRaw ? (toE164(phoneRaw) ?? phoneRaw.slice(0, 40)) : null;

    const full = col(r, "address") ? parseAddress(col(r, "address")) : null;
    const line1 = col(r, "address_line1") || full?.address_line1 || "";
    const property = line1
      ? {
          address_line1: line1.slice(0, 200),
          address_line2:
            (col(r, "address_line2") || full?.address_line2 || "").slice(0, 100) || null,
          city: (col(r, "city") || full?.city || "").slice(0, 100) || null,
          state: (col(r, "state") || full?.state || "").slice(0, 50) || null,
          postal_code: (col(r, "postal_code") || full?.postal_code || "").slice(0, 20) || null,
          approx_gallons: col(r, "gallons") ? parseGallons(col(r, "gallons")) : null,
          pool_type: parsePoolType(col(r, "pool_type")),
          access_notes: col(r, "access_notes").slice(0, 500) || null,
        }
      : null;
    if (!property) warnings.push("No address, so there’s no pool to visit yet.");
    if (col(r, "gallons") && property && property.approx_gallons === null)
      warnings.push(`Gallons “${col(r, "gallons")}” wasn’t a number.`);

    let plan: ImportRecord["plan"] = null;
    const dayText = col(r, "visit_day");
    if (pool && dayText && property) {
      const day = parseWeekday(dayText);
      const freqText = col(r, "frequency");
      const every = freqText ? parseFrequency(freqText) : 1;
      if (!day) warnings.push(`Service day “${dayText}” wasn’t a day of the week, so no plan.`);
      else {
        if (day.several)
          warnings.push(`More than one service day (“${dayText}”): the first is used.`);
        if (freqText && every === null)
          warnings.push(`How often (“${freqText}”) wasn’t clear: weekly is used.`);
        const interval = every ?? 1;
        // Plans are priced by the month (owner, 2026-10-18).
        let price = col(r, "monthly_price") ? parseDollars(col(r, "monthly_price")) : null;
        if (col(r, "monthly_price") && price === null)
          warnings.push(`Monthly price “${col(r, "monthly_price")}” wasn’t a dollar amount.`);
        if (price === null && col(r, "price")) {
          const perVisit = parseDollars(col(r, "price"));
          // A price per visit times the visits in an average month (one for monthly plans).
          if (perVisit !== null)
            price = interval > 2 ? perVisit : Math.round((perVisit * 52) / 12 / interval);
          else warnings.push(`Price “${col(r, "price")}” wasn’t a dollar amount.`);
        }
        const techText = col(r, "tech");
        const tech = techByName(techText);
        if (techText && !tech)
          warnings.push(`Tech “${techText}” isn’t on the team yet: unassigned.`);
        plan = { weekday: day.day, interval_weeks: interval, price_cents: price, tech_id: tech };
      }
    }

    records.push({
      row,
      customer: {
        name: (name || company).slice(0, 200),
        company_name: name && company ? company.slice(0, 200) : null,
        email,
        phone,
        notes: col(r, "notes").slice(0, 2000) || null,
      },
      property,
      plan,
      warnings,
    });
  });
  if (rows.length > IMPORT_MAX_ROWS)
    problems.push({
      row: IMPORT_MAX_ROWS + 1,
      message: `Only the first ${IMPORT_MAX_ROWS} rows are imported at once; import the rest in a second file.`,
    });
  return { records, problems };
}

/** How a customer is recognized as already in Sundeck Pro (or twice in the file). */
export function customerKeys(c: {
  name: string;
  email: string | null;
  phone: string | null;
  address?: string | null;
}): string[] {
  const keys: string[] = [];
  if (c.email) keys.push(`e:${c.email.toLowerCase()}`);
  const digits = c.phone?.replace(/\D/g, "").slice(-10);
  if (digits && digits.length === 10) keys.push(`p:${digits}`);
  if (c.address) keys.push(`a:${squash(c.name)}|${squash(c.address)}`);
  return keys;
}

/** The first visit: the next service day on or after `today` (YYYY-MM-DD). */
export function firstVisitOn(weekdayWanted: number, today: string): string {
  const diff = (weekdayWanted - weekday(today) + 7) % 7;
  return addDays(today, diff);
}
