// What Schedule's result banner says and how long it stays (owner, 2026-10-20: the inline
// "Planned: …" note "looks horrible. Display it on a banner on the top of the screen"), as the
// website's route actions word it: one short line ("Optimized · 1 hr 6 min less driving ·
// Back by 4:28 PM"), and what to watch for as a second, smaller line. Pure, so it's tested
// without a phone.

export type BannerTone = "success" | "info" | "error";

export interface BannerNote {
  tone: BannerTone;
  message: string;
  /** What to watch for, as a second, smaller line. */
  detail?: string;
  /** Puts the change back; shows Undo and keeps the banner up longer. */
  undo?: () => void;
}

/** How long a banner stays: 4 s, 8 s with Undo; an error stays until it's dismissed. */
export const BANNER_MS = 4000;
export const BANNER_UNDO_MS = 8000;

export function bannerDuration(n: Pick<BannerNote, "tone" | "undo">): number | null {
  if (n.tone === "error") return null;
  return n.undo ? BANNER_UNDO_MS : BANNER_MS;
}

/** Notes as sentences: "Runs 20 min late. A fixed time can’t be met." */
function sentences(notes: string[]): string | undefined {
  const list = notes.map((n) => n.trim()).filter(Boolean);
  return list.length
    ? list.map((n) => `${n.charAt(0).toUpperCase()}${n.slice(1).replace(/\.$/, "")}.`).join(" ")
    : undefined;
}

/** The website's wording for pools without a location. */
function webNote(note: string): string {
  return note === "some pools have no location, so driving to them isn’t counted"
    ? "driving to pools not on the map isn’t counted"
    : note;
}

/**
 * A planning result for the banner: "Moved to 9:15 AM. Note: a; b." becomes "Moved to 9:15 AM."
 * with "A. B." under it, and Optimize's "Planned: 2 hr 8 min of driving, 1 hr 6 min less than
 * before, back at the shop by 4:28 PM." becomes "Optimized · 1 hr 6 min less driving" (no clock
 * times: owner, 2026-10-21).
 */
export function bannerText(text: string): { message: string; detail?: string } {
  const at = text.indexOf(" Note: ");
  const main = at >= 0 ? text.slice(0, at) : text;
  const notes =
    at >= 0
      ? text
          .slice(at + 7)
          .replace(/\.$/, "")
          .split("; ")
          .map(webNote)
      : [];
  const detail = sentences(notes);
  const planned =
    /^Planned: (.+?) of driving(?:, (.+?) less than before)?, back at the shop by (.+?)\.$/.exec(
      main,
    );
  const message = planned
    ? ["Optimized", planned[2] ? `${planned[2]} less driving` : `${planned[1]} driving`].join(" · ")
    : main;
  return detail ? { message, detail } : { message };
}

/** What the banner reads aloud. */
export function bannerSpoken(n: Pick<BannerNote, "message" | "detail" | "undo">): string {
  return [n.message.replace(/ · /g, ", "), n.detail, n.undo ? "Undo is available." : null]
    .filter(Boolean)
    .join(". ")
    .replace(/\.\./g, ".");
}
