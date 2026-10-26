// A tap you can feel when something finishes (owner, 2026-10-26: Apple principle 5, "Haptics on
// completion"). The moments are listed once, here, so the website, the Android app and the iPhone
// app (SundeckCore/Haptics.swift, checked by the same fixtures) buzz at the same ones. A checklist
// item or a chemical marked done is a light tap; a whole set, a job, a report or a payment is the
// success tap. The website has only one buzz (a ten-millisecond vibration, and only in Android
// browsers); it uses the list for the moments and ignores the strength.

export type HapticStrength = "light" | "success";

export const HAPTIC_MOMENTS = {
  /** A checklist item answered as done ("Done", "Not Leaking", "No"). */
  checklistItemDone: "light",
  /** A suggested chemical marked added, one by one. */
  chemicalAdded: "light",
  /** Mark All Added. */
  allChemicalsAdded: "success",
  /** A job completed. */
  jobCompleted: "success",
  /** A report sent to the customer (visit report or the finished report). */
  reportSent: "success",
  /** A payment recorded. */
  paymentRecorded: "success",
} as const satisfies Record<string, HapticStrength>;

export type HapticMoment = keyof typeof HAPTIC_MOMENTS;

/** How long the website's buzz lasts, in milliseconds. */
export const HAPTIC_WEB_MS = 10;
