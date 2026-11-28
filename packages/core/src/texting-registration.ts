// Texting registration (owner, 2026-11-27; docs/plans/texting-registration.md): before a shop's
// number can text, phone companies need the shop's business on file. Three ways to get a
// number, each with its own review at Twilio; Sundeck Pro pays and submits everything. The
// fields, their checks and the status wording live here so the website and the Android app say
// the same thing (SundeckCore's TextingRegistration.swift mirrors them). No I/O.

import { toE164 } from "./texting";

/** toll_free: a new toll-free number; local: a new local number; own: the shop's existing one. */
export type RegistrationKind = "toll_free" | "local" | "own";
export const REGISTRATION_KINDS: readonly RegistrationKind[] = ["toll_free", "local", "own"];

export const KIND_TITLE: Record<RegistrationKind, string> = {
  toll_free: "Get a Toll-Free Number",
  local: "Get a Local Number",
  own: "Use My Own Number",
};

export const KIND_DETAIL: Record<RegistrationKind, string> = {
  toll_free: "An 800-style number for texts and calls. Usually ready in about a week.",
  local: "A number with your area code. Usually ready in one to three weeks.",
  own: "Text from the number your customers already know. Calls stay with your phone company. Usually ready in one to three weeks.",
};

/** The business types phone companies accept with an EIN (Twilio's names on the server). */
export type BusinessType = "llc" | "corporation" | "partnership" | "sole_proprietor" | "nonprofit";
export const BUSINESS_TYPES: readonly BusinessType[] = [
  "llc",
  "corporation",
  "partnership",
  "sole_proprietor",
  "nonprofit",
];
export const BUSINESS_TYPE_LABEL: Record<BusinessType, string> = {
  llc: "LLC",
  corporation: "Corporation",
  partnership: "Partnership",
  sole_proprietor: "Sole Proprietor",
  nonprofit: "Nonprofit",
};

/** What phone companies ask about the shop. Stored as entered, cleaned up. */
export interface BusinessDetails {
  legal_name: string;
  business_type: BusinessType;
  ein: string;
  street: string;
  city: string;
  state: string;
  postal_code: string;
  website: string;
  first_name: string;
  last_name: string;
  title: string;
  email: string;
  phone: string;
}

export type BusinessField = keyof BusinessDetails;

/** The form, in order: label, placeholder, and the keyboard each field wants. */
export const BUSINESS_FIELDS: readonly {
  key: BusinessField;
  label: string;
  placeholder: string;
  keyboard: "text" | "number" | "email" | "phone" | "url";
}[] = [
  { key: "legal_name", label: "Legal name", placeholder: "Blue Wave Pools LLC", keyboard: "text" },
  { key: "ein", label: "EIN", placeholder: "12-3456789", keyboard: "number" },
  { key: "street", label: "Street", placeholder: "123 Main St", keyboard: "text" },
  { key: "city", label: "City", placeholder: "Las Vegas", keyboard: "text" },
  { key: "state", label: "State", placeholder: "NV", keyboard: "text" },
  { key: "postal_code", label: "ZIP code", placeholder: "89101", keyboard: "number" },
  { key: "website", label: "Website", placeholder: "bluewavepools.com", keyboard: "url" },
  { key: "first_name", label: "First name", placeholder: "Alex", keyboard: "text" },
  { key: "last_name", label: "Last name", placeholder: "Rivera", keyboard: "text" },
  { key: "title", label: "Job title", placeholder: "Owner", keyboard: "text" },
  { key: "email", label: "Email", placeholder: "alex@bluewavepools.com", keyboard: "email" },
  { key: "phone", label: "Mobile", placeholder: "(702) 555-0100", keyboard: "phone" },
];

/** The two groups the form shows them in. */
export const BUSINESS_SECTIONS: readonly { title: string; keys: readonly BusinessField[] }[] = [
  {
    title: "Business",
    keys: [
      "legal_name",
      "business_type",
      "ein",
      "street",
      "city",
      "state",
      "postal_code",
      "website",
    ],
  },
  { title: "Contact person", keys: ["first_name", "last_name", "title", "email", "phone"] },
];

/**
 * What phone companies check in each group (as Housecall Pro tells its pros, 2026-11-28): the
 * website shows the business, and the contact's mobile gets texts.
 */
export const BUSINESS_GROUP_FOOTER: Record<string, string> = {
  Business:
    "Use your legal name and address exactly as on your IRS EIN letter. No website? Use a Facebook, Instagram, or Yelp page that’s been active for a few weeks. Phone companies check that it shows your business name, services, and how to reach you.",
  "Contact person":
    "Use a cell phone that gets texts, not a landline. Phone companies may text it to confirm. Reply YES within 24 hours.",
};

export const BUSINESS_FOOTER =
  "Phone companies require this before your shop can text customers. We submit it for you.";

