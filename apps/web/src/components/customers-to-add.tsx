"use client";

import { useDraggable } from "@dnd-kit/core";
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useOptimistic,
  useRef,
  useState,
  useTransition,
  type ReactNode,
  type RefObject,
} from "react";
import { planMovedBanner, serviceDays, weekday, type DaySuggestion } from "@leakbook/core";
import {
  keepSuggestedDays,
  setServiceDay,
  suggestDays,
  undoServiceDays,
  type PlanUndo,
  type RouteDayResult,
} from "@/app/actions/service-days";
import {
  WEEKDAY_NAMES,
  WEEKDAY_SHORT,
  customersToAdd,
  leftOutNote,
  movePlan,
  rebuildPlans,
  repeatNote,
  sortDays,
  suggestedLabel,
  type RoutePlanCard,
} from "@/lib/service-routes";
import { NotOnMapTag } from "./not-on-map";
import { RowActions, type MenuEntry, type RowActionsHandle } from "./row-actions";
import { Segmented } from "./segmented";
import { Sheet } from "./sheet";
import { SideSectionTitle } from "./side-section";
import { TechDot } from "./tech-dot";
import { showBanner } from "./top-banner";
import { Button, cx } from "./ui";

// Customers to Add, in Schedule › Week (owner, 2026-10-20, docs/design/2026-10-20-team-week.md
// section 6; it was the Routes view's list): maintenance plans nobody services yet. Drag a
// customer onto a tech's day on the week (the whole tile drags, grip included: section 8), or
// tap it for Move…, which picks the weekday and tech. Suggest Days proposes a day for each and
// saves nothing until Keep. Every change has Undo. Owners and admins.

export type Tech = { id: string; name: string; color?: string | null };

/**
 * What the week board hands Customers to Add: a customer dropped on a tech's day, and a touch
 * held without moving (its menu). Set by the sidebar list; the board calls it from its own drag
 * and drop.
 */
export interface PlanDrops {
  drop: (planId: string, techId: string, date: string) => void;
  hold: (dragId: string) => void;
}
export const PlanDrop = createContext<RefObject<PlanDrops | null> | null>(null);

/** A customer's drag id: "plan:<plan>". The board tells them from its jobs by the prefix. */
export const PLAN_DRAG = "plan:";

/** What the drag shows under the finger, for the board's overlay. */
export interface PlanDragData {
  kind: "plan";
  customer: string;
  address: string;
}

type Change =
  | { kind: "move"; plan: string; from: number | null; to: number; tech: string }
  | { kind: "restore"; rows: PlanUndo[] }
  | { kind: "keep"; list: DaySuggestion[] };

function apply(plans: RoutePlanCard[], c: Change): RoutePlanCard[] {
  if (c.kind === "move") return plans.map((p) => (p.planId === c.plan ? movePlan(p, c) : p));
  if (c.kind === "keep") {
    const by = new Map(c.list.map((s) => [s.id, s]));
    return plans.map((p) => {
      const s = by.get(p.planId);
      return s ? { ...p, techId: s.techId, days: [s.day] } : p;
    });
  }
  const by = new Map(c.rows.map((r) => [r.id, r]));
  return plans.map((p) => {
    const r = by.get(p.planId);
    return r ? { ...p, techId: r.assigned_user_id, days: serviceDays(r) } : p;
  });
}

interface Suggested {
  list: DaySuggestion[];
  left: string[];
  asked: RoutePlanCard[];
}

