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

/** Credentials for a request: Sundeck Pro's main account, or a shop's subaccount. */
export interface TwilioAuth {
  sid: string;
  token: string;
}
const mainAuth = (): TwilioAuth => ({ sid: sid(), token: token() });

/** Twilio's own words for a failed request, kept for staff (TwilioError carries the plain one). */
export class TwilioRequestError extends TwilioError {
  constructor(
    message: string,
    readonly status: number,
    readonly detail: string,
  ) {
    super(message);
  }
}

/**
 * Any Twilio REST call: a form POST (or GET, or DELETE) to a full URL, as `auth` (the main
 * account by default). Throws TwilioRequestError with Twilio's own message in `detail`.
 */
export async function twilioRequest<T>(
  url: string,
  {
    form,
    method = form ? "POST" : "GET",
    auth = mainAuth(),
  }: { form?: URLSearchParams; method?: string; auth?: TwilioAuth } = {},
): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: {
      authorization: `Basic ${Buffer.from(`${auth.sid}:${auth.token}`).toString("base64")}`,
      ...(form ? { "content-type": "application/x-www-form-urlencoded" } : {}),
    },
    body: form,
  });
  if (res.status === 204) return {} as T;
  const body = (await res.json().catch(() => ({}))) as T & { message?: string; code?: number };
  // The provider's own words are for the logs; people read the plain version.
  if (!res.ok) {
    const detail = body.message ?? `The server said ${res.status}.`;
    throw new TwilioRequestError(friendlyError(detail), res.status, detail);
  }
  return body;
}

/** A v2010 API call on an account (the main one unless a subaccount is named). */
async function api<T>(
  path: string,
  form?: URLSearchParams,
  method = form ? "POST" : "GET",
  account = sid(),
) {
  // The main account's credentials reach its subaccounts' v2010 resources.
  return twilioRequest<T>(`${API}/Accounts/${account}${path}`, { form, method });
}

/** A v2010 call on a shop's subaccount (or the main account when it has none). */
export function accountApi<T>(
  account: string | null | undefined,
  path: string,
  form?: URLSearchParams,
) {
  return api<T>(path, form, form ? "POST" : "GET", account || sid());
}

const subaccountTokens = new Map<string, string>();

/**
 * A subaccount's own credentials: Twilio's other APIs (Trust Hub, Messaging) and its webhook
 * signatures use them. Read from Twilio with the main account's, never stored.
 */
export async function subaccountAuth(account: string): Promise<TwilioAuth> {
  if (account === sid()) return mainAuth();
  let t = subaccountTokens.get(account);
  if (!t) {
    const r = await api<{ auth_token: string; owner_account_sid?: string }>(
      "",
      undefined,
      "GET",
      account,
    );
    t = r.auth_token;
    subaccountTokens.set(account, t);
  }
  return { sid: account, token: t };
}

/** A new subaccount for a shop's numbers and registrations. */
export async function createSubaccount(name: string): Promise<string> {
  const r = await twilioRequest<{ sid: string; auth_token: string }>(`${API}/Accounts.json`, {
    form: new URLSearchParams({ FriendlyName: name.slice(0, 64) }),
  });
  subaccountTokens.set(r.sid, r.auth_token);
  return r.sid;
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
    /** The shop's subaccount and Messaging Service (its registration), when it has them. */
    account?: string | null;
    messagingService?: string | null;
  },
  { hold = false }: { hold?: boolean } = {},
): Promise<SentText> {
  if (hold || !twilioConfigured()) return { sid: `demo-${randomUUID()}`, status: "sent" };
  const form = new URLSearchParams({ To: input.to, Body: input.body });
  // With a registered campaign (A2P 10DLC), texts go through its Messaging Service.
  const service = input.messagingService ?? process.env.TWILIO_MESSAGING_SERVICE_SID;
  if (service) form.set("MessagingServiceSid", service);
  form.set("From", input.from);
  for (const url of input.mediaUrls ?? []) form.append("MediaUrl", url);
  if (input.statusCallback) form.set("StatusCallback", input.statusCallback);
  const r = await accountApi<{ sid: string; status: string }>(
    input.account,
    "/Messages.json",
    form,
  );
  return { sid: r.sid, status: r.status === "failed" ? "failed" : "queued" };
}

export interface AvailableNumber {
  number: string;
  locality: string | null;
  region: string | null;
}

