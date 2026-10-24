import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  weeklySummaryEmail,
  weeklySummaryNumbers,
  type WeeklySummaryData,
} from "@/lib/weekly-summary";
import { emailConfigured, sendEmail } from "./email";

// The weekly summary email (owner, 2026-10-22), sent by the daily cron: on Monday in each
// shop's time zone (Tuesday catches a missed run) to the owners, and the admins who turn it
// on. Each person's email is claimed in public.weekly_summary first, so a second run, or two
// at once, never send it twice; a failed send is tried again on the next run, up to 3 times.

export interface WeeklySummaryRun {
  shops: number;
  sent: number;
  failed: number;
  /** Already claimed by another run, or a shop with nothing to say. */
  skipped: number;
}

interface Due {
  company_id: string;
  week_of: string;
  recipients: { user_id: string; email: string; role: string }[];
}

/** From "Sundeck Pro" at the sending domain; replies go to support. */
function from(): string {
  const domain = process.env.EMAIL_FROM_DOMAIN || "send.sundeckpro.com";
  return `"Sundeck Pro" <summary@${domain}>`;
}

/** The shop's logo for the email: a signed link that works for 30 days, or null. */
async function logoUrl(admin: SupabaseClient, path: string | null): Promise<string | null> {
  if (!path) return null;
  try {
    const { data } = await admin.storage
      .from("company-assets")
      .createSignedUrl(path, 60 * 60 * 24 * 30);
    return data?.signedUrl ?? null;
  } catch {
    return null;
  }
}

export async function runWeeklySummaries(
  admin: SupabaseClient,
  origin: string,
  at: Date = new Date(),
  supportEmail?: string,
): Promise<WeeklySummaryRun> {
  const run: WeeklySummaryRun = { shops: 0, sent: 0, failed: 0, skipped: 0 };
  if (!emailConfigured()) return run;
  const { data: dueData, error } = await admin.rpc("weekly_summaries_due", {
    at: at.toISOString(),
  });
  if (error) throw new Error(error.message);
  for (const shop of (dueData ?? []) as Due[]) {
    run.shops++;
    const { data, error: dataError } = await admin.rpc("weekly_summary_data", {
      target_company: shop.company_id,
      week_of: shop.week_of,
    });
    const summary = data as WeeklySummaryData | null;
    if (dataError || !summary) {
      run.failed += shop.recipients.length;
      continue;
    }
    // A week with nothing done, owed, waiting, or coming up: no email (and no claim).
    if (weeklySummaryNumbers(summary, at).empty) {
      run.skipped += shop.recipients.length;
      continue;
    }
    const logo = await logoUrl(admin, summary.company.logo_path);
    for (const r of shop.recipients) {
      const email = (token: string) =>
        weeklySummaryEmail({ data: summary, now: at, origin, token, logoUrl: logo, role: r.role });
      const { data: token } = await admin.rpc("claim_weekly_summary", {
        target_company: shop.company_id,
        target_week: shop.week_of,
        target_user: r.user_id,
        to_email: r.email,
      });
      if (typeof token !== "string" || !token) {
        run.skipped++; // Another run claimed it first, or it was sent already.
        continue;
      }
      try {
        const sent = await sendEmail({
          companyId: shop.company_id,
          from: from(),
          to: r.email,
          replyTo: supportEmail ?? null,
          ...email(token),
        });
        await admin.rpc("finish_weekly_summary", {
          link_token: token,
          delivered: true,
          provider: sent.id,
        });
        run.sent++;
      } catch (e) {
        await admin.rpc("finish_weekly_summary", {
          link_token: token,
          delivered: false,
          failure: e instanceof Error ? e.message : String(e),
        });
        run.failed++;
      }
    }
  }
  return run;
}
