import { REMOVED_UNDO_SECONDS } from "@leakbook/core";
import type { BannerNote } from "./resultBanner";
import type { Removal } from "./removal";

// Where a removal says so (owner, 2026-10-26): one banner host for the whole signed-in app
// (ui/RemovedHost.tsx), so a removal made from a sheet or a pushed screen is still announced
// after it closes. Pure, so it's tested without a phone.

type Listener = (note: BannerNote) => void;
const listeners = new Set<Listener>();

/** The banner for a removal: its line, Undo, and five seconds. */
export function removalNote(removal: Pick<Removal, "message" | "detail" | "undo">): BannerNote {
  return {
    tone: "info",
    message: removal.message,
    ...(removal.detail ? { detail: removal.detail } : {}),
    undo: removal.undo,
    ms: REMOVED_UNDO_SECONDS * 1000,
  };
}

/** The host listens; returns how to stop. */
export function onRemoved(listener: Listener): () => void {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/** Say a removal happened, with Undo. */
export function announceRemoved(removal: Removal) {
  const note = removalNote(removal);
  for (const l of listeners) l(note);
}
