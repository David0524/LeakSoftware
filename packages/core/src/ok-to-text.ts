// OK to Text (owner, 2026-11-28): a customer said it's OK to text them, recorded with the date
// and who marked it. Phone companies ask how consent is kept. Texts still go to customers not
// marked; the message screens remind the sender (owner: "Allow, with a reminder"). The same
// words on the website and Android; SundeckCore's OkToText.swift mirrors them. No I/O.

export const OK_TO_TEXT = "OK to Text";
export const OK_TO_TEXT_HINT = "They said it’s OK to text them about their service.";
export const OK_TO_TEXT_REMINDER =
  "Not marked OK to Text yet. Text only customers who said it’s OK.";
export const MARK_OK_TO_TEXT = "Mark OK to Text";

/**
 * The customer page's value: "Replied STOP" when they opted out by text, "Yes · Nov 28, 2026"
 * when marked, "Not yet" otherwise.
 */
export function okToTextValue(
  at: string | null | undefined,
  repliedStop: boolean,
  timeZone: string,
): string {
  if (repliedStop) return "Replied STOP";
  if (!at) return "Not yet";
  const day = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone,
  }).format(new Date(at));
  return `Yes · ${day}`;
}

/** Whether a message screen should remind the sender: a known customer, not marked, not STOP. */
export function needsTextOk(
  customer: { text_ok_at?: string | null } | null | undefined,
  repliedStop: boolean,
): boolean {
  return !!customer && !customer.text_ok_at && !repliedStop;
}
