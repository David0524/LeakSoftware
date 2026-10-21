"use client";

import { useCallback, useOptimistic, useState, useTransition, type ReactNode } from "react";
import {
  CHECKLIST_SECTION_LABELS,
  FINDING_STATUS_LABELS,
  INSPECTION_SECTIONS,
  jobActionLabel,
  jobFeeLabel,
  calculate,
  currentVerdict,
  parseDiagramLayout,
  poolDiagram,
  previewTest,
  userTransitions,
  verdictOptions,
  type ChecklistItemResult,
  type ChecklistSection,
  type ComponentType,
  type DiagramShape,
  type FindingStatus,
  type JobStatus,
  type Outcome,
  type TestData,
  type TestType,
  type Verdict,
  removeItemConfirm,
} from "@leakbook/core";
import type { FormState } from "@/app/actions/auth";
import { orOffline } from "@/lib/offline";
import {
  addComponent,
  changeJobStatus,
  markRest,
  deleteFinding,
  deleteTest,
  removeComponent,
  saveFinding,
  saveJobDetails,
  saveTest,
  saveWhere,
  setUpChecklist,
  setPoolShape,
  setPoolSpa,
  setVerdict,
  unmarkRest,
} from "@/app/actions/inspection";
import { InspectionChecklist } from "./inspection-checklist";
import { useNextStep } from "./next-step-events";
import { DiagramShapes } from "./pool-diagram";
import { Segmented } from "./segmented";
import { ShapePicker } from "./shape-picker";
import { FieldError, SField, STextArea, SettingsForm } from "./settings-forms";
import { RowActions, type MenuEntry } from "./row-actions";
import { Sheet, useConfirm } from "./sheet";
import { Button, Checkbox, Chip, Select, buttonClass, cx } from "./ui";
import { SavedNote, UndoNotice, useAutosave, useUndoWindow } from "./undo";

// Working a job on the website (M9.5): the phone's job screen, for a browser.

type Action = (state: FormState, form: FormData) => Promise<FormState>;

/** Run a server action from a button, outside a form. Shows the error, if any. */
export function useRun() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  /**
   * As `run`, and resolves with what the action returned. `after` runs before the button
   * stops being busy, so what it shows next (an Undo) is on screen without a gap.
   */
  function call(
    action: Action,
    fields: Record<string, string>,
    before?: () => void,
    after?: (result: FormState) => void,
  ): Promise<FormState> {
    return new Promise((resolve) =>
      start(async () => {
        before?.();
        const form = new FormData();
        for (const [k, v] of Object.entries(fields)) form.set(k, v);
        // No signal: the request never reached the server. Say so here instead of the
        // whole page giving way to the error screen.
        const result = await orOffline(action)({}, form);
        setError(result.error ?? Object.values(result.fields ?? {})[0] ?? null);
        after?.(result);
        resolve(result);
      }),
    );
  }
  function run(action: Action, fields: Record<string, string>, before?: () => void) {
    void call(action, fields, before);
  }
  return { pending, error, run, call };
}

export function ErrorText({ error }: { error: string | null }) {
  return error ? (
    <p role="alert" className="text-[0.9375rem] text-status-fail">
      {error}
    </p>
  ) : null;
}

// ---------------------------------------------------------------------------
// Status and job details
// ---------------------------------------------------------------------------

export function JobStatusActions({
  jobId,
  status,
  jobType,
  cancel = false,
  prompt = null,
}: {
  jobId: string;
  status: JobStatus;
  jobType?: string;
  /** Asked before Complete Job when completing sends the visit report (owner, 2026-10-20). */
  prompt?: SendPrompt;
  /**
   * Cancel Job lives apart, at the end of Details, so the destructive action isn't the first
   * control on the page (M11 review M5). false: every other action; true: only Cancel Job.
   */
  cancel?: boolean;
}) {
  const { pending, error, run } = useRun();
  const [confirm, confirmSheet] = useConfirm();
  const next = userTransitions(status, jobType).filter((to) => (to === "canceled") === cancel);
  if (next.length === 0) return null;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-3">
        {next.map((to) => (
          <Button
            key={to}
            type="button"
            disabled={pending}
            kind={to === "in_progress" ? "primary" : to === "canceled" ? "danger" : "secondary"}
            // Phones start a job from the Next Step bar instead (owner, 2026-10-20).
            className={
              to === "in_progress" && (status === "scheduled" || status === "unscheduled")
                ? "max-sm:hidden"
                : undefined
            }
            onClick={async () => {
              if (
                to === "canceled" &&
                !(await confirm({
                  title: "Cancel this job?",
                  confirmLabel: "Cancel Job",
                  destructive: true,
                }))
              )
                return;
              if (to === "done" && prompt && !(await confirm({ ...prompt, alert: true }))) return;
              run(changeJobStatus, { job: jobId, to });
            }}
          >
            {jobActionLabel(status, to)}
          </Button>
        ))}
      </div>
      <ErrorText error={error} />
      {confirmSheet}
    </div>
  );
}

/** The question before completing sends the visit report (completeSendPrompt), if any. */
export type SendPrompt = { title: string; message: string; confirmLabel: string } | null;

/**
 * Complete Job at the end of a visit's Checklist (owner, 2026-10-19): one tap, from Scheduled
 * or In progress. The server says what's missing when the shop asks for the checklist or a
 * photo first. Phones have it in the Next Step bar instead (owner, 2026-10-20).
 */
