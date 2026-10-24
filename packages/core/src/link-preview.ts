import { formatCents } from "./money";
import { dateFormat } from "./intl";
import { reportTitle } from "./report";

/**
 * Link previews for quotes, invoices and reports (owner, 2026-10-24): what Messages, Mail, Slack
 * and the share sheet show for a customer link, instead of Sundeck Pro's own clip. The image is a
 * calm card, like an Apple receipt: the shop's logo (or name), what the document is, and one key
 * detail. The title reads "{Shop}: Quote for {Customer}".
 *
 * Built only from `link_preview_for_token`, which returns fields the link's page already shows:
 * never a phone number, an email or a line item. A link that no longer works, an expired quote,
 * a canceled invoice or an updated report gets a neutral card with the shop's name only.
 */

export type LinkPreviewKind = "quote" | "invoice" | "report";

/** What `link_preview_for_token` returns. */
export interface LinkPreviewRow {
  kind: LinkPreviewKind;
  live: boolean;
  shop: string;
  logo_path?: string | null;
  brand_primary?: string | null;
  timezone?: string | null;
  number?: number | null;
  status?: string | null;
  total_cents?: number | null;
  balance_cents?: number | null;
  valid_until?: string | null;
  due_date?: string | null;
  sent_at?: string | null;
  template_key?: string | null;
  version?: number | null;
  job_type?: string | null;
  customer?: string | null;
  address?: string | null;
  visit_at?: string | null;
}

/** What the 1200×630 card draws. */
export interface LinkPreviewCard {
  /** "document" shows the shop's logo and the details; "neutral" only the shop's name. */
  tone: "document" | "neutral";
  shop: string;
  /** Storage path of the shop's logo (company-assets), or null to set the name in large type. */
  logoPath: string | null;
  /** "Quote", "Invoice", "Leak Detection Report"…; null on a neutral card. */
  docType: string | null;
  /** The key detail: the amount, the pool's street, or the neutral message. */
  headline: string;
  /** A quiet line under it: "Due Nov 15", "Visit on Oct 24 · Tampa, FL 33601". */
  caption: string | null;
  /** True when the headline is money (set in tabular figures, larger). */
  money: boolean;
}

export interface LinkPreview {
  kind: LinkPreviewKind;
  title: string;
  description: string;
  /** The image's alt text. */
  alt: string;
  card: LinkPreviewCard;
}

export const LINK_PREVIEW_TEXT = {
  gone: "This document is no longer available",
  updated: "This report was updated",
  updatedDescription: "Open the link to see the latest version.",
  sentWith: "Sent with Sundeck Pro",
} as const;

/** The document's name on the card, as the owner listed them. */
export function linkPreviewDocType(
  row: Pick<LinkPreviewRow, "kind" | "template_key" | "job_type">,
) {
  if (row.kind === "quote") return "Quote";
  if (row.kind === "invoice") return "Invoice";
  if (row.template_key === "maintenance") return "Maintenance Visit Report";
  return reportTitle(row.job_type);
}

/** "2026-10-24 15:00:00+00" and ISO strings alike; date-only strings are that day, at noon. */
function parseWhen(s: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(`${s}T12:00:00Z`);
  const iso = s.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00");
  return new Date(iso);
}

/** "Nov 15", or "Nov 15, 2027" outside this year, in the shop's time zone. */
function shortDate(s: string, timeZone: string, now: Date): string {
  const d = parseWhen(s);
  const tz = /^\d{4}-\d{2}-\d{2}$/.test(s) ? "UTC" : timeZone;
  const year = (x: Date) => dateFormat("en-US", { year: "numeric", timeZone: tz }).format(x);
  const sameYear = year(d) === year(now);
  return dateFormat("en-US", {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
    timeZone: tz,
  }).format(d);
}

