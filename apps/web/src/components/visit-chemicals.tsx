"use client";

import {
  memo,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useOptimistic,
  useRef,
  useState,
  useTransition,
  type ComponentProps,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  ACID_PRODUCTS,
  CHLORINE_PRODUCTS,
  READING_LABELS,
  additionLabel,
  additionsCents,
  calculateChemistry,
  chemicalCardLine,
  chemicalItems,
  chemicalRows,
  formatCents,
  itemAddition,
  lineTotal,
  openSuggestions,
  pickList,
  readingSummary,
  stepQuantity,
  suggestionText,
  targets,
  unitPriceLabel,
  uuidv7,
  type AcidProduct,
  type AdditionDraft,
  type ChemicalAddition,
  type ChemicalItem,
  type ChemicalReading,
  type ChlorineProduct,
  type ChemicalRow,
  type LastVisitNote,
  type ReadingKey,
  type Readings,
} from "@leakbook/core";
import {
  addChemicalsAction,
  removeChemicalAction,
  restoreChemicalAction,
  saveVisitReadingAction,
  updateChemicalAction,
  type ChemicalInput,
} from "@/app/actions/chemicals";
import { createAutosave } from "@/lib/autosave";
import { buzz, type HapticMoment } from "@/lib/haptics";
import { NO_CONNECTION, whenOffline } from "@/lib/offline";
import { saveFailed } from "./instant";
import { showRemoved } from "./removed";
import { Sheet } from "./sheet";
import { buttonClass, cx } from "./ui";

// A visit's Chemicals (owner, 2026-10-24: "the actual reading, the aim for, the suggested
// chemicals to add, and what was actually added"; docs/design/2026-10-24-chemicals-added.md).
// One row per reading: Reading and Aim For, then Suggested and Added. Tapping the circle adds
// the suggestion as it is; the text opens the Added Chemical sheet. Also Added lists chemicals
// added on their own. Everything saves as it's typed or tapped (no Submit on visits). The math
// is packages/core (chemistry.ts, chemical-additions.ts); the same on the iPhone and Android.

const READINGS: { key: ReadingKey; label: string }[] = [
  { key: "fc", label: "Free chlorine" },
  { key: "ph", label: "pH" },
  { key: "ta", label: "Alkalinity" },
  { key: "ch", label: "Calcium" },
  { key: "cya", label: "Stabilizer" },
  { key: "salt", label: "Salt" },
];

/** Where a tech's chosen levels are remembered on this device (as the calculator). */
const GOALS_KEY = "tidemark:chemical-goals";

const num = (v: string | undefined) => {
  const n = Number((v ?? "").replace(/,/g, ""));
  return !v || v.trim() === "" || !Number.isFinite(n) ? null : n;
};
const str = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v));
function withCommas(text: string): string {
  const digits = text
    .replace(/\D/g, "")
    .replace(/^0+(?=\d)/, "")
    .slice(0, 7);
  return digits ? Number(digits).toLocaleString("en-US") : "";
}

const FIELD =
  "block min-h-11 w-full min-w-0 rounded-[10px] border border-control-border bg-surface px-3 py-2 text-right text-text tabular-nums placeholder:text-placeholder focus:outline-3 focus:outline-offset-1 focus:outline-focus";

/**
 * Number pads have no return key on phones: Done (`enterKeyHint`) and Enter put the keyboard
 * away (owner, 2026-10-25: "There isn't a good way to minimize the number keyboard"). Leaving
 * the field saves what's waiting.
 */
function doneOnEnter(e: KeyboardEvent<HTMLInputElement>) {
  if (e.key === "Enter") {
    e.preventDefault();
    e.currentTarget.blur();
  }
}

function Cell({
  label,
  hint,
  ...input
}: ComponentProps<"input"> & { label: string; hint?: string }) {
  return (
    <input
      {...input}
      // A reading's last value from the pool's last visit (owner, 2026-10-26: "Last 7.6"): a
      // hint, never a value; smaller so it fits the box.
      placeholder={hint ?? input.placeholder}
      type="text"
      autoComplete="off"
      enterKeyHint="done"
      onKeyDown={doneOnEnter}
      aria-label={label}
      className={cx(FIELD, hint && "px-2! placeholder:text-[0.8125rem]")}
    />
  );
}

/** A function that keeps one identity across renders and always calls the latest `fn`. */
function useStable<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  const latest = useRef(fn);
  useLayoutEffect(() => {
    latest.current = fn;
  });
  return useCallback((...args: A) => latest.current(...args), []);
}

function Check({ on }: { on: boolean }) {
  return on ? (
    <span
      aria-hidden="true"
      className="grid size-[1.625rem] shrink-0 place-items-center rounded-full bg-status-pass text-on-status"
    >
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
    </span>
  ) : (
    <span
      aria-hidden="true"
      className="size-[1.625rem] shrink-0 rounded-full border-2 border-control-border/60"
    />
  );
}

function Chevron() {
  return (
    <span aria-hidden="true" className="shrink-0 text-xl leading-none text-text-muted/70">
      ›
    </span>
  );
}

