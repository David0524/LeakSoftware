"use client";

import {
  useCallback,
  useOptimistic,
  useRef,
  useState,
  useTransition,
  type PointerEvent,
  type ReactNode,
} from "react";
import {
  CHECKLIST_SECTION_LABELS,
  FINDING_STATUS_LABELS,
  jobActionLabel,
  jobFeeLabel,
  calculate,
  currentVerdict,
  normalizeTestData,
  parseDiagramLayout,
  poolDiagram,
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
} from "@leakbook/core";
import type { FormState } from "@/app/actions/auth";
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
} from "@/app/actions/inspection";
import { DiagramShapes } from "./pool-diagram";
import { Segmented } from "./segmented";
import { ShapePicker } from "./shape-picker";
import { FieldError, SField, STextArea, SettingsForm } from "./settings-forms";
import { Sheet, useConfirm } from "./sheet";
import { Button, Checkbox, Chip, Select, cx } from "./ui";

// Working a job on the website (M9.5): the phone's job screen, for a browser.

type Action = (state: FormState, form: FormData) => Promise<FormState>;

/** Run a server action from a button, outside a form. Shows the error, if any. */
function useRun() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  function run(action: Action, fields: Record<string, string>, before?: () => void) {
    start(async () => {
      before?.();
      const form = new FormData();
      for (const [k, v] of Object.entries(fields)) form.set(k, v);
      const result = await action({}, form);
      setError(result.error ?? Object.values(result.fields ?? {})[0] ?? null);
    });
  }
  return { pending, error, run };
}

