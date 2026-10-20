import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isManagerRole, isUsNumber, toE164, uuidv7 } from "@leakbook/core";
import { adminClient } from "./admin";
import { TextingError, activeLine, type PhoneLine } from "./texting";
import { TwilioError, buyNumber, searchNumbers, twilioConfigured } from "./twilio";
import { READ_ONLY_MESSAGE, shopWritable } from "./usage";

// The company number (Settings › Phone and Texting), shared by the website's settings page and
// the apps (/api/phone, owner 2026-10-20: "From the app, do not link to the website"). The
// caller has checked the person is an owner or admin of `companyId`; `user` acts as them, and
// the service role writes the line (members can't write phone_line directly).

export type LineResult = { message: string } | { error: string; fields?: Record<string, string> };

const NOT_SET_UP = "Texting isn’t set up on this server.";

function failed(e: unknown): LineResult {
  if (e instanceof TextingError || e instanceof TwilioError) return { error: e.message };
  throw e;
}

/** Whether this server can buy and run numbers. */
export function phoneConfigured(): boolean {
  return twilioConfigured() && !!adminClient();
}

export async function findLineNumbers(areaCode: string) {
  try {
    const numbers = await searchNumbers(areaCode);
    if (!numbers.length) return { error: "No numbers there right now. Try a nearby area code." };
    return { numbers };
  } catch (e) {
    return failed(e);
  }
}

async function addLine(
  user: SupabaseClient,
  companyId: string,
  number: string,
  source: "new" | "existing",
  providerSid: string | null,
): Promise<LineResult> {
  if (!(await shopWritable(user, companyId))) return { error: READ_ONLY_MESSAGE };
  const db = adminClient();
  if (!db) return { error: NOT_SET_UP };
  if (await activeLine(db, companyId)) return { error: "This shop already has a number." };
  const { error } = await db.from("phone_line").insert({
    id: uuidv7(),
    company_id: companyId,
    number,
    source,
    // A shop's own number takes a few days to move or register; Sundeck Pro finishes it.
    status: source === "new" ? "active" : "pending",
    provider_sid: providerSid,
  });
  if (error) {
    return { error: error.code === "23505" ? "Another shop uses that number." : error.message };
  }
  return { message: source === "new" ? "Your number is ready." : "We’ll set up your number." };
}

/**
 * Buy a new local number (Sundeck Pro pays for it). The shop's one line is reserved first, so a
 * double-click or two owners at once can't buy two numbers (security review 2026-10-16); if
 * buying fails, the reservation is let go.
 */
export async function takeLineNumber(
  user: SupabaseClient,
  companyId: string,
  raw: string,
  origin: string,
): Promise<LineResult> {
  const number = toE164(raw);
  if (!isUsNumber(number)) return { error: "Pick a number." };
  // A read-only (unpaid) shop doesn't buy numbers on Sundeck Pro's account (security audit).
  if (!(await shopWritable(user, companyId))) return { error: READ_ONLY_MESSAGE };
  const db = adminClient();
  if (!db) return { error: NOT_SET_UP };
  const id = uuidv7();
  const { error: held } = await db
    .from("phone_line")
    .insert({ id, company_id: companyId, number, source: "new", status: "pending" });
  if (held) {
    if (held.code !== "23505") return { error: held.message };
    return {
      error: (await activeLine(db, companyId))
        ? "This shop already has a number."
        : "Another shop uses that number.",
    };
  }
  try {
    const providerSid = await buyNumber(number, origin);
    const { error } = await db
      .from("phone_line")
      .update({ status: "active", provider_sid: providerSid })
      .eq("id", id);
    if (error) throw new Error(error.message);
  } catch (e) {
    await db.from("phone_line").update({ status: "released" }).eq("id", id);
    return failed(e);
  }
  return { message: "Your number is ready." };
}

/** Use the shop's existing number (set up by Sundeck Pro: ported or registered for texting). */
export async function keepLineNumber(
  user: SupabaseClient,
  companyId: string,
  raw: string,
): Promise<LineResult> {
  const number = toE164(raw);
  if (!number)
    return { error: "Enter a US phone number.", fields: { number: "Enter a US phone number." } };
  return addLine(user, companyId, number, "existing", null);
}

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
  if (error) return { error: error.message };
  return { message: "Saved." };
}

/** Stop setting up an existing number (only while it's pending). */
export async function cancelLineNumber(companyId: string): Promise<LineResult> {
  const db = adminClient();
  if (!db) return { error: NOT_SET_UP };
  await db
    .from("phone_line")
    .update({ status: "released" })
    .eq("company_id", companyId)
    .eq("status", "pending");
  return { message: "Cancelled." };
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
  if (error) return { error: error.message };
  return { message: "Saved." };
}

/** Everything the Phone and Texting page shows. */
export async function phoneSettings(user: SupabaseClient, companyId: string, userId: string) {
  const [line, { data: members }, { data: me }] = await Promise.all([
    activeLine(user, companyId),
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
