// Company texting and calls (owner, 2026-10-16): phone numbers, business hours for incoming
// calls, and the keywords carriers require. No I/O.

import { localDate } from "./job-list";
import { localMinutes, routingSettings, weekday } from "./route-plan";
import { clockToMinutes } from "./routing";

/**
 * Whether Tidemark texts and calls this number: US and Canada (+1) only, so a trial account
 * can't run up international or premium-rate charges on Tidemark's Twilio bill (security
 * review 2026-10-16). Twilio's geo permissions should allow only the US and Canada too.
 */
export function isUsNumber(e164: string | null | undefined): e164 is string {
  return typeof e164 === "string" && /^\+1[2-9]\d{2}[2-9]\d{6}$/.test(e164);
}

/**
 * A US phone number as E.164 (+16025550142), or null when it isn't one. Accepts the ways people
 * type them: (602) 555-0142, 602.555.0142, 1-602-555-0142, +1 602 555 0142.
 */
export function toE164(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("+") && !trimmed.startsWith("+1")) {
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  }
  const ten = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  // North American numbers: area code and exchange can't start with 0 or 1.
  return /^[2-9]\d{2}[2-9]\d{6}$/.test(ten) ? `+1${ten}` : null;
}

/** "(602) 555-0142" for US numbers; others as stored. */
export function formatPhone(e164: string): string {
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
}

/** Whether `at` falls in the shop's working hours (Settings › Scheduling), in its time zone. */
export function inBusinessHours(at: Date, timeZone: string, settings: unknown): boolean {
  const r = routingSettings(settings);
  const day = weekday(localDate(at, timeZone));
  if (!r.workDays.includes(day)) return false;
  const m = localMinutes(at.toISOString(), timeZone);
  return m >= clockToMinutes(r.dayStart) && m < clockToMinutes(r.dayEnd);
}

/** Carrier keywords: STOP and its synonyms opt out, START and UNSTOP opt back in. */
export function optKeyword(body: string | null | undefined): "stop" | "start" | "help" | null {
  const w = (body ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
  if (["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "OPTOUT", "REVOKE"].includes(w))
    return "stop";
  if (["START", "UNSTOP", "YES", "OPTIN"].includes(w)) return "start";
  if (["HELP", "INFO"].includes(w)) return "help";
  return null;
}

/** The line shown in the inbox for a text or a call. */
export function conversationPreview(
  item: { kind: "text"; body: string | null; pictures: number } | { kind: "call"; status: string },
): string {
  if (item.kind === "call") {
    return item.status === "voicemail"
      ? "Voicemail"
      : item.status === "missed"
        ? "Missed call"
        : "Call";
  }
  const body = (item.body ?? "").replace(/\s+/g, " ").trim();
  if (body) return body.length > 80 ? `${body.slice(0, 79)}…` : body;
  return item.pictures === 1 ? "Picture" : item.pictures > 1 ? `${item.pictures} pictures` : "";
}