function ErrorText({ error }: { error: string | null }) {
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
}: {
  jobId: string;
  status: JobStatus;
  jobType?: string;
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

// Inputs inside a grouped row. Outlined in color.controlBorder so they read in direct sun.
const ROW_INPUT =
  "rounded-[10px] border border-control-border bg-surface px-3 text-text placeholder:text-placeholder " +
  "focus:outline-3 focus:outline-offset-1 focus:outline-focus";

/** On Site, as an iOS grouped form: label left and the control right, notes full width. */
export function JobDetailsForm({
  jobId,
  jobType,
  fee,
  locationMarked,
  notes,
}: {
  jobId: string;
  jobType: string;
  fee: number | null;
  locationMarked: boolean;
  notes: string;
}) {
  // Only leak detection marks a leak's location (owner, 2026-10-19: no leak checkbox on
  // maintenance visits) and calls its price a detection fee.
  const detection = jobType === "detection";
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
  type: Pick<ComponentType, "id" | "name" | "answer" | "allows_multiple" | "section">;
  result: Pick<
    ChecklistItemResult,
    "id" | "status" | "outcome" | "location_text" | "method" | "exclusion_reason" | "notes"
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
  const sections = (Object.keys(CHECKLIST_SECTION_LABELS) as ChecklistSection[])
    .map((section) => ({ section, items: rows.filter((r) => r.type.section === section) }))
    .filter((s) => s.items.length > 0);
  // Types that can repeat ("+ Add Another Return"), once each.
  const repeatable = [
    ...new Map(rows.filter((r) => r.type.allows_multiple).map((r) => [r.type.id, r.type])).values(),
  ];
  return (
    <div className="space-y-3">
      {sections.map(({ section, items }) => (
        <ChecklistGroup key={section} jobId={jobId} section={section} items={items} />
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
}: {
  jobId: string;
  section: ChecklistSection;
  items: ChecklistRow[];
}) {
  const { pending, error, run } = useRun();
  const toDo = items.filter((r) => currentVerdict(r.result ?? undefined) === null);
  const leaking = items.filter((r) => r.result?.outcome === "leaking").length;
  const attention = items.filter((r) => r.result?.outcome === "attention").length;
  const [open, setOpen] = useState(toDo.length > 0);
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
          onClick={() => setOpen(!open)}
          className="flex min-h-14 w-full items-center gap-3 px-4 text-left"
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
          <span className="flex-1 font-sans text-[1.0625rem] font-semibold">{title}</span>
          <span
            className={cx(
              "text-[0.9375rem] font-medium",
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
                <ChecklistItem jobId={jobId} row={row} />
              </li>
            ))}
          </ul>
          {toDo.length > 0 ? (
            <div className="border-t-[0.5px] border-separator px-4 py-1">
              <button
                type="button"
                disabled={pending}
                className="min-h-11 text-[1.0625rem] text-link"
                onClick={() =>
                  run(markRest, { job: jobId, components: toDo.map((r) => r.id).join(",") })
                }
              >
                {pending
                  ? "Saving…"
                  : toDo.every((r) => r.type.answer === "yes_no")
                    ? `Answer ${toDo.length} Remaining No`
                    : toDo.every((r) => r.type.answer === "done")
                      ? `Mark ${toDo.length} Remaining Done`
                      : `Mark ${toDo.length} Remaining Not Leaking`}
              </button>
              <ErrorText error={error} />
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

const VERDICT_STYLE: Record<Verdict, string> = {
  ok: "bg-status-pass text-on-status border-transparent",
  leaking: "bg-status-fail text-on-status border-transparent",
  attention: "bg-status-warning text-on-status border-transparent",
  na: "bg-status-excluded text-on-status border-transparent",
};
const REMOVE = "remove";

/** One row: the item, and its verdict as a pull-down (the system menu on a phone). */
function ChecklistItem({ jobId, row }: { jobId: string; row: ChecklistRow }) {
  const { error, run } = useRun();
  const [confirm, confirmSheet] = useConfirm();
  const saved = currentVerdict(row.result ?? undefined);
  const [shown, show] = useOptimistic(saved);
  const needsWhere = row.type.answer !== "yes_no" && (shown === "leaking" || shown === "attention");
  const options = verdictOptions(row.type);
  // Maintenance items are just done or not: a check, no menu (owner, 2026-10-18).
  const check = row.type.answer === "done";

  async function choose(value: string) {
    if (value === REMOVE) {
      if (
        await confirm({
          title: `Remove ${row.label} from the checklist?`,
          confirmLabel: "Remove Item",
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

  if (check) {
    const done = shown === "ok";
    const other = shown && !done ? options.find((o) => o.value === shown)?.label : null;
    return (
      <div className="flex min-h-11 items-center gap-1 px-4 py-1">
        <label className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            className="peer sr-only"
            checked={done}
            onChange={(e) => void choose(e.target.checked ? "ok" : "todo")}
          />
          <span
            aria-hidden="true"
            className={cx(
              "grid size-6 shrink-0 place-items-center rounded-full peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus",
              done ? "bg-status-pass text-white" : "border-2 border-control-border",
            )}
          >
            {done ? (
              <svg
                viewBox="0 0 24 24"
                className="size-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
            ) : null}
          </span>
          <span className="min-w-0 flex-1">
            <span className={cx("block leading-tight font-medium", done && "text-text-muted")}>
              {row.label}
            </span>
            {other || row.result?.notes ? (
              <span className="block truncate text-[0.8125rem] text-text-muted">
                {[other, row.result?.notes].filter(Boolean).join(" · ")}
              </span>
            ) : null}
          </span>
        </label>
        {row.type.allows_multiple ? (
          <button
            type="button"
            aria-label={`Remove ${row.label}`}
            onClick={() => void choose(REMOVE)}
            className="grid size-11 shrink-0 place-items-center rounded-full text-text-muted hover:text-text"
          >
            <svg
              viewBox="0 0 24 24"
              className="size-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        ) : null}
        <ErrorText error={error} />
        {confirmSheet}
      </div>
    );
  }

  return (
    <div className="px-4 py-2">
      <div className="flex min-h-11 items-center gap-3">
        <span className="min-w-0 flex-1">
          <span className="block leading-tight font-medium">{row.label}</span>
          {row.result?.method || row.result?.notes ? (
            <span className="block truncate text-[0.8125rem] text-text-muted">
              {[row.result.method, row.result.notes].filter(Boolean).join(" · ")}
            </span>
          ) : null}
        </span>
        <span className="relative shrink-0">
          <select
            aria-label={row.label}
            value={shown ?? ""}
            onChange={(e) => void choose(e.target.value)}
            className={cx(
              "min-h-11 cursor-pointer appearance-none rounded-full border py-1 pr-8 pl-3 text-[0.9375rem] font-semibold",
              shown ? VERDICT_STYLE[shown] : "border-transparent bg-fill text-text",
            )}
          >
            {shown === null ? (
              <option value="" disabled>
                To Do
              </option>
            ) : null}
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
            {row.type.allows_multiple ? <option value={REMOVE}>Remove Item…</option> : null}
          </select>
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M7 10l5 5 5-5" />
          </svg>
        </span>
      </div>
      {needsWhere && row.result ? (
        <WhereField
          jobId={jobId}
          resultId={row.result.id}
          item={row.label}
          value={row.result.location_text}
        />
      ) : null}
      {row.result?.status === "excluded" && row.result.exclusion_reason ? (
        <p className="pb-1 text-[0.9375rem] text-text-muted">{row.result.exclusion_reason}</p>
      ) : null}
      <ErrorText error={error} />
      {confirmSheet}
    </div>
  );
}

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
  const { error, run } = useRun();
  return (
    <div className="pb-2">
      <input
        aria-label={`Where: ${item}`}
        title="Where"
        key={value ?? ""}
        defaultValue={value ?? ""}
        placeholder="Where? Under the deck, at the throat…"
        onBlur={(e) => {
          if (e.target.value.trim() !== (value ?? ""))
            run(saveWhere, { job: jobId, result: resultId, where: e.target.value });
        }}
        className="block min-h-11 w-full rounded-[10px] border border-control-border bg-bg px-3 py-2"
      />
      <ErrorText error={error} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// List rows that swipe (Tests and Findings)
// ---------------------------------------------------------------------------

const SWIPE_WIDTH = 88;

/**
 * An iOS list row that slides left on touch to show a red Delete button (lists-and-tables.md:
 * swipe actions). Mouse, keyboard, and VoiceOver users delete from the row's edit sheet
 * instead, so the hidden button stays out of the tab order and the accessibility tree until
 * it shows. `inset` is where the separator above the row starts (where the text does).
 */
function SwipeRow({
  children,
  onDelete,
  deleteLabel,
  disabled = false,
  first = false,
  inset = "1rem",
}: {
  children: ReactNode;
  onDelete: () => void;
  deleteLabel: string;
  disabled?: boolean;
  first?: boolean;
  inset?: string;
}) {
  const [open, setOpen] = useState(false);
  const [dx, setDx] = useState<number | null>(null);
  const live = useRef(0);
  const drag = useRef<{ x0: number; y0: number; base: number; axis: "x" | "y" | null } | null>(
    null,
  );
  // A swipe ends with a click on the row; that click must not open the editor.
  const swallow = useRef(false);
  const offset = dx ?? (open ? -SWIPE_WIDTH : 0);

  function down(e: PointerEvent<HTMLDivElement>) {
    swallow.current = false;
    if (e.pointerType === "mouse" || disabled) return;
    drag.current = { x0: e.clientX, y0: e.clientY, base: open ? -SWIPE_WIDTH : 0, axis: null };
  }
  function move(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d) return;
    const mx = e.clientX - d.x0;
    const my = e.clientY - d.y0;
    if (d.axis === null) {
      if (Math.abs(mx) < 8 && Math.abs(my) < 8) return;
      d.axis = Math.abs(mx) > Math.abs(my) ? "x" : "y";
      if (d.axis === "x") e.currentTarget.setPointerCapture?.(e.pointerId);
    }
    if (d.axis !== "x") return;
    live.current = Math.min(0, Math.max(-SWIPE_WIDTH * 1.4, d.base + mx));
    setDx(live.current);
  }
  function up() {
    const d = drag.current;
    drag.current = null;
    if (!d || d.axis !== "x") return;
    swallow.current = true;
    setOpen(live.current < -SWIPE_WIDTH / 2);
    setDx(null);
  }
  function cancel() {
    drag.current = null;
    setDx(null);
  }

  return (
    <li className="relative overflow-hidden">
      {first ? null : (
        <span
          aria-hidden="true"
          style={{ left: inset }}
          className="pointer-events-none absolute top-0 right-0 z-10 border-t-[0.5px] border-separator"
        />
      )}
      {offset < 0 ? (
        <button
          type="button"
          tabIndex={open ? 0 : -1}
          aria-hidden={!open}
          aria-label={deleteLabel}
          disabled={disabled}
          onClick={() => {
            setOpen(false);
            onDelete();
          }}
          style={{ width: Math.max(SWIPE_WIDTH, -offset) }}
          className="absolute inset-y-0 right-0 flex items-center justify-center bg-status-fail text-[1.0625rem] font-semibold text-on-status"
        >
          Delete
        </button>
      ) : null}
      <div
        style={offset ? { transform: `translateX(${offset}px)` } : undefined}
        className={cx("relative touch-pan-y bg-surface", dx === null && "transition-transform")}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={cancel}
        onClickCapture={(e) => {
          if (swallow.current || open) {
            swallow.current = false;
            e.preventDefault();
            e.stopPropagation();
            setOpen(false);
          }
        }}
      >
        {children}
      </div>
    </li>
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
                deleteLabel={`Delete ${name}`}
                disabled={pending}
                onDelete={() => remove(t)}
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
      {types.length ? (
        <Button type="button" kind="secondary" onClick={() => setEditing("new")}>
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
  const calc = type ? calculate(type, normalizeTestData(type.field_schema, values)) : null;
  const set = (k: string, v: string) => setValues((old) => ({ ...old, [k]: v }));
  // In a sheet: the sheet carries the title and Cancel.
  return (
    <SettingsForm
      action={saveTest}
      submit={test ? "Save Test" : "Add Test"}
      onSaved={onDone}
      primary
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
                deleteLabel={`Delete ${f.title}`}
                disabled={pending}
                onDelete={() => remove(f)}
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
      <Button type="button" kind="secondary" onClick={() => setEditing("new")}>
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
