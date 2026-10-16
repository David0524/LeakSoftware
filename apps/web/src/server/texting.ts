import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  conversationPreview,
  formatPhone,
  inBusinessHours,
  optKeyword,
  isUsNumber,
  toE164,
} from "@leakbook/core";
import { adminClient } from "./admin";
import { fetchTwilioFile, sendText, startBridgeCall, twilioConfigured, twiml, xml } from "./twilio";

// Company texting and calls (owner, 2026-10-16), as Housecall Pro does them: one company number
// per shop; texts and calls with each customer in one conversation the whole team sees. The
// signed-in person's own client checks access; the service role writes (members can't write
// texts directly, only through here).

export class TextingError extends Error {}

type Db = SupabaseClient;

export interface PhoneLine {
  id: string;
  company_id: string;
  number: string;
  status: "pending" | "active" | "released";
  pictures: boolean;
  ring_user_ids: string[];
  voicemail_greeting: string | null;
}

export interface Picture {
  path: string;
  type: string;
}

function admin(): Db {
  const a = adminClient();
  if (!a) throw new TextingError("Texting isn’t set up on this server.");
  return a;
}

/** The shop's working number, if it has one. */
export async function activeLine(db: Db, companyId: string): Promise<PhoneLine | null> {
  const { data } = await db
    .from("phone_line")
    .select("id, company_id, number, status, pictures, ring_user_ids, voicemail_greeting")
    .eq("company_id", companyId)
    .neq("status", "released")
    .is("deleted_at", null)
    .maybeSingle();
  return (data as PhoneLine | null) ?? null;
}

async function lineByNumber(db: Db, number: string) {
  const { data } = await db
    .from("phone_line")
    .select("id, company_id, number, status, pictures, ring_user_ids, voicemail_greeting")
    .eq("number", number)
    .neq("status", "released")
    .is("deleted_at", null)
    .maybeSingle();
  return (data as PhoneLine | null) ?? null;
}

/** The conversation with a phone number, made (and matched to a customer) the first time. */
export async function conversationFor(db: Db, companyId: string, phone: string) {
  const { data: found } = await db
    .from("conversation")
    .select("id, customer_id, opted_out")
    .eq("company_id", companyId)
    .eq("phone", phone)
    .is("deleted_at", null)
    .maybeSingle();
  if (found) return found as { id: string; customer_id: string | null; opted_out: boolean };
  // Customers' numbers are typed every which way; compare them as +1...
  const { data: customers } = await db
    .from("customer")
    .select("id, phone")
    .eq("company_id", companyId)
    .not("phone", "is", null)
    .is("deleted_at", null);
  const customer = (customers ?? []).find((c) => toE164(c.phone as string) === phone);
  const { data: made, error } = await db
    .from("conversation")
    .insert({ company_id: companyId, phone, customer_id: customer?.id ?? null })
    .select("id, customer_id, opted_out")
    .single();
  if (error?.code === "23505") {
    // Another webhook made it first (carriers split a text and its picture into two
    // messages that arrive together): use that one, so neither message is lost.
    const { data: again } = await db
      .from("conversation")
      .select("id, customer_id, opted_out")
      .eq("company_id", companyId)
      .eq("phone", phone)
      .is("deleted_at", null)
      .maybeSingle();
    if (again) return again as { id: string; customer_id: string | null; opted_out: boolean };
  }
  if (error) throw new TextingError(error.message);
  return made as { id: string; customer_id: string | null; opted_out: boolean };
}

