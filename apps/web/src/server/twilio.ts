import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { friendlyError } from "@leakbook/core";

// Twilio over its REST API (no SDK): texts, numbers, calls, and webhook signatures. One Sundeck Pro
// account pays for every shop (owner, 2026-10-16). Without TWILIO_ACCOUNT_SID nothing leaves
// the server: texts are saved as sent and numbers are made up (demo mode), as payments are on
// a server without Stripe keys.

const API = "https://api.twilio.com/2010-04-01";

export class TwilioError extends Error {}

const sid = () => process.env.TWILIO_ACCOUNT_SID ?? "";
const token = () => process.env.TWILIO_AUTH_TOKEN ?? "";

/** Texts and calls really go out (keys set). */
export function twilioConfigured(): boolean {
  return Boolean(sid() && token());
}

async function api<T>(path: string, form?: URLSearchParams, method = form ? "POST" : "GET") {
  const res = await fetch(`${API}/Accounts/${sid()}${path}`, {
    method,
    headers: {
      authorization: `Basic ${Buffer.from(`${sid()}:${token()}`).toString("base64")}`,
      ...(form ? { "content-type": "application/x-www-form-urlencoded" } : {}),
    },
    body: form,
  });
  const body = (await res.json().catch(() => ({}))) as T & { message?: string; code?: number };
  // The provider's own words are for the logs; people read the plain version.
  if (!res.ok)
    throw new TwilioError(friendlyError(body.message ?? `The server said ${res.status}.`));
  return body;
}

export interface SentText {
  sid: string;
  status: "queued" | "sent" | "failed";
}

/**
 * Send a text (and pictures, as MMS) from the shop's number. `hold`: the App Review shop
 * (review-shop.ts): recorded as sent like demo mode, never handed to Twilio.
 */
export async function sendText(
  input: {
    from: string;
    to: string;
    body: string;
    mediaUrls?: string[];
    statusCallback?: string;
  },
  { hold = false }: { hold?: boolean } = {},
): Promise<SentText> {
  if (hold || !twilioConfigured()) return { sid: `demo-${randomUUID()}`, status: "sent" };
  const form = new URLSearchParams({ To: input.to, Body: input.body });
  // With a registered campaign (A2P 10DLC), texts go through its Messaging Service.
  if (process.env.TWILIO_MESSAGING_SERVICE_SID) {
    form.set("MessagingServiceSid", process.env.TWILIO_MESSAGING_SERVICE_SID);
  }
  form.set("From", input.from);
  for (const url of input.mediaUrls ?? []) form.append("MediaUrl", url);
  if (input.statusCallback) form.set("StatusCallback", input.statusCallback);
  const r = await api<{ sid: string; status: string }>("/Messages.json", form);
  return { sid: r.sid, status: r.status === "failed" ? "failed" : "queued" };
}

export interface AvailableNumber {
  number: string;
  locality: string | null;
  region: string | null;
}

/** Local numbers that text, take pictures, and take calls, in an area code. */
export async function searchNumbers(areaCode: string): Promise<AvailableNumber[]> {
  if (!/^[2-9]\d{2}$/.test(areaCode)) throw new TwilioError("Enter a 3-digit area code.");
  if (!twilioConfigured()) {
    // Demo: 555-01xx numbers are reserved for fiction.
    return [11, 23, 47].map((n) => ({
      number: `+1${areaCode}55501${n}`,
      locality: "Demo",
      region: null,
    }));
  }
  const q = new URLSearchParams({
    AreaCode: areaCode,
    SmsEnabled: "true",
    MmsEnabled: "true",
    VoiceEnabled: "true",
    PageSize: "8",
  });
  const r = await api<{
    available_phone_numbers: { phone_number: string; locality: string; region: string }[];
  }>(`/AvailablePhoneNumbers/US/Local.json?${q}`);
  return r.available_phone_numbers.map((n) => ({
    number: n.phone_number,
    locality: n.locality || null,
    region: n.region || null,
  }));
}

/** Buy a number and point its texts and calls at Sundeck Pro. */
export async function buyNumber(number: string, origin: string): Promise<string> {
  if (!twilioConfigured()) return `demo-${randomUUID()}`;
  const r = await api<{ sid: string }>(
    "/IncomingPhoneNumbers.json",
    new URLSearchParams({
      PhoneNumber: number,
      SmsUrl: `${origin}/api/twilio/sms`,
      VoiceUrl: `${origin}/api/twilio/voice`,
    }),
  );
  if (process.env.TWILIO_MESSAGING_SERVICE_SID) {
    await fetch(
      `https://messaging.twilio.com/v1/Services/${process.env.TWILIO_MESSAGING_SERVICE_SID}/PhoneNumbers`,
      {
        method: "POST",
        headers: {
          authorization: `Basic ${Buffer.from(`${sid()}:${token()}`).toString("base64")}`,
          "content-type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ PhoneNumberSid: r.sid }),
      },
    );
  }
  return r.sid;
}

/** Click to call: ring the person's own phone, then connect them to the customer. */
export async function startBridgeCall(input: {
  from: string;
  ringPhone: string;
  twimlUrl: string;
  statusCallback: string;
}): Promise<string> {
  if (!twilioConfigured()) return `demo-${randomUUID()}`;
  const r = await api<{ sid: string }>(
    "/Calls.json",
    new URLSearchParams({
      From: input.from,
      To: input.ringPhone,
      Url: input.twimlUrl,
      StatusCallback: input.statusCallback,
    }),
  );
  return r.sid;
}

/** A recording or a picture Twilio holds (it needs the account's credentials). */
export async function fetchTwilioFile(url: string): Promise<Response> {
  // The account's credentials only ever go to Twilio's own API (security audit hardening).
  if (new URL(url).hostname !== "api.twilio.com") throw new Error("Not a Twilio media URL");
  return fetch(url, {
    headers: {
      authorization: `Basic ${Buffer.from(`${sid()}:${token()}`).toString("base64")}`,
    },
  });
}

export const recordingUrl = (recordingSid: string) =>
  `${API}/Accounts/${sid()}/Recordings/${recordingSid}.mp3`;

/**
 * Twilio signs each webhook: HMAC-SHA1 of the full URL followed by the POSTed parameters
 * sorted by name, keyed with the auth token, in base64 (X-Twilio-Signature).
 */
export function twilioSignature(url: string, params: Record<string, string>, key = token()) {
  const data =
    url +
    Object.keys(params)
      .sort()
      .map((k) => k + params[k])
      .join("");
  return createHmac("sha1", key).update(data, "utf8").digest("base64");
}

export function validTwilioRequest(
  url: string,
  params: Record<string, string>,
  signature: string | null,
): boolean {
  if (!token() || !signature) return false;
  const want = Buffer.from(twilioSignature(url, params));
  const got = Buffer.from(signature);
  return want.length === got.length && timingSafeEqual(want, got);
}

/** TwiML: text escaped for XML. */
export function xml(text: string): string {
  return text.replace(/[<>&'"]/g, (c) => `&#${c.charCodeAt(0)};`);
}

export function twiml(body: string): Response {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`, {
    headers: { "content-type": "text/xml" },
  });
}
