import "server-only";
import { CONTACT_EMAIL } from "@/lib/site";
import { adminClient } from "@/server/admin";
import { emailConfigured, fromAddress, sendEmail } from "@/server/email";

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export interface FeatureRequestInput {
  user: { id: string; name: string | null; email: string };
  company: { id: string; name: string };
  request: string;
  /** Where it was sent from: a website path, or the app's screen. */
  page: string | null;
}

/** What the person typed, trimmed and capped, or null when there's nothing. */
export function featureRequestText(value: unknown): string | null {
  const request = String(value ?? "")
    .trim()
    .slice(0, 4000);
  return request || null;
}

export const FEATURE_REQUEST_EMPTY = "Tell us what you’d like Sundeck Pro to do.";
export const FEATURE_REQUEST_THANKS = "Thanks! We read every request.";

/**
 * Request a Feature (owner, 2026-10-19), from the website and the apps: saved to Sundeck
 * Pro's list (/admin/requests) and emailed to the office. Either is enough.
 */
export async function recordFeatureRequest(
  input: FeatureRequestInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { user, company, request } = input;
  const page = input.page?.slice(0, 200) || null;
  const who = user.name ?? user.email;
  let saved = false;
  const admin = adminClient();
  if (admin) {
    const { error } = await admin.from("feature_request").insert({
      user_id: user.id,
      company_ref: company.id,
      name: user.name,
      email: user.email,
      company_name: company.name,
      request,
      page,
    });
    saved = !error;
  }
  if (emailConfigured()) {
    try {
      await sendEmail({
        // To Sundeck Pro itself, never a customer.
        companyId: null,
        from: fromAddress(company.name),
        to: CONTACT_EMAIL,
        replyTo: user.email,
        subject: `Feature request from ${company.name}`,
        text: `${request}\n\n${who} (${user.email}), ${company.name}${page ? `\nPage: ${page}` : ""}`,
        html: `<p style="white-space:pre-line">${escape(request)}</p><p>${escape(who)} (${escape(user.email)}), ${escape(company.name)}${page ? `<br>Page: ${escape(page)}` : ""}</p>`,
      });
      saved = true;
    } catch {
      // Saved to the list is still enough.
    }
  }
  return saved
    ? { ok: true }
    : { ok: false, error: `That didn’t go through. Email your idea to ${CONTACT_EMAIL} instead.` };
}
