import type { VisitReportMode } from "./maintenance";

// Require a Photo (owner, 2026-10-25: "In the owner's settings add a 'require photo to send
// report' button. This is a feature Skimmer has"). A switch under Settings › Report Templates ›
// Visit reports, saved as company.settings.require_report_photo (off unless true). With it on, a
// maintenance visit's report can't be sent until the visit has at least one photo: Send Visit
// Report shows why with Add Photo, and an automatic send waits until one is added. The monthly
// report isn't held up (it goes with the invoice). The database checks it too
// (send_visit_report, 20261022003200_report_photo.sql); the phones decide from their own copy.
// Ported to SundeckCore/ReportPhoto.swift.

/** Whether the shop requires a photo before a visit's report is sent (default off). */
export function requiresReportPhoto(settings: unknown): boolean {
  return (settings as { require_report_photo?: unknown } | null)?.require_report_photo === true;
}

export const REPORT_PHOTO_TEXT = {
  label: "Require a Photo",
  each: "A visit’s report can’t be sent until the visit has at least one photo. With Send Automatically on, it goes once one is added.",
  monthly:
    "One visit’s report can’t be sent until the visit has at least one photo. The monthly report still goes with the invoice.",
  /** On Send Visit Report, and the server's refusal. */
  blocked: "Add a photo to send this report.",
  addPhoto: "Add Photo",
} as const;

/** What the switch means for the shop's visit reports; null when they're off (no switch). */
export function reportPhotoHint(mode: VisitReportMode): string | null {
  if (mode === "off") return null;
  return mode === "monthly" ? REPORT_PHOTO_TEXT.monthly : REPORT_PHOTO_TEXT.each;
}

/**
 * Why this visit's report can't be sent yet (`REPORT_PHOTO_TEXT.blocked`), or null when it can:
 * the shop requires a photo and the visit has none. `photos` counts the visit's photos (not
 * videos, not deleted ones; still uploading counts).
 */
export function reportPhotoBlock(settings: unknown, photos: number): string | null {
  return requiresReportPhoto(settings) && photos === 0 ? REPORT_PHOTO_TEXT.blocked : null;
}