export function CompleteJob({ jobId, prompt }: { jobId: string; prompt: SendPrompt }) {
  return (
    <div className="mt-6 max-w-2xl max-sm:hidden">
      <CompleteJobButton jobId={jobId} prompt={prompt} className="w-full" />
    </div>
  );
}

/**
 * The Complete Job button. When completing sends the visit report (Automatic shops), it asks
 * first in an alert (owner, 2026-10-20); otherwise one tap.
 */
export function CompleteJobButton({
  jobId,
  prompt,
  className,
}: {
  jobId: string;
  prompt: SendPrompt;
  className?: string;
}) {
  const { pending, error, run } = useRun();
  const [confirm, confirmSheet] = useConfirm();
  return (
    <div className="space-y-2">
      <Button
        type="button"
        className={className}
        disabled={pending}
        onClick={async () => {
          if (prompt && !(await confirm({ ...prompt, alert: true }))) return;
          run(changeJobStatus, { job: jobId, to: "done" });
        }}
      >
        {pending ? "Completing…" : "Complete Job"}
      </Button>
      <ErrorText error={error} />
      {confirmSheet}
    </div>
  );
}

// Inputs inside a grouped row. Outlined in color.controlBorder so they read in direct sun.
const ROW_INPUT =
  "rounded-[10px] border border-control-border bg-surface px-3 text-text placeholder:text-placeholder " +
  "focus:outline-3 focus:outline-offset-1 focus:outline-focus";

/** On Site, as an iOS grouped form: label left and the control right, notes full width. */
export function JobDetailsForm({
  jobId,
  jobType,
  pool,
  fee,
  locationMarked,
  notes,
}: {
  jobId: string;
  jobType: string;
  /** The job's pool: its gallons are edited here too (owner, 2026-10-19). */
  pool: { id: string; gallons: number | null } | null;
  fee: number | null;
  locationMarked: boolean;
  notes: string;
}) {
  // Only leak detection marks a leak's location (owner, 2026-10-19: no leak checkbox on
  // maintenance visits) and calls its price a detection fee.
  const detection = jobType === "detection";
  const [gallons, setGallons] = useState(pool?.gallons ? pool.gallons.toLocaleString("en-US") : "");
  return (
    <SettingsForm action={saveJobDetails} submit="Save">
      <input type="hidden" name="job" value={jobId} />
      {detection ? <input type="hidden" name="detection" value="1" /> : null}
      <div>
        <ul className="grouped">
          <li className="flex min-h-11 items-center gap-3 px-4 py-1.5">
            <label htmlFor="job-fee" className="min-w-0 flex-1">
              {jobFeeLabel(jobType)}
            </label>
            <span aria-hidden="true" className="text-text-muted">
              $
            </span>
            <input
              id="job-fee"
              name="fee"
              inputMode="decimal"
              placeholder="0.00"
              defaultValue={fee != null ? (fee / 100).toFixed(2) : ""}
              aria-describedby="job-fee-note"
              className={cx(ROW_INPUT, "min-h-11 w-28 text-right tabular-nums")}
            />
          </li>
          {pool ? (
            <li className="flex min-h-11 items-center gap-3 px-4 py-1.5">
              <input type="hidden" name="property" value={pool.id} />
              <label htmlFor="job-gallons" className="min-w-0 flex-1">
                Pool gallons
              </label>
              <input
                id="job-gallons"
                name="approx_gallons"
                inputMode="numeric"
                placeholder="20,000"
                value={gallons}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, "").slice(0, 7);
                  setGallons(digits ? Number(digits).toLocaleString("en-US") : "");
                }}
                className={cx(ROW_INPUT, "min-h-11 w-28 text-right tabular-nums")}
              />
            </li>
          ) : null}
          {detection ? (
            <li className="px-4">
              <Checkbox
                name="location_marked"
                label="Leak location marked"
                defaultChecked={locationMarked}
              />
            </li>
          ) : null}
          <li className="px-4 pt-2.5 pb-3">
            <label htmlFor="job-notes" className="block text-[0.9375rem] text-text-muted">
              Job notes
            </label>
            <textarea
              id="job-notes"
              name="notes"
              defaultValue={notes}
              placeholder="Anything the office should know"
              className={cx(ROW_INPUT, "mt-1 block min-h-24 w-full py-2")}
            />
          </li>
        </ul>
        <p id="job-fee-note" className="mt-2 px-4 text-[0.8125rem] text-text-muted">
          {detection ? "The detection fee is shown on the report." : "Billed on the invoice."}
        </p>
        <div className="px-4">
          <FieldError name="fee" />
          <FieldError name="approx_gallons" />
          <FieldError name="notes" />
        </div>
      </div>
    </SettingsForm>
  );
}

// ---------------------------------------------------------------------------
// Checklist
// ---------------------------------------------------------------------------

export interface ChecklistRow {
  id: string;
  label: string;
  type: Pick<
    ComponentType,
    "id" | "name" | "answer" | "allows_multiple" | "section" | "group_label" | "options" | "notice"
  >;
  /** Put on this visit by the plan's scheduled cleaning. */
  fromPlan?: boolean;
  /** Photos attached to the item (pool inspection questions show the count). */
  photos?: number;
  result: Pick<
    ChecklistItemResult,
    | "id"
    | "status"
    | "outcome"
    | "location_text"
    | "method"
    | "exclusion_reason"
    | "notes"
    | "value"
  > | null;
}

export function SetUpChecklist({ jobId }: { jobId: string }) {
  return (
    <SettingsForm action={setUpChecklist} submit="Set Up Checklist">
      <input type="hidden" name="job" value={jobId} />
      <p>No checklist yet for this job.</p>
    </SettingsForm>
  );
}