type Op =
  | { type: "add"; rows: ChemicalAddition[] }
  | { type: "update"; row: ChemicalAddition }
  | { type: "remove"; id: string };

export interface VisitChemicalsProps {
  jobId: string;
  propertyId: string;
  customerName: string;
  initialGallons: number | null;
  /** The visit's own readings (its id is the visit's), if typed yet. */
  reading: ChemicalReading | null;
  /** The pool's last readings from another visit, for the closed line. */
  lastLine: string | null;
  additions: ChemicalAddition[];
  items: ChemicalItem[];
  /** Charge for Chemicals: prices show, and "Billed on …'s October invoice". */
  charges: boolean;
  /** "October": the month the visit is billed in. */
  month: string;
  /** Additions on a sent invoice, which can't change. */
  locked: string[];
  /** Opened at first (a visit whose chemicals were started). */
  startOpen?: boolean;
  /** "Last 7.6" for each reading, from the pool's last visit (core readingHints). */
  hints?: Partial<Record<ReadingKey, string>>;
  /** The pool's usual chemicals, price book item ids, first in Add Chemical (core usualChemicalIds). */
  usualItems?: string[];
  /** The notes from the pool's last visit, under this visit's notes (core lastVisitNote). */
  lastNote?: LastVisitNote | null;
}

