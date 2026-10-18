"use server";

import { revalidatePath } from "next/cache";
import { isUsNumber, toE164, uuidv7 } from "@leakbook/core";
import { getOffice, requireOwner } from "@/lib/auth";
import { siteOrigin } from "@/lib/origin";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/server/admin";
import { TextingError, activeLine, sendCompanyText, startCall } from "@/server/texting";
import { TwilioError, buyNumber, searchNumbers, type AvailableNumber } from "@/server/twilio";
import { READ_ONLY_MESSAGE, shopWritable } from "@/server/usage";
import type { FormState } from "./auth";

// Company texting and calls from the website (owner, 2026-10-16). Sending goes through the
// server (Twilio); the line's settings are owner-only, and RLS checks that again.

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

const PICTURE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/heic"];
const MAX_PICTURE_BYTES = 5 * 1024 * 1024;

function message(e: unknown): string {
  if (e instanceof TextingError || e instanceof TwilioError) return e.message;
  throw e;
}

// ---------------------------------------------------------------------------
// The company number (Settings › Phone and Texting)
// ---------------------------------------------------------------------------

export interface NumberSearch extends FormState {
  numbers?: AvailableNumber[];
}

export async function findNumbers(_: NumberSearch, form: FormData): Promise<NumberSearch> {
  await requireOwner();
  const areaCode = text(form, "area_code");
  try {
    const numbers = await searchNumbers(areaCode);
    if (!numbers.length) return { error: "No numbers there right now. Try a nearby area code." };
    return { numbers, values: { area_code: areaCode } };
  } catch (e) {
    return { error: message(e), values: { area_code: areaCode } };
  }
}

async function addLine(number: string, source: "new" | "existing", providerSid: string | null) {
  const office = await requireOwner();
  if (!(await shopWritable(await createClient(), office.company.id)))
    return { error: READ_ONLY_MESSAGE };
  const db = adminClient();
  if (!db) return { error: "Texting isn’t set up on this server." };
  if (await activeLine(db, office.company.id)) return { error: "This shop already has a number." };
  const { error } = await db.from("phone_line").insert({
    id: uuidv7(),
    company_id: office.company.id,
    number,
    source,
    // A shop's own number takes a few days to move or register; Sundeck Pro finishes it.
    status: source === "new" ? "active" : "pending",
    provider_sid: providerSid,
  });
  if (error) {
    return {
      error: error.code === "23505" ? "Another shop uses that number." : error.message,
    };
  }
  revalidatePath("/", "layout");
  return { message: source === "new" ? "Your number is ready." : "We’ll set up your number." };
}

/**
 * Buy a new local number (Sundeck Pro pays for it). The shop's one line is reserved first, so a
 * double-click or two owners at once can't buy two numbers (security review 2026-10-16); if
 * buying fails, the reservation is let go.
 */
export async function takeNumber(_: FormState, form: FormData): Promise<FormState> {
  const office = await requireOwner();
  const number = toE164(text(form, "number"));
  if (!isUsNumber(number)) return { error: "Pick a number." };
  // A read-only (unpaid) shop doesn't buy numbers on Sundeck Pro's account (security audit).
  if (!(await shopWritable(await createClient(), office.company.id)))
    return { error: READ_ONLY_MESSAGE };
  const db = adminClient();
  if (!db) return { error: "Texting isn’t set up on this server." };
  const id = uuidv7();
  const { error: held } = await db.from("phone_line").insert({
    id,
    company_id: office.company.id,
    number,
    source: "new",
    status: "pending",
  });
  if (held) {
    if (held.code !== "23505") return { error: held.message };
    return {
      error: (await activeLine(db, office.company.id))
        ? "This shop already has a number."
        : "Another shop uses that number.",
    };
  }
  try {
    const providerSid = await buyNumber(number, await siteOrigin());
    const { error } = await db
      .from("phone_line")
      .update({ status: "active", provider_sid: providerSid })
      .eq("id", id);
    if (error) throw new Error(error.message);
  } catch (e) {
    await db.from("phone_line").update({ status: "released" }).eq("id", id);
    return { error: message(e) };
  }
  revalidatePath("/", "layout");
  return { message: "Your number is ready." };
}

/** Use the shop's existing number (set up by Sundeck Pro: ported or registered for texting). */
export async function keepNumber(_: FormState, form: FormData): Promise<FormState> {
  await requireOwner();
  const number = toE164(text(form, "number"));
  if (!number) return { fields: { number: "Enter a US phone number." } };
  return addLine(number, "existing", null);
}