export function ChecklistEditor({
  jobId,
  rows,
  addable,
}: {
  jobId: string;
  rows: ChecklistRow[];
  /** Item types the pool could have that aren't on the checklist yet. */
  addable: { id: string; name: string }[];
}) {
  const { pending, error, run } = useRun();
  const [adding, setAdding] = useState("");
  // Edit, as in an iOS list: every item gets Remove (owner, 2026-10-19).
  const [editing, setEditing] = useState(false);
  // A pool inspection's eight sections have their own rows (inspection-checklist.tsx).
  const inspection = rows.some((r) => INSPECTION_SECTIONS.includes(r.type.section ?? "other"));
  const sections = (Object.keys(CHECKLIST_SECTION_LABELS) as ChecklistSection[])
    .filter((section) => !INSPECTION_SECTIONS.includes(section))
    .map((section) => ({ section, items: rows.filter((r) => r.type.section === section) }))
    .filter((s) => s.items.length > 0);
  // Types that can repeat ("+ Add Another Return"), once each.
  const repeatable = [
    ...new Map(rows.filter((r) => r.type.allows_multiple).map((r) => [r.type.id, r.type])).values(),
  ];
  return (
    <div className="space-y-3">
      {rows.length ? (
        <div className="-mb-1 flex justify-end">
          <button
            type="button"
            aria-pressed={editing}
            onClick={() => setEditing(!editing)}
            className="min-h-11 px-2 font-semibold text-link"
          >
            {editing ? "Done" : "Edit"}
          </button>
        </div>
      ) : null}
      {inspection ? <InspectionChecklist jobId={jobId} rows={rows} editing={editing} /> : null}
      {sections.map(({ section, items }) => (
        <ChecklistGroup
          key={section}
          jobId={jobId}
          section={section}
          items={items}
          editing={editing}
        />
      ))}
      {repeatable.length || addable.length ? (
        <div className="flex flex-wrap items-end gap-3">
          <Select
            label="Add an item"
            name="add_item"
            value={adding}
            onChange={(e) => setAdding(e.target.value)}
            className="min-w-0 flex-1"
            options={[
              { value: "", label: "Choose…" },
              ...repeatable.map((t) => ({ value: t.id, label: `Another ${t.name}` })),
              ...addable.map((t) => ({ value: t.id, label: t.name })),
            ]}
          />
          <Button
            type="button"
            kind="secondary"
            disabled={!adding || pending}
            onClick={() => run(addComponent, { job: jobId, type: adding }, () => setAdding(""))}
          >
            Add
          </Button>
        </div>
      ) : null}
      <ErrorText error={error} />
    </div>
  );
}

/**
 * One section of the checklist as a grouped list that folds away: open while it has items
 * to do, a one-line summary when it's done (apple-design: disclosure-controls.md).
 */