export function VisitChemicals(props: VisitChemicalsProps) {
  const { jobId, propertyId, items, charges } = props;
  const hints = props.hints ?? {};
  const [open, setOpen] = useState(!!props.startOpen);
  const panel = useId();
  const r = props.reading;
  const [gallonsText, setGallonsText] = useState(
    withCommas(str(r?.gallons ?? props.initialGallons)),
  );
  const [values, setValues] = useState<Partial<Record<ReadingKey, string>>>(() =>
    Object.fromEntries(READINGS.map(({ key }) => [key, str(r?.[key])])),
  );
  const [goals, setGoals] = useState<Partial<Record<ReadingKey, string>>>(() =>
    Object.fromEntries(
      Object.entries(r?.goals ?? {}).map(([k, v]) => [k, str(v as number | null)]),
    ),
  );
  const [chlorine, setChlorine] = useState<ChlorineProduct>(r?.chlorine_product ?? "liquid12");
  const [acid, setAcid] = useState<AcidProduct>(r?.acid_product ?? "muriatic31");
  const [notes, setNotes] = useState(r?.notes ?? "");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const touched = useRef(false);

  // A visit with no Aim For of its own starts from this device's remembered levels.
  useEffect(() => {
    if (r?.goals && Object.keys(r.goals).length) return;
    try {
      const saved = JSON.parse(localStorage.getItem(GOALS_KEY) ?? "{}");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read once after mount
      if (saved && typeof saved === "object") setGoals(saved as Record<string, string>);
    } catch {
      // Private browsing or blocked storage: the recommended levels.
    }
  }, [r?.goals]);

  // Saved as typed (owner, 2026-10-25: typing multi-digit numbers was laggy): a second after
  // typing stops, when a field is left (Done, Enter, another field) and when the page is left,
  // as typed text everywhere (lib/autosave). Nothing is sent or stored while the keys are going.
  const [saver] = useState(() =>
    createAutosave({
      initial: "",
      save: async () => null,
      onStatus: (status) => {
        setSaveState(typeof status === "object" ? "error" : status);
        setSaveError(typeof status === "object" ? status.error : null);
      },
    }),
  );
  useEffect(() =>
    saver.setSave(async (json) => {
      const form = JSON.parse(json) as SavedForm;
      try {
        // The levels aimed for are remembered on this device for the next visit.
        localStorage.setItem(GOALS_KEY, JSON.stringify(form.goals));
      } catch {
        // Not remembered; still used for this visit.
      }
      const done = await whenOffline(
        saveVisitReadingAction({ job: jobId, property: propertyId, ...form }),
        { error: NO_CONNECTION },
      );
      return done.error ?? null;
    }),
  );
  const formJson = JSON.stringify({
    gallons: gallonsText,
    readings: values,
    goals,
    chlorine,
    acid,
    notes,
  } satisfies SavedForm);
  useEffect(() => {
    if (touched.current) saver.change(formJson);
  }, [saver, formJson]);
  // Leaving the page (or closing the tab) sends what's waiting.
  useEffect(() => {
    const hidden = () => {
      if (document.visibilityState === "hidden") void saver.flush();
    };
    document.addEventListener("visibilitychange", hidden);
    return () => {
      document.removeEventListener("visibilitychange", hidden);
      void saver.flush();
    };
  }, [saver]);
  const flush = useStable(() => void saver.flush());
  const change =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      touched.current = true;
      set(v);
    };
  // One identity across renders, so a reading's row re-renders only when its own values change.
  const setReading = useCallback((key: ReadingKey, v: string) => {
    touched.current = true;
    setValues((now) => ({ ...now, [key]: v }));
  }, []);
  const setGoal = useCallback((key: ReadingKey, v: string) => {
    touched.current = true;
    setGoals((now) => ({ ...now, [key]: v }));
  }, []);

  // The added chemicals, changed at once on screen and saved behind.
  const [additions, apply] = useOptimistic(props.additions, (rows, op: Op) =>
    op.type === "add"
      ? [...rows, ...op.rows]
      : op.type === "update"
        ? rows.map((a) => (a.id === op.row.id ? op.row : a))
        : rows.filter((a) => a.id !== op.id),
  );
  const [, startTransition] = useTransition();
  const locked = useMemo(() => new Set(props.locked), [props.locked]);
  const run = (op: Op, call: () => Promise<{ error?: string | null }>, after?: () => void) =>
    startTransition(async () => {
      apply(op);
      const done = await whenOffline(call(), { error: NO_CONNECTION });
      if (done.error) saveFailed(done.error);
      else after?.();
    });
  const draftRow = (d: AdditionDraft, i: number): ChemicalAddition => ({
    ...d,
    id: uuidv7(),
    job_id: jobId,
    property_id: propertyId,
    customer_supplied: false,
    note: null,
    added_at: new Date().toISOString(),
    sort_order: additions.length + i,
  });
  const add = (
    drafts: AdditionDraft[],
    extra?: Partial<ChemicalAddition>,
    moment: HapticMoment = "chemicalAdded",
  ) => {
    const rows = drafts.map((d, i) => ({ ...draftRow(d, i), ...extra }));
    buzz(moment);
    run({ type: "add", rows }, () => addChemicalsAction(jobId, propertyId, rows.map(toInput)));
  };
  const save = (row: ChemicalAddition) =>
    run({ type: "update", row }, () => updateChemicalAction(jobId, toInput(row)));
  // `undoable`: from the Remove Chemical button, which takes it off at once and says so for
  // five seconds with Undo (owner, 2026-10-26). Tapping an added chemical's check unmarks it,
  // and tapping again marks it added: no banner needed.
  const remove = (row: ChemicalAddition, undoable = false) =>
    run(
      { type: "remove", id: row.id },
      () => removeChemicalAction(jobId, row.id),
      undoable
        ? () =>
            showRemoved("chemical", async () => {
              const r = await whenOffline(restoreChemicalAction(jobId, row.id), {
                error: NO_CONNECTION,
              });
              return r.error ?? null;
            })
        : undefined,
    );

  // Worked out once per change, not again for every row.
  const readings: Readings = useMemo(
    () => Object.fromEntries(READINGS.map(({ key }) => [key, num(values[key])])),
    [values],
  );
  const result = useMemo(() => {
    const goalLevels = Object.fromEntries(
      Object.entries(goals).map(([k, v]) => [k, num(v)]),
    ) as Partial<Record<ReadingKey, number | null>>;
    const gallons = num(gallonsText) ?? 0;
    return calculateChemistry({ gallons, readings, chlorine, acid, goals: goalLevels });
  }, [gallonsText, readings, goals, chlorine, acid]);
  const gallons = num(gallonsText) ?? 0;
  const ready = gallons > 0 && result.statuses.length > 0;
  const { rows, extras } = useMemo(
    () => chemicalRows(ready ? result : { ...result, steps: [] }, additions, items),
    [ready, result, additions, items],
  );
  const open_ = openSuggestions(rows);
  const recommended = useMemo(() => targets(readings.cya), [readings.cya]);
  const typed = readingSummary(readings);
  const line = chemicalCardLine(typed || props.lastLine || "", additions);
  const total = additionsCents(additions);
  const [editing, setEditing] = useState<ChemicalAddition | null>(null);
  const [picking, setPicking] = useState(false);

  const onAdd = useStable((d: AdditionDraft) => add([d]));
  const onEdit = useStable((a: ChemicalAddition) => setEditing(a));
  const onEditSuggestion = useStable((d: AdditionDraft) =>
    setEditing({ ...draftRow(d, 0), id: "" }),
  );
  const onRemove = useStable((a: ChemicalAddition) => remove(a));

  return (
    <section
      aria-label="Chemicals"
      className="card mb-6 max-w-2xl lg:max-w-5xl"
      data-testid="visit-chemicals"
    >
      <h2>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panel}
          onClick={() => setOpen(!open)}
          className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left"
        >
          <span className="min-w-0 flex-1">
            <span className="block font-sans text-[1.0625rem] font-semibold">Chemicals</span>
            <span className="block truncate font-sans text-[0.9375rem] font-normal text-text-muted tabular-nums">
              {line}
            </span>
          </span>
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className={cx(
              "size-5 shrink-0 text-text-muted transition-transform motion-reduce:transition-none",
              open && "rotate-180",
            )}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      </h2>
      {open ? (
        <div id={panel} className="border-t-[0.5px] border-separator px-4 pt-3 pb-5">
          <div className="flex min-h-11 items-center justify-between gap-3">
            <label htmlFor={`${panel}-gallons`} className="font-medium">
              Gallons
            </label>
            <div className="relative w-36">
              <input
                id={`${panel}-gallons`}
                inputMode="numeric"
                autoComplete="off"
                enterKeyHint="done"
                onKeyDown={doneOnEnter}
                onBlur={flush}
                value={gallonsText}
                placeholder="20,000"
                onChange={(e) => change(setGallonsText)(withCommas(e.target.value))}
                className={cx(FIELD, "pr-11")}
              />
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[0.9375rem] text-text-muted">
                gal
              </span>
            </div>
          </div>

          {/* One row per reading. Phones stack Suggested and Added under the boxes; wide
              screens put them beside, one line per reading. */}
          <div className="mt-3 grid items-end gap-x-4 border-t-[0.5px] border-separator pt-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
            <div className="grid grid-cols-[minmax(0,1fr)_4.75rem_4.75rem] gap-x-2">
              <span />
              <span className="text-right text-[0.8125rem] font-semibold text-text-muted">
                Reading
              </span>
              <span className="text-right text-[0.8125rem] font-semibold text-text-muted">
                Aim For
              </span>
            </div>
            <span className="hidden text-[0.8125rem] font-semibold text-text-muted lg:block">
              Suggested and Added
            </span>
          </div>
          <ol className="mt-1">
            {rows.map((row, i) => {
              const status = result.statuses.find((x) => x.key === row.key);
              return (
                <ReadingRow
                  key={row.key}
                  row={row}
                  rowJson={JSON.stringify(row)}
                  first={i === 0}
                  label={READINGS.find((x) => x.key === row.key)!.label}
                  status={status ? status.status : null}
                  target={recommended[row.key]?.target}
                  value={values[row.key] ?? ""}
                  hint={hints[row.key]}
                  goal={goals[row.key] ?? ""}
                  charges={charges}
                  locked={row.added
                    .filter((a) => locked.has(a.id))
                    .map((a) => a.id)
                    .join(" ")}
                  onReading={setReading}
                  onGoal={setGoal}
                  onBlur={flush}
                  onAdd={onAdd}
                  onEdit={onEdit}
                  onEditSuggestion={onEditSuggestion}
                  onRemove={onRemove}
                />
              );
            })}
          </ol>
          {open_.length ? (
            <button
              type="button"
              onClick={() => add(open_, undefined, "allChemicalsAdded")}
              className={buttonClass("secondary", "mt-3 w-full")}
            >
              Mark All Added
            </button>
          ) : null}

          <h3 className="mt-6 mb-2 font-sans text-[0.8125rem] font-normal text-text-muted uppercase">
            Also Added
          </h3>
          <ul className="overflow-hidden rounded-xl bg-text/[0.04]" data-testid="also-added">
            {extras.map((a) => (
              <li key={a.id} className="border-b-[0.5px] border-separator">
                <button
                  type="button"
                  onClick={() => setEditing(a)}
                  className="flex min-h-11 w-full items-center gap-3 px-4 py-2.5 text-left"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{additionLabel(a)}</span>
                    {a.note || a.customer_supplied ? (
                      <span className="block text-[0.9375rem] text-text-muted">
                        {[a.customer_supplied ? "Customer supplied" : null, a.note]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    ) : null}
                  </span>
                  {charges && !a.customer_supplied ? (
                    <span className="shrink-0 text-text-muted tabular-nums">
                      {formatCents(
                        lineTotal({ quantity: a.quantity, unit_price_cents: a.unit_price_cents }),
                      )}
                    </span>
                  ) : null}
                  <Chevron />
                </button>
              </li>
            ))}
            <li>
              <button
                type="button"
                onClick={() => setPicking(true)}
                className="flex min-h-11 w-full items-center gap-3 px-4 py-2.5 text-left text-link"
              >
                <span
                  aria-hidden="true"
                  className="grid size-[1.625rem] shrink-0 place-items-center rounded-full bg-link text-on-status"
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="size-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                  >
                    <path d="M12 6v12M6 12h12" />
                  </svg>
                </span>
                <span className="font-medium">Add Chemical</span>
              </button>
            </li>
          </ul>

          {result.lsi !== null ? (
            <div className="mt-5 flex items-center justify-between gap-3 border-t-[0.5px] border-separator pt-4">
              <span>Water balance</span>
              <span className="text-text-muted">
                <span className="font-semibold text-text tabular-nums">
                  {result.lsi > 0 ? "+" : ""}
                  {result.lsi.toFixed(1)}
                </span>{" "}
                · {result.lsiLabel}
              </span>
            </div>
          ) : null}

          <h3 className="mt-5 mb-2 font-sans text-[0.8125rem] font-normal text-text-muted uppercase">
            Suggestions Use
          </h3>
          <div className="overflow-hidden rounded-xl bg-text/[0.04]">
            <ProductRow
              label="Chlorine"
              value={chlorine}
              options={CHLORINE_PRODUCTS}
              onChange={(v) => change(setChlorine)(v as ChlorineProduct)}
            />
            <div className="ml-4 border-t-[0.5px] border-separator" />
            <ProductRow
              label="Acid"
              value={acid}
              options={ACID_PRODUCTS}
              onChange={(v) => change(setAcid)(v as AcidProduct)}
            />
          </div>

          <label htmlFor={`${panel}-notes`} className="mt-4 mb-1 block font-medium">
            Notes
          </label>
          <textarea
            id={`${panel}-notes`}
            value={notes}
            placeholder="Anything the customer should know"
            onBlur={flush}
            onChange={(e) => change(setNotes)(e.target.value)}
            className="block min-h-20 w-full rounded-[10px] border border-control-border bg-surface px-3 py-2 text-text placeholder:text-placeholder focus:outline-3 focus:outline-offset-1 focus:outline-focus"
          />
          {props.lastNote ? (
            <p className="mt-1.5 text-[0.9375rem] text-text-muted" data-testid="last-visit-notes">
              <span className="font-semibold">{props.lastNote.label}</span>
              <span className="mt-0.5 line-clamp-3 block whitespace-pre-line">
                {props.lastNote.text}
              </span>
            </p>
          ) : null}

          {charges ? (
            <div className="mt-5 flex items-baseline justify-between border-t-[0.5px] border-separator pt-4">
              <span className="font-semibold">Chemicals today</span>
              <span className="font-semibold tabular-nums" data-testid="chemicals-today">
                {formatCents(total)}
              </span>
            </div>
          ) : null}
          <p className="mt-1 text-[0.9375rem] text-text-muted" aria-live="polite">
            {saveState === "error"
              ? (saveError ?? NO_CONNECTION)
              : saveState === "saving"
                ? "Saving…"
                : charges
                  ? `Billed on ${props.customerName}’s ${props.month} invoice.`
                  : ""}
          </p>
        </div>
      ) : null}

      <AddedSheet
        row={editing}
        items={items}
        charges={charges}
        locked={!!editing && locked.has(editing.id)}
        onClose={() => setEditing(null)}
        onSave={(row) => {
          setEditing(null);
          if (row.id) save(row);
          else add([row], { customer_supplied: row.customer_supplied, note: row.note });
        }}
        onRemove={(row) => {
          setEditing(null);
          remove(row, true);
        }}
      />
      <PickSheet
        open={picking}
        items={items}
        usual={props.usualItems ?? []}
        charges={charges}
        onClose={() => setPicking(false)}
        onAdd={(draft, supplied, note) => {
          setPicking(false);
          add([draft], { customer_supplied: supplied, note });
        }}
      />
    </section>
  );
}

