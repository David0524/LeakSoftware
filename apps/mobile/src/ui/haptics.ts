import { HAPTIC_MOMENTS, type HapticMoment } from "@leakbook/core";
import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

/**
 * Haptic feedback with a few fixed meanings (owner, 2026-10-14), used sparingly: not on every
 * tap, only where iOS apps give a tap you can feel. Android phones vibrate for the same moments.
 * Every call is fire-and-forget: a phone without a haptic engine, or a failure, does nothing.
 */
const supported = Platform.OS === "ios" || Platform.OS === "android";

function play(effect: () => Promise<void>) {
  if (!supported) return;
  try {
    effect().catch(() => {});
  } catch {
    // No haptics on this device; nothing to do.
  }
}

export const haptics = {
  /** A choice changed: a segmented control, a switch. */
  selection: () => play(() => Haptics.selectionAsync()),
  /** Something was saved or created. */
  success: () => play(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  /** A destructive action was confirmed (delete, remove, discard). */
  warning: () => play(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  /** A gesture reached its point: pull to refresh started, a full swipe will act on release. */
  light: () => play(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  /** Something was picked up to drag (a schedule stop held down). */
  pickUp: () => play(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
} as const;

/**
 * The tap for one of the moments that finish something (owner, 2026-10-26: Apple principle 5),
 * listed once in core's HAPTIC_MOMENTS so this app, the iPhone app and the website buzz at the
 * same ones: a checklist item or chemical marked done is a light tap; a whole set, a job, a
 * report or a payment is the success tap.
 */
export function haptic(moment: HapticMoment) {
  haptics[HAPTIC_MOMENTS[moment]]();
}
