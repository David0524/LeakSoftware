"use client";

import { useCallback, useOptimistic, useRef, useState, useTransition } from "react";
import {
  EMPTY_REPAIR_DRAFT,
  REPAIR_CUSTOM,
  REPAIR_LABELS,
  formatCents,
  parseDollars,
  pickRepair,
  repairsTotal,
  type RepairDraft,
  type RepairItem,
  type RepairLine,
} from "@leakbook/core";
import { addRepairAction, removeRepairAction, restoreRepairAction } from "@/app/actions/repairs";
import { NO_CONNECTION, whenOffline } from "@/lib/offline";
import { saveFailed } from "./instant";
import { showRemoved } from "./removed";
import { RowActions, RowMenuButton, type MenuEntry, type SwipeAction } from "./row-actions";
import { FieldError, SField, SettingsForm, SheetDone } from "./settings-forms";
import { Sheet } from "./sheet";
import { showBanner } from "./top-banner";
import { Grouped, Select, buttonClass, cx } from "./ui";

// A repair job's repairs (owner, 2026-10-22: "On repair jobs, (in the intake and actually
// working the job) we need a button to 'add additional repair'"; packages/core/src/repairs.ts).
// The same words and rules as the iPhone and Android apps.

function pickOptions(items: readonly RepairItem[]) {
  return [
    { value: "", label: REPAIR_LABELS.pick },
    ...items.map((i) => ({ value: i.id, label: `${i.name} (${formatCents(i.cents)})` })),
    { value: REPAIR_CUSTOM, label: REPAIR_LABELS.custom },
  ];
}

function PlusIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-5"
      fill="none"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path d="M12 5v14M5 12h14" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// New Job › Repair
// ---------------------------------------------------------------------------

/**
 * New Job › Repair's repairs: the first ("What do they need?"), then each one added with Add
 * Additional Repair, each a price book item (or Something else, typed) and its price. Posts
 * repair_count and repair_pick_N, repair_description_N, repair_price_N (createJobAction).
 */
