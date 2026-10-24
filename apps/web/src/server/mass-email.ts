import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  MASS_EMAIL_LIST_CHANGED,
  MASS_EMAIL_NO_ADDRESS,
  MASS_EMAIL_NOBODY,
  customerShowOptions,
  massEmailAudience,
  massEmailContent,
  massEmailErrors,
  massEmailFirstName,
  massEmailLimitText,
  massEmailSentText,
  massEmailTestSent,
  offersPool,
  shopMailingAddress,
  type MassEmailAudience,
  type MassEmailCount,
} from "@leakbook/core";
import { emailConfigured, fromAddress, sendEmail, sendEmailBatch, type Email } from "./email";
import { dailyLimit, READ_ONLY_MESSAGE, shopWritable, takeAllowance } from "./usage";

// Email Customers (owner, 2026-10-22): one email to the customers a filter picks. Shared by the
// website's actions and the apps' /api/mass-email calls, so every platform gets the same
// answers. Every call acts as the signed-in person (their own Supabase client): the database
// lets only the shop's owners and admins count, start, finish and read campaigns.
// Design: docs/design/2026-10-22-mass-email.md.

export interface MassEmailHistoryRow {
  id: string;
  subject: string;
  status: string;
  recipient_count: number;
  sent_count: number;
  failed_count: number;
  created_at: string;
}

export interface MassEmailSetup {
  shop: { name: string; address: string | null };
  /** The Show menu's choices (the Customers page's, without counts). */
  shows: { value: string; label: string }[];
  cities: string[];
  /** Mass emails the shop can still send today (their own daily allowance, apart from reports). */
  left: number;
  /** Whether the server can send email at all. */
  configured: boolean;
  history: MassEmailHistoryRow[];
}

export type MassEmailResult =
  | { ok: true; message: string; sent?: number; failed?: number }
  | { ok: false; error?: string; fields?: Record<string, string>; status: number };

const ONLY_MANAGERS = "Only owners and admins can email customers.";
const NOT_SET_UP = "Email isn’t set up yet. Try again later.";

interface Shop {
  name: string;
  email: string | null;
  address: string | null;
  settings: unknown;
}

async function shop(db: SupabaseClient, companyId: string): Promise<Shop | null> {
  const { data } = await db
    .from("company")
    .select("name, email, address_line1, address_line2, city, state, postal_code, settings")
    .eq("id", companyId)
    .maybeSingle();
  if (!data) return null;
  return {
    name: data.name as string,
    email: (data.email as string | null) ?? null,
    address: shopMailingAddress(data),
    settings: data.settings,
  };
}

/** The page's data: the shop's name and address, filter choices, what's left today, history. */
export async function massEmailSetup(
  db: SupabaseClient,
  companyId: string,
): Promise<MassEmailSetup | null> {
  const [company, setup, history] = await Promise.all([
    shop(db, companyId),
    db.rpc("email_campaign_setup", { target_company: companyId }),
    massEmailHistory(db, companyId),
  ]);
  if (!company || setup.error || !setup.data) return null;
  const data = setup.data as { cities?: string[]; used_today?: number };
  return {
    shop: { name: company.name, address: company.address },
    shows: customerShowOptions(offersPool(company.settings)),
    cities: data.cities ?? [],
    left: Math.max(0, dailyLimit("mass_email") - Number(data.used_today ?? 0)),
    configured: emailConfigured(),
    history,
  };
}

