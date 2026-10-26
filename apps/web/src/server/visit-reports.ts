import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { toE164, type ReportSnapshot } from "@leakbook/core";
import { emailConfigured, fromAddress, sendEmail } from "./email";
import { activeLine, sendCompanyText } from "./texting";
import { LIMIT_MESSAGE, ccList, emailRefusal, takeAllowance } from "./usage";
import { Fault, Refusal, dbFailure } from "./failures";
import { sendOnce, sentRecently } from "./send-once";

// Maintenance visit reports (owner, 2026-10-20: "build a report with the tested chemicals,
// checklist, cleanings, photos, etc. Then have an option to send the report to customers.
// Include manual send and auto send"). The database freezes the report and makes the link
// (send_visit_report, 20261012006300); this delivers it.

export type VisitChannel = "email" | "sms_device" | "text";

export type VisitSendResult =
  | { skipped: string }
  | {
      token: string;
      link: string;
      /** For texting from the tech's own phone: the prefilled message. */
      message: string;
      /** How it reached the customer: by email, a company text, or not yet (the link only). */
      delivered: "email" | "text" | null;
    };

const short = (shop: string) => `${shop}: your maintenance visit report`;

/**
 * Send a visit's report. `automatic` is the send that follows completing a visit: it happens
 * only in shops that chose Automatic, once per visit, by email when the customer has one, else
 * by company text when the shop has a number. By hand, `channel` picks how.
 *
 * `db` acts as the signed-in member (`userId`), or is the server's service client for the daily
 * catch-up (no `userId`: email only).
 */
export async function sendVisitReport(
  db: SupabaseClient,
  jobId: string,
  opts: {
    automatic?: boolean;
    channel?: VisitChannel;
    to?: string | null;
    origin: string;
    userId?: string;
  },
): Promise<VisitSendResult> {
  const { data, error } = await db.rpc("send_visit_report", {
    target_job: jobId,
    automatic: !!opts.automatic,
  });
  if (error) throw dbFailure(error);
  const sent = data as { token?: string; report_id?: string; skipped?: string };
  if (sent.skipped || !sent.token) return { skipped: sent.skipped ?? "not_sent" };

  const link = `${opts.origin}/r/${sent.token}`;
  const { data: rep } = await db
    .from("report")
    .select("company_id, data_snapshot")
    .eq("id", sent.report_id!)
    .single();
  const snapshot = rep?.data_snapshot as ReportSnapshot & { customer_id?: string };
  const companyId = rep?.company_id as string;
  const shop = snapshot.company.name;
  const message = `${short(shop)}: ${link}`;
  const email = (opts.to ?? snapshot.customer?.email ?? "").trim();

  let channel = opts.channel;
  if (opts.automatic) {
    if (email && emailConfigured()) channel = "email";
    else if (opts.userId && (await activeLine(db, companyId))) channel = "text";
    else channel = undefined;
  }

  const log = (via: string, to: string, delivery: string, extra: Record<string, unknown> = {}) =>
    db.rpc("log_message", {
      target_job: jobId,
      via,
      sent_to: to,
      template_key: "visit_report",
      delivery,
      ...extra,
    });

  if (channel === "email") {
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new Refusal("Enter the customer’s email.");
    if (!emailConfigured()) throw new Refusal("Email isn’t set up on this server. Text the link.");
    const cc = ccList(snapshot.customer?.cc_emails, email);
    const sentTo = [email, ...cc].join(", ");
    // Twice in a row (a double tap, a slow answer asked again) is one email.
    return sendOnce(
      db,
      { jobId, channel: "email", recipient: sentTo, template: "visit_report" },
      async () => {
        // The daily catch-up (no person) checks only the shop's email allowance.
        const refusal = opts.userId
          ? await emailRefusal(db, companyId, 1 + cc.length)
          : (await takeAllowance(companyId, "email", 1 + cc.length))
            ? null
            : LIMIT_MESSAGE;
        if (refusal) throw new Refusal(refusal);
        const greeting = snapshot.customer?.name ? `Hi ${snapshot.customer.name},` : "Hello,";
        const where = snapshot.property.address;
        try {
          const mail = await sendEmail({
            companyId,
            from: fromAddress(shop),
            to: email,
            cc,
            replyTo: snapshot.company.email,
            subject: `Your maintenance visit report from ${shop}`,
            text: `${greeting}\n\nHere’s what we did at ${where} today: the water test, the checklist, and photos.\n${link}\n\n${shop}${snapshot.company.phone ? `\n${snapshot.company.phone}` : ""}`,
            html: `<p>${esc(greeting)}</p><p>Here’s what we did at ${esc(where)} today: the water test, the checklist, and photos.</p><p><a href="${link}">View your visit report</a></p><p>${esc(shop)}${snapshot.company.phone ? `<br>${esc(snapshot.company.phone)}` : ""}</p>`,
          });
          await log("email", sentTo, "sent", { provider: mail.id });
        } catch (e) {
          await log("email", email, "failed", {
            failure: e instanceof Error ? e.message : String(e),
          });
          throw new Fault(
            "The visit report is ready and its link works, but the email didn’t go through. Text the link instead.",
          );
        }
        return { token: sent.token!, link, message, delivered: "email" as const };
      },
      () => ({ token: sent.token!, link, message, delivered: "email" as const }),
    );
  }

  if (channel === "text" && opts.userId) {
    await sendCompanyText(
      db,
      opts.userId,
      {
        companyId,
        phone: toE164(snapshot.customer?.phone) || undefined,
        body: message,
        jobId,
      },
      opts.origin,
    );
    return { token: sent.token, link, message, delivered: "text" };
  }

  if (channel === "sms_device") {
    const phone = snapshot.customer?.phone ?? "phone";
    // One line in the log for a double tap.
    if (
      !(await sentRecently(db, {
        jobId,
        channel: "sms_device",
        recipient: phone,
        template: "visit_report",
      }))
    )
      await log("sms_device", phone, "sent");
  }
  return { token: sent.token, link, message, delivered: null };
}

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/**
 * A Monthly shop's report for a customer with no invoice that month (owner, 2026-10-24): the
 * daily run sends it on its own, once, by email. Customers with an invoice get theirs with it
 * (server/invoices.ts). `db` is the server's service client.
 */