/** What a visit's readings save: the fields as typed. */
interface SavedForm {
  gallons: string;
  readings: Partial<Record<ReadingKey, string>>;
  goals: Partial<Record<ReadingKey, string>>;
  chlorine: ChlorineProduct;
  acid: AcidProduct;
  notes: string;
}

interface ReadingRowProps {
  row: ChemicalRow;
  /** `row` as text: rows are worked out again on every change, so they're compared by content. */
  rowJson: string;
  first: boolean;
  label: string;
  status: "ok" | "low" | "high" | null;
  target: number | undefined;
  value: string;
  /** "Last 7.6": the pool's last reading, shown in the empty box. */
  hint?: string;
  goal: string;
  charges: boolean;
  /** The ids of this row's additions on a sent invoice, space-separated. */
  locked: string;
  onReading: (key: ReadingKey, v: string) => void;
  onGoal: (key: ReadingKey, v: string) => void;
  onBlur: () => void;
  onAdd: (d: AdditionDraft) => void;
  onEdit: (a: ChemicalAddition) => void;
  onEditSuggestion: (d: AdditionDraft) => void;
  onRemove: (a: ChemicalAddition) => void;
}

/**
 * One reading: its name and status, Reading and Aim For, then Suggested and Added. Typing in one
 * reading re-renders only the rows whose own values or suggestions changed (owner, 2026-10-25).
 */
