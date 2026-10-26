"use client";

import { useOptimistic, useState, useTransition } from "react";
import {
  CHECKLIST_SECTION_LABELS,
  INSPECTION_SECTIONS,
  NOT_PRESENT_LABEL,
  choiceIcons,
  choiceOptions,
  foldedItems,
  inspectionProgress,
  inspectionProgressText,
  inspectionValue,
  isGate,
  toggleChoice,
  type ChecklistSection,
  type ChoiceOption,
  type InspectionValue,
} from "@leakbook/core";
import {
  removeComponent,
  restoreComponent,
  saveItemNotes,
  setAnswer,
} from "@/app/actions/inspection";
import { ErrorText, useRun, type ChecklistRow } from "./job-work";
import { AnswerIconButtons, AnswerMenuPill, flagTone } from "./answer-controls";
import { uploadItemPhotos } from "./media-work";
import { restoreWith, showRemoved } from "./removed";
import { buttonClass, cx } from "./ui";

// Pool Inspection's checklist (owner, 2026-10-20; docs/plans/pool-inspection.md): Leaktronics'
// form, every question kept, made shorter. One row per question with its answers on the row;
// Describe and photos open only when used; a gate's No folds its group away as "Not present";
// banners sit above their question, word for word.

export function InspectionChecklist({
  jobId,
  rows,
  editing,
}: {
  jobId: string;
  rows: ChecklistRow[];
  editing: boolean;
}) {
  const asFold = (r: ChecklistRow) => ({
    id: r.id,
    section: r.type.section,
    group_label: r.type.group_label,
    options: r.type.options,
    value: r.result?.value,
    result: r.result,
  });
  const folded = foldedItems(rows.map(asFold));
  const sections = INSPECTION_SECTIONS.map((section) => ({
    section,
    items: rows.filter((r) => r.type.section === section),
  })).filter((s) => s.items.length > 0);
  // The first section with questions left starts open; the rest are one line each.
  const first = sections.find(
    (s) => inspectionProgress(s.items.map(asFold), folded).toDo > 0,
  )?.section;
  return (
    <>
      {sections.map(({ section, items }) => (
        <InspectionSection
          key={section}
          jobId={jobId}
          section={section}
          items={items}
          folded={folded}
          progress={inspectionProgress(items.map(asFold), folded)}
          startOpen={section === first}
          editing={editing}
        />
      ))}
    </>
  );
}

