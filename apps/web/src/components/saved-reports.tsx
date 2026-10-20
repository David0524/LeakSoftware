"use client";

import { useActionState, useState, type RefObject } from "react";
import {
  applySavedReport,
  replaceSavedReportQuestion,
  savedReportSections,
  type FinalSection,
} from "@leakbook/core";
import { saveSavedReport } from "@/app/actions/settings";
import { Sheet, useConfirm } from "./sheet";
import { Button, Notice, cx } from "./ui";

export interface SavedReportOption {
  id: string;
  name: string;
  sections: unknown;
}

/** The draft's sections as they are on screen (its text boxes, edits included). */
function onScreen(form: HTMLFormElement): FinalSection[] {
  const keys = [...form.querySelectorAll<HTMLInputElement>('input[name="key"]')];
  const titles = [...form.querySelectorAll<HTMLInputElement>('input[name="title"]')];
  const texts = [...form.querySelectorAll<HTMLTextAreaElement>('textarea[name="text"]')];
  return keys.map((k, i) => ({
    key: k.value,
    title: titles[i]?.value ?? k.value,
    text: texts[i]?.value ?? "",
  }));
}

/**
 * Use Saved Report and Save as Saved Report on a draft (owner, 2026-10-20: "a copy/paste
 * essentially that the tech uses each time"). Using one puts its text in word for word, asking
 * first when it would replace different text, then saves the draft like an edit.
 */
export function SavedReportActions({
  form,
  saved,
  canSave,
  onUsed,
}: {
  form: RefObject<HTMLFormElement | null>;
  saved: SavedReportOption[];
  /** Owners and admins add saved reports. */
  canSave: boolean;
  /** After the text is in: save the draft. */
  onUsed: () => void;
}) {
  const [picking, setPicking] = useState(false);
  const [naming, setNaming] = useState(false);
  const [confirm, confirmSheet] = useConfirm();
  const [state, saveAction, saving] = useActionState(saveSavedReport, {});
  const [sections, setSections] = useState<FinalSection[]>([]);
  // Saved: close the naming sheet (adjusted while rendering, as React suggests for this).
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    if (state.message) setNaming(false);
  }

  async function use(option: SavedReportOption) {
    setPicking(false);
    const el = form.current;
    if (!el) return;
    const { sections: next, replaces } = applySavedReport(onScreen(el), option.sections);
    if (
      replaces.length &&
      !(await confirm({
        title: replaceSavedReportQuestion(replaces),
        message: `“${option.name}” puts its own text there.`,
        confirmLabel: "Replace",
        destructive: true,
      }))
    )
      return;
    const boxes = [...el.querySelectorAll<HTMLTextAreaElement>('textarea[name="text"]')];
    next.forEach((s, i) => {
      if (boxes[i]) boxes[i].value = s.text;
    });
    onUsed();
  }

  if (!saved.length && !canSave) return null;
  return (
    <div className="flex flex-wrap items-center gap-3">
      {saved.length ? (
        <Button type="button" kind="secondary" onClick={() => setPicking(true)}>
          Use Saved Report
        </Button>
      ) : null}
      {canSave ? (
        <button
          type="button"
          onClick={() => {
            if (form.current) setSections(onScreen(form.current));
            setNaming(true);
          }}
          className="inline-flex min-h-11 items-center font-semibold text-link"
        >
          Save as Saved Report
        </button>
      ) : null}
      {state.message && !naming ? (
        <span aria-live="polite" className="text-[0.9375rem] text-status-pass">
          {state.message}
        </span>
      ) : null}

      <Sheet open={picking} onClose={() => setPicking(false)} title="Use Saved Report">
        <ul className="grouped">
          {saved.map((o) => {
            const text = savedReportSections(o.sections);
            const first = Object.values(text)[0] ?? "";
            return (
              <li key={o.id}>
                <button
                  type="button"
                  onClick={() => void use(o)}
                  className="flex min-h-14 w-full flex-col justify-center px-4 py-2.5 text-left hover:bg-text/[0.03] active:bg-text/[0.06]"
                >
                  <span className="font-semibold">{o.name}</span>
                  {first ? (
                    <span className="line-clamp-2 text-[0.9375rem] text-text-muted">{first}</span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      </Sheet>

      <Sheet open={naming} onClose={() => setNaming(false)} title="Save as Saved Report">
        <form action={saveAction} className="space-y-4">
          {sections.map((s) => (
            <span key={s.key}>
              <input type="hidden" name="key" value={s.key} />
              <input type="hidden" name="text" value={s.text} />
            </span>
          ))}
          <p className="text-[0.9375rem] text-text-muted">
            Saves this draft’s text, word for word, for the team to use on other reports.
          </p>
          <label className="block space-y-1">
            <span className="font-medium">Name</span>
            <input
              name="name"
              required
              maxLength={80}
              placeholder="No leak found"
              className={cx(
                "block min-h-11 w-full rounded-[10px] border border-control-border bg-surface px-3",
                state.fields?.name && "border-status-fail",
              )}
            />
          </label>
          {state.fields?.name ? (
            <p className="text-[0.9375rem] text-status-fail">{state.fields.name}</p>
          ) : null}
          {state.error ? <Notice tone="error">{state.error}</Notice> : null}
          <Button type="submit" disabled={saving} className="w-full">
            {saving ? "Saving…" : "Save"}
          </Button>
        </form>
      </Sheet>
      {confirmSheet}
    </div>
  );
}
