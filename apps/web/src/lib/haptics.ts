import { HAPTIC_MOMENTS, HAPTIC_WEB_MS, type HapticMoment } from "@leakbook/core";

// A tap you can feel when something finishes (owner, 2026-10-26: Apple principle 5). The moments
// are core's HAPTIC_MOMENTS, the same as the iPhone and Android apps. Only Android browsers have
// a vibration motor to drive (iPhone Safari has none), so elsewhere this does nothing; so does a
// person who asked for reduced motion.

export { HAPTIC_MOMENTS, HAPTIC_WEB_MS, type HapticMoment };

interface Env {
  navigator?: { vibrate?: (pattern: number) => boolean };
  matchMedia?: (query: string) => { matches: boolean };
}

/** Buzz for `moment`, if this browser can and the person hasn't asked for reduced motion. */
export function buzz(
  moment: HapticMoment,
  env: Env | undefined = typeof window === "undefined" ? undefined : window,
): boolean {
  // One buzz for every moment here; the moment is named so call sites say what finished.
  void HAPTIC_MOMENTS[moment];
  try {
    const nav = env?.navigator;
    if (typeof nav?.vibrate !== "function") return false;
    if (env?.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return false;
    return nav.vibrate(HAPTIC_WEB_MS);
  } catch {
    return false;
  }
}