/** Earlier mass emails, newest first. */
export async function massEmailHistory(
  db: SupabaseClient,
  companyId: string,
): Promise<MassEmailHistoryRow[]> {
  const { data } = await db
    .from("email_campaign")
    .select("id, subject, status, recipient_count, sent_count, failed_count, created_at")
    .eq("company_id", companyId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(50);
  return (data ?? []) as MassEmailHistoryRow[];
}

/** The live count for a filter, or null when the person can't (not a manager). */
export async function massEmailCount(
  db: SupabaseClient,
  companyId: string,
  audience: MassEmailAudience,
): Promise<MassEmailCount | null> {
  const { data, error } = await db.rpc("email_audience_count", {
    target_company: companyId,
    audience,
  });
  if (error || !data) return null;
  const c = data as Partial<MassEmailCount>;
  return {
    recipients: Number(c.recipients ?? 0),
    no_email: Number(c.no_email ?? 0),
    unsubscribed: Number(c.unsubscribed ?? 0),
  };
}

function fieldsFor(subject: string, body: string): Record<string, string> | null {
  const errors = massEmailErrors(subject, body);
  return Object.keys(errors).length ? (errors as Record<string, string>) : null;
}

/** Checks shared by a test and a real send: a shop with an address that isn't read-only. */
async function ready(
  db: SupabaseClient,
  companyId: string,
): Promise<{ shop: Shop & { address: string } } | MassEmailResult> {
  const company = await shop(db, companyId);
  if (!company) return { ok: false, error: ONLY_MANAGERS, status: 403 };
  if (!company.address) return { ok: false, error: MASS_EMAIL_NO_ADDRESS, status: 400 };
  if (!emailConfigured()) return { ok: false, error: NOT_SET_UP, status: 503 };
  if (!(await shopWritable(db, companyId)))
    return { ok: false, error: READ_ONLY_MESSAGE, status: 403 };
  return { shop: { ...company, address: company.address } };
}

/** Send Test to Me: the email to the signed-in person, "Test: " before the subject. */
export async function sendMassEmailTest(
  db: SupabaseClient,
  companyId: string,
  me: { email: string; name: string | null },
  input: { subject: string; body: string },
  origin: string,
): Promise<MassEmailResult> {
  const fields = fieldsFor(input.subject, input.body);
  if (fields) return { ok: false, fields, status: 400 };
  // Only managers may (the count is the database's check), the same as a real send.
  if (!(await massEmailCount(db, companyId, massEmailAudience({}))))
    return { ok: false, error: ONLY_MANAGERS, status: 403 };
  const r = await ready(db, companyId);
  if (!("shop" in r)) return r;
  if (!me.email) return { ok: false, error: "Your account has no email address.", status: 400 };
  // A test counts against mass email's own allowance, like the real send it previews.
  if (!(await takeAllowance(companyId, "mass_email", 1)))
    return { ok: false, error: massEmailLimitText(0), status: 429 };
  const content = massEmailContent({
    subject: input.subject,
    body: input.body,
    firstName: massEmailFirstName(me.name ?? me.email.split("@")[0]),
    shop: { name: r.shop.name, address: r.shop.address },
    unsubscribeUrl: `${origin}/unsubscribe/test`,
    test: true,
  });
  try {
    await sendEmail({
      companyId,
      from: fromAddress(r.shop.name, "news"),
      to: me.email,
      replyTo: r.shop.email,
      ...content,
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e), status: 502 };
  }
  return { ok: true, message: massEmailTestSent(me.email) };
}

/**
 * Sends a mass email to everyone the filter picks. `expected` is the count the person
 * confirmed in the alert; a list that moved since then sends nothing.
 */
export async function sendMassEmail(
  db: SupabaseClient,
  companyId: string,
  input: { subject: string; body: string; audience: MassEmailAudience; expected: number },
  origin: string,
): Promise<MassEmailResult> {
  const fields = fieldsFor(input.subject, input.body);
  if (fields) return { ok: false, fields, status: 400 };
  const count = await massEmailCount(db, companyId, input.audience);
  if (!count) return { ok: false, error: ONLY_MANAGERS, status: 403 };
  if (count.recipients === 0) return { ok: false, error: MASS_EMAIL_NOBODY, status: 400 };
  if (count.recipients !== input.expected)
    return { ok: false, error: MASS_EMAIL_LIST_CHANGED, status: 409 };
  const r = await ready(db, companyId);
  if (!("shop" in r)) return r;
  const { data: setup } = await db.rpc("email_campaign_setup", { target_company: companyId });
  const left = Math.max(
    0,
    dailyLimit("mass_email") - Number((setup as { used_today?: number } | null)?.used_today ?? 0),
  );
  if (count.recipients > left || !(await takeAllowance(companyId, "mass_email", count.recipients)))
    return { ok: false, error: massEmailLimitText(left), status: 429 };

  const { data: started, error } = await db.rpc("start_email_campaign", {
    target_company: companyId,
    subject: input.subject.trim(),
    body: input.body.trim(),
    audience: input.audience,
    expected: input.expected,
  });
  if (error || !started) {
    const message = error?.message ?? "";
    if (message.startsWith("list_changed"))
      return { ok: false, error: MASS_EMAIL_LIST_CHANGED, status: 409 };
    if (message.startsWith("nobody")) return { ok: false, error: MASS_EMAIL_NOBODY, status: 400 };
    if (error?.code === "42501") return { ok: false, error: ONLY_MANAGERS, status: 403 };
    return { ok: false, error: message || "It didn’t go. Try again.", status: 500 };
  }
  const campaign = started as {
    id: string;
    recipients: { id: string; name: string; kind: string; email: string; token: string }[];
  };
  const emails: Email[] = campaign.recipients.map((p) => {
    const content = massEmailContent({
      subject: input.subject,
      body: input.body,
      firstName: massEmailFirstName(p.name, p.kind),
      shop: { name: r.shop.name, address: r.shop.address },
      unsubscribeUrl: `${origin}/unsubscribe/${p.token}`,
    });
    return {
      companyId,
      from: fromAddress(r.shop.name, "news"),
      to: p.email,
      replyTo: r.shop.email,
      ...content,
      // RFC 8058: mail apps show their own Unsubscribe, which posts here.
      headers: {
        "List-Unsubscribe": `<${origin}/api/unsubscribe/${p.token}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    };
  });
  const results = await sendEmailBatch(emails);
  const { data: totals } = await db.rpc("finish_email_campaign", {
    target_campaign: campaign.id,
    results: campaign.recipients.map((p, i) => {
      const res = results[i];
      return res && "id" in res
        ? { id: p.id, sent: true, provider_id: res.id }
        : { id: p.id, sent: false, error: res?.error ?? "Not sent" };
    }),
  });
  const t = (totals ?? {}) as { sent?: number; failed?: number };
  const sent = Number(t.sent ?? results.filter((x) => "id" in x).length);
  const failed = Number(t.failed ?? results.length - sent);
  if (sent === 0) return { ok: false, error: massEmailSentText(0, failed), status: 502 };
  return { ok: true, message: massEmailSentText(sent, failed), sent, failed };
}