export async function sendMonthReport(
  db: SupabaseClient,
  customerId: string,
  month: string,
  origin: string,
): Promise<boolean> {
  const { data, error } = await db.rpc("send_month_report", {
    target_customer: customerId,
    month,
    target_invoice: null,
    automatic: true,
  });
  if (error) throw dbFailure(error);
  const sent = data as { token?: string; report_id?: string; skipped?: string };
  if (!sent.token || !sent.report_id) return false;
  const link = `${origin}/r/${sent.token}`;
  const { data: rep } = await db
    .from("report")
    .select("company_id, job_id, data_snapshot")
    .eq("id", sent.report_id)
    .single();
  const snapshot = rep?.data_snapshot as ReportSnapshot & { month?: string };
  const email = (snapshot.customer?.email ?? "").trim();
  if (!email || !emailConfigured()) return true;
  const companyId = rep?.company_id as string;
  if (!(await takeAllowance(companyId, "email", 1))) return true;
  const shop = snapshot.company.name;
  const name = new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" }).format(
    new Date(`${month.slice(0, 10)}T12:00:00Z`),
  );
  const greeting = snapshot.customer?.name ? `Hi ${snapshot.customer.name},` : "Hello,";
  const where = snapshot.property.address;
  const log = (delivery: string, extra: Record<string, unknown> = {}) =>
    db.rpc("log_message", {
      target_job: rep?.job_id,
      via: "email",
      sent_to: email,
      template_key: "visit_report",
      delivery,
      ...extra,
    });
  try {
    const mail = await sendEmail({
      companyId,
      from: fromAddress(shop),
      to: email,
      replyTo: snapshot.company.email,
      subject: `Your ${name} service report from ${shop}`,
      text: `${greeting}\n\nHere’s ${name} at ${where}: each water test, the chemicals we added, and photos.\n${link}\n\n${shop}${snapshot.company.phone ? `\n${snapshot.company.phone}` : ""}`,
      html: `<p>${esc(greeting)}</p><p>Here’s ${esc(name)} at ${esc(where)}: each water test, the chemicals we added, and photos.</p><p><a href="${link}">View your service report</a></p><p>${esc(shop)}${snapshot.company.phone ? `<br>${esc(snapshot.company.phone)}` : ""}</p>`,
    });
    await log("sent", { provider: mail.id });
  } catch (e) {
    await log("failed", { failure: e instanceof Error ? e.message : String(e) });
  }
  return true;
}
