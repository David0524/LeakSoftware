import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isManagerRole, isUsNumber, toE164 } from "@leakbook/core";
import { adminClient } from "./admin";
import { REVIEW_NUMBERS_MESSAGE, isReviewShop } from "./review-shop";
import { TextingError, activeLine, type PhoneLine } from "./texting";
import { cancelRegistration, currentRegistration, registrationView } from "./texting-registration";
import { TwilioError, searchNumbers, twilioConfigured } from "./twilio";

import { friendlyDbError } from "@/lib/limits";
// The company number (Settings › Phone and Texting), shared by the website's settings page and
// the apps (/api/phone, owner 2026-10-20: "From the app, do not link to the website"). The
// caller has checked the person is an owner or admin of `companyId`; `user` acts as them, and
// the service role writes the line (members can't write phone_line directly).

export type LineResult = { message: string } | { error: string; fields?: Record<string, string> };

function failed(e: unknown): LineResult {
  if (e instanceof TextingError || e instanceof TwilioError) return { error: e.message };
  throw e;
}

/** Whether this server can buy and run numbers. */
export function phoneConfigured(): boolean {
  return twilioConfigured() && !!adminClient();
}

export async function findLineNumbers(companyId: string, areaCode: string) {
  try {
    // The App Review shop never gets a number (review-shop.ts): say so before a search.
    if (await isReviewShop(companyId)) return { error: REVIEW_NUMBERS_MESSAGE };
    const numbers = await searchNumbers(areaCode);
    if (!numbers.length) return { error: "No numbers there right now. Try a nearby area code." };
    return { numbers };
  } catch (e) {
    return failed(e);
  }
}

/**
 * Older apps' "take a number" and "use my number" (before registrations, 2026-11-27): a number
 * can't text until its business is registered, so those versions are asked to update.
 */
export const UPDATE_TO_REGISTER =
  "Update Sundeck Pro to set up a number. Phone companies now need your business details first.";

/** Pictures, who rings, and the voicemail greeting. */
export async function saveLineSettings(
  user: SupabaseClient,
  companyId: string,
  input: { pictures: boolean; ringUserIds: string[]; greeting: string },
): Promise<LineResult> {
  const greeting = input.greeting.trim();
  if (greeting.length > 400)
    return {
      error: "Keep it under 400 letters.",
      fields: { voicemail_greeting: "Keep it under 400 letters." },
    };
  const { error } = await user
    .from("phone_line")
    .update({
      pictures: input.pictures,
      ring_user_ids: input.ringUserIds,
      voicemail_greeting: greeting || null,
    })
    .eq("company_id", companyId)
    .neq("status", "released");
  if (error) return { error: friendlyDbError(error.message) };
  return { message: "Saved." };
}

/** Stop setting up a number (only while it's pending). */
export async function cancelLineNumber(companyId: string): Promise<LineResult> {
  return cancelRegistration(companyId);
}

/** My own mobile number: calls I place ring it first, and incoming calls can ring it. */
export async function saveOwnPhone(
  user: SupabaseClient,
  userId: string,
  raw: string,
): Promise<LineResult> {
  const phone = toE164(raw);
  if (!isUsNumber(phone))
    return { error: "Enter a US mobile number.", fields: { phone: "Enter a US mobile number." } };
  const { error } = await user.from("profile").update({ phone }).eq("id", userId);
  if (error) return { error: friendlyDbError(error.message) };
  return { message: "Saved." };
}

/** Everything the Phone and Texting page shows. */
export async function phoneSettings(user: SupabaseClient, companyId: string, userId: string) {
  const [line, registration, { data: members }, { data: me }] = await Promise.all([
    activeLine(user, companyId),
    currentRegistration(user, companyId),
    user
      .from("membership")
      .select(
        "user_id, role, profile:profile!membership_user_profile_fkey(full_name, email, phone)",
      )
      .eq("company_id", companyId)
      .eq("status", "active")
      .is("deleted_at", null),
    user.from("profile").select("phone").eq("id", userId).maybeSingle(),
  ]);
  const rings = (id: string, role: string) =>
    line?.ring_user_ids.length ? line.ring_user_ids.includes(id) : isManagerRole(role);
  const team = (
    (members ?? []) as unknown as {
      user_id: string;
      role: string;
      profile: { full_name: string | null; email: string | null; phone: string | null } | null;
    }[]
  ).map((m) => ({
    user_id: m.user_id,
    name: m.profile?.full_name || m.profile?.email || "Teammate",
    role: m.role,
    phone: toE164(m.profile?.phone) || null,
    rings: rings(m.user_id, m.role),
  }));
  return {
    configured: phoneConfigured(),
    line: line ? lineView(line) : null,
    registration: registrationView(registration, line?.number ?? null),
    my_phone: (me?.phone as string | null) ?? null,
    team,
  };
}

function lineView(line: PhoneLine) {
  return {
    number: line.number,
    status: line.status,
    pictures: line.pictures,
    ring_user_ids: line.ring_user_ids,
    voicemail_greeting: line.voicemail_greeting,
  };
}