export function CustomersToAdd({
  plans,
  techs,
  workDays,
  variant,
}: {
  plans: RoutePlanCard[];
  techs: Tech[];
  /** The shop's working days (0 Sunday to 6 Saturday). */
  workDays: number[];
  /**
   * "sidebar": Week's sidebar on wide screens (a tray above the board when narrower), inside
   * the board's drag and drop. "phone": a row that opens the list in a sheet, beside Suggest
   * Days, above the phone's week.
   */
  variant: "sidebar" | "phone";
}) {
  const techIds = useMemo(() => techs.map((t) => t.id), [techs]);
  const [saved, optimistic] = useOptimistic(plans, apply);
  const [pending, start] = useTransition();
  const [suggesting, setSuggesting] = useState(false);
  const [suggested, setSuggested] = useState<Suggested | null>(null);
  const suggestedIds = useMemo(() => new Set(suggested?.list.map((s) => s.id)), [suggested]);
  const toAdd = useMemo(
    () => customersToAdd(saved, techIds).filter((p) => !suggestedIds.has(p.planId)),
    [saved, techIds, suggestedIds],
  );
  const [moving, setMoving] = useState<RoutePlanCard | null>(null);
  const [sheet, setSheet] = useState<"list" | "suggest" | null>(null);
  const [open, setOpen] = useState(true);
  const listId = useId();
  const closeSheet = useCallback(() => setSheet(null), []);
  const closeMove = useCallback(() => setMoving(null), []);
  const nameOf = (id: string) => techs.find((t) => t.id === id)?.name ?? "";

  function notice(r: RouteDayResult, message: string) {
    if (r.error) return showBanner({ tone: "error", message: r.error });
    const rows = r.undo;
    showBanner({
      message,
      action: rows?.length ? { label: "Undo", onAction: () => undo(rows) } : undefined,
    });
  }

  /** Put a customer on a weekday with a tech (or, while suggesting, change the suggestion). */
  function move(p: RoutePlanCard, to: number, tech: string) {
    if (suggested && suggestedIds.has(p.planId)) {
      setSuggested({
        ...suggested,
        list: suggested.list.map((s) => (s.id === p.planId ? { ...s, day: to, techId: tech } : s)),
      });
      return;
    }
    if (suggested) return;
    const from = p.techId && techIds.includes(p.techId) ? (p.days[0] ?? null) : null;
    start(async () => {
      optimistic({ kind: "move", plan: p.planId, from, to, tech });
      const r = await setServiceDay({ plan: p.planId, from, to, tech });
      notice(r, planMovedBanner(p.customer, WEEKDAY_NAMES[to], nameOf(tech)));
    });
  }

  function undo(rows: PlanUndo[]) {
    start(async () => {
      optimistic({ kind: "restore", rows });
      const r = await undoServiceDays(rows);
      if (r.error) showBanner({ tone: "error", message: r.error });
      else showBanner({ message: r.message ?? "Put back as it was." });
    });
  }

  function suggest(ids: string[], forTechs: string[], asked: RoutePlanCard[]) {
    setSheet(null);
    setSuggesting(true);
    start(async () => {
      const r = await suggestDays({ plans: ids, techs: forTechs });
      setSuggesting(false);
      if (r.error) return void showBanner({ tone: "error", message: r.error });
      const list = r.suggestions ?? [];
      if (!list.length) {
        const why = leftOutNote(asked, r.left ?? []);
        return void showBanner({
          message: `No days to suggest${why ? `: ${why.charAt(0).toLowerCase()}${why.slice(1)}` : ""}.`,
        });
      }
      setSuggested({ list, left: r.left ?? [], asked });
    });
  }

  function keep() {
    const s = suggested;
    if (!s) return;
    start(async () => {
      optimistic({ kind: "keep", list: s.list });
      setSuggested(null);
      const r = await keepSuggestedDays(s.list);
      notice(r, r.message ?? "Kept.");
    });
  }

  // The board's drops and holds come here (sidebar only).
  const dropsRef = use(PlanDrop);
  // The cards' menus, by drag id, for a touch held without moving.
  const [menus] = useState(() => new Map<string, RowActionsHandle>());
  const byId = (id: string) => saved.find((p) => p.planId === id);
  const latestRef = useRef({ move, byId });
  useEffect(() => {
    latestRef.current = { move, byId };
  });
  useEffect(() => {
    if (variant !== "sidebar" || !dropsRef) return;
    dropsRef.current = {
      drop: (planId, techId, date) => {
        const p = latestRef.current.byId(planId);
        if (p) latestRef.current.move(p, weekday(date), techId);
      },
      hold: (dragId) => menus.get(dragId)?.open(undefined, true),
    };
    return () => {
      dropsRef.current = null;
    };
  }, [dropsRef, variant, menus]);

  const canMove = (p: RoutePlanCard) => !pending && (!suggested || suggestedIds.has(p.planId));
  const suggestedCards = suggested
    ? suggested.list.flatMap((s) => {
        const p = saved.find((x) => x.planId === s.id);
        return p ? [{ p, s }] : [];
      })
    : [];

  const suggestButton = (
    <Button
      type="button"
      kind="secondary"
      aria-haspopup="dialog"
      disabled={pending || !!suggested || !techs.length}
      onClick={() => setSheet("suggest")}
      className="shrink-0 px-3 text-[0.9375rem]"
    >
      {suggesting ? "Suggesting…" : "Suggest Days"}
    </Button>
  );

  const cards = (inSheet: boolean) => (
    <>
      {suggestedCards.length ? (
        <>
          <p className="mt-1 mb-1.5 px-1 text-[0.8125rem] text-text-muted">
            {suggestedLabel(suggestedCards.length)}
          </p>
          <ol className="mb-3 space-y-1.5">
            {suggestedCards.map(({ p, s }) => (
              <PlanTile
                key={p.planId}
                id={`${variant}:${p.planId}`}
                plan={p}
                note={`${WEEKDAY_NAMES[s.day]} · ${nameOf(s.techId)}`}
                color={techs.find((t) => t.id === s.techId)?.color}
                suggested
                disabled={!canMove(p)}
                onMove={() => setMoving(p)}
                draggable={!inSheet}
                menus={menus}
              />
            ))}
          </ol>
        </>
      ) : null}
      <AddList
        plans={toAdd}
        draggable={!inSheet}
        prefix={variant}
        canMove={canMove}
        onMove={setMoving}
        menus={menus}
      />
    </>
  );

  const sheets: ReactNode = (
    <>
      <Sheet
        open={sheet === "list"}
        onClose={closeSheet}
        title="Customers to Add"
        cancelLabel="Done"
      >
        <div className="pt-1">{cards(true)}</div>
      </Sheet>
      {sheet === "suggest" ? (
        <SuggestSheet
          techs={techs}
          toAdd={toAdd}
          rebuild={(id) => rebuildPlans(saved, id)}
          onClose={closeSheet}
          onSuggest={suggest}
        />
      ) : null}
      {moving ? (
        <MoveSheet
          plan={moving}
          techs={techs}
          workDays={workDays}
          suggestion={suggested?.list.find((s) => s.id === moving.planId) ?? null}
          onClose={closeMove}
          onMove={(to, tech) => {
            setMoving(null);
            move(moving, to, tech);
          }}
        />
      ) : null}
      {suggested ? (
        <SuggestBar
          count={suggested.list.length}
          note={leftOutNote(suggested.asked, suggested.left)}
          techs={new Set(suggested.list.map((s) => s.techId)).size}
          busy={pending}
          onCancel={() => setSuggested(null)}
          onKeep={keep}
        />
      ) : null}
    </>
  );

  if (variant === "phone")
    return (
      <>
        <ul className="grouped" data-testid="customers-to-add-phone">
          <li>
            <button
              type="button"
              aria-haspopup="dialog"
              onClick={() => setSheet("list")}
              className="flex min-h-11 w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-text/[0.03] active:bg-text/[0.06]"
            >
              <span className="flex-1">Customers to Add</span>
              <span className="text-text-muted tabular-nums">{toAdd.length}</span>
              <span aria-hidden="true" className="text-xl leading-none text-text-muted/70">
                ›
              </span>
            </button>
          </li>
          <li>
            <button
              type="button"
              aria-haspopup="dialog"
              disabled={pending || !!suggested || !techs.length}
              onClick={() => setSheet("suggest")}
              className="flex min-h-11 w-full items-center px-4 py-2.5 text-left text-link hover:bg-text/[0.03] active:bg-text/[0.06] disabled:opacity-50"
            >
              {suggesting ? "Suggesting…" : "Suggest Days"}
            </button>
          </li>
        </ul>
        {sheets}
      </>
    );

  return (
    <section
      aria-label="Customers to Add"
      data-testid="customers-to-add"
      className="card p-3 lg:p-3"
    >
      <SideSectionTitle
        id={listId}
        title="Customers to Add"
        count={toAdd.length}
        open={open}
        onToggle={() => setOpen((o) => !o)}
        action={suggestButton}
      />
      <div id={listId} hidden={!open} className="mt-2">
        {cards(false)}
      </div>
      {sheets}
    </section>
  );
}