function ChecklistGroup({
  jobId,
  section,
  items,
  editing,
}: {
  jobId: string;
  section: ChecklistSection;
  items: ChecklistRow[];
  editing: boolean;
}) {
  const { pending, error, call } = useRun();
  const toDo = items.filter((r) => currentVerdict(r.result ?? undefined) === null);
  // Undo after Mark Remaining (owner, 2026-10-20): "Marked N" and Undo where the button was.
  const undo = useUndoWindow();
  const [marked, setMarked] = useState<string[]>([]);
  const leaking = items.filter((r) => r.result?.outcome === "leaking").length;
  const attention = items.filter((r) => r.result?.outcome === "attention").length;
  const [folded, setOpen] = useState(toDo.length > 0);
  // Editing opens every section, so each item shows its Remove button.
  const open = folded || editing;
  const title = CHECKLIST_SECTION_LABELS[section];
  const summary =
    toDo.length > 0
      ? `${toDo.length} of ${items.length} to do`
      : section === "service"
        ? attention
          ? `${attention} need${attention === 1 ? "s" : ""} attention`
          : "All done"
        : leaking || attention
          ? [leaking ? `${leaking} leaking` : null, attention ? `${attention} attention` : null]
              .filter(Boolean)
              .join(" · ")
          : "All clear";
  const panel = `checklist-${section}`;
  return (
    <section aria-label={title} className="grouped">
      <h3>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panel}
          onClick={() => setOpen(!folded)}
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
              toDo.length ? "text-text-muted" : leaking ? "text-status-fail" : "text-status-pass",
            )}
          >
            {summary}
          </span>
        </button>
      </h3>
      {open ? (
        <div id={panel} className="border-t-[0.5px] border-separator">
          <ul className="grouped rounded-none">
            {items.map((row) => (
              <li key={row.id}>
                <ChecklistItem jobId={jobId} row={row} editing={editing} />
              </li>
            ))}
          </ul>
          {undo.open ? (
            <div className="border-t-[0.5px] border-separator px-4 py-1">
              <UndoNotice
                text={`Marked ${marked.length}`}
                label={`Undo Marked ${marked.length}: ${title}`}
                onUndo={() => {
                  undo.cancel();
                  void call(unmarkRest, { job: jobId, components: marked.join(",") });
                }}
              />
            </div>
          ) : toDo.length > 0 ? (
            <div className="border-t-[0.5px] border-separator px-4 py-1">
              <button
                type="button"
                disabled={pending}
                className="min-h-11 text-[1.0625rem] text-link"
                onClick={() => {
                  const ids = toDo.map((r) => r.id);
                  void call(
                    markRest,
                    { job: jobId, components: ids.join(",") },
                    undefined,
                    (result) => {
                      if (result.error) return;
                      setMarked(ids);
                      undo.start();
                    },
                  );
                }}
              >
                {pending
                  ? "Saving…"
                  : toDo.every((r) => r.type.answer === "yes_no")
                    ? `Answer ${toDo.length} Remaining No`
                    : toDo.every((r) => r.type.answer === "done")
                      ? `Mark ${toDo.length} Remaining Done`
                      : `Mark ${toDo.length} Remaining Not Leaking`}
              </button>
            </div>
          ) : null}
          {error ? (
            <div className="px-4 pb-2">
              <ErrorText error={error} />
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

const REMOVE = "remove";

/**
 * One row: the item, and its answers as a segmented control under its name, 44 pt tall and
 * full width (owner, 2026-10-20: "Checklist answers in one tap"). Tapping the chosen answer
 * again puts the item back to do. Remove Item is behind Edit (and the menu is gone).
 */
function ChecklistItem({
  jobId,
  row,
  editing,
}: {
  jobId: string;
  row: ChecklistRow;
  editing: boolean;
}) {
  const { error, run } = useRun();
  const [confirm, confirmSheet] = useConfirm();
  const saved = currentVerdict(row.result ?? undefined);
  const [shown, show] = useOptimistic(saved);
  // Where only for leak items marked Leaking or Attention.
  const needsWhere =
    row.type.answer !== "yes_no" &&
    row.type.answer !== "done" &&
    (shown === "leaking" || shown === "attention");
  const options = verdictOptions(row.type);

  async function choose(value: string) {
    if (value === REMOVE) {
      const ask = removeItemConfirm(row.label, row.fromPlan === true);
      if (
        await confirm({
          title: ask.title,
          message: ask.message ?? undefined,
          confirmLabel: ask.confirm,
          destructive: true,
        })
      )
        run(removeComponent, { job: jobId, component: row.id });
      return;
    }
    const v = value === "todo" ? null : (value as Verdict);
    run(
      setVerdict,
      { job: jobId, component: row.id, result: row.result?.id ?? "", verdict: value },
      () => show(v),
    );
  }

  if (editing) {
    return (
      <div className="flex min-h-11 items-center gap-3 px-4 py-1">
        <span className="min-w-0 flex-1 leading-tight font-medium">{row.label}</span>
        <button
          type="button"
          aria-label={`Remove ${row.label}`}
          onClick={() => void choose(REMOVE)}
          className={buttonClass("danger", "min-h-9 px-4")}
        >
          Remove
        </button>
        <ErrorText error={error} />
        {confirmSheet}
      </div>
    );
  }

  const note = [row.result?.method, row.result?.notes].filter(Boolean).join(" · ");
  // Swipe right for the first answer (Done, No, Not Leaking); touch and hold, right-click, or
  // "⋯" for every answer and Not Done (gestures.md section 12), the same as the segments.
  const first = options[0]!;
  const menu: MenuEntry[] = [
    ...options.map((o) => ({
      label: o.label,
      checked: shown === o.value,
      onSelect: () => void choose(o.value),
    })),
    shown != null && "separator",
    shown != null && { label: "Not Done", onSelect: () => void choose("todo") },
  ];
  return (
    <>
      <RowActions
        title={row.label}
        menu={menu}
        leading={
          shown === first.value
            ? []
            : [{ label: first.label, tone: "green", onSelect: () => void choose(first.value) }]
        }
        buttonClassName="absolute top-1.5 right-2"
        data-no-swipe=""
      >
        <div className="px-4 py-2">
          <Segmented<Verdict | "">
            label={row.label}
            name={`verdict-${row.id}`}
            value={shown ?? ""}
            options={options}
            description={note || undefined}
            fit
            segmentClassName="min-h-11!"
            onChange={(v) => void choose(v === shown ? "todo" : v)}
          />
          {needsWhere && row.result ? (
            <WhereField
              jobId={jobId}
              resultId={row.result.id}
              item={row.label}
              value={row.result.location_text}
            />
          ) : null}
          {row.result?.status === "excluded" && row.result.exclusion_reason ? (
            <p className="pt-1 text-[0.9375rem] text-text-muted">{row.result.exclusion_reason}</p>
          ) : null}
          <ErrorText error={error} />
        </div>
      </RowActions>
      {confirmSheet}
    </>
  );
}

/** Where on a Leaking or Attention item: saves by itself (owner, 2026-10-20). */
function WhereField({
  jobId,
  resultId,
  item,
  value,
}: {
  jobId: string;
  resultId: string;
  item: string;
  value: string | null | undefined;
}) {
  const autosave = useAutosave((value ?? "").trim(), async (where) => {
    const form = new FormData();
    form.set("job", jobId);
    form.set("result", resultId);
    form.set("where", where);
    const result = await saveWhere({}, form);
    return result.error ?? null;
  });
  return (
    <div className="pt-2">
      <input
        aria-label={`Where: ${item}`}
        data-autosave
        title="Where"
        defaultValue={value ?? ""}
        placeholder="Where? Under the deck, at the throat…"
        onChange={(e) => autosave.change(e.target.value.trim())}
        onBlur={() => void autosave.flush()}
        className="block min-h-11 w-full rounded-[10px] border border-control-border bg-bg px-3 py-2"
      />
      <SavedNote status={autosave.status} className="block" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// List rows that swipe (Tests and Findings)
// ---------------------------------------------------------------------------

/**
 * An iOS list row with Edit and Delete… (gestures.md section 12): it swipes left on touch to
 * show a red Delete…, and touch and hold, right-click, or its "⋯" button opens a menu with
 * Edit and Delete…. Delete always asks first (the caller's `onDelete`). The row's edit sheet
 * has Delete too, so the gesture is never the only way. `inset` is where the separator above
 * the row starts (where the text does).
 */
function SwipeRow({
  children,
  title,
  onEdit,
  onDelete,
  disabled = false,
  first = false,
  inset = "1rem",
}: {
  children: ReactNode;
  /** The menu's title: the row's name. */
  title: string;
  onEdit?: () => void;
  onDelete: () => void;
  disabled?: boolean;
  first?: boolean;
  inset?: string;
}) {
  const menu: MenuEntry[] = [
    onEdit && { label: "Edit", onSelect: onEdit },
    "separator",
    { label: "Delete…", destructive: true, onSelect: onDelete },
  ];
  return (
    // A row that swipes by itself never swipes to the next job section (owner, 2026-10-20).
    <RowActions
      as="li"
      title={title}
      menu={menu}
      trailing={[{ label: "Delete…", tone: "red", onSelect: onDelete }]}
      disabled={disabled}
      className="overflow-hidden"
      data-no-swipe=""
    >
      {first ? null : (
        <span
          aria-hidden="true"
          style={{ left: inset }}
          className="pointer-events-none absolute top-0 right-0 z-10 border-t-[0.5px] border-separator"
        />
      )}
      {children}
    </RowActions>
  );
}

/** The content of a tappable list row: what's given, then a chevron. */
const LIST_BUTTON =
  "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-text/[0.03] active:bg-text/[0.06] " +
  "focus-visible:outline-3 focus-visible:-outline-offset-3 focus-visible:outline-focus";

function Chevron() {
  return (
    <span
      aria-hidden="true"
      className="shrink-0 self-center text-xl leading-none text-text-muted/70"
    >
      ›
    </span>
  );
}

/** Delete, inside an edit sheet: the way to delete without swiping. */
function SheetDelete({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="mt-6 border-t-[0.5px] border-separator pt-4">
      <Button type="button" kind="danger" className="w-full" disabled={disabled} onClick={onClick}>
        {label}
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

export interface TestRow {
  id: string;
  typeId: string;
  componentId: string | null;
  data: TestData;
  outcome: Outcome | null;
  notes: string | null;
  /** Already formatted on the server, e.g. "Today 9:40 AM". */
  when: string | null;
}

const OUTCOME: Record<Outcome, { label: string; className: string }> = {
  pass: { label: "Pass", className: "bg-status-pass" },
  fail: { label: "Fail", className: "bg-status-fail" },
  inconclusive: { label: "Unclear", className: "bg-status-warning" },
};

export function TestsEditor({
  jobId,
  tests,
  types,
  components,
}: {
  jobId: string;
  tests: TestRow[];
  types: TestType[];
  components: { id: string; label: string }[];
}) {
  // "new", a test's id, or null: which sheet is up.
  const [editing, setEditing] = useState<string | null>(null);
  const close = useCallback(() => setEditing(null), []);
  const { pending, error, run } = useRun();
  const [confirm, confirmSheet] = useConfirm();
  const typeOf = new Map(types.map((t) => [t.id, t]));
  const componentLabel = new Map(components.map((c) => [c.id, c.label]));
  const current = editing && editing !== "new" ? tests.find((t) => t.id === editing) : undefined;
  const currentType = current ? typeOf.get(current.typeId) : undefined;
  const remove = (t: TestRow) => run(deleteTest, { job: jobId, test: t.id }, close);
  // Delete… from the row's swipe or menu asks first, as the sheet's Delete Test does.
  const askRemove = async (t: TestRow, name: string) => {
    if (
      await confirm({
        title: `Delete this ${name.toLowerCase()}?`,
        confirmLabel: "Delete Test",
        destructive: true,
      })
    )
      remove(t);
  };
  useNextStep("add-test", () => {
    if (types.length) setEditing("new");
  });

  return (
    <div className="space-y-4">
      {tests.length === 0 ? (
        <p className="text-text-muted">No tests recorded.</p>
      ) : (
        <ul className="grouped" aria-label="Tests">
          {tests.map((t, i) => {
            const type = typeOf.get(t.typeId);
            const name = type?.name ?? "Test";
            const calc = type ? calculate(type, t.data) : null;
            const outcome = t.outcome ? OUTCOME[t.outcome] : null;
            const meta = [t.componentId ? componentLabel.get(t.componentId) : null, t.when]
              .filter(Boolean)
              .join(" · ");
            const fields =
              type && !type.calculator
                ? type.field_schema.fields.filter(
                    (f) => t.data[f.key] != null && t.data[f.key] !== "",
                  )
                : [];
            return (
              <SwipeRow
                key={t.id}
                first={i === 0}
                title={name}
                disabled={pending}
                onEdit={type ? () => setEditing(t.id) : undefined}
                onDelete={() => void askRemove(t, name)}
              >
                <button
                  type="button"
                  className={LIST_BUTTON}
                  disabled={!type}
                  onClick={() => setEditing(t.id)}
                  aria-label={`Edit ${name}`}
                  aria-describedby={`test-${t.id}-detail`}
                >
                  <span className="min-w-0 flex-1" id={`test-${t.id}-detail`}>
                    <span className="block font-semibold">{name}</span>
                    {meta ? (
                      <span className="block text-[0.9375rem] text-text-muted">{meta}</span>
                    ) : null}
                    {calc?.summary ? (
                      <span className="mt-1 block font-medium">{calc.summary}</span>
                    ) : null}
                    {fields.map((f) => (
                      <span key={f.key} className="block text-[0.9375rem]">
                        <span className="text-text-muted">{f.label}:</span> {String(t.data[f.key])}
                      </span>
                    ))}
                    {t.notes ? (
                      <span className="mt-1 block text-[0.9375rem]">{t.notes}</span>
                    ) : null}
                  </span>
                  {outcome ? (
                    <span className="shrink-0 self-center">
                      <Chip label={outcome.label} className={outcome.className} />
                    </span>
                  ) : null}
                  <Chevron />
                </button>
              </SwipeRow>
            );
          })}
        </ul>
      )}
      <ErrorText error={error} />
      {/* Phones add from the Next Step bar (owner, 2026-10-20). */}
      {types.length ? (
        <Button
          type="button"
          kind="secondary"
          className="max-sm:hidden"
          onClick={() => setEditing("new")}
        >
          Add Test
        </Button>
      ) : null}
      <Sheet
        open={editing === "new" || !!(current && currentType)}
        onClose={close}
        title={current ? `Edit ${currentType?.name ?? "Test"}` : "Add Test"}
      >
        {editing === "new" ? (
          <TestForm jobId={jobId} types={types} components={components} onDone={close} />
        ) : current && currentType ? (
          <>
            <TestForm
              key={current.id}
              jobId={jobId}
              types={[currentType]}
              components={components}
              test={current}
              onDone={close}
            />
            <SheetDelete
              label="Delete Test"
              disabled={pending}
              onClick={async () => {
                if (
                  await confirm({
                    title: `Delete this ${currentType.name.toLowerCase()}?`,
                    confirmLabel: "Delete Test",
                    destructive: true,
                  })
                )
                  remove(current);
              }}
            />
          </>
        ) : null}
      </Sheet>
      {confirmSheet}
    </div>
  );
}

function TestForm({
  jobId,
  types,
  components,
  test,
  onDone,
}: {
  jobId: string;
  types: TestType[];
  components: { id: string; label: string }[];
  test?: TestRow;
  onDone: () => void;
}) {
  const [typeId, setTypeId] = useState(test?.typeId ?? types[0]?.id ?? "");
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      Object.entries(test?.data ?? {}).map(([k, v]) => [k, v == null ? "" : String(v)]),
    ),
  );
  const type = types.find((t) => t.id === typeId);
  const calc = type ? previewTest(type, values) : null;
  const set = (k: string, v: string) => setValues((old) => ({ ...old, [k]: v }));
  // In a sheet: the sheet carries the title and Cancel.
  return (
    <SettingsForm
      action={saveTest}
      submit={test ? "Save Test" : "Add Test"}
      onSaved={onDone}
      primary
      pinned
    >
      <input type="hidden" name="job" value={jobId} />
      <input type="hidden" name="test" value={test?.id ?? ""} />
      {test ? (
        <input type="hidden" name="type" value={typeId} />
      ) : (
        <Select
          label="Test"
          name="type"
          value={typeId}
          onChange={(e) => {
            setTypeId(e.target.value);
            setValues({});
          }}
          options={types.map((t) => ({ value: t.id, label: t.name }))}
        />
      )}
      <Select
        label="Item (optional)"
        name="component"
        defaultValue={test?.componentId ?? ""}
        options={[
          { value: "", label: "Whole job" },
          ...components.map((c) => ({ value: c.id, label: c.label })),
        ]}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        {(type?.field_schema.fields ?? []).map((f) => {
          const name = `f_${f.key}`;
          const label = f.unit ? `${f.label} (${f.unit})` : f.label;
          if (f.type === "select")
            return (
              <div key={f.key}>
                <Select
                  label={label}
                  name={name}
                  value={values[f.key] ?? ""}
                  onChange={(e) => set(f.key, e.target.value)}
                  options={[
                    { value: "", label: "Choose…" },
                    ...(f.options ?? []).map((o) => ({ value: o, label: o })),
                  ]}
                />
                <FieldError name={name} />
              </div>
            );
          if (f.type === "textarea")
            return (
              <div key={f.key} className="sm:col-span-2">
                <STextArea
                  label={label}
                  name={name}
                  value={values[f.key] ?? ""}
                  onChange={(e) => set(f.key, e.target.value)}
                />
              </div>
            );
          return (
            <SField
              key={f.key}
              label={label}
              name={name}
              inputMode={f.type === "number" ? "decimal" : undefined}
              value={values[f.key] ?? ""}
              onChange={(e) => set(f.key, e.target.value)}
            />
          );
        })}
      </div>
      {calc?.summary ? (
        <p className="font-semibold" aria-live="polite">
          {calc.summary}
        </p>
      ) : null}
      <Select
        label="Result"
        name="outcome"
        defaultValue={test?.outcome ?? ""}
        options={[
          {
            value: "",
            label: calc?.suggested
              ? `Use the calculation (${OUTCOME[calc.suggested].label})`
              : "Not decided",
          },
          ...(type?.result_options ?? ["pass", "fail", "inconclusive"]).map((o) => ({
            value: o,
            label: OUTCOME[o].label,
          })),
        ]}
      />
      <STextArea label="Notes (optional)" name="notes" defaultValue={test?.notes ?? ""} />
    </SettingsForm>
  );
}

// ---------------------------------------------------------------------------
// Findings
// ---------------------------------------------------------------------------

export interface FindingRow {
  id: string;
  title: string;
  severity: string;
  componentId: string | null;
  location: string | null;
  status: FindingStatus;
  notes: string | null;
  pinX: number | null;
  pinY: number | null;
}

interface Diagram {
  shape: DiagramShape | null;
  hasSpa: boolean;
  /** property.diagram_layout: mirror and the spa's place (owner, 2026-10-19). */
  layout?: unknown;
  /** The pool, so its shape can be changed here. */
  propertyId?: string;
}

export function FindingsEditor({
  jobId,
  findings,
  severities,
  components,
  diagram,
}: {
  jobId: string;
  findings: FindingRow[];
  severities: { key: string; name: string; color: string }[];
  components: { id: string; label: string }[];
  diagram: Diagram | null;
}) {
  // "new", a finding's id, or null: which sheet is up.
  const [editing, setEditing] = useState<string | null>(null);
  const close = useCallback(() => setEditing(null), []);
  const { pending, error, run } = useRun();
  const [confirm, confirmSheet] = useConfirm();
  const sev = new Map(severities.map((s) => [s.key, s]));
  const componentLabel = new Map(components.map((c) => [c.id, c.label]));
  const current = editing && editing !== "new" ? findings.find((f) => f.id === editing) : undefined;
  const remove = (f: FindingRow) => run(deleteFinding, { job: jobId, finding: f.id }, close);
  // Delete… from the row's swipe or menu asks first, as the sheet's Delete Finding does.
  const askRemove = async (f: FindingRow) => {
    if (
      await confirm({
        title: `Delete “${f.title}”?`,
        confirmLabel: "Delete Finding",
        destructive: true,
      })
    )
      remove(f);
  };
  useNextStep("add-finding", () => setEditing("new"));
  return (
    <div className="space-y-4">
      {findings.length === 0 ? (
        <p className="text-text-muted">No findings recorded.</p>
      ) : (
        // The diagram with its pins is the Pool Diagram section above (owner, 2026-10-19).
        <div className="max-w-2xl">
          <ol className="grouped" aria-label="Findings">
            {findings.map((f, i) => (
              <SwipeRow
                key={f.id}
                first={i === 0}
                inset="3.75rem"
                title={f.title}
                disabled={pending}
                onEdit={() => setEditing(f.id)}
                onDelete={() => void askRemove(f)}
              >
                <button
                  type="button"
                  className={LIST_BUTTON}
                  onClick={() => setEditing(f.id)}
                  aria-label={`Edit ${f.title}`}
                  aria-describedby={`finding-${f.id}-detail`}
                >
                  <span
                    className="inline-flex size-7 shrink-0 items-center justify-center rounded-full font-sans text-[0.9375rem] font-bold text-paper"
                    style={{ backgroundColor: sev.get(f.severity)?.color }}
                    aria-hidden="true"
                  >
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1" id={`finding-${f.id}-detail`}>
                    <span className="block font-semibold">{f.title}</span>
                    <span className="block text-[0.9375rem] text-text-muted">
                      {[
                        sev.get(f.severity)?.name ?? f.severity,
                        f.componentId ? componentLabel.get(f.componentId) : null,
                        FINDING_STATUS_LABELS[f.status],
                        f.pinX != null ? "Pinned on the diagram" : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                    {f.location ? <span className="mt-1 block">{f.location}</span> : null}
                    {f.notes ? (
                      <span className="mt-1 block text-[0.9375rem]">{f.notes}</span>
                    ) : null}
                  </span>
                  <Chevron />
                </button>
              </SwipeRow>
            ))}
          </ol>
        </div>
      )}
      <ErrorText error={error} />
      <Button
        type="button"
        kind="secondary"
        className="max-sm:hidden"
        onClick={() => setEditing("new")}
      >
        Add Finding
      </Button>
      <Sheet
        open={editing === "new" || !!current}
        onClose={close}
        title={current ? "Edit Finding" : "Add Finding"}
      >
        {editing === "new" || current ? (
          <FindingForm
            key={current?.id ?? "new"}
            jobId={jobId}
            finding={current}
            severities={severities}
            components={components}
            diagram={diagram}
            onDone={close}
          />
        ) : null}
        {current ? (
          <SheetDelete
            label="Delete Finding"
            disabled={pending}
            onClick={async () => {
              if (
                await confirm({
                  title: `Delete “${current.title}”?`,
                  confirmLabel: "Delete Finding",
                  destructive: true,
                })
              )
                remove(current);
            }}
          />
        ) : null}
      </Sheet>
      {confirmSheet}
    </div>
  );
}

const STATUSES = Object.keys(FINDING_STATUS_LABELS) as FindingStatus[];

function FindingForm({
  jobId,
  finding,
  severities,
  components,
  diagram,
  onDone,
}: {
  jobId: string;
  finding?: FindingRow;
  severities: { key: string; name: string; color: string }[];
  components: { id: string; label: string }[];
  diagram: Diagram | null;
  onDone: () => void;
}) {
  const [status, setStatus] = useState<FindingStatus>(finding?.status ?? "open");
  const [severity, setSeverity] = useState(finding?.severity ?? "");
  const [pin, setPin] = useState<{ x: number; y: number } | null>(
    finding?.pinX != null && finding.pinY != null ? { x: finding.pinX, y: finding.pinY } : null,
  );
  // The pool's shape is set here, next to the pin (owner, 2026-10-15): saved as soon as it's
  // tapped, and the pin diagram redraws.
  const [shape, setShape] = useState<DiagramShape | null>(diagram?.shape ?? null);
  const [spa, setSpa] = useState(diagram?.hasSpa ?? false);
  const shapeSave = useRun();
  // In a sheet: the sheet carries the title and Cancel.
  return (
    <SettingsForm
      action={saveFinding}
      submit={finding ? "Save Finding" : "Add Finding"}
      onSaved={onDone}
      primary
      pinned
    >
      <input type="hidden" name="job" value={jobId} />
      <input type="hidden" name="finding" value={finding?.id ?? ""} />
      <input type="hidden" name="pin_x" value={pin ? String(pin.x) : ""} />
      <input type="hidden" name="pin_y" value={pin ? String(pin.y) : ""} />
      <SField
        label="What"
        name="title"
        defaultValue={finding?.title ?? ""}
        placeholder="Crack at the skimmer throat"
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Select
            label="Severity"
            name="severity"
            value={severity}
            onChange={(e) => setSeverity(e.target.value)}
            options={[
              { value: "", label: "Choose…" },
              ...severities.map((s) => ({ value: s.key, label: s.name })),
            ]}
          />
          <FieldError name="severity" />
        </div>
        <Select
          label="Item (optional)"
          name="component"
          defaultValue={finding?.componentId ?? ""}
          options={[
            { value: "", label: "None" },
            ...components.map((c) => ({ value: c.id, label: c.label })),
          ]}
        />
      </div>
      <SField
        label="Where (optional)"
        name="location"
        defaultValue={finding?.location ?? ""}
        placeholder="Two feet left of the skimmer"
      />
      <Segmented
        label="Status"
        name="status"
        value={status}
        onChange={setStatus}
        options={STATUSES.map((s) => ({ value: s, label: FINDING_STATUS_LABELS[s] }))}
      />
      {diagram?.propertyId ? (
        <div>
          <ShapePicker
            value={shape}
            hint={shape ? undefined : "Pick one so the diagram matches the pool."}
            disabled={shapeSave.pending}
            onChange={(next) => {
              setShape(next);
              shapeSave.run(setPoolShape, {
                job: jobId,
                property: diagram.propertyId!,
                shape: next ?? "",
              });
            }}
          />
          <Checkbox
            label="Has a spa"
            checked={spa}
            disabled={shapeSave.pending}
            onChange={(e) => {
              const next = e.target.checked;
              setSpa(next);
              shapeSave.run(setPoolSpa, {
                job: jobId,
                property: diagram.propertyId!,
                spa: String(next),
              });
            }}
          />
          <ErrorText error={shapeSave.error} />
        </div>
      ) : null}
      {diagram ? (
        <PinPicker
          diagram={{ ...diagram, shape, hasSpa: spa }}
          pin={pin}
          color={severities.find((s) => s.key === severity)?.color}
          onChange={setPin}
        />
      ) : null}
      <STextArea label="Notes (optional)" name="notes" defaultValue={finding?.notes ?? ""} />
    </SettingsForm>
  );
}

/** Tap the pool diagram to place the pin. Arrow keys move it; Enter drops one in the middle. */
function PinPicker({
  diagram,
  pin,
  color,
  onChange,
}: {
  diagram: Diagram;
  pin: { x: number; y: number } | null;
  color: string | undefined;
  onChange: (pin: { x: number; y: number } | null) => void;
}) {
  const d = poolDiagram(diagram.shape, diagram.hasSpa, parseDiagramLayout(diagram.layout));
  const round = (n: number) => Math.round(Math.min(1, Math.max(0, n)) * 10_000) / 10_000;
  return (
    <div className="space-y-2">
      <p className="font-medium" id="pin-label">
        Pin on the diagram (optional)
      </p>
      <p className="text-[0.9375rem] text-text-muted" id="pin-hint">
        Tap where the leak is. Arrow keys move the pin.
      </p>
      <svg
        viewBox={`0 0 ${d.width} ${d.height}`}
        role="application"
        aria-labelledby="pin-label"
        aria-describedby="pin-hint"
        tabIndex={0}
        data-testid="pin-picker"
        className="w-full max-w-md cursor-crosshair touch-manipulation rounded-xl border border-control-border bg-surface focus:outline-3 focus:outline-offset-2 focus:outline-focus"
        onClick={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          onChange({
            x: round((e.clientX - box.left) / box.width),
            y: round((e.clientY - box.top) / box.height),
          });
        }}
        onKeyDown={(e) => {
          const step = 0.02;
          const at = pin ?? { x: 0.5, y: 0.5 };
          const move: Record<string, [number, number]> = {
            ArrowLeft: [-step, 0],
            ArrowRight: [step, 0],
            ArrowUp: [0, -step],
            ArrowDown: [0, step],
            Enter: [0, 0],
          };
          const delta = move[e.key];
          if (!delta) return;
          e.preventDefault();
          onChange({ x: round(at.x + delta[0]), y: round(at.y + delta[1]) });
        }}
      >
        <DiagramShapes d={d} />
        {pin ? (
          <g>
            <circle cx={pin.x * d.width} cy={pin.y * d.height} r={7.5} className="fill-surface" />
            <circle
              cx={pin.x * d.width}
              cy={pin.y * d.height}
              r={6}
              fill={color ?? "currentColor"}
            />
          </g>
        ) : null}
      </svg>
      <p className="text-[0.9375rem]" aria-live="polite">
        {pin ? "Pin placed." : "No pin yet."}
        {pin ? (
          <button type="button" className="ml-3 min-h-11 text-link" onClick={() => onChange(null)}>
            Clear Pin
          </button>
        ) : null}
      </p>
    </div>
  );
}