const ReadingRow = memo(
  function ReadingRow({
    row,
    first,
    label,
    status,
    target,
    value,
    hint,
    goal,
    charges,
    locked,
    onReading,
    onGoal,
    onBlur,
    onAdd,
    onEdit,
    onEditSuggestion,
    onRemove,
  }: ReadingRowProps) {
    const lockedIds = new Set(locked.split(" "));
    const addedRow = (a: ChemicalAddition) => (
      <div key={a.id} className="flex items-center gap-1">
        <button
          type="button"
          aria-label={`Remove ${additionLabel(a)}`}
          disabled={lockedIds.has(a.id)}
          onClick={() => onRemove(a)}
          className="-ml-2 grid size-11 shrink-0 place-items-center disabled:opacity-60"
        >
          <Check on />
        </button>
        <button
          type="button"
          onClick={() => onEdit(a)}
          className="flex min-h-12 min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-[0.8125rem] font-semibold text-status-pass">
              {a.customer_supplied ? "Added · customer supplied" : "Added"}
            </span>
            <span className="block font-semibold">{additionLabel(a)}</span>
          </span>
          {charges && !a.customer_supplied ? (
            <span className="shrink-0 text-text-muted tabular-nums">
              {formatCents(
                lineTotal({ quantity: a.quantity, unit_price_cents: a.unit_price_cents }),
              )}
            </span>
          ) : null}
          <Chevron />
        </button>
      </div>
    );
    return (
      <li
        className={cx(
          "grid gap-x-4 py-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] lg:items-center",
          !first && "border-t-[0.5px] border-separator",
        )}
        data-testid={`reading-${row.key}`}
      >
        <div className="grid grid-cols-[minmax(0,1fr)_4.75rem_4.75rem] items-center gap-x-2">
          <div className="min-w-0">
            <p className="leading-tight font-medium">{label}</p>
            <p
              className={cx(
                "text-[0.9375rem]",
                !status
                  ? "text-text-muted"
                  : status === "ok"
                    ? "font-semibold text-status-pass"
                    : "font-semibold text-status-warning",
              )}
            >
              {!status
                ? "Not tested"
                : status === "ok"
                  ? "In range"
                  : status === "low"
                    ? "Low"
                    : "High"}
            </p>
          </div>
          <Cell
            label={`${READING_LABELS[row.key]} reading`}
            hint={hint}
            inputMode="decimal"
            value={value}
            onBlur={onBlur}
            onChange={(e) => onReading(row.key, e.target.value)}
          />
          <Cell
            label={`${READING_LABELS[row.key]}: aim for (recommended ${target})`}
            inputMode="decimal"
            placeholder={String(target)}
            value={goal}
            onBlur={onBlur}
            onChange={(e) => onGoal(row.key, e.target.value)}
          />
        </div>
        {row.step || row.added.length ? (
          <div className="well mt-2.5 px-3 pt-2 pb-1 lg:mt-0">
            {row.step ? (
              <>
                <div className="flex items-center gap-2 text-[0.9375rem]">
                  {row.order ? (
                    <span className="grid size-5 shrink-0 place-items-center rounded-full bg-primary text-[0.75rem] font-bold text-on-primary">
                      {row.order}
                    </span>
                  ) : null}
                  <span className="text-text-muted">Suggested</span>
                  <span className="ml-auto text-right font-medium">{suggestionText(row.step)}</span>
                </div>
                {row.step.note && row.key === "ph" ? (
                  <p className="mt-1 text-[0.9375rem] text-text-muted">
                    Acid to water, never water to acid.
                  </p>
                ) : row.step.note && !row.suggestion ? (
                  <p className="mt-1 text-[0.9375rem] text-text-muted">{row.step.note}</p>
                ) : null}
              </>
            ) : null}
            <div className="mt-2 border-t-[0.5px] border-separator">
              {row.added.map(addedRow)}
              {row.added.length === 0 && row.suggestion ? (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-label={`Mark added: ${additionLabel(row.suggestion)}`}
                    onClick={() => onAdd(row.suggestion!)}
                    className="-ml-2 grid size-11 shrink-0 place-items-center"
                  >
                    <Check on={false} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onEditSuggestion(row.suggestion!)}
                    className="flex min-h-12 min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-[0.8125rem] text-text-muted">Not added yet</span>
                      <span className="block text-text-muted">{additionLabel(row.suggestion)}</span>
                    </span>
                    {charges ? (
                      <span className="shrink-0 text-text-muted tabular-nums">
                        {formatCents(
                          lineTotal({
                            quantity: row.suggestion.quantity,
                            unit_price_cents: row.suggestion.unit_price_cents,
                          }),
                        )}
                      </span>
                    ) : null}
                    <Chevron />
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </li>
    );
  },
  // `row` is compared by its text (`rowJson`); everything else as it is.
  (a, b) =>
    (Object.keys(a) as (keyof ReadingRowProps)[]).every((k) => k === "row" || a[k] === b[k]),
);

function toInput(a: ChemicalAddition): ChemicalInput {
  return {
    id: a.id,
    price_book_item_id: a.price_book_item_id,
    name: a.name,
    unit: a.unit,
    reading_key: a.reading_key,
    suggested_quantity: a.suggested_quantity,
    quantity: a.quantity,
    customer_supplied: a.customer_supplied,
    note: a.note,
    sort_order: a.sort_order,
  };
}

function ProductRow({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Record<string, string>;
  onChange: (v: string) => void;
}) {
  const id = useId();
  return (
    <div className="flex min-h-11 items-center gap-3 px-4">
      <label htmlFor={id} className="flex-1">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-11 bg-transparent text-right text-text-muted [text-align-last:right]"
      >
        {Object.entries(options).map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </div>
  );
}

/** The amount, with − and + by the unit's step (steppers.md: a field beside the stepper). */
function Amount({
  value,
  unit,
  onChange,
}: {
  value: string;
  unit: string;
  onChange: (v: string) => void;
}) {
  const n = num(value) ?? 0;
  const step = (d: 1 | -1) => onChange(String(stepQuantity(n, unit, d)));
  return (
    <div className="flex min-h-14 items-center gap-3 px-4 py-2">
      <div className="relative w-32">
        <input
          aria-label="Amount"
          inputMode="decimal"
          autoComplete="off"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cx(FIELD, "pr-12")}
          data-testid="amount"
        />
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[0.9375rem] text-text-muted">
          {unit}
        </span>
      </div>
      <span className="flex-1" />
      <div className="inline-flex h-11 items-center rounded-full bg-fill">
        <button
          type="button"
          aria-label="Less"
          onClick={() => step(-1)}
          className="grid h-11 w-14 place-items-center"
        >
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className="size-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
          >
            <path d="M5 12h14" />
          </svg>
        </button>
        <span aria-hidden="true" className="h-5 w-px bg-separator" />
        <button
          type="button"
          aria-label="More"
          onClick={() => step(1)}
          className="grid h-11 w-14 place-items-center"
        >
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className="size-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function Group({
  title,
  footer,
  children,
}: {
  title?: string;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="mt-2">
      {title ? (
        <h3 className="mb-2 px-4 font-sans text-[0.8125rem] font-normal text-text-muted uppercase">
          {title}
        </h3>
      ) : null}
      <div className="grouped divide-y divide-separator">{children}</div>
      {footer ? <p className="mt-2 px-4 text-[0.8125rem] text-text-muted">{footer}</p> : null}
    </section>
  );
}

function Switch({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 px-4 py-1.5">
      <span>{label}</span>
      <input
        type="checkbox"
        role="switch"
        className="ios-switch"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}

/** Added Chemical: another chemical, the amount, Customer Supplied, a note, or Remove. */
function AddedSheet({
  row,
  items,
  charges,
  locked,
  onClose,
  onSave,
  onRemove,
}: {
  row: ChemicalAddition | null;
  items: ChemicalItem[];
  charges: boolean;
  locked: boolean;
  onClose: () => void;
  onSave: (row: ChemicalAddition) => void;
  onRemove: (row: ChemicalAddition) => void;
}) {
  return (
    <Sheet
      open={!!row}
      onClose={onClose}
      title={row?.id ? "Added Chemical" : "Add Chemical"}
      done={
        row && !locked
          ? {
              label: row.id ? "Save" : "Add",
              onClick: () => document.getElementById("added-form-submit")?.click(),
            }
          : undefined
      }
    >
      {row ? (
        <AddedForm
          key={row.id || "new"}
          row={row}
          items={items}
          charges={charges}
          locked={locked}
          onSave={onSave}
          onRemove={onRemove}
        />
      ) : null}
    </Sheet>
  );
}

function AddedForm({
  row,
  items,
  charges,
  locked,
  onSave,
  onRemove,
}: {
  row: ChemicalAddition;
  items: ChemicalItem[];
  charges: boolean;
  locked: boolean;
  onSave: (row: ChemicalAddition) => void;
  onRemove: (row: ChemicalAddition) => void;
}) {
  const list = chemicalItems(items);
  const [itemId, setItemId] = useState(row.price_book_item_id ?? "");
  const item = list.find((i) => i.id === itemId);
  const unit = item?.unit ?? row.unit;
  const [qty, setQty] = useState(String(row.quantity));
  const [supplied, setSupplied] = useState(row.customer_supplied);
  const [note, setNote] = useState(row.note ?? "");
  const quantity = num(qty);
  const price = item?.price_cents ?? row.unit_price_cents;
  const valid = quantity !== null && quantity > 0 && quantity <= 100_000;
  const selectId = useId();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid || locked) return;
        onSave({
          ...row,
          price_book_item_id: item?.id ?? row.price_book_item_id,
          name: item?.name ?? row.name,
          unit,
          quantity: quantity!,
          unit_price_cents: price,
          customer_supplied: supplied,
          note: note.trim() || null,
        });
      }}
    >
      <Group title="Chemical">
        <div className="flex min-h-11 items-center gap-3 px-4">
          <label htmlFor={selectId} className="sr-only">
            Chemical
          </label>
          <select
            id={selectId}
            value={itemId}
            disabled={locked}
            onChange={(e) => setItemId(e.target.value)}
            className="min-h-11 w-full bg-transparent font-semibold"
          >
            {!item && row.price_book_item_id === null ? <option value="">{row.name}</option> : null}
            {list.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
                {charges ? ` (${unitPriceLabel(i.price_cents, i.unit)})` : ""}
              </option>
            ))}
          </select>
        </div>
      </Group>
      <Group
        title="Amount"
        footer={
          locked
            ? "This chemical is on a sent invoice. Change the invoice instead."
            : charges && quantity
              ? supplied
                ? "Customer supplied: on the report, not billed."
                : `${additionLabel({ quantity, unit, name: "" }).trim()} × ${formatCents(price)} = ${formatCents(lineTotal({ quantity, unit_price_cents: price }))}, on the monthly invoice.`
              : undefined
        }
      >
        <Amount value={qty} unit={unit} onChange={setQty} />
        <Switch label="Customer Supplied" checked={supplied} onChange={setSupplied} />
        <div className="flex min-h-11 items-center gap-3 px-4">
          <label htmlFor={`${selectId}-note`} className="shrink-0">
            Note
          </label>
          <input
            id={`${selectId}-note`}
            value={note}
            maxLength={200}
            placeholder="Optional"
            onChange={(e) => setNote(e.target.value)}
            className="min-h-11 min-w-0 flex-1 bg-transparent text-right text-text-muted placeholder:text-placeholder"
          />
        </div>
      </Group>
      <button id="added-form-submit" type="submit" className="sr-only" tabIndex={-1} aria-hidden>
        Save
      </button>
      {row.id && !locked ? (
        <button
          type="button"
          onClick={() => onRemove(row)}
          className={buttonClass("danger", "mt-6 w-full")}
        >
          Remove Chemical
        </button>
      ) : null}
    </form>
  );
}