export function NewJobRepairs({ items }: { items: RepairItem[] }) {
  const next = useRef(1);
  const [rows, setRows] = useState<{ key: number; draft: RepairDraft }[]>([
    { key: 0, draft: EMPTY_REPAIR_DRAFT },
  ]);
  const change = (key: number, draft: RepairDraft) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { key, draft } : r)));
  const total = repairsTotal(
    rows.map((r) => ({ price_cents: Math.max(parseDollars(r.draft.price) ?? 0, 0) })),
  );
  return (
    <div className="space-y-4">
      <input type="hidden" name="repair_count" value={rows.length} />
      {rows.map(({ key, draft }, i) => {
        const typed = !items.length || draft.pick === REPAIR_CUSTOM;
        return (
          <div
            key={key}
            data-testid="new-job-repair"
            className={cx("space-y-4", i > 0 && "border-t-[0.5px] border-separator pt-4")}
          >
            {i > 0 ? (
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold">{REPAIR_LABELS.additional}</span>
                <button
                  type="button"
                  onClick={() => setRows((rs) => rs.filter((r) => r.key !== key))}
                  aria-label={`${REPAIR_LABELS.remove} ${REPAIR_LABELS.additional.toLowerCase()} ${i}`}
                  className={buttonClass("danger", "min-h-9 px-4 text-[0.9375rem]")}
                >
                  {REPAIR_LABELS.remove}
                </button>
              </div>
            ) : null}
            {items.length ? (
              <Select
                label={i === 0 ? REPAIR_LABELS.first : REPAIR_LABELS.item}
                name={`repair_pick_${i}`}
                value={draft.pick}
                onChange={(e) => change(key, pickRepair(draft, e.target.value, items))}
                options={pickOptions(items)}
              />
            ) : null}
            {typed ? (
              <SField
                label={
                  items.length
                    ? REPAIR_LABELS.description
                    : i === 0
                      ? REPAIR_LABELS.first
                      : REPAIR_LABELS.item
                }
                name={`repair_description_${i}`}
                value={draft.description}
                maxLength={200}
                onChange={(e) => change(key, { ...draft, description: e.target.value })}
              />
            ) : null}
            <SField
              label={REPAIR_LABELS.price}
              name={`repair_price_${i}`}
              inputMode="decimal"
              value={draft.price}
              onChange={(e) => change(key, { ...draft, price: e.target.value })}
            />
          </div>
        );
      })}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          data-testid="add-additional-repair"
          onClick={() =>
            setRows((rs) => [...rs, { key: next.current++, draft: EMPTY_REPAIR_DRAFT }])
          }
          className={buttonClass("secondary")}
        >
          <PlusIcon />
          {REPAIR_LABELS.add}
        </button>
        {rows.length > 1 ? (
          <span className="ml-auto font-semibold" data-testid="new-job-repairs-total">
            {REPAIR_LABELS.total} <span className="tabular-nums">{formatCents(total)}</span>
          </span>
        ) : null}
      </div>
      <p className="text-[0.9375rem] text-text-muted">{REPAIR_LABELS.footer}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The job's Details: Repairs
// ---------------------------------------------------------------------------

/** Add Additional Repair's sheet: a price book item, or Something else typed, and its price. */
function AddRepairForm({ jobId, items }: { jobId: string; items: RepairItem[] }) {
  const [draft, setDraft] = useState<RepairDraft>(EMPTY_REPAIR_DRAFT);
  const typed = !items.length || draft.pick === REPAIR_CUSTOM;
  return (
    <SettingsForm action={addRepairAction} submit={REPAIR_LABELS.save} full primary>
      <input type="hidden" name="job" value={jobId} />
      {items.length ? (
        <div>
          <Select
            label={REPAIR_LABELS.item}
            name="pick"
            value={draft.pick}
            onChange={(e) => setDraft(pickRepair(draft, e.target.value, items))}
            options={pickOptions(items)}
          />
          <FieldError name="pick" />
        </div>
      ) : null}
      {typed ? (
        <SField
          label={REPAIR_LABELS.description}
          name="description"
          value={draft.description}
          maxLength={200}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
        />
      ) : null}
      <SField
        label={REPAIR_LABELS.price}
        name="price"
        inputMode="decimal"
        value={draft.price}
        onChange={(e) => setDraft({ ...draft, price: e.target.value })}
      />
    </SettingsForm>
  );
}

/**
 * A repair job's Repairs on Details: each repair and its price, the total, and Add Additional
 * Repair. A repair is removed by its "⋯" menu (always shown), a swipe left, or a right-click.
 */
export function JobRepairs({
  jobId,
  lines,
  items,
}: {
  jobId: string;
  lines: RepairLine[];
  items: RepairItem[];
}) {
  const [adding, setAdding] = useState(false);
  const [, start] = useTransition();
  // Gone from the list at once; a failed removal brings it back.
  const [removed, remove] = useOptimistic<string[], string>([], (ids, id) => [...ids, id]);
  const shown = lines.filter((l) => !removed.includes(l.id));
  const close = useCallback(() => setAdding(false), []);
  const added = useCallback((message: string) => {
    setAdding(false);
    showBanner({ message });
  }, []);

  // Removed at once, with Undo for five seconds (owner, 2026-10-26), not asked first.
  function removeLine(line: RepairLine) {
    start(async () => {
      remove(line.id);
      const r = await whenOffline(removeRepairAction(jobId, line.id), { error: NO_CONNECTION });
      if (r.error) return saveFailed(r.error);
      showRemoved(
        "repair",
        async () => {
          const back = await whenOffline(restoreRepairAction(jobId, line.id), {
            error: NO_CONNECTION,
          });
          return back.error ?? null;
        },
        REPAIR_LABELS.removeMessage,
      );
    });
  }

  return (
    <>
      <Grouped title={REPAIR_LABELS.section} footer={REPAIR_LABELS.footer}>
        {shown.map((line) => {
          const menu: MenuEntry[] = [
            {
              label: REPAIR_LABELS.remove,
              destructive: true,
              onSelect: () => removeLine(line),
            },
          ];
          const swipe: SwipeAction = {
            label: REPAIR_LABELS.remove,
            tone: "red",
            onSelect: () => removeLine(line),
          };
          return (
            <RowActions
              key={line.id}
              as="li"
              title={line.description}
              menu={menu}
              trailing={[swipe]}
              button="none"
              data-testid="repair-row"
            >
              <div className="flex min-h-11 items-center gap-3 py-1.5 pr-1 pl-4">
                <span className="min-w-0 flex-1 break-words">{line.description}</span>
                <span className="shrink-0 text-text-muted tabular-nums">
                  {formatCents(line.price_cents)}
                </span>
                <RowMenuButton
                  visible
                  className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-text/[0.06] focus-visible:outline-3 focus-visible:outline-focus"
                />
              </div>
            </RowActions>
          );
        })}
        {shown.length ? (
          <li>
            <div
              className="flex min-h-11 items-center gap-3 py-2.5 pr-15 pl-4 font-semibold"
              data-testid="repairs-total"
            >
              <span className="flex-1">{REPAIR_LABELS.total}</span>
              <span className="tabular-nums">{formatCents(repairsTotal(shown))}</span>
            </div>
          </li>
        ) : (
          <li>
            <div className="flex min-h-11 items-center px-4 py-2.5 text-text-muted">
              {REPAIR_LABELS.empty}
            </div>
          </li>
        )}
        <li>
          <button
            type="button"
            aria-haspopup="dialog"
            onClick={() => setAdding(true)}
            className="flex min-h-11 w-full items-center gap-2 px-4 py-2.5 text-left text-link transition-colors hover:bg-text/[0.03] focus-visible:outline-3 focus-visible:-outline-offset-3 focus-visible:outline-focus active:bg-text/[0.06]"
          >
            <PlusIcon />
            {REPAIR_LABELS.add}
          </button>
        </li>
      </Grouped>
      <Sheet open={adding} onClose={close} title={REPAIR_LABELS.add}>
        <SheetDone value={added}>
          {adding ? <AddRepairForm jobId={jobId} items={items} /> : null}
        </SheetDone>
      </Sheet>
    </>
  );
}