async function touch(db: Db, conversationId: string, preview: string, unread: boolean) {
  await db
    .from("conversation")
    .update({ last_at: new Date().toISOString(), last_preview: preview, unread })
    .eq("id", conversationId);
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

export interface SendInput {
  /** An existing conversation, or a customer (their phone), or a phone in the company. */
  conversationId?: string;
  customerId?: string;
  companyId?: string;
  phone?: string;
  body: string;
  pictures?: Picture[];
  jobId?: string | null;
}

/** Send a text from the company number, as the signed-in person. */
export async function sendCompanyText(user: Db, userId: string, input: SendInput, origin: string) {
  const body = input.body.trim();
  // The phone app's API passes JSON straight through: check its shape (security review
  // 2026-10-16), up to 10 pictures, images only.
  const raw: unknown = input.pictures ?? [];
  if (
    !Array.isArray(raw) ||
    raw.length > 10 ||
    raw.some(
      (p) =>
        typeof p?.path !== "string" ||
        typeof p?.type !== "string" ||
        !/^image\/[a-z0-9.+-]+$/i.test(p.type),
    )
  )
    throw new TextingError("Send up to 10 photos.");
  const pictures = raw as Picture[];
  if (!body && pictures.length === 0) throw new TextingError("Write a message first.");
  if (body.length > 1600) throw new TextingError("That’s too long for a text.");

  // Find who it goes to, through the person's own access.
  let companyId: string;
  let phone: string | null;
  if (input.conversationId) {
    const { data } = await user
      .from("conversation")
      .select("company_id, phone")
      .eq("id", input.conversationId)
      .maybeSingle();
    if (!data) throw new TextingError("That conversation isn’t there.");
    companyId = data.company_id as string;
    phone = data.phone as string;
  } else if (input.customerId) {
    const { data } = await user
      .from("customer")
      .select("company_id, phone")
      .eq("id", input.customerId)
      .maybeSingle();
    if (!data) throw new TextingError("That customer isn’t there.");
    companyId = data.company_id as string;
    phone = toE164(data.phone as string | null);
    if (!phone) throw new TextingError("Add a mobile number for this customer first.");
  } else {
    phone = toE164(input.phone);
    if (!phone || !input.companyId) throw new TextingError("Enter a phone number.");
    const { data } = await user
      .from("company")
      .select("id")
      .eq("id", input.companyId)
      .maybeSingle();
    if (!data) throw new TextingError("Sign in again.");
    companyId = input.companyId;
  }
  if (!isUsNumber(phone)) throw new TextingError("Tidemark texts US and Canadian numbers only.");

  const db = admin();
  const line = await activeLine(db, companyId);
  // A pending line (the shop's own number, not set up yet) isn't Tidemark's to send from.
  if (line?.status !== "active")
    throw new TextingError("Set up a company number first (Settings › Phone and Texting).");
  if (pictures.length && !line.pictures)
    throw new TextingError("Pictures in texts are turned off.");
  if (pictures.some((p) => !p.path.startsWith(`${companyId}/`)))
    throw new TextingError("That picture isn’t this shop’s.");
  const conv = input.conversationId
    ? { id: input.conversationId, ...(await optedOut(db, input.conversationId)) }
    : await conversationFor(db, companyId, phone);
  if (conv.opted_out)
    throw new TextingError("This customer replied STOP. They can text START to get texts again.");

  const { data: row, error } = await db
    .from("text_message")
    .insert({
      company_id: companyId,
      conversation_id: conv.id,
      direction: "out",
      body: body || null,
      media: pictures,
      status: "queued",
      sent_by: userId,
      job_id: input.jobId ?? null,
    })
    .select("id")
    .single();
  if (error) throw new TextingError(error.message);

  // Twilio fetches pictures from links that work for a few days.
  const mediaUrls: string[] = [];
  for (const p of pictures) {
    const { data } = await db.storage.from("texts").createSignedUrl(p.path, 7 * 86_400);
    if (data?.signedUrl) mediaUrls.push(data.signedUrl);
  }
  let status: "queued" | "sent" | "failed" = "failed";
  let errorText: string | null = null;
  let providerSid: string | null = null;
  try {
    const sent = await sendText({
      from: line.number,
      to: phone,
      body,
      mediaUrls,
      statusCallback: `${origin}/api/twilio/status`,
    });
    status = sent.status;
    providerSid = sent.sid;
  } catch (e) {
    errorText = e instanceof Error ? e.message : String(e);
  }
  await db
    .from("text_message")
    .update({ status, provider_sid: providerSid, error: errorText })
    .eq("id", row.id);
  await touch(
    db,
    conv.id,
    conversationPreview({ kind: "text", body, pictures: pictures.length }),
    false,
  );
  if (errorText) throw new TextingError(`Not sent: ${errorText}`);
  return { id: row.id as string, conversationId: conv.id, demo: !twilioConfigured() };
}

async function optedOut(db: Db, conversationId: string) {
  const { data } = await db
    .from("conversation")
    .select("opted_out")
    .eq("id", conversationId)
    .single();
  return { opted_out: Boolean(data?.opted_out) };
}

// ---------------------------------------------------------------------------
// Webhooks: texts in, delivery updates
// ---------------------------------------------------------------------------

/** A text (and its pictures) from a customer. Returns the TwiML reply. */
export async function receiveText(params: Record<string, string>): Promise<Response> {
  const db = admin();
  const line = await lineByNumber(db, params.To ?? "");
  // Short codes and named senders aren't customers: nothing to file them under.
  const from = toE164(params.From);
  if (!line || !from) return twiml("");
  const conv = await conversationFor(db, line.company_id, from);

  const pictures: Picture[] = [];
  const count = Number(params.NumMedia ?? 0);
  for (let i = 0; i < Math.min(count, 10); i++) {
    const url = params[`MediaUrl${i}`];
    const type = params[`MediaContentType${i}`] ?? "application/octet-stream";
    if (!url) continue;
    const res = await fetchTwilioFile(url);
    if (!res.ok) continue;
    const ext = type.split("/")[1]?.split(";")[0] ?? "bin";
    const path = `${line.company_id}/${conv.id}/${params.MessageSid ?? crypto.randomUUID()}-${i}.${ext}`;
    const { error } = await db.storage
      .from("texts")
      .upload(path, await res.arrayBuffer(), { contentType: type, upsert: true });
    if (!error) pictures.push({ path, type });
  }

  // Each message once: Twilio retries a webhook that didn't answer in time.
  const { error } = await db.from("text_message").insert({
    company_id: line.company_id,
    conversation_id: conv.id,
    direction: "in",
    body: params.Body ?? null,
    media: pictures,
    status: "received",
    provider_sid: params.MessageSid ?? null,
  });
  if (error && error.code !== "23505") throw new TextingError(error.message);

  const keyword = optKeyword(params.Body);
  if (keyword === "stop" || keyword === "start") {
    await db
      .from("conversation")
      .update({ opted_out: keyword === "stop" })
      .eq("id", conv.id);
  }
  await touch(
    db,
    conv.id,
    conversationPreview({ kind: "text", body: params.Body ?? "", pictures: pictures.length }),
    true,
  );
  // Carriers (with the registered campaign) answer STOP, START, and HELP themselves.
  return twiml("");
}

const STATUS: Record<string, string> = {
  queued: "queued",
  accepted: "queued",
  sending: "queued",
  sent: "sent",
  delivered: "delivered",
  undelivered: "undelivered",
  failed: "failed",
};

/** Delivery updates for texts we sent. */
export async function textStatus(params: Record<string, string>) {
  const status = STATUS[params.MessageStatus ?? ""];
  if (!status || !params.MessageSid) return;
  await admin()
    .from("text_message")
    .update({
      status,
      error: params.ErrorCode ? `Carrier error ${params.ErrorCode}` : null,
    })
    .eq("provider_sid", params.MessageSid);
}

// ---------------------------------------------------------------------------
// Calls (as Housecall Pro: ring the team in business hours, then voicemail)
// ---------------------------------------------------------------------------

async function companyInfo(db: Db, companyId: string) {
  const { data } = await db
    .from("company")
    .select("name, timezone, settings")
    .eq("id", companyId)
    .single();
  return data as { name: string; timezone: string; settings: unknown };
}

/** The team phones that ring: the line's chosen people, else the owners. */
async function ringPhones(db: Db, line: PhoneLine): Promise<string[]> {
  const { data: members } = await db
    .from("membership")
    .select("user_id, role, status, profile:profile!membership_user_profile_fkey(phone)")
    .eq("company_id", line.company_id)
    .eq("status", "active");
  const rows = (members ?? []) as unknown as {
    user_id: string;
    role: string;
    profile: { phone: string | null } | null;
  }[];
  const chosen = line.ring_user_ids.length
    ? rows.filter((m) => line.ring_user_ids.includes(m.user_id))
    : rows.filter((m) => m.role === "owner");
  return [...new Set(chosen.map((m) => toE164(m.profile?.phone)).filter((p): p is string => !!p))];
}

function voicemail(origin: string, greeting: string): Response {
  return twiml(
    `<Say voice="Polly.Joanna">${xml(greeting)}</Say>` +
      `<Record maxLength="120" playBeep="true" transcribe="true"` +
      ` transcribeCallback="${origin}/api/twilio/transcription"` +
      ` recordingStatusCallback="${origin}/api/twilio/recording"` +
      ` action="${origin}/api/twilio/voice/done"/>`,
  );
}

const greetingFor = (line: PhoneLine, company: string) =>
  line.voicemail_greeting?.trim() ||
  `Thanks for calling ${company}. We can’t take your call right now. Leave a message and we’ll call you back.`;

/** A customer calls the company number. */
export async function incomingCall(params: Record<string, string>, origin: string) {
  const db = admin();
  const line = await lineByNumber(db, params.To ?? "");
  if (!line) return twiml(`<Say>This number isn’t in service.</Say><Hangup/>`);
  const from = toE164(params.From);
  const conv = from ? await conversationFor(db, line.company_id, from) : null;
  // Each call once: Twilio retries a webhook that didn't answer in time. (A plain insert: the
  // unique index on provider_sid is partial, which ON CONFLICT (provider_sid) can't use.)
  const { error } = await db.from("call_log").insert({
    company_id: line.company_id,
    conversation_id: conv?.id ?? null,
    direction: "in",
    status: "ringing",
    provider_sid: params.CallSid ?? null,
  });
  if (error && error.code !== "23505") throw new TextingError(error.message);
  const company = await companyInfo(db, line.company_id);
  const phones = await ringPhones(db, line);
  if (!phones.length || !inBusinessHours(new Date(), company.timezone, company.settings)) {
    // Straight to voicemail: a missed call for the team, even if they hang up without leaving
    // a message (a recording turns it into a voicemail). Security review 2026-10-16.
    if (params.CallSid) {
      await db.from("call_log").update({ status: "missed" }).eq("provider_sid", params.CallSid);
    }
    if (conv) await touch(db, conv.id, "Missed call", true);
    return voicemail(origin, greetingFor(line, company.name));
  }
  // Everyone's phone rings at once; the first to answer gets the call. The customer's number
  // shows, so the team knows who's calling.
  return twiml(
    `<Dial timeout="20" answerOnBridge="true" callerId="${xml(params.From ?? line.number)}"` +
      ` action="${origin}/api/twilio/voice/after">` +
      phones.map((p) => `<Number>${xml(p)}</Number>`).join("") +
      `</Dial>`,
  );
}

/** After ringing the team: answered, or on to voicemail. */
export async function afterDial(params: Record<string, string>, origin: string) {
  const db = admin();
  const answered = params.DialCallStatus === "completed";
  const { data: call } = await db
    .from("call_log")
    .update(
      answered
        ? { status: "answered", duration_seconds: Number(params.DialCallDuration ?? 0) }
        : { status: "missed" },
    )
    .eq("provider_sid", params.CallSid)
    .select("company_id, conversation_id")
    .maybeSingle();
  if (call?.conversation_id) {
    await touch(db, call.conversation_id as string, answered ? "Call" : "Missed call", !answered);
  }
  if (answered) return twiml("<Hangup/>");
  const line = call ? await activeLine(db, call.company_id as string) : null;
  const company = call ? await companyInfo(db, call.company_id as string) : null;
  return voicemail(origin, line && company ? greetingFor(line, company.name) : "Leave a message.");
}

/** A voicemail was recorded. */
export async function voicemailRecorded(params: Record<string, string>) {
  if (params.RecordingStatus && params.RecordingStatus !== "completed") return;
  const db = admin();
  const { data: call } = await db
    .from("call_log")
    .update({
      status: "voicemail",
      recording_sid: params.RecordingSid,
      duration_seconds: Number(params.RecordingDuration ?? 0),
    })
    .eq("provider_sid", params.CallSid)
    .select("conversation_id")
    .maybeSingle();
  if (call?.conversation_id) await touch(db, call.conversation_id as string, "Voicemail", true);
}

/** The voicemail's words, when Twilio has them. */
export async function voicemailTranscribed(params: Record<string, string>) {
  if (params.TranscriptionStatus !== "completed" || !params.TranscriptionText) return;
  await admin()
    .from("call_log")
    .update({ transcript: params.TranscriptionText })
    .eq("provider_sid", params.CallSid);
}

/**
 * Call a customer from the company number: Twilio rings the person's own phone first, then
 * connects them, so the customer sees the company number (as Housecall Pro does).
 */
export async function startCall(user: Db, userId: string, conversationId: string, origin: string) {
  const { data: conv } = await user
    .from("conversation")
    .select("id, company_id, phone")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conv) throw new TextingError("That conversation isn’t there.");
  const db = admin();
  const line = await activeLine(db, conv.company_id as string);
  if (line?.status !== "active")
    throw new TextingError("Set up a company number first (Settings › Phone and Texting).");
  if (!isUsNumber(conv.phone as string))
    throw new TextingError("Tidemark calls US and Canadian numbers only.");
  const { data: me } = await db.from("profile").select("phone").eq("id", userId).single();
  const mine = toE164(me?.phone as string | null);
  if (!isUsNumber(mine))
    throw new TextingError(
      "Add your mobile number first (Settings › Phone and Texting, or Settings in the phone app).",
    );
  const providerSid = await startBridgeCall({
    from: line.number,
    ringPhone: mine,
    twimlUrl: `${origin}/api/twilio/voice/bridge?to=${encodeURIComponent(conv.phone as string)}`,
    statusCallback: `${origin}/api/twilio/voice/status`,
  });
  await db.from("call_log").insert({
    company_id: conv.company_id,
    conversation_id: conv.id,
    direction: "out",
    status: "ringing",
    user_id: userId,
    provider_sid: providerSid,
  });
  await touch(db, conv.id as string, "Call", false);
  return { calling: formatPhone(mine), demo: !twilioConfigured() };
}

/** The bridge's second leg: connect the team member to the customer as the company. */
export async function bridgeTwiml(params: Record<string, string>, to: string) {
  const db = admin();
  // The first leg was placed from the company number to the team member.
  const line = await lineByNumber(db, params.From ?? "");
  const customer = toE164(to);
  if (!line || !customer) return twiml("<Say>That call can’t be placed.</Say><Hangup/>");
  return twiml(`<Dial callerId="${xml(line.number)}"><Number>${xml(customer)}</Number></Dial>`);
}

/** Outbound call progress: answered, or not. */
export async function callStatus(params: Record<string, string>) {
  const done = params.CallStatus === "completed";
  const failed = ["busy", "no-answer", "failed", "canceled"].includes(params.CallStatus ?? "");
  if (!done && !failed) return;
  await admin()
    .from("call_log")
    .update(
      done
        ? { status: "completed", duration_seconds: Number(params.CallDuration ?? 0) }
        : { status: "failed" },
    )
    .eq("provider_sid", params.CallSid);
}
