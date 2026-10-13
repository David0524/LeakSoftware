"use client";

import { useOptimistic, useState, useTransition } from "react";
import {
  CHECKLIST_SECTION_LABELS,
  FINDING_STATUS_LABELS,
  JOB_STATUS_LABELS,
  calculate,
  currentVerdict,
  normalizeTestData,
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
  setVerdict,
} from "@/app/actions/inspection";
import { PoolDiagram } from "./pool-diagram";
import { Segmented } from "./segmented";
import { FieldError, SField, STextArea, SettingsForm } from "./settings-forms";
import { Button, Checkbox, Chip, Empty, Select, cx } from "./ui";

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
    <p role="alert" className="text-[15px] text-status-fail">
      {error}
    </p>
  ) : null;
}

// ---------------------------------------------------------------------------
// Status and job details
// ---------------------------------------------------------------------------

const ACTION_LABELS: Partial<Record<JobStatus, string>> = {
  in_progress: "Start Job",
  scheduled: "Move Back to Scheduled",
  unscheduled: "Reopen Job",
  canceled: "Cancel Job",
};

export function JobStatusActions({ jobId, status }: { jobId: string; status: JobStatus }) {
  const { pending, error, run } = useRun();
  const next = userTransitions(status);
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
            onClick={() => {
              if (to === "canceled" && !window.confirm("Cancel this job?")) return;
              run(changeJobStatus, { job: jobId, to });
            }}
          >
            {ACTION_LABELS[to] ?? JOB_STATUS_LABELS[to]}
          </Button>
        ))}
      </div>
      <ErrorText error={error} />
    </div>
  );
}

