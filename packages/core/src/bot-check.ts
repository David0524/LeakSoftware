// Bot sign-ups (owner, 2026-11-06: "We need bot detection"). On 2026-11-05 bots made three
// accounts named "🔥Masadaki 15k TL bonus senin" (spam riding the sign-up), and on 2026-10-21
// one named "Xgmjndcy Dfwtwno" of "Iwdlhvbab LLC" (random letters). The website's sign-up and
// the apps' Create an Account check what was typed here; the website's form also carries a
// hidden field people never see (`BOT_TRAP_FIELD`) and the time it was opened.

/** A field hidden from people (off screen, not focusable); a bot that fills every field fills it. */
export const BOT_TRAP_FIELD = "website";
/** The hidden field holding when the form was opened (ms since 1970). */
export const BOT_STARTED_FIELD = "started";
/** Faster than this from opening the form to Create Account is a script, not a person. */
export const BOT_MIN_FILL_MS = 3000;

export type BotReason = "trap" | "too_fast" | "link" | "spam_words" | "symbols" | "gibberish";

const LINK = /(https?:\/\/|www\.|\.(com|net|org|ru|xyz|top|io|info|biz|link|click)\b|t\.me\/)/i;
const SPAM =
  /\b(bonus|casino|betting|jackpot|crypto|bitcoin|usdt|forex|viagra|porn|giveaway|promo ?code|telegram|whatsapp|\d+ ?k ?(tl|usd))\b/i;
/** Emoji and pictographs: no person's or shop's name needs them. */
const PICTOGRAPH = /\p{Extended_Pictographic}/u;
/** Five or more consonants in a row (y counts as a vowel), as in "Xgmjndcy". */
const CONSONANT_RUN = /[bcdfghjklmnpqrstvwxz]{5,}/i;

/** Why what was typed looks like a bot, or null when it reads like a person and a shop. */
export function botReason(input: {
  name?: string | null;
  company?: string | null;
}): BotReason | null {
  const fields = [input.name ?? "", input.company ?? ""];
  const text = fields.join(" ");
  if (fields.some((f) => LINK.test(f))) return "link";
  if (SPAM.test(text)) return "spam_words";
  if (PICTOGRAPH.test(text)) return "symbols";
  // One odd word happens ("Angstrom"); random letters make several.
  const words = text.split(/[^\p{L}]+/u).filter(Boolean);
  if (words.filter((w) => CONSONANT_RUN.test(w)).length >= 2) return "gibberish";
  return null;
}

/** The website form's hidden checks: the trap field filled in, or sent too fast (or never opened). */
export function formBotReason(
  trap: string | null | undefined,
  started: string | null | undefined,
  now = Date.now(),
): BotReason | null {
  if (trap && trap.trim()) return "trap";
  const opened = Number(started);
  if (!Number.isFinite(opened) || opened <= 0) return "too_fast";
  if (now - opened < BOT_MIN_FILL_MS) return "too_fast";
  return null;
}

/** What the sign-up says when the name or company reads like a bot's. */
export const BOT_NAME_MESSAGE = "Enter your own name and your company's name.";