function InspectionSection({
  jobId,
  section,
  items,
  folded,
  progress,
  startOpen,
  editing,
}: {
  jobId: string;
  section: ChecklistSection;
  items: ChecklistRow[];
  folded: Set<string>;
  progress: ReturnType<typeof inspectionProgress>;
  startOpen: boolean;
  editing: boolean;
}) {
  const [toggled, setOpen] = useState(startOpen);
  const open = toggled || editing;
  const title = CHECKLIST_SECTION_LABELS[section];
  const panel = `inspection-${section}`;
  return (
    <section aria-label={title} className="grouped">
      <h3>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panel}
          onClick={() => setOpen(!toggled)}
          className="flex min-h-14 w-full flex-wrap items-center gap-x-3 gap-y-0.5 px-4 py-1 text-left"
        >
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className={cx(
              "size-5 shrink-0 text-text-muted transition-transform",
              open && "rotate-90",
            )}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M9 6l6 6-6 6" />
          </svg>
          {/* Large text: the summary drops under the title rather than past the edge. */}
          <span className="min-w-0 flex-1 font-sans text-[1.0625rem] font-semibold break-words">
            {title}
          </span>
          <span
            className={cx(
              "ml-auto text-[0.9375rem] font-medium",
              progress.leaking
                ? "text-status-fail"
                : progress.attention
                  ? "text-status-warning"
                  : progress.toDo
                    ? "text-text-muted"
                    : "text-status-pass",
            )}
          >
            {inspectionProgressText(progress)}
          </span>
        </button>
      </h3>
      {open ? (
        <div id={panel} className="border-t-[0.5px] border-separator">
          <ul className="grouped rounded-none">
            {items.map((row, i) => {
              if (folded.has(row.id)) return null;
              const prev = items[i - 1];
              const header =
                row.type.group_label && row.type.group_label !== prev?.type.group_label
                  ? row.type.group_label
                  : null;
              const foldedHere = items.filter(
                (r) =>
                  folded.has(r.id) &&
                  r.type.group_label === row.type.group_label &&
                  isGate(row.type),
              ).length;
              return (
                <li key={row.id}>
                  {header ? (
                    <p className="px-4 pt-4 pb-1 text-[0.8125rem] text-text-muted uppercase">
                      {header}
                    </p>
                  ) : null}
                  {row.type.notice ? (
                    <p className="mx-4 mt-3 rounded-xl bg-status-warning/10 px-3 py-2 text-[0.9375rem] font-semibold">
                      {row.type.notice}
                    </p>
                  ) : null}
                  <InspectionItem jobId={jobId} row={row} editing={editing} />
                  {foldedHere ? (
                    <p className="px-4 pb-3 text-[0.9375rem] text-text-muted">
                      {NOT_PRESENT_LABEL}: {foldedHere}{" "}
                      {foldedHere === 1 ? "question" : "questions"} folded away.
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

const SELECTED: Record<NonNullable<ChoiceOption["flag"]> | "plain", string> = {
  ok: "bg-status-pass text-on-status",
  attention: "bg-status-warning text-on-status",
  leaking: "bg-status-fail text-on-status",
  na: "bg-status-excluded text-on-status",
  plain: "bg-link text-white",
};
const PILL =
  "inline-flex min-h-11 items-center rounded-full px-4 text-[0.9375rem] font-semibold transition-colors";

/** One question: its answers on the row, then Describe and photos when used. */
function InspectionItem({
  jobId,
  row,
  editing,
}: {
  jobId: string;
  row: ChecklistRow;
  editing: boolean;
}) {
  const { error, run, call } = useRun({ instant: true });
  const answer = row.type.answer ?? "choice";
  const options = choiceOptions(row.type.options);
  const saved = inspectionValue(answer, row.result?.value);
  const [shown, show] = useOptimistic<InspectionValue>(saved);
  const [describing, setDescribing] = useState(false);
  const [uploading, startUpload] = useTransition();
  const [photoError, setPhotoError] = useState<string | null>(null);
  const notes = row.result?.notes ?? "";
  // A choice question's answers fit its line on phones; multi and text keep theirs below.
  const choice = answer !== "text" && answer !== "multi";
  const icons = choice ? choiceIcons(options) : null;
  const phoneNote = [
    icons && typeof shown === "string" ? shown : null,
    row.photos ? `${row.photos} photo${row.photos === 1 ? "" : "s"}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  function answerWith(value: InspectionValue) {
    run(
      setAnswer,
      {
        job: jobId,
        component: row.id,
        result: row.result?.id ?? "",
        value: JSON.stringify(value),
      },
      () => show(value),
    );
  }

  if (editing) {
    return (
      <div className="flex min-h-11 items-center gap-3 px-4 py-1">
        <span className="min-w-0 flex-1 leading-tight font-medium">{row.label}</span>
        <button
          type="button"
          aria-label={`Remove ${row.label}`}
          onClick={() =>
            // Removed at once, with Undo for five seconds (owner, 2026-10-26), not asked first.
            void call(removeComponent, { job: jobId, component: row.id }, undefined, (r) => {
              if (!r.error)
                showRemoved(
                  "checklistItem",
                  restoreWith(restoreComponent, { job: jobId, component: row.id }),
                );
            })
          }
          className={buttonClass("danger", "min-h-9 px-4")}
        >
          Remove
        </button>
        <ErrorText error={error} />
      </div>
    );
  }

  return (
    <div className="px-4 py-2">
      <div
        className={cx(
          "flex min-h-11 gap-2",
          choice ? "items-start max-sm:items-center max-sm:gap-0" : "items-start",
        )}
      >
        <span className="min-w-0 flex-1 pt-2.5 max-sm:py-1">
          <span id={`q-${row.id}`} className="block leading-tight font-medium">
            {row.label}
          </span>
          {choice && phoneNote ? (
            <span className="block truncate text-[0.8125rem] text-text-muted sm:hidden">
              {phoneNote}
            </span>
          ) : null}
        </span>
        {/* Phones: the answers on the question's line (owner, 2026-10-22), as icons, or one
            pill and its menu when they have no clear icons. */}
        {choice ? (
          icons ? (
            <AnswerIconButtons
              className="sm:hidden"
              itemLabel={row.label}
              choices={options.map((o, i) => ({
                label: o.label,
                icon: icons[i]!,
                chosen: shown === o.label,
                onSelect: () => answerWith(shown === o.label ? null : o.label),
              }))}
            />
          ) : (
            <AnswerMenuPill
              className="sm:hidden"
              itemLabel={row.label}
              options={options.map((o) => ({ label: o.label, tone: flagTone(o.flag) }))}
              chosen={typeof shown === "string" ? shown : null}
              onChoose={(label) => answerWith(label)}
            />
          )
        ) : null}
        {row.result ? (
          <button
            type="button"
            aria-label={`Describe: ${row.label}`}
            aria-expanded={describing || !!notes}
            onClick={() => setDescribing(!describing)}
            className={cx(
              "inline-flex size-11 shrink-0 items-center justify-center rounded-full transition-colors",
              notes ? "bg-link/10 text-link" : "text-text-muted hover:bg-fill",
            )}
          >
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              className="size-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-4-4L4 16v4z" />
            </svg>
          </button>
        ) : null}
        <label
          className={cx(
            "relative inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors focus-within:outline-3 focus-within:outline-focus",
            row.photos ? "bg-link/10 text-link" : "text-text-muted hover:bg-fill",
          )}
        >
          <span className="sr-only">
            Add photos: {row.label}
            {row.photos ? ` (${row.photos} so far)` : ""}
          </span>
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className="size-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
            <circle cx="12" cy="13" r="3.5" />
          </svg>
          {row.photos ? (
            <span
              aria-hidden="true"
              className="absolute -top-0.5 -right-0.5 grid min-w-5 place-items-center rounded-full bg-link px-1 text-[0.75rem] font-semibold text-white"
            >
              {row.photos}
            </span>
          ) : null}
          <input
            type="file"
            accept="image/*"
            multiple
            disabled={uploading}
            className="sr-only"
            onChange={(e) => {
              const files = [...(e.target.files ?? [])];
              e.target.value = "";
              if (!files.length) return;
              setPhotoError(null);
              startUpload(async () => {
                try {
                  await uploadItemPhotos(jobId, row.id, files);
                } catch (err) {
                  setPhotoError(err instanceof Error ? err.message : String(err));
                }
              });
            }}
          />
        </label>
      </div>

      {answer === "text" ? (
        <textarea
          aria-labelledby={`q-${row.id}`}
          key={typeof saved === "string" ? saved : ""}
          defaultValue={typeof saved === "string" ? saved : ""}
          rows={2}
          maxLength={2000}
          onBlur={(e) => {
            if (e.target.value.trim() !== (typeof saved === "string" ? saved : ""))
              answerWith(e.target.value);
          }}
          className="mt-1 block min-h-11 w-full rounded-[10px] border border-control-border bg-bg px-3 py-2"
        />
      ) : answer === "multi" ? (
        <div role="group" aria-labelledby={`q-${row.id}`} className="mt-1 flex flex-wrap gap-2">
          {options.map((o) => {
            const on = Array.isArray(shown) && shown.includes(o.label);
            return (
              <button
                key={o.label}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  answerWith(toggleChoice(options, Array.isArray(shown) ? shown : [], o.label))
                }
                className={cx(PILL, on ? SELECTED.plain : "bg-fill hover:bg-text/[0.1]")}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      ) : (
        <div
          role="radiogroup"
          aria-labelledby={`q-${row.id}`}
          className="mt-1 flex flex-wrap gap-2 max-sm:hidden"
        >
          {options.map((o) => {
            const on = shown === o.label;
            return (
              <button
                key={o.label}
                type="button"
                role="radio"
                aria-checked={on}
                // Tapping the chosen answer again puts the question back to do.
                onClick={() => answerWith(on ? null : o.label)}
                className={cx(
                  PILL,
                  on ? SELECTED[o.flag ?? "plain"] : "bg-fill hover:bg-text/[0.1]",
                )}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      )}

      {row.result && (describing || notes) ? (
        <textarea
          aria-label={`Describe: ${row.label}`}
          key={notes}
          defaultValue={notes}
          placeholder="Describe"
          rows={2}
          maxLength={2000}
          autoFocus={describing && !notes}
          onBlur={(e) => {
            if (e.target.value.trim() !== notes)
              run(saveItemNotes, { job: jobId, result: row.result!.id, notes: e.target.value });
          }}
          className="mt-2 block min-h-11 w-full rounded-[10px] border border-control-border bg-bg px-3 py-2"
        />
      ) : null}
      {uploading ? <p className="pt-1 text-[0.9375rem] text-text-muted">Uploading…</p> : null}
      <ErrorText error={error ?? photoError} />
    </div>
  );
}