export function JobDetailsForm({
  jobId,
  fee,
  locationMarked,
  notes,
}: {
  jobId: string;
  fee: number | null;
  locationMarked: boolean;
  notes: string;
}) {
  return (
    <SettingsForm action={saveJobDetails} submit="Save">
      <input type="hidden" name="job" value={jobId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <SField
          label="Detection fee ($)"
          name="fee"
          inputMode="decimal"
          defaultValue={fee != null ? (fee / 100).toFixed(2) : ""}
          hint="Shown on the report."
        />
        <div className="self-center">
          <Checkbox
            name="location_marked"
            label="Leak location marked"
            defaultChecked={locationMarked}
          />
        </div>
      </div>
      <STextArea
        label="Job notes"
        name="notes"
        defaultValue={notes}
        placeholder="Anything the office should know"
      />
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
      : leaking || attention
        ? [leaking ? `${leaking} leaking` : null, attention ? `${attention} attention` : null]
            .filter(Boolean)
            .join(" · ")
        : "All clear";
  const panel = `checklist-${section}`;
  return (
    <section
      aria-label={title}
      className="overflow-hidden rounded-xl border border-border bg-surface"
    >
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
          <span className="flex-1 font-display text-lg font-bold">{title}</span>
          <span
            className={cx(
              "text-[15px] font-medium",
              toDo.length ? "text-text-muted" : leaking ? "text-status-fail" : "text-status-pass",
            )}
          >
            {summary}
          </span>
        </button>
      </h3>
      {open ? (
        <div id={panel} className="border-t border-border">
          <ul className="divide-y divide-border">
            {items.map((row) => (
              <li key={row.id}>
                <ChecklistItem jobId={jobId} row={row} />
              </li>
            ))}
          </ul>
          {toDo.length > 0 ? (
            <div className="border-t border-border px-4 py-1">
              <button
                type="button"
                disabled={pending}
                className="min-h-11 text-[15px] font-semibold text-link underline-offset-4 hover:underline"
                onClick={() =>
                  run(markRest, { job: jobId, components: toDo.map((r) => r.id).join(",") })
                }
              >
                {pending
                  ? "Saving…"
                  : toDo.every((r) => r.type.answer === "yes_no")
                    ? `Answer ${toDo.length} Remaining No`
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
  const saved = currentVerdict(row.result ?? undefined);
  const [shown, show] = useOptimistic(saved);
  const needsWhere = row.type.answer !== "yes_no" && (shown === "leaking" || shown === "attention");
  const options = verdictOptions(row.type);

  function choose(value: string) {
    if (value === REMOVE) {
      if (window.confirm(`Remove ${row.label}?`))
        run(removeComponent, { job: jobId, component: row.id });
      return;
    }
    const v = value as Verdict;
    run(
      setVerdict,
      { job: jobId, component: row.id, result: row.result?.id ?? "", verdict: v },
      () => show(v),
    );
  }

  return (
    <div className="px-4 py-2">
      <div className="flex min-h-11 items-center gap-3">
        <span className="min-w-0 flex-1">
          <span className="block leading-tight font-medium">{row.label}</span>
          {row.result?.method || row.result?.notes ? (
            <span className="block truncate text-[13px] text-text-muted">
              {[row.result.method, row.result.notes].filter(Boolean).join(" · ")}
            </span>
          ) : null}
        </span>
        <span className="relative shrink-0">
          <select
            aria-label={row.label}
            value={shown ?? ""}
            onChange={(e) => choose(e.target.value)}
            className={cx(
              "min-h-11 cursor-pointer appearance-none rounded-full border py-1 pr-8 pl-3 text-[15px] font-semibold",
              shown ? VERDICT_STYLE[shown] : "border-control-border bg-surface text-text",
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
        <p className="pb-1 text-[15px] text-text-muted">{row.result.exclusion_reason}</p>
      ) : null}
      <ErrorText error={error} />
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
        className="block min-h-11 w-full rounded-lg border border-control-border bg-bg px-3 py-2"
      />
      <ErrorText error={error} />
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
  const [editing, setEditing] = useState<string | null>(null);
  const { pending, error, run } = useRun();
  const typeOf = new Map(types.map((t) => [t.id, t]));
  const componentLabel = new Map(components.map((c) => [c.id, c.label]));
  return (
    <div className="space-y-4">
      {tests.length === 0 && editing !== "new" ? <Empty>No tests recorded.</Empty> : null}
      <ul className="grid gap-3 md:grid-cols-2">
        {tests.map((t) => {
          const type = typeOf.get(t.typeId);
          if (editing === t.id && type)
            return (
              <li key={t.id} className="md:col-span-2">
                <TestForm
                  jobId={jobId}
                  types={[type]}
                  components={components}
                  test={t}
                  onDone={() => setEditing(null)}
                />
              </li>
            );
          const calc = type ? calculate(type, t.data) : null;
          const outcome = t.outcome ? OUTCOME[t.outcome] : null;
          return (
            <li key={t.id} className="rounded-lg border border-border bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{type?.name ?? "Test"}</p>
                  <p className="text-[15px] text-text-muted">
                    {[t.componentId ? componentLabel.get(t.componentId) : null, t.when]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                {outcome ? <Chip label={outcome.label} className={outcome.className} /> : null}
              </div>
              {calc?.summary ? <p className="mt-2 font-medium">{calc.summary}</p> : null}
              {type && !type.calculator ? (
                <dl className="mt-2 text-[15px]">
                  {type.field_schema.fields
                    .filter((f) => t.data[f.key] != null && t.data[f.key] !== "")
                    .map((f) => (
                      <div key={f.key} className="flex gap-2">
                        <dt className="text-text-muted">{f.label}:</dt>
                        <dd>{String(t.data[f.key])}</dd>
                      </div>
                    ))}
                </dl>
              ) : null}
              {t.notes ? <p className="mt-2 text-[15px]">{t.notes}</p> : null}
              <div className="mt-2 flex gap-4">
                <button
                  type="button"
                  className="min-h-11 font-semibold text-link underline-offset-4 hover:underline"
                  onClick={() => setEditing(t.id)}
                  aria-label={`Edit ${type?.name ?? "test"}`}
                >
                  Edit
                </button>
                <button
                  type="button"
                  disabled={pending}
                  className="min-h-11 font-semibold text-status-fail underline-offset-4 hover:underline"
                  aria-label={`Delete ${type?.name ?? "test"}`}
                  onClick={() => {
                    if (window.confirm("Delete this test?"))
                      run(deleteTest, { job: jobId, test: t.id });
                  }}
                >
                  Delete
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      <ErrorText error={error} />
      {editing === "new" ? (
        <TestForm
          jobId={jobId}
          types={types}
          components={components}
          onDone={() => setEditing(null)}
        />
      ) : types.length ? (
        <Button type="button" kind="secondary" onClick={() => setEditing("new")}>
          Add Test
        </Button>
      ) : null}
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
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <h3 className="mb-3 font-display text-lg font-bold">
        {test ? `Edit ${type?.name ?? "Test"}` : "Add Test"}
      </h3>
      <SettingsForm action={saveTest} submit={test ? "Save Test" : "Add Test"} onSaved={onDone}>
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
      <Button type="button" kind="quiet" className="mt-2" onClick={onDone}>
        Cancel
      </Button>
    </div>
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
  const [editing, setEditing] = useState<string | null>(null);
  const { pending, error, run } = useRun();
  const sev = new Map(severities.map((s) => [s.key, s]));
  const componentLabel = new Map(components.map((c) => [c.id, c.label]));
  const form = (f?: FindingRow) => (
    <FindingForm
      jobId={jobId}
      finding={f}
      severities={severities}
      components={components}
      diagram={diagram}
      onDone={() => setEditing(null)}
    />
  );
  return (
    <div className="space-y-4">
      {findings.length === 0 && editing !== "new" ? <Empty>No findings recorded.</Empty> : null}
      {findings.length ? (
        <div className="grid gap-5 lg:grid-cols-2">
          {diagram ? (
            <PoolDiagram
              shape={diagram.shape}
              hasSpa={diagram.hasSpa}
              title={`Pool diagram with ${findings.length} finding pins`}
              pins={findings
                .map((f, i) => ({ f, n: i + 1 }))
                .filter(({ f }) => f.pinX != null && f.pinY != null)
                .map(({ f, n }) => ({
                  id: f.id,
                  x: f.pinX!,
                  y: f.pinY!,
                  color: sev.get(f.severity)?.color ?? "currentColor",
                  label: String(n),
                }))}
            />
          ) : null}
          <ol className="space-y-3">
            {findings.map((f, i) =>
              editing === f.id ? (
                <li key={f.id}>{form(f)}</li>
              ) : (
                <li key={f.id} className="rounded-lg border border-border bg-surface p-4">
                  <div className="flex items-start gap-3">
                    <span
                      className="inline-flex size-7 shrink-0 items-center justify-center rounded-full font-display font-bold text-paper"
                      style={{ backgroundColor: sev.get(f.severity)?.color }}
                      aria-hidden="true"
                    >
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{f.title}</p>
                      <p className="text-[15px] text-text-muted">
                        {[
                          sev.get(f.severity)?.name ?? f.severity,
                          f.componentId ? componentLabel.get(f.componentId) : null,
                          FINDING_STATUS_LABELS[f.status],
                          f.pinX != null ? "Pinned on the diagram" : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      {f.location ? <p className="mt-1">{f.location}</p> : null}
                      {f.notes ? <p className="mt-1 text-[15px]">{f.notes}</p> : null}
                      <div className="mt-1 flex gap-4">
                        <button
                          type="button"
                          className="min-h-11 font-semibold text-link underline-offset-4 hover:underline"
                          aria-label={`Edit ${f.title}`}
                          onClick={() => setEditing(f.id)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          disabled={pending}
                          className="min-h-11 font-semibold text-status-fail underline-offset-4 hover:underline"
                          aria-label={`Delete ${f.title}`}
                          onClick={() => {
                            if (window.confirm(`Delete “${f.title}”?`))
                              run(deleteFinding, { job: jobId, finding: f.id });
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                </li>
              ),
            )}
          </ol>
        </div>
      ) : null}
      <ErrorText error={error} />
      {editing === "new" ? (
        form()
      ) : (
        <Button type="button" kind="secondary" onClick={() => setEditing("new")}>
          Add Finding
        </Button>
      )}
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
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <h3 className="mb-3 font-display text-lg font-bold">
        {finding ? "Edit Finding" : "Add Finding"}
      </h3>
      <SettingsForm
        action={saveFinding}
        submit={finding ? "Save Finding" : "Add Finding"}
        onSaved={onDone}
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
        {diagram ? (
          <PinPicker
            diagram={diagram}
            pin={pin}
            color={severities.find((s) => s.key === severity)?.color}
            onChange={setPin}
          />
        ) : null}
        <STextArea label="Notes (optional)" name="notes" defaultValue={finding?.notes ?? ""} />
      </SettingsForm>
      <Button type="button" kind="quiet" className="mt-2" onClick={onDone}>
        Cancel
      </Button>
    </div>
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
  const d = poolDiagram(diagram.shape, diagram.hasSpa);
  const round = (n: number) => Math.round(Math.min(1, Math.max(0, n)) * 10_000) / 10_000;
  return (
    <div className="space-y-2">
      <p className="font-medium" id="pin-label">
        Pin on the diagram (optional)
      </p>
      <p className="text-[15px] text-text-muted" id="pin-hint">
        Tap where the leak is. Arrow keys move the pin.
      </p>
      <svg
        viewBox={`0 0 ${d.width} ${d.height}`}
        role="application"
        aria-labelledby="pin-label"
        aria-describedby="pin-hint"
        tabIndex={0}
        data-testid="pin-picker"
        className="w-full max-w-md cursor-crosshair touch-manipulation rounded-lg border border-control-border bg-surface focus:outline-3 focus:outline-offset-2 focus:outline-focus"
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
        <path d={d.pool} className="fill-diagram-water stroke-water" strokeWidth={2} />
        {d.spa ? (
          <circle
            cx={d.spa.cx}
            cy={d.spa.cy}
            r={d.spa.r}
            className="fill-diagram-water stroke-water"
            strokeWidth={2}
          />
        ) : null}
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
      <p className="text-[15px]" aria-live="polite">
        {pin ? "Pin placed." : "No pin yet."}
        {pin ? (
          <button
            type="button"
            className="ml-3 min-h-11 font-semibold text-link underline-offset-4 hover:underline"
            onClick={() => onChange(null)}
          >
            Clear Pin
          </button>
        ) : null}
      </p>
    </div>
  );
}