/** Customers to Add: newest first, with a search once there are more than a few. */
function AddList({
  plans,
  draggable,
  prefix,
  canMove,
  onMove,
  menus,
}: {
  plans: RoutePlanCard[];
  draggable: boolean;
  prefix: string;
  canMove: (p: RoutePlanCard) => boolean;
  onMove: (p: RoutePlanCard) => void;
  menus: Map<string, RowActionsHandle>;
}) {
  const [query, setQuery] = useState("");
  const ids = useId();
  const list = useMemo(
    () => (query.trim() ? customersToAdd(plans, [], query) : plans),
    [plans, query],
  );
  return (
    <>
      {plans.length > 4 || query ? (
        <div className="relative mb-2">
          <label htmlFor={`${ids}-q`} className="sr-only">
            Search Customers to Add
          </label>
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-[1.125rem] -translate-y-1/2 text-text-muted"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
          >
            <circle cx="10.5" cy="10.5" r="6.5" />
            <path d="M15.5 15.5L20 20" />
          </svg>
          <input
            id={`${ids}-q`}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search"
            autoComplete="off"
            className="min-h-11 w-full rounded-[10px] bg-fill pr-3 pl-9 placeholder:text-text-muted focus:outline-3 focus:outline-focus"
          />
        </div>
      ) : null}
      {plans.length === 0 ? (
        <p className="px-1 py-1 text-[0.9375rem] text-text-muted">Every customer has a day.</p>
      ) : list.length === 0 ? (
        <p className="px-1 py-1 text-[0.9375rem] text-text-muted">
          No customers to add match “{query.trim()}”.
        </p>
      ) : (
        // Narrower than the sidebar: one row that scrolls sideways above the board, like Needs
        // a Time; the sidebar lists them down.
        <ol
          className={cx(
            "space-y-1.5",
            draggable &&
              "-mx-3 flex snap-x gap-2 space-y-0 overflow-x-auto px-3 pb-1 lg:mx-0 lg:block lg:space-y-1.5 lg:overflow-visible lg:px-0 lg:pb-0",
          )}
        >
          {list.map((p) => (
            <PlanTile
              key={p.planId}
              id={`${prefix}:${p.planId}`}
              plan={p}
              disabled={!canMove(p)}
              onMove={() => onMove(p)}
              draggable={draggable}
              menus={menus}
              className={draggable ? "w-64 shrink-0 snap-start lg:w-auto" : undefined}
            />
          ))}
        </ol>
      )}
    </>
  );
}

