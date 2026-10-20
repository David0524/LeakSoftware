"use server";

import { revalidatePath } from "next/cache";
import { uuidv7 } from "@leakbook/core";
import { getOffice, requireManager } from "@/lib/auth";
import { siteOrigin } from "@/lib/origin";
import { createClient } from "@/lib/supabase/server";
import {
  cancelLineNumber,
  findLineNumbers,
  keepLineNumber,
  saveLineSettings,
  saveOwnPhone,
  takeLineNumber,
  type LineResult,
} from "@/server/phone-line";
import { TextingError, sendCompanyText, startCall } from "@/server/texting";
import { TwilioError, type AvailableNumber } from "@/server/twilio";
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
  await requireManager();
  const areaCode = text(form, "area_code");
  const found = await findLineNumbers(areaCode);
  return { ...found, values: { area_code: areaCode } };
}

function done(result: LineResult): FormState {
  if ("error" in result) return result.fields ? { fields: result.fields } : { error: result.error };
  revalidatePath("/", "layout");
  return { message: result.message };
}

/** Buy a new local number (Sundeck Pro pays for it). */
export async function takeNumber(_: FormState, form: FormData): Promise<FormState> {
  const office = await requireManager();
  return done(
    await takeLineNumber(
      await createClient(),
      office.company.id,
      text(form, "number"),
      await siteOrigin(),
    ),
  );
}

/** Use the shop's existing number (set up by Sundeck Pro: ported or registered for texting). */
export async function keepNumber(_: FormState, form: FormData): Promise<FormState> {
  const office = await requireManager();
  return done(await keepLineNumber(await createClient(), office.company.id, text(form, "number")));
}

/** Pictures, who rings, and the voicemail greeting. */
export async function saveLine(_: FormState, form: FormData): Promise<FormState> {
  const office = await requireManager();
  return done(
    await saveLineSettings(await createClient(), office.company.id, {
      pictures: form.get("pictures") === "on",
      ringUserIds: form.getAll("ring").map(String),
      greeting: text(form, "voicemail_greeting"),
    }),
  );
}

/** Stop setting up an existing number (only while it's pending). */
export async function cancelNumber(): Promise<FormState> {
  const office = await requireManager();
  return done(await cancelLineNumber(office.company.id));
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
  const result = await saveOwnPhone(await createClient(), office.user.id, text(form, "phone"));
  if ("error" in result) return result.fields ? { fields: result.fields } : { error: result.error };
  revalidatePath("/messages", "layout");
  revalidatePath("/settings/phone");
  return { message: result.message };
}
