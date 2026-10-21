// Discard changes, everywhere (owner, 2026-10-20: "should apply everywhere"): an editor with
// unsaved changes asks "Discard changes?" before it closes. "Unsaved" is what its fields hold
// now against what they held when it opened (or last saved). Fields that save by themselves
// (marked data-autosave) never count. Hidden inputs do: a segmented control keeps its choice
// in one.

/** One field as the editor holds it. */
export interface FieldValue {
  /** Its name, id, or place in the editor. */
  key: string;
  type: string;
  value: string;
  checked?: boolean;
  /** A field that saves by itself (report text, Where, captions). */
  autosave?: boolean;
  /** Files chosen in a file input. */
  files?: number;
}

const NOT_EDITED = new Set(["submit", "button", "reset", "image"]);

/** A comparable signature of what an editor's fields hold. */
export function signature(fields: FieldValue[]): string {
  return JSON.stringify(
    fields
      .filter((f) => !f.autosave && !NOT_EDITED.has(f.type))
      .map((f) =>
        f.type === "checkbox" || f.type === "radio"
          ? [f.key, f.value, !!f.checked]
          : f.type === "file"
            ? [f.key, f.files ?? 0]
            : [f.key, f.value],
      ),
  );
}

/** The fields under an element (a sheet's panel, a form). */
export function fieldsOf(root: ParentNode): FieldValue[] {
  const els = root.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
    "input, select, textarea",
  );
  return [...els].map((el, i) => ({
    key: el.name || el.id || String(i),
    type: el instanceof HTMLInputElement ? el.type : el.tagName.toLowerCase(),
    value: el.value,
    checked: el instanceof HTMLInputElement ? el.checked : undefined,
    autosave: el.closest("[data-autosave]") !== null,
    files: el instanceof HTMLInputElement ? (el.files?.length ?? 0) : undefined,
  }));
}

/** The question before unsaved changes are thrown away (item 4's alert). */
export const DISCARD_PROMPT = {
  title: "Discard changes?",
  confirmLabel: "Discard Changes",
  cancelLabel: "Keep Editing",
  destructive: true,
  alert: true,
} as const;

/**
 * A link click the page should check before leaving: a plain click on a same-origin link to
 * another page (not a new tab, a download, or a jump within this page).
 */
export function leavesPage(
  link: { href: string; target?: string; download?: boolean },
  click: { button: number; meta: boolean; ctrl: boolean; shift: boolean; alt: boolean },
  here: string,
): boolean {
  if (click.button !== 0 || click.meta || click.ctrl || click.shift || click.alt) return false;
  if (link.download || (link.target && link.target !== "_self")) return false;
  let to: URL;
  let from: URL;
  try {
    to = new URL(link.href, here);
    from = new URL(here);
  } catch {
    return false;
  }
  if (to.origin !== from.origin) return false;
  return to.pathname !== from.pathname || to.search !== from.search;
}