/**
 * A customer to add. The whole tile drags (grip included) on the week; a tap opens Move…. Its
 * menu: Move… and Open Plan (right-click or "⋯"; on touch, a hold let go without moving).
 */
function PlanTile(props: {
  id: string;
  plan: RoutePlanCard;
  note?: string;
  color?: string | null;
  suggested?: boolean;
  disabled: boolean;
  onMove: () => void;
  draggable: boolean;
  menus: Map<string, RowActionsHandle>;
  className?: string;
}) {
  return props.draggable && !props.disabled ? (
    <DraggableTile {...props} />
  ) : (
    <Tile {...props} drag={null} />
  );
}

function DraggableTile(props: Parameters<typeof PlanTile>[0]) {
  const data: PlanDragData = {
    kind: "plan",
    customer: props.plan.customer,
    address: props.plan.address,
  };
  const { setNodeRef, listeners, isDragging } = useDraggable({
    id: `${PLAN_DRAG}${props.plan.planId}`,
    data,
  });
  // Pointers only: Enter and Space open Move…, the keyboard's way to move a customer.
  const { onKeyDown: _keys, ...pointer } = (listeners ?? {}) as Record<string, unknown>;
  void _keys;
  return <Tile {...props} drag={{ ref: setNodeRef, listeners: pointer, isDragging }} />;
}

