import { useRef } from "react";

// Taps that run once (owner, 2026-10-26: "taps submit twice"). A button that sends, saves,
// creates, pays or books disables itself while its request runs (SettingsForm, Button's pending
// states); this covers a control that can't, one that turns into its own undo.

/**
 * Ignores a second tap that comes within `ms` of the last one that ran: a double tap on a button
 * that changes into its opposite ("Mark Complete" becoming "Reopen") would otherwise undo itself.
 */
export function useTapGuard(ms = 700) {
  const last = useRef(0);
  return (run: () => void) => {
    const now = Date.now();
    if (now - last.current < ms) return;
    last.current = now;
    run();
  };
}