/** Add Chemical: the shop's chemicals with search, then the amount. */
function PickSheet({
  open,
  items,
  usual,
  charges,
  onClose,
  onAdd,
}: {
  open: boolean;
  items: ChemicalItem[];
  /** The pool's usual chemicals (item ids), listed first. */
  usual: string[];
  charges: boolean;
  onClose: () => void;
  onAdd: (draft: AdditionDraft, supplied: boolean, note: string | null) => void;
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Add Chemical"
      done={
        open
          ? { label: "Add", onClick: () => document.getElementById("pick-form-submit")?.click() }
          : undefined
      }
    >
      {open ? <PickForm items={items} usual={usual} charges={charges} onAdd={onAdd} /> : null}
    </Sheet>
  );
}

function PickForm({
  items,
  usual,
  charges,
  onAdd,
}: {
  items: ChemicalItem[];
  usual: string[];
  charges: boolean;
  onAdd: (draft: AdditionDraft, supplied: boolean, note: string | null) => void;
}) {
  const list = chemicalItems(items);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<ChemicalItem | null>(null);
  const [qty, setQty] = useState("1");
  const [supplied, setSupplied] = useState(false);
  const [note, setNote] = useState("");
  // The chemicals this pool usually gets come first (owner, 2026-10-26).
  const groups = pickList(list, usual, query);
  const shownCount = groups.usual.length + groups.rest.length;
  const quantity = num(qty);
  const pick = (i: ChemicalItem) => {
    setPicked(i);
    setQty(String(itemAddition(i).quantity));
  };
  const item = (i: ChemicalItem) => (
    <button
      key={i.id}
      type="button"
      onClick={() => pick(i)}
      aria-pressed={picked?.id === i.id}
      className="flex min-h-11 w-full items-center gap-3 px-4 py-2 text-left"
    >
      <span className="min-w-0 flex-1">
        <span className="block">{i.name}</span>
        {charges ? (
          <span className="block text-[0.9375rem] text-text-muted">
            {unitPriceLabel(i.price_cents, i.unit)}
          </span>
        ) : null}
      </span>
      {picked?.id === i.id ? (
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="size-5 text-link"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      ) : null}
    </button>
  );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!picked || quantity === null || quantity <= 0) return;
        onAdd(itemAddition(picked, quantity), supplied, note.trim() || null);
      }}
    >
      {picked ? (
        <Group
          title="Amount"
          footer={
            charges && quantity
              ? supplied
                ? "Customer supplied: on the report, not billed."
                : `${formatCents(lineTotal({ quantity, unit_price_cents: picked.price_cents }))}, on the monthly invoice.`
              : undefined
          }
        >
          <div className="flex min-h-11 items-center gap-3 px-4 py-2.5">
            <span className="flex-1 font-semibold">{picked.name}</span>
            {charges ? (
              <span className="text-text-muted tabular-nums">
                {unitPriceLabel(picked.price_cents, picked.unit)}
              </span>
            ) : null}
          </div>
          <Amount value={qty} unit={picked.unit} onChange={setQty} />
          <Switch label="Customer Supplied" checked={supplied} onChange={setSupplied} />
          <div className="flex min-h-11 items-center gap-3 px-4">
            <label htmlFor="pick-note" className="shrink-0">
              Note
            </label>
            <input
              id="pick-note"
              value={note}
              maxLength={200}
              placeholder="Optional"
              onChange={(e) => setNote(e.target.value)}
              className="min-h-11 min-w-0 flex-1 bg-transparent text-right text-text-muted placeholder:text-placeholder"
            />
          </div>
        </Group>
      ) : null}
      <div className="mt-4 flex min-h-11 items-center gap-2 rounded-[10px] bg-fill px-3">
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="size-5 text-text-muted"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <input
          type="search"
          aria-label="Search chemicals"
          placeholder="Search chemicals"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="min-h-11 min-w-0 flex-1 bg-transparent placeholder:text-placeholder"
        />
      </div>
      {groups.usual.length ? (
        <Group title="Usual for This Pool">{groups.usual.map(item)}</Group>
      ) : null}
      {groups.rest.length || shownCount === 0 ? (
        <Group title={groups.usual.length ? "Other Chemicals" : "Chemicals"}>
          {groups.rest.map(item)}
          {shownCount === 0 ? (
            <p className="px-4 py-3 text-text-muted">
              No chemicals match. Add them in Settings › Price Book.
            </p>
          ) : null}
        </Group>
      ) : null}
      <button id="pick-form-submit" type="submit" className="sr-only" tabIndex={-1} aria-hidden>
        Add
      </button>
    </form>
  );
}