function Tile({
  id,
  plan: p,
  note,
  color,
  suggested = false,
  disabled,
  onMove,
  menus,
  className,
  drag,
}: Parameters<typeof PlanTile>[0] & {
  drag: {
    ref: (el: HTMLElement | null) => void;
    listeners: Record<string, unknown>;
    isDragging: boolean;
  } | null;
}) {
  const handle = useCallback(
    (h: RowActionsHandle | null) => {
      // The board knows the drag id ("plan:<id>").
      const key = `${PLAN_DRAG}${p.planId}`;
      if (h) menus.set(key, h);
      else menus.delete(key);
    },
    [menus, p.planId],
  );
  const menu: MenuEntry[] = [
    !disabled && { label: "Move…", onSelect: onMove },
    p.customerId && { label: "Open Plan", href: `/customers/${p.customerId}` },
  ];
  const repeat = repeatNote(p);
  return (
    <li className={className} data-plan={id}>
      {/* The whole tile is the drag handle (owner, 2026-10-20: "you should be able to drag
          the entire tile"); a click or tap still opens Move…. */}
      <div
        ref={drag?.ref}
        {...(drag?.listeners ?? {})}
        data-testid="route-customer"
        className={cx(
          "well relative touch-manipulation select-none [-webkit-touch-callout:none]",
          drag && "cursor-grab active:cursor-grabbing",
          drag?.isDragging && "opacity-40",
          suggested && "ring-2 ring-link/40",
        )}
      >
        <RowActions
          title={p.customer}
          menu={menu}
          longPress={!drag}
          handle={handle}
          buttonClassName="absolute top-1/2 right-10 -translate-y-1/2"
          className="flex items-center rounded-[inherit]"
        >
          <button
            type="button"
            aria-haspopup="dialog"
            aria-disabled={disabled || undefined}
            title={disabled ? undefined : drag ? "Move or drag" : "Move"}
            onClick={disabled ? undefined : onMove}
            className={cx(
              "flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-[inherit] py-1.5 pl-3 text-left",
              drag ? "pr-1" : "pr-3",
              disabled ? "cursor-default" : drag ? "cursor-[inherit]" : "hover:bg-text/[0.03]",
            )}
          >
            {color ? <TechDot color={color} /> : null}
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{p.customer}</span>
              <span className="flex min-w-0 items-center gap-1 text-[0.8125rem] text-text-muted">
                <span className="truncate">{note ?? p.address}</span>
                {!note && !p.location ? <NotOnMapTag /> : null}
              </span>
              {repeat && !note ? (
                <span className="block text-[0.8125rem] text-text-muted">{repeat}</span>
              ) : null}
              <span className="sr-only">. Move…</span>
            </span>
          </button>
          {drag ? (
            // Part of the tile's drag, not a control of its own.
            <span
              aria-hidden="true"
              data-grip
              className="grid h-11 w-9 shrink-0 place-items-center text-text-muted/70"
            >
              <svg viewBox="0 0 24 24" className="size-5" fill="currentColor">
                {[6, 12, 18].map((y) =>
                  [9, 15].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.6" />),
                )}
              </svg>
            </span>
          ) : null}
        </RowActions>
      </div>
    </li>
  );
}

