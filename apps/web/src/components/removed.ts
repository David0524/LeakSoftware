"use client";

import {
  REMOVED_TEXT,
  REMOVED_UNDO_LABEL,
  REMOVED_UNDO_SECONDS,
  type RemovedKind,
} from "@leakbook/core";
import type { FormState } from "@/app/actions/auth";
import { NO_CONNECTION, whenOffline } from "@/lib/offline";
import { showBanner } from "./top-banner";

/**
 * Undo instead of "Are you sure?" (owner, 2026-10-26; docs/design/2026-10-26-undo.md): the
 * removal has already happened; this says so for five seconds with Undo. `restore` writes the
 * same rows back (the matching restore server action) and answers an error, or null. The top
 * banner is the one every other result on the website already uses.
 */
export function showRemoved(
  kind: RemovedKind,
  restore: () => Promise<string | null>,
  detail?: string | null,
) {
  showBanner({
    message: REMOVED_TEXT[kind],
    ...(detail ? { detail } : {}),
    ms: REMOVED_UNDO_SECONDS * 1000,
    action: {
      label: REMOVED_UNDO_LABEL,
      onAction: () => {
        void restore().then((error) => {
          if (error) showBanner({ tone: "error", message: error });
        });
      },
    },
  });
}

/** A restore server action that takes a form, as `showRemoved`'s `restore`. */
export function restoreWith(
  action: (state: FormState, form: FormData) => Promise<FormState>,
  fields: Record<string, string>,
): () => Promise<string | null> {
  return async () => {
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) form.set(k, v);
    const r = await whenOffline(action({}, form), { error: NO_CONNECTION });
    return r.error ?? Object.values(r.fields ?? {})[0] ?? null;
  };
}