/** "123 Palm Ave" and "Tampa, FL 33601" from "123 Palm Ave, Tampa, FL 33601". */
export function splitAddress(address: string | null | undefined): {
  street: string | null;
  rest: string | null;
} {
  const parts = (address ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (!parts.length) return { street: null, rest: null };
  return { street: parts[0]!, rest: parts.slice(1).join(", ") || null };
}

function neutral(row: LinkPreviewRow, updated: boolean): LinkPreview {
  const shop = row.shop.trim() || "Sundeck Pro";
  const headline = updated ? LINK_PREVIEW_TEXT.updated : LINK_PREVIEW_TEXT.gone;
  return {
    kind: row.kind,
    title: `${shop}: ${headline}`,
    description: updated ? LINK_PREVIEW_TEXT.updatedDescription : `${headline}.`,
    alt: `${shop}: ${headline}`,
    card: {
      tone: "neutral",
      shop,
      logoPath: null,
      docType: null,
      headline,
      caption: null,
      money: false,
    },
  };
}

/** Whether the document's own page treats it as gone: expired, canceled or updated. */
function neutralReason(row: LinkPreviewRow): "gone" | "updated" | null {
  if (!row.live) return "gone";
  if (row.kind === "quote" && row.status === "expired") return "gone";
  if (row.kind === "invoice" && row.status === "void") return "gone";
  if (row.kind === "report" && row.status === "superseded") return "updated";
  return null;
}

/** The preview for one customer link. `now` sets which dates need their year. */
export function linkPreview(row: LinkPreviewRow, now: Date = new Date()): LinkPreview {
  const reason = neutralReason(row);
  if (reason) return neutral(row, reason === "updated");

  const shop = row.shop.trim() || "Sundeck Pro";
  const tz = row.timezone || "America/New_York";
  const docType = linkPreviewDocType(row);
  const { street, rest } = splitAddress(row.address);
  const who = row.customer?.trim() || street;
  const title = `${shop}: ${docType}${who ? ` for ${who}` : ""}`;
  const card = (headline: string, caption: string | null, money: boolean): LinkPreviewCard => ({
    tone: "document",
    shop,
    logoPath: row.logo_path || null,
    docType,
    headline,
    caption,
    money,
  });
  const join = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join(" · ");

  if (row.kind === "quote") {
    const total = formatCents(row.total_cents ?? 0);
    const state =
      row.status === "accepted"
        ? "Accepted"
        : row.status === "declined"
          ? "Declined"
          : row.valid_until
            ? `Good through ${shortDate(row.valid_until, tz, now)}`
            : null;
    return {
      kind: "quote",
      title,
      description: join(total, state),
      alt: `${docType} from ${shop}: ${total}`,
      card: card(total, state, true),
    };
  }

  if (row.kind === "invoice") {
    const paid = row.status === "paid";
    const amount = formatCents((paid ? row.total_cents : row.balance_cents) ?? 0);
    // The due row as the invoice page shows it: on receipt when due the day it was sent.
    const due =
      !paid && row.due_date
        ? row.sent_at && row.due_date <= row.sent_at.slice(0, 10)
          ? "Due on receipt"
          : `Due ${shortDate(row.due_date, tz, now)}`
        : null;
    const partly = row.status === "partially_paid";
    return {
      kind: "invoice",
      title,
      description: paid
        ? join(amount, "Paid in full")
        : join(partly ? `${amount} balance` : amount, due),
      alt: `${docType} from ${shop}: ${amount}${paid ? ", paid in full" : partly ? " balance" : ""}`,
      card: card(
        amount,
        paid ? "Paid in full" : join(partly ? "Balance due" : null, due) || null,
        true,
      ),
    };
  }

  const visit = row.visit_at ? `Visit on ${shortDate(row.visit_at, tz, now)}` : null;
  return {
    kind: "report",
    title,
    description: join(visit, street),
    alt: `${docType} from ${shop}${street ? `: ${street}` : ""}`,
    card: card(street ?? docType, join(visit, rest) || null, false),
  };
}

/**
 * A short fingerprint of what the card shows, for its image URL (`card.png?v=…`): the URL changes
 * whenever the card would, so the image can be kept by caches. FNV-1a, not for security.
 */
/** Bumped when the card's look changes, so caches fetch the new picture (2: white on blue). */
const CARD_DESIGN = 2;

export function linkPreviewVersion(p: LinkPreview): string {
  const text = JSON.stringify([CARD_DESIGN, p.title, p.description, p.card]);
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x5bd1e995) >>> 0;
  }
  return a.toString(16).padStart(8, "0") + b.toString(16).padStart(8, "0");
}

/**
 * The text a tech sends, split into its words and its link, so the share sheet can hand Messages
 * the link as a link (it then shows the preview card) with the words beside it:
 * "Blue Wave Pools: your invoice. View and pay it here:" and "https://sundeckpro.com/i/…".
 */
export function splitShareMessage(message: string): { text: string; url: string | null } {
  const m = /(https?:\/\/\S+)\s*$/.exec(message.trim());
  if (!m) return { text: message.trim(), url: null };
  return { text: message.trim().slice(0, m.index).trim(), url: m[1]! };
}

/** The customer link's token: /q/…, /i/… or /r/… on any host. */
export function customerLinkToken(url: string): string | null {
  const m = /\/(?:q|i|r)\/([0-9a-f]{32})(?:[/?#]|$)/.exec(url);
  return m ? m[1]! : null;
}