/**
 * Numbers that text, take pictures, and take calls: local ones in an area code, or toll-free
 * ones (`areaCode` null).
 */
export async function searchNumbers(areaCode: string | null): Promise<AvailableNumber[]> {
  if (areaCode !== null && !/^[2-9]\d{2}$/.test(areaCode))
    throw new TwilioError("Enter a 3-digit area code.");
  if (!twilioConfigured()) {
    // Demo: 555-01xx numbers are reserved for fiction.
    return [11, 23, 47].map((n) => ({
      number: `+1${areaCode ?? "800"}55501${n}`,
      locality: "Demo",
      region: null,
    }));
  }
  const q = new URLSearchParams({ SmsEnabled: "true", VoiceEnabled: "true", PageSize: "8" });
  if (areaCode) {
    q.set("AreaCode", areaCode);
    q.set("MmsEnabled", "true");
  }
  const r = await api<{
    available_phone_numbers: { phone_number: string; locality: string; region: string }[];
  }>(`/AvailablePhoneNumbers/US/${areaCode ? "Local" : "TollFree"}.json?${q}`);
  return r.available_phone_numbers.map((n) => ({
    number: n.phone_number,
    locality: n.locality || null,
    region: n.region || null,
  }));
}

/** Point a number's texts and calls at Sundeck Pro. */
export function numberWebhooks(origin: string) {
  return { SmsUrl: `${origin}/api/twilio/sms`, VoiceUrl: `${origin}/api/twilio/voice` };
}

/**
 * Buy a number (in the shop's subaccount when it has one) and point its texts and calls at
 * Sundeck Pro. Returns the number's sid.
 */
export async function buyNumber(
  number: string,
  origin: string,
  account?: string | null,
): Promise<string> {
  if (!twilioConfigured()) return `demo-${randomUUID()}`;
  const r = await accountApi<{ sid: string }>(
    account,
    "/IncomingPhoneNumbers.json",
    new URLSearchParams({ PhoneNumber: number, ...numberWebhooks(origin) }),
  );
  return r.sid;
}

/** Click to call: ring the person's own phone, then connect them to the customer. */
export async function startBridgeCall(input: {
  from: string;
  ringPhone: string;
  twimlUrl: string;
  statusCallback: string;
  /** The shop's subaccount, when its number lives there. */
  account?: string | null;
}): Promise<string> {
  if (!twilioConfigured()) return `demo-${randomUUID()}`;
  const r = await accountApi<{ sid: string }>(
    input.account,
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

export const recordingUrl = (recordingSid: string, account?: string | null) =>
  `${API}/Accounts/${account || sid()}/Recordings/${recordingSid}.mp3`;

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

function signatureMatches(
  url: string,
  params: Record<string, string>,
  signature: string,
  key: string,
) {
  const want = Buffer.from(twilioSignature(url, params, key));
  const got = Buffer.from(signature);
  return want.length === got.length && timingSafeEqual(want, got);
}

/**
 * Whether Twilio sent this webhook. A shop's subaccount signs with its own token: when the main
 * account's doesn't match and the request names another account, that subaccount's token is
 * read from Twilio (which only answers for Sundeck Pro's own subaccounts).
 */
export async function validTwilioRequest(
  url: string,
  params: Record<string, string>,
  signature: string | null,
): Promise<boolean> {
  if (!token() || !signature) return false;
  if (signatureMatches(url, params, signature, token())) return true;
  const account = params.AccountSid;
  if (!account || account === sid() || !/^AC[0-9a-f]{32}$/.test(account)) return false;
  try {
    return signatureMatches(url, params, signature, (await subaccountAuth(account)).token);
  } catch {
    return false;
  }
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

/**
 * What kind of line a number is (Twilio Lookup: "mobile", "landline", "fixedVoip", …), or null
 * when it can't be told (no Twilio, or Lookup didn't answer). About a cent a lookup.
 */
export async function lineType(e164: string): Promise<string | null> {
  if (!twilioConfigured()) return null;
  try {
    const r = await twilioRequest<{ line_type_intelligence?: { type?: string | null } | null }>(
      `https://lookups.twilio.com/v2/PhoneNumbers/${encodeURIComponent(e164)}?Fields=line_type_intelligence`,
    );
    return r.line_type_intelligence?.type ?? null;
  } catch {
    return null;
  }
}
