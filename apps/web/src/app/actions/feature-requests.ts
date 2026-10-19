"use server";

import { getOffice } from "@/lib/auth";
import { CONTACT_EMAIL } from "@/lib/site";
import { adminClient } from "@/server/admin";
import { emailConfigured, fromAddress, sendEmail } from "@/server/email";
import type { FormState } from "./auth";

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * Request a Feature (owner, 2026-10-19): saved to Sundeck Pro's list (/admin/requests) and
 * emailed to the office. Either is enough; with neither set up, the person is asked to email.
 */
export async function requestFeature(_: FormState, form: FormData): Promise<FormState> {
  const office = await getOffice();
  const request = String(form.get("request") ?? "")
    .trim()
    .slice(0, 4000);
  if (!request) return { fields: { request: "Tell us what you’d like Sundeck Pro to do." } };
  const page = String(form.get("page") ?? "").slice(0, 200) || null;
  const who = office.user.name ?? office.user.email;
  let saved = false;
  const admin = adminClient();
  if (admin) {
    const { error } = await admin.from("feature_request").insert({
      user_id: office.user.id,
      company_ref: office.company.id,
      name: office.user.name,
      email: office.user.email,
      company_name: office.company.name,
      request,
      page,
    });
    saved = !error;
  }
  if (emailConfigured()) {
    try {
      await sendEmail({
        from: fromAddress(office.company.name),
        to: CONTACT_EMAIL,
        replyTo: office.user.email,
        subject: `Feature request from ${office.company.name}`,
        text: `${request}\n\n${who} (${office.user.email}), ${office.company.name}${page ? `\nPage: ${page}` : ""}`,
        html: `<p style="white-space:pre-line">${escape(request)}</p><p>${escape(who)} (${escape(office.user.email)}), ${escape(office.company.name)}${page ? `<br>Page: ${escape(page)}` : ""}</p>`,
      });
      saved = true;
    } catch {
      // Saved to the list is still enough.
    }
  }
  if (!saved)
    return { error: `That didn’t go through. Email your idea to ${CONTACT_EMAIL} instead.` };
  return { message: "Thanks! We read every request." };
}