const US_STATES = new Set(
  (
    "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ " +
    "NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY PR"
  ).split(" "),
);

/**
 * "https://bluewavepools.com" from "bluewavepools.com" (or "http://…": phone companies want the
 * secure address), or null when it isn't a web address.
 */
export function normalizeWebsite(input: string): string | null {
  const t = input.trim();
  if (!t) return null;
  const withScheme = /^https?:\/\//i.test(t) ? t : `https://${t}`;
  try {
    const u = new URL(withScheme);
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(u.hostname)) return null;
    return `https://${u.host}${u.pathname === "/" ? "" : u.pathname}`;
  } catch {
    return null;
  }
}

/**
 * Check and clean the form. Returns the details, or a message per field. Every field is
 * required (phone companies check the website, or a Facebook or Google business page).
 */
export function checkBusinessDetails(
  input: Partial<Record<BusinessField, unknown>>,
): { details: BusinessDetails } | { fields: Partial<Record<BusinessField, string>> } {
  const s = (k: BusinessField) => (typeof input[k] === "string" ? (input[k] as string).trim() : "");
  const fields: Partial<Record<BusinessField, string>> = {};
  const need = (k: BusinessField, message: string) => {
    if (!s(k)) fields[k] = message;
  };
  need("legal_name", "Enter the legal name.");
  need("street", "Enter the street address.");
  need("city", "Enter the city.");
  need("first_name", "Enter a first name.");
  need("last_name", "Enter a last name.");
  need("title", "Enter a job title, like Owner.");

  const type = s("business_type") as BusinessType;
  if (!BUSINESS_TYPES.includes(type)) fields.business_type = "Choose the type of business.";

  const einDigits = s("ein").replace(/\D/g, "");
  if (einDigits.length !== 9) fields.ein = "Enter the 9-digit EIN, like 12-3456789.";

  const state = s("state").toUpperCase();
  if (!US_STATES.has(state)) fields.state = "Enter the 2-letter state, like NV.";

  const zip = s("postal_code");
  if (!/^\d{5}(-\d{4})?$/.test(zip)) fields.postal_code = "Enter a 5-digit ZIP code.";

  const website = normalizeWebsite(s("website"));
  if (!website) fields.website = "Enter a web address, like bluewavepools.com.";

  const email = s("email");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fields.email = "Enter an email address.";

  const phone = toE164(s("phone"));
  if (!phone) fields.phone = "Enter a US cell phone number.";

  if (Object.keys(fields).length) return { fields };
  return {
    details: {
      legal_name: s("legal_name"),
      business_type: type,
      ein: `${einDigits.slice(0, 2)}-${einDigits.slice(2)}`,
      street: s("street"),
      city: s("city"),
      state,
      postal_code: zip,
      website: website!,
      first_name: s("first_name"),
      last_name: s("last_name"),
      title: s("title"),
      email,
      phone: phone!,
    },
  };
}

/** If the phone companies text the contact person to confirm (Housecall Pro's pros see the same). */
const REPLY_YES =
  "If your contact person gets a text asking them to confirm, reply YES within 24 hours.";

/** What the shop sees about a registration. */
export type RegistrationStage = "registering" | "verify_number" | "ready" | "needs_changes";

export interface RegistrationStatus {
  title: string;
  detail: string;
  tone: "info" | "warning" | "success" | "error";
}

/**
 * The status line on Phone and Texting. `problem`: why a review came back, already in plain
 * words (the server words Twilio's reasons); `number`: the line, formatted.
 */
export function registrationStatus(
  stage: RegistrationStage,
  kind: RegistrationKind,
  number: string | null,
  problem: string | null,
): RegistrationStatus {
  switch (stage) {
    case "ready":
      return {
        title: "Ready",
        detail: number ? `Your customers can text ${number}.` : "Your customers can text you.",
        tone: "success",
      };
    case "verify_number":
      return {
        title: "Check Your Phone",
        detail: `To prove ${number ?? "the number"} is yours, the phone company sends a code to it or calls it. Enter the code here, or follow the email sent to your contact person.`,
        tone: "warning",
      };
    case "needs_changes":
      return {
        title: "Needs Changes",
        detail: `${problem ?? "The phone companies couldn’t approve your details."} Edit your business details and we’ll send them again.`,
        tone: "error",
      };
    default:
      return {
        title: "Registering…",
        detail:
          kind === "own"
            ? `Phone companies are reviewing your business. This usually takes one to three weeks. We’ll call or email your contact person to confirm the number is yours. Calls keep ringing where they do today. ${REPLY_YES}`
            : kind === "toll_free"
              ? `Phone companies are reviewing your business. This usually takes about a week. Calls to the number already work. ${REPLY_YES}`
              : `Phone companies are reviewing your business. This usually takes one to three weeks. Calls to the number already work. ${REPLY_YES}`,
        tone: "info",
      };
  }
}