function Check({ on }: { on: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={cx("size-5 shrink-0 text-link", !on && "invisible")}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

/** Move…: the weekday (one of the shop's working days) and the tech, each with their dot. */
function MoveSheet({
  plan: p,
  techs,
  workDays,
  suggestion,
  onClose,
  onMove,
}: {
  plan: RoutePlanCard;
  techs: Tech[];
  workDays: number[];
  /** While suggesting: the suggested day and tech, which this changes. */
  suggestion: DaySuggestion | null;
  onClose: () => void;
  onMove: (to: number, tech: string) => void;
}) {
  const start = suggestion?.day ?? p.days[0] ?? workDays[0] ?? 1;
  const options = sortDays([...workDays, start]);
  const [day, setDay] = useState(options.includes(start) ? start : options[0]!);
  const [who, setWho] = useState(
    suggestion?.techId ??
      (p.techId && techs.some((t) => t.id === p.techId) ? p.techId : (techs[0]?.id ?? "")),
  );
  return (
    <Sheet open onClose={onClose} title={`Move ${p.customer}`}>
      <p className="mb-4 text-center text-[0.9375rem] text-text-muted">
        {p.address}
        {!p.location ? (
          <>
            {" "}
            <NotOnMapTag />
          </>
        ) : null}
      </p>
      <div className="space-y-5">
        <Segmented
          label="Day"
          name="day"
          value={String(day)}
          options={options.map((d) => ({ value: String(d), label: WEEKDAY_SHORT[d] }))}
          onChange={(v) => setDay(Number(v))}
          fit
          segmentClassName="min-h-11"
        />
        {techs.length > 1 ? (
          <div role="radiogroup" aria-labelledby="move-plan-tech">
            <p id="move-plan-tech" className="mb-1.5 font-medium">
              Tech
            </p>
            <ul className="grouped">
              {techs.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={who === t.id}
                    onClick={() => setWho(t.id)}
                    className="flex min-h-11 w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-text/[0.03] active:bg-text/[0.06]"
                  >
                    <TechDot color={t.color} />
                    <span className="flex-1">{t.name}</span>
                    <Check on={who === t.id} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <p className="px-1 text-[0.9375rem] text-text-muted">
          {suggestion ? "Changes the suggestion." : "Its coming visits go on the new day."}
        </p>
        <Button type="button" className="w-full" disabled={!who} onClick={() => onMove(day, who)}>
          Move to {WEEKDAY_NAMES[day]}
        </Button>
      </div>
    </Sheet>
  );
}

/** One choice in an iOS checklist: a title, a line under it, and a checkmark. */
function ChoiceRow({
  on,
  title,
  detail,
  color,
  disabled,
  onPick,
}: {
  on: boolean;
  title: string;
  detail?: ReactNode;
  color?: string | null;
  disabled?: boolean;
  onPick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        role="radio"
        aria-checked={on}
        disabled={disabled}
        onClick={onPick}
        className="flex min-h-11 w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-text/[0.03] active:bg-text/[0.06] disabled:opacity-50"
      >
        {color !== undefined ? <TechDot color={color} /> : null}
        <span className="min-w-0 flex-1">
          <span className="block">{title}</span>
          {detail ? <span className="block text-[0.9375rem] text-text-muted">{detail}</span> : null}
        </span>
        <Check on={on} />
      </button>
    </li>
  );
}

const customersWord = (n: number) => `${n} ${n === 1 ? "customer" : "customers"}`;

/** Suggest Days: for Customers to Add (one tech or everyone), or rebuild one tech's week. */
function SuggestSheet({
  techs,
  toAdd,
  rebuild,
  onClose,
  onSuggest,
}: {
  techs: Tech[];
  toAdd: RoutePlanCard[];
  rebuild: (tech: string) => RoutePlanCard[];
  onClose: () => void;
  onSuggest: (plans: string[], techs: string[], asked: RoutePlanCard[]) => void;
}) {
  const [what, setWhat] = useState<"add" | "rebuild">(toAdd.length ? "add" : "rebuild");
  // Whose: a tech, or (for Customers to Add) everyone.
  const [who, setWho] = useState<string>(
    toAdd.length && techs.length > 1 ? "all" : (techs[0]?.id ?? ""),
  );
  const tech = who === "all" ? null : who;
  const plans = what === "add" ? toAdd : tech ? rebuild(tech) : [];
  const name = techs.find((t) => t.id === tech)?.name ?? "";
  return (
    <Sheet open onClose={onClose} title="Suggest Days">
      <div className="space-y-5 pt-1">
        <div role="radiogroup" aria-labelledby="suggest-what">
          <p id="suggest-what" className="mb-1.5 px-4 text-[0.9375rem] text-text-muted">
            Suggest for
          </p>
          <ul className="grouped">
            <ChoiceRow
              on={what === "add"}
              title={`Customers to Add (${toAdd.length})`}
              detail="Puts each on a day near its neighbors"
              disabled={!toAdd.length}
              onPick={() => setWhat("add")}
            />
            <ChoiceRow
              on={what === "rebuild"}
              title={name ? `Rebuild ${name}’s Week` : "Rebuild a Tech’s Week"}
              detail={
                tech
                  ? `${customersWord(rebuild(tech).length)} on one day a week, planned again from scratch`
                  : "Pick a tech below"
              }
              onPick={() => {
                setWhat("rebuild");
                if (who === "all") setWho(techs[0]?.id ?? "");
              }}
            />
          </ul>
        </div>
        {techs.length > 1 ? (
          <div role="radiogroup" aria-labelledby="suggest-who">
            <p id="suggest-who" className="mb-1.5 px-4 text-[0.9375rem] text-text-muted">
              {what === "add" ? "Spread across" : "Tech"}
            </p>
            <ul className="grouped">
              {what === "add" ? (
                <ChoiceRow
                  on={who === "all"}
                  title="Everyone"
                  detail={`${techs.length} techs`}
                  onPick={() => setWho("all")}
                />
              ) : null}
              {techs.map((t) => (
                <ChoiceRow
                  key={t.id}
                  on={who === t.id}
                  title={t.name}
                  color={t.color ?? null}
                  onPick={() => setWho(t.id)}
                />
              ))}
            </ul>
          </div>
        ) : null}
        <p className="px-4 text-[0.9375rem] text-text-muted">
          Groups nearby pools on the same day and evens out the days. Customers on several days a
          week stay as they are. Nothing changes until you press Keep.
        </p>
        <Button
          type="button"
          className="w-full"
          disabled={!plans.length || (what === "rebuild" && !tech)}
          onClick={() =>
            onSuggest(
              plans.map((p) => p.planId),
              tech ? [tech] : techs.map((t) => t.id),
              plans,
            )
          }
        >
          Suggest Days
        </Button>
      </div>
    </Sheet>
  );
}

/** The suggestions' bar: how many, what was left out, Cancel and Keep. */
function SuggestBar({
  count,
  note,
  techs,
  busy,
  onCancel,
  onKeep,
}: {
  count: number;
  note: string | null;
  techs: number;
  busy: boolean;
  onCancel: () => void;
  onKeep: () => void;
}) {
  return (
    <div
      role="region"
      aria-label="Suggested days"
      data-testid="suggest-bar"
      className="fixed inset-x-0 bottom-[calc(4.125rem+max(0.75rem,env(safe-area-inset-bottom)))] z-30 px-3 sm:bottom-6"
    >
      <div className="glass mx-auto flex max-w-xl items-center gap-2 rounded-[28px] py-2 pr-2 pl-5">
        <p className="min-w-0 flex-1" aria-live="polite">
          <span className="block font-semibold">
            {suggestedLabel(count)}
            {techs > 1 ? (
              <span className="font-normal text-text-muted"> · {techs} techs</span>
            ) : null}
          </span>
          {note ? (
            <span className="block truncate text-[0.9375rem] text-text-muted">{note}</span>
          ) : null}
        </p>
        <div className="shrink-0 rounded-full bg-surface">
          <Button type="button" kind="secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        </div>
        <Button type="button" onClick={onKeep} disabled={busy}>
          Keep
        </Button>
      </div>
    </div>
  );
}