/** Pictures, who rings, and the voicemail greeting. */
export async function saveLine(_: FormState, form: FormData): Promise<FormState> {
  const office = await requireOwner();
  const supabase = await createClient();
  const greeting = text(form, "voicemail_greeting");
  if (greeting.length > 400)
    return { fields: { voicemail_greeting: "Keep it under 400 letters." } };
  const { error } = await supabase
    .from("phone_line")
    .update({
      pictures: form.get("pictures") === "on",
      ring_user_ids: form.getAll("ring").map(String),
      voicemail_greeting: greeting || null,
    })
    .eq("company_id", office.company.id)
    .neq("status", "released");
  if (error) return { error: error.message };
  revalidatePath("/settings/phone");
  return { message: "Saved." };
}

/** Stop setting up an existing number (only while it's pending). */
export async function cancelNumber(): Promise<FormState> {
  const office = await requireOwner();
  const db = adminClient();
  if (!db) return { error: "Texting isn’t set up on this server." };
  await db
    .from("phone_line")
    .update({ status: "released" })
    .eq("company_id", office.company.id)
    .eq("status", "pending");
  revalidatePath("/", "layout");
  return { message: "Cancelled." };
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export interface SendState extends FormState {
  conversationId?: string;
  sentAt?: number;
}

/** Text a customer from the company number, with pictures when they're turned on. */
export async function sendMessage(_: SendState, form: FormData): Promise<SendState> {
  const office = await getOffice();
  const supabase = await createClient();
  const conversationId = text(form, "conversation_id") || undefined;
  const customerId = text(form, "customer_id") || undefined;
  const phone = text(form, "phone") || undefined;

  // Pictures go to the shop's folder first; Twilio fetches them from a signed link.
  const files = form
    .getAll("pictures")
    .filter((f): f is File => f instanceof File && f.size > 0)
    .slice(0, 10);
  const pictures = [];
  for (const file of files) {
    if (!PICTURE_TYPES.includes(file.type)) return { error: "Send photos (JPEG, PNG, or HEIC)." };
    if (file.size > MAX_PICTURE_BYTES) return { error: "Each photo must be under 5 MB." };
    const ext = file.type.split("/")[1];
    const path = `${office.company.id}/out/${uuidv7()}.${ext}`;
    const { error } = await supabase.storage
      .from("texts")
      .upload(path, file, { contentType: file.type });
    if (error) return { error: error.message };
    pictures.push({ path, type: file.type });
  }

  try {
    const sent = await sendCompanyText(
      supabase,
      office.user.id,
      {
        conversationId,
        customerId,
        companyId: office.company.id,
        phone,
        body: text(form, "body"),
        pictures,
        jobId: text(form, "job_id") || null,
      },
      await siteOrigin(),
    );
    revalidatePath("/messages", "layout");
    return { conversationId: sent.conversationId, sentAt: Date.now() };
  } catch (e) {
    return { error: message(e) };
  }
}

/** Ring my phone, then connect me to the customer from the company number. */
export async function callCustomer(conversationId: string): Promise<FormState> {
  const office = await getOffice();
  try {
    const call = await startCall(
      await createClient(),
      office.user.id,
      conversationId,
      await siteOrigin(),
    );
    revalidatePath("/messages", "layout");
    return {
      message: call.demo
        ? "Demo: no call placed (Twilio isn’t connected)."
        : `Calling you at ${call.calling}. Answer to connect.`,
    };
  } catch (e) {
    return { error: message(e) };
  }
}

/** Opening a conversation marks it read for the team. */
export async function markRead(conversationId: string) {
  await setUnread(conversationId, false);
}

/**
 * Mark a conversation unread (or read) for the whole team: unread is shared, as in a team
 * inbox (owner, 2026-10-16: "Remember this is shared across the entire team").
 */
export async function setUnread(conversationId: string, unread: boolean) {
  const supabase = await createClient();
  const { error } = await supabase.from("conversation").update({ unread }).eq("id", conversationId);
  if (error) return { error: error.message };
  revalidatePath("/messages", "layout");
  return {};
}

/** My own mobile number: calls I place ring it first, and incoming calls can ring it. */
export async function saveMyPhone(_: FormState, form: FormData): Promise<FormState> {
  const office = await getOffice();
  const phone = toE164(text(form, "phone"));
  if (!isUsNumber(phone)) return { fields: { phone: "Enter a US mobile number." } };
  const supabase = await createClient();
  const { error } = await supabase.from("profile").update({ phone }).eq("id", office.user.id);
  if (error) return { error: error.message };
  revalidatePath("/messages", "layout");
  revalidatePath("/settings/phone");
  return { message: "Saved." };
}
