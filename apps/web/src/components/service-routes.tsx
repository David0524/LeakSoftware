"use client";

import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useOptimistic,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import {
  durationLabel,
  serviceDays,
  type DaySuggestion,
  type LatLng,
  type WorkDay,
} from "@leakbook/core";
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
  dayDetail,
  daySummary,
  firstTech,
  leftOutNote,
  movePlan,
  movedMessage,
  rebuildPlans,
  repeatNote,
  routeDay,
  routeDays,
  sortDays,
  suggestedLabel,
  withSuggestions,
  type RouteDay,
  type RoutePlanCard,
} from "@/lib/service-routes";
import { DayMap } from "./day-map";
import { NotOnMapTag } from "./not-on-map";
import { Segmented } from "./segmented";
import { Sheet } from "./sheet";
import { Button, ButtonLink, Notice, cx, pillClass } from "./ui";

// Routes on Schedule (owner, 2026-10-20, docs/plans/route-maps.md part 3, PayThePoolMan's route
// screen): which weekday each pool customer is serviced on, and by whom. Wide screens: Customers
// to Add on the left, then the tech's working days side by side, each with its map and its
// pools in driving order. Narrower: one day at a time from a segmented control. Drag a card onto
// a day (on phones, onto a day's segment, which springs open), or tap it for Move…. Every
// change has Undo; Suggest Days shows its suggestions in place and saves nothing until Keep.

type Maps = { company: string } | null;

type Change =
  | { kind: "move"; plan: string; from: number | null; to: number; tech: string }
  | { kind: "restore"; rows: PlanUndo[] }
  | { kind: "suggest"; list: DaySuggestion[] };

function apply(plans: RoutePlanCard[], c: Change): RoutePlanCard[] {
  if (c.kind === "suggest") return withSuggestions(plans, c.list);
  if (c.kind === "move") return plans.map((p) => (p.planId === c.plan ? movePlan(p, c) : p));
  const by = new Map(c.rows.map((r) => [r.id, r]));
  return plans.map((p) => {
    const r = by.get(p.planId);
    return r ? { ...p, techId: r.assigned_user_id, days: serviceDays(r) } : p;
  });
}

interface Moving {
  plan: RoutePlanCard;
  /** The day it was moved from (a plan on several days moves one at a time); null: no tech. */
  from: number | null;
}

interface Suggested {
  list: DaySuggestion[];
  left: string[];
  /** What was planned, for the note on what was left out. */
  asked: RoutePlanCard[];
}

/** "Mon", or the full name for a reader. Spring loading waits this long over a segment. */
const SPRING_MS = 450;

export function ServiceRoutes({
  plans,
  techs,
  workDays,
  workDay,
  depot,
  maps,
  initialTech,
}: {
  plans: RoutePlanCard[];
  techs: { id: string; name: string }[];
  /** The shop's working days (0 Sunday to 6 Saturday). */
  workDays: number[];
  workDay: WorkDay;
  /** The shop, where each day starts and ends (for drive estimates). */
  depot: LatLng | null;
  /** Day maps, when the shop's maps are set up. */
  maps: Maps;
  initialTech?: string | null;
}) {
  const techIds = useMemo(() => techs.map((t) => t.id), [techs]);
  const [saved, optimistic] = useOptimistic(plans, apply);
  const [pending, start] = useTransition();
  const [work, setWork] = useState<"Saving…" | "Suggesting…">("Saving…");
  const [suggested, setSuggested] = useState<Suggested | null>(null);
  const shown = useMemo(
    () => (suggested ? withSuggestions(saved, suggested.list) : saved),
    [saved, suggested],
  );
  const suggestedIds = useMemo(() => new Set(suggested?.list.map((s) => s.id)), [suggested]);
  const [picked, setPicked] = useState<string | null>(null);
  const tech = firstTech(plans, techIds, picked ?? initialTech);
  const techName = techs.find((t) => t.id === tech)?.name ?? "";
  const days = useMemo(() => routeDays(shown, tech, workDays), [shown, tech, workDays]);
  const routes = useMemo(
    () => days.map((d) => routeDay({ plans: shown, tech, day: d, depot, workDay })),
    [days, shown, tech, depot, workDay],
  );
  const toAdd = useMemo(() => customersToAdd(shown, techIds), [shown, techIds]);
  const [phoneDay, setPhoneDay] = useState<number | null>(null);
  const day =
    phoneDay != null && days.includes(phoneDay)
      ? phoneDay
      : (routes.find((r) => r.plans.length)?.day ?? days[0] ?? 1);
  const [notice, setNotice] = useState<
    (RouteDayResult & { tone?: "info" | "success" | "error" }) | null
  >(null);
  const [moving, setMoving] = useState<Moving | null>(null);
  const [sheet, setSheet] = useState<"add" | "suggest" | null>(null);
  const [dragging, setDragging] = useState<RoutePlanCard | null>(null);
  const spring = useRef<{ day: number; timer: ReturnType<typeof setTimeout> } | null>(null);
  const dndId = useId();
  const closeSheet = useCallback(() => setSheet(null), []);
  const closeMove = useCallback(() => setMoving(null), []);

  const sensors = useSensors(
    // A mouse picks a card up once it moves a little (a click opens Move…); a finger after a
    // short press, so scrolling past the cards still scrolls. Keyboards use Move….
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
  );

  useEffect(() => () => clearTimeout(spring.current?.timer), []);

  /** Save a move (or, while suggestions are showing, change the suggestion). */
  function move(m: { plan: RoutePlanCard; from: number | null; to: number; tech: string }) {
    if (m.from === m.to && m.tech === m.plan.techId) return;
    if (suggested) {
      setSuggested({
        ...suggested,
        list: suggested.list.map((s) =>
          s.id === m.plan.planId ? { ...s, day: m.to, techId: m.tech } : s,
        ),
      });
      return;
    }
    setWork("Saving…");
    start(async () => {
      optimistic({ kind: "move", plan: m.plan.planId, from: m.from, to: m.to, tech: m.tech });
      const r = await setServiceDay({ plan: m.plan.planId, from: m.from, to: m.to, tech: m.tech });
      setNotice(
        r.error
          ? { error: r.error, tone: "error" }
          : { message: movedMessage(m.to), undo: r.undo, tone: "success" },
      );
    });
  }

  function undo(rows: PlanUndo[]) {
    setWork("Saving…");
    start(async () => {
      optimistic({ kind: "restore", rows });
      const r = await undoServiceDays(rows);
      setNotice(r.error ? { error: r.error, tone: "error" } : { message: r.message, tone: "info" });
    });
  }

  function suggest(ids: string[], forTechs: string[], asked: RoutePlanCard[]) {
    setSheet(null);
    setNotice(null);
    setWork("Suggesting…");
    start(async () => {
      const r = await suggestDays({ plans: ids, techs: forTechs });
      if (r.error) return setNotice({ error: r.error, tone: "error" });
      const list = r.suggestions ?? [];
      if (!list.length) {
        const why = leftOutNote(asked, r.left ?? []);
        return setNotice({
          message: `No days to suggest${why ? `: ${why.charAt(0).toLowerCase()}${why.slice(1)}` : ""}.`,
          tone: "info",
        });
      }
      setSuggested({ list, left: r.left ?? [], asked });
    });
  }

  function keep() {
    const s = suggested;
    if (!s) return;
    setWork("Saving…");
    start(async () => {
      optimistic({ kind: "suggest", list: s.list });
      setSuggested(null);
      const r = await keepSuggestedDays(s.list);
      setNotice(
        r.error
          ? { error: r.error, tone: "error" }
          : { message: r.message, undo: r.undo, tone: "success" },
      );
    });
  }

  // --- Drag and drop -------------------------------------------------------------------
  const byDrag = (id: string) => {
    // "d:<plan>@<day>": the layout it's in, the plan, and the day it's on ("add": no tech).
    const [plan, from] = id.replace(/^\w:/, "").split("@") as [string, string];
    const p = shown.find((x) => x.planId === plan);
    return p ? { plan: p, from: from === "add" ? null : Number(from) } : null;
  };
  const dropDay = (id: string | undefined) => {
    const m = /^(?:day|seg)-(\d)$/.exec(id ?? "");
    return m ? Number(m[1]) : null;
  };
  function onDragStart(e: DragStartEvent) {
    setDragging(byDrag(String(e.active.id))?.plan ?? null);
  }
  function onDragOver(e: DragOverEvent) {
    // Spring loading: holding a card over a day's segment opens that day.
    const over = e.over ? String(e.over.id) : "";
    const d = over.startsWith("seg-") ? dropDay(over) : null;
    if (spring.current?.day === d) return;
    clearTimeout(spring.current?.timer);
    spring.current =
      d == null ? null : { day: d, timer: setTimeout(() => setPhoneDay(d), SPRING_MS) };
  }
  function onDragEnd(e: DragEndEvent) {
    clearTimeout(spring.current?.timer);
    spring.current = null;
    setDragging(null);
    const from = byDrag(String(e.active.id));
    const to = dropDay(e.over ? String(e.over.id) : undefined);
    if (!from || to == null || !tech) return;
    if (from.from === to && from.plan.techId === tech) return;
    if (from.from != null && from.from !== to && from.plan.days.includes(to)) {
      setNotice({
        error: `${from.plan.customer} is already serviced on ${WEEKDAY_NAMES[to]}.`,
        tone: "error",
      });
      return;
    }
    move({ plan: from.plan, from: from.from, to, tech });
    if (e.over && String(e.over.id).startsWith("seg-")) setPhoneDay(to);
  }

  const canMove = (p: RoutePlanCard) => !pending && (!suggested || suggestedIds.has(p.planId));
  const openMove = (plan: RoutePlanCard, from: number | null) => {
    if (!canMove(plan)) return;
    setSheet(null);
    setMoving({ plan, from });
  };

  if (!plans.length)
    return (
      <section className="card mx-auto max-w-xl p-6 text-center" data-testid="routes-empty">
        <h2 className="font-display text-xl font-bold">No Maintenance Plans Yet</h2>
        <p className="mt-2 text-text-muted">
          Routes show which weekday each pool customer is serviced on, and by whom. Set up a
          maintenance plan on a customer’s pool to start.
        </p>
        <ButtonLink href="/customers" className="mt-5">
          Go to Customers
        </ButtonLink>
      </section>
    );

  const noticeView = (
    <div aria-live="polite" className="mb-4 empty:hidden" data-testid="routes-notice">
      {pending ? (
        <Notice>{work}</Notice>
      ) : notice?.error ? (
        <Notice tone="error">{notice.error}</Notice>
      ) : notice?.message ? (
        <Notice tone={notice.tone === "info" ? "info" : "success"}>
          <span className="-my-2 flex flex-wrap items-center justify-between gap-x-3">
            <span className="py-2 font-medium">{notice.message}</span>
            {notice.undo?.length ? (
              <Button
                type="button"
                kind="quiet"
                onClick={() => undo(notice.undo!)}
                className="-mr-2 px-4"
              >
                Undo
              </Button>
            ) : null}
          </span>
        </Notice>
      ) : null}
    </div>
  );

  const pills =
    techs.length > 1 ? (
      <nav
        aria-label="Whose routes"
        className="-mx-4 flex min-w-0 gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:px-0"
      >
        {techs.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-pressed={t.id === tech}
            onClick={() => setPicked(t.id)}
            className={pillClass(t.id === tech)}
          >
            {t.name}
          </button>
        ))}
      </nav>
    ) : null;

  const current = routes.find((r) => r.day === day);

  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        clearTimeout(spring.current?.timer);
        setDragging(null);
      }}
      autoScroll={{ threshold: { x: 0.15, y: 0.15 }, acceleration: 12 }}
    >
      {/* Wide screens: Customers to Add beside the week. */}
      <div className="max-lg:hidden lg:grid lg:grid-cols-[16.5rem_minmax(0,1fr)] lg:items-start lg:gap-5">
        <AddList
          plans={toAdd}
          suggestedIds={suggestedIds}
          canMove={canMove}
          onMove={(p) => openMove(p, null)}
          prefix="d"
        />
        <div className="min-w-0">
          <div className="mb-4 flex min-h-11 items-center gap-3">
            <div className="min-w-0 flex-1">
              {pills ?? <h2 className="font-display text-xl font-bold">{techName}’s Routes</h2>}
            </div>
            <Button
              type="button"
              kind="secondary"
              aria-haspopup="dialog"
              disabled={pending || !!suggested || !tech}
              onClick={() => setSheet("suggest")}
              className="shrink-0"
            >
              Suggest Days
            </Button>
          </div>
          {noticeView}
          <ol
            aria-label={`${techName}’s days`}
            className="grid gap-3 overflow-x-auto pb-2"
            style={{ gridTemplateColumns: `repeat(${routes.length}, minmax(9.75rem, 1fr))` }}
          >
            {routes.map((r) => (
              <DayColumn
                key={r.day}
                route={r}
                tech={techName}
                maps={maps}
                suggestedIds={suggestedIds}
                canMove={canMove}
                onMove={openMove}
              />
            ))}
          </ol>
        </div>
      </div>

      {/* Phones and narrow windows: one day at a time. */}
      <div className="lg:hidden">
        {pills ? <div className="mb-3">{pills}</div> : null}
        <ul className="grouped mb-4">
          <li>
            <button
              type="button"
              aria-haspopup="dialog"
              onClick={() => setSheet("add")}
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
              disabled={pending || !!suggested || !tech}
              onClick={() => setSheet("suggest")}
              className="flex min-h-11 w-full items-center px-4 py-2.5 text-left text-link hover:bg-text/[0.03] active:bg-text/[0.06] disabled:opacity-50"
            >
              Suggest Days
            </button>
          </li>
        </ul>
        {noticeView}
        <DaySegments routes={routes} day={day} onPick={setPhoneDay} dragging={!!dragging} />
        {current ? (
          <section aria-label={`${techName}, ${WEEKDAY_NAMES[current.day]}`} className="mt-4">
            {maps && current.plans.length ? (
              <DayMap
                company={maps.company}
                pins={current.pins}
                stops={mapStops(current)}
                missing={current.missing}
                tech={techName}
                day={WEEKDAY_NAMES[current.day]}
                className="mb-2"
              />
            ) : null}
            <DayFacts route={current} />
            <ol className="mt-3 space-y-1.5">
              {current.plans.length ? (
                current.plans.map((p, i) => (
                  <PlanCard
                    key={p.planId}
                    id={`p:${p.planId}@${current.day}`}
                    plan={p}
                    number={i + 1}
                    suggested={suggestedIds.has(p.planId)}
                    disabled={!canMove(p)}
                    onMove={() => openMove(p, current.day)}
                    grip
                  />
                ))
              ) : (
                <li className="rounded-[1.25rem] bg-text/[0.04] p-4 text-center text-text-muted">
                  No pools on {WEEKDAY_NAMES[current.day]} yet.
                </li>
              )}
            </ol>
          </section>
        ) : null}
      </div>

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

      <DragOverlay dropAnimation={null}>
        {dragging ? (
          <div className="card max-w-72 px-4 py-2.5 shadow-xl ring-2 ring-link">
            <span className="block truncate font-semibold">{dragging.customer}</span>
            <span className="block truncate text-[0.9375rem] text-text-muted">
              {dragging.address}
            </span>
          </div>
        ) : null}
      </DragOverlay>

      <Sheet
        open={sheet === "add"}
        onClose={closeSheet}
        title="Customers to Add"
        cancelLabel="Done"
      >
        <AddList
          plans={toAdd}
          suggestedIds={suggestedIds}
          canMove={canMove}
          onMove={(p) => openMove(p, null)}
          prefix="s"
          inSheet
        />
      </Sheet>

      {sheet === "suggest" && tech ? (
        <SuggestSheet
          tech={{ id: tech, name: techName }}
          techs={techs}
          toAdd={toAdd}
          rebuild={rebuildPlans(saved, tech)}
          onClose={closeSheet}
          onSuggest={suggest}
        />
      ) : null}

      {moving ? (
        <MoveSheet
          moving={moving}
          techs={techs}
          tech={tech}
          workDays={workDays}
          onClose={closeMove}
          onMove={(to, techId) => {
            setMoving(null);
            move({ plan: moving.plan, from: moving.from, to, tech: techId });
          }}
        />
      ) : null}
    </DndContext>
  );
}

const mapStops = (r: RouteDay) =>
  r.plans.map((p) => ({ id: p.planId, time: null, customer: p.customer, detail: p.address }));

/** "14 pools · 6 hr 20 min", and a warning when the day runs long. */
function DayFacts({ route: r }: { route: RouteDay }) {
  const summary = daySummary(r);
  if (!summary) return null;
  return (
    <>
      <p className="text-[0.9375rem] text-text-muted tabular-nums" title={dayDetail(r)}>
        {summary}
        <span className="sr-only">: {dayDetail(r)}</span>
      </p>
      {r.overMin > 0 ? (
        <p className="mt-0.5 text-[0.9375rem] font-semibold text-status-warning">
          {durationLabel(r.overMin)} past the end of the day
        </p>
      ) : null}
    </>
  );
}

/** A weekday on wide screens: its name, totals, map, and pools in driving order. */
function DayColumn({
  route: r,
  tech,
  maps,
  suggestedIds,
  canMove,
  onMove,
}: {
  route: RouteDay;
  tech: string;
  maps: Maps;
  suggestedIds: Set<string>;
  canMove: (p: RoutePlanCard) => boolean;
  onMove: (p: RoutePlanCard, from: number) => void;
}) {
  const { setNodeRef, isOver, active } = useDroppable({ id: `day-${r.day}` });
  const name = WEEKDAY_NAMES[r.day];
  return (
    <li
      ref={setNodeRef}
      data-testid="route-day"
      aria-label={name}
      className={cx(
        "flex min-w-0 flex-col rounded-[22px] bg-text/[0.03] p-2 transition-shadow",
        isOver && "bg-link/5 ring-2 ring-link",
        active && !isOver && "ring-1 ring-link/30",
      )}
    >
      <h3 className="px-1.5 font-display text-lg font-bold">{name}</h3>
      <div className="mb-2 min-h-5 px-1.5">
        <DayFacts route={r} />
      </div>
      {maps && r.plans.length ? (
        <DayMap
          variant="week"
          company={maps.company}
          pins={r.pins}
          stops={mapStops(r)}
          missing={r.missing}
          tech={tech}
          day={name}
        />
      ) : null}
      <ol className="mt-2 min-h-24 flex-1 space-y-1.5">
        {r.plans.length ? (
          r.plans.map((p, i) => (
            <PlanCard
              key={p.planId}
              id={`d:${p.planId}@${r.day}`}
              plan={p}
              number={i + 1}
              suggested={suggestedIds.has(p.planId)}
              disabled={!canMove(p)}
              onMove={() => onMove(p, r.day)}
            />
          ))
        ) : (
          <li className="grid min-h-24 place-items-center rounded-[1.25rem] border-2 border-dashed border-text/10 p-3 text-center text-[0.9375rem] text-text-muted">
            Drag a customer here
          </li>
        )}
      </ol>
    </li>
  );
}

/**
 * A customer on a day (numbered in driving order) or in Customers to Add. Tapping it opens
 * Move…; dragging it moves it (the whole card, after a short press on phones).
 */
function PlanCard({
  id,
  plan: p,
  number,
  suggested,
  disabled,
  onMove,
  grip = false,
  well = false,
  draggable = true,
}: {
  id: string;
  plan: RoutePlanCard;
  number?: number;
  suggested: boolean;
  disabled: boolean;
  onMove: () => void;
  /** Wide cards: a grip at the end shows it can be dragged. */
  grip?: boolean;
  /** Inside a card (Customers to Add): a quiet well instead of a card. */
  well?: boolean;
  draggable?: boolean;
}) {
  const { setNodeRef, listeners, isDragging } = useDraggable({
    id,
    disabled: disabled || !draggable,
  });
  // Pointers only: Enter and Space open Move…, the keyboard's way to move a customer.
  const { onKeyDown: _keys, ...pointer } = (listeners ?? {}) as Record<string, unknown>;
  void _keys;
  const note = repeatNote(p);
  return (
    <li>
      <div
        ref={setNodeRef}
        data-testid="route-customer"
        className={cx(
          well ? "well" : "card",
          "relative flex items-center",
          isDragging && "opacity-40",
          suggested && "ring-2 ring-link/40",
        )}
      >
        <button
          type="button"
          {...(draggable && !disabled ? pointer : {})}
          aria-haspopup="dialog"
          aria-disabled={disabled || undefined}
          title={disabled ? undefined : "Move or drag"}
          onClick={disabled ? undefined : onMove}
          className={cx(
            "flex min-h-11 min-w-0 flex-1 touch-manipulation items-center gap-2.5 rounded-[inherit] py-2 text-left select-none [-webkit-touch-callout:none]",
            number != null ? "gap-2 pl-1.5" : "pl-3",
            grip ? "pr-1" : "pr-3",
            disabled
              ? "cursor-default"
              : draggable
                ? "cursor-grab hover:bg-text/[0.03] active:cursor-grabbing"
                : "hover:bg-text/[0.03] active:bg-text/[0.06]",
          )}
        >
          {number != null ? (
            <span
              aria-hidden="true"
              className="grid size-7 shrink-0 place-items-center rounded-full bg-fill font-display text-[0.9375rem] font-bold tabular-nums"
            >
              {number}
            </span>
          ) : null}
          <span className="min-w-0 flex-1">
            {/* Narrow day columns: the name may take two lines rather than lose its end. */}
            <span className="line-clamp-2 font-semibold leading-snug break-words">
              {p.customer}
            </span>
            {p.address ? (
              <span className="flex min-w-0 items-center gap-1 text-[0.9375rem] text-text-muted">
                <span className="truncate">{p.address}</span>
                {!p.location ? <NotOnMapTag /> : null}
              </span>
            ) : !p.location ? (
              <NotOnMapTag />
            ) : null}
            {suggested || note ? (
              <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                {suggested ? (
                  <span className="rounded-full bg-link/12 px-2.5 py-0.5 text-[0.8125rem] font-semibold text-link">
                    Suggested
                  </span>
                ) : null}
                {note ? <span className="text-[0.8125rem] text-text-muted">{note}</span> : null}
              </span>
            ) : null}
            <span className="sr-only">. Move…</span>
          </span>
        </button>
        {grip && draggable && !disabled ? (
          <span
            aria-hidden="true"
            className="grid size-11 shrink-0 place-items-center text-text-muted/70"
          >
            <svg viewBox="0 0 24 24" className="size-5" fill="currentColor">
              {[6, 12, 18].map((y) =>
                [9, 15].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.6" />),
              )}
            </svg>
          </span>
        ) : null}
      </div>
    </li>
  );
}

/** Customers to Add: plans nobody services yet, newest first, with a search. */
function AddList({
  plans,
  suggestedIds,
  canMove,
  onMove,
  prefix,
  inSheet = false,
}: {
  plans: RoutePlanCard[];
  suggestedIds: Set<string>;
  canMove: (p: RoutePlanCard) => boolean;
  onMove: (p: RoutePlanCard) => void;
  prefix: string;
  inSheet?: boolean;
}) {
  const [query, setQuery] = useState("");
  const ids = useId();
  const list = useMemo(
    () => (query.trim() ? customersToAdd(plans, [], query) : plans),
    [plans, query],
  );
  const body = (
    <>
      {plans.length > 4 || query ? (
        <div className="relative mb-3">
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
        <p className="px-1 py-2 text-text-muted">Every customer has a day.</p>
      ) : list.length === 0 ? (
        <p className="px-1 py-2 text-text-muted">No customers to add match “{query.trim()}”.</p>
      ) : (
        <ol className={cx("space-y-1.5", !inSheet && "overflow-y-auto")}>
          {list.map((p) => (
            <PlanCard
              key={p.planId}
              id={`${prefix}:${p.planId}@add`}
              plan={p}
              suggested={suggestedIds.has(p.planId)}
              disabled={!canMove(p)}
              onMove={() => onMove(p)}
              well={!inSheet}
              grip={!inSheet}
              draggable={!inSheet}
            />
          ))}
        </ol>
      )}
    </>
  );
  if (inSheet) return <div className="pt-1">{body}</div>;
  return (
    <section
      aria-labelledby={`${ids}-title`}
      data-testid="customers-to-add"
      className="card sticky top-6 flex max-h-[calc(100dvh-3rem)] flex-col p-3"
    >
      <h2 id={`${ids}-title`} className="mb-3 px-1 pt-1 font-display text-xl font-bold">
        Customers to Add{" "}
        <span className="font-sans font-normal text-text-muted tabular-nums">({plans.length})</span>
      </h2>
      {body}
    </section>
  );
}

/**
 * The working days as a segmented control (phones). While a card is held, each segment is a
 * place to drop it, and holding it over one opens that day (spring loading).
 */
function DaySegments({
  routes,
  day,
  onPick,
  dragging,
}: {
  routes: RouteDay[];
  day: number;
  onPick: (d: number) => void;
  dragging: boolean;
}) {
  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const i = routes.findIndex((r) => r.day === day);
    const next = routes[(i + step + routes.length) % routes.length]!;
    onPick(next.day);
    e.currentTarget
      .querySelectorAll<HTMLButtonElement>("[role=radio]")
      [routes.indexOf(next)]?.focus();
  }
  return (
    <div
      role="radiogroup"
      aria-label="Day"
      data-no-swipe
      onKeyDown={onKeyDown}
      className="sticky top-[calc(2.75rem+env(safe-area-inset-top))] z-10 flex w-full gap-0.5 rounded-[1.5rem] bg-fill p-0.5 sm:top-2"
    >
      {routes.map((r) => (
        <DaySegment
          key={r.day}
          route={r}
          active={r.day === day}
          onPick={onPick}
          dragging={dragging}
        />
      ))}
    </div>
  );
}

function DaySegment({
  route: r,
  active,
  onPick,
  dragging,
}: {
  route: RouteDay;
  active: boolean;
  onPick: (d: number) => void;
  dragging: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `seg-${r.day}` });
  return (
    <button
      ref={setNodeRef}
      type="button"
      role="radio"
      aria-checked={active}
      tabIndex={active ? 0 : -1}
      aria-label={`${WEEKDAY_NAMES[r.day]}, ${r.plans.length} ${r.plans.length === 1 ? "pool" : "pools"}`}
      onClick={() => onPick(r.day)}
      className={cx(
        "flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center rounded-full px-1 text-[0.9375rem] leading-tight transition-[transform,background-color] duration-200 motion-reduce:transition-none",
        active
          ? "bg-thumb font-semibold text-text shadow-[0_3px_8px_rgb(0_0_0/0.12),0_3px_1px_rgb(0_0_0/0.04)]"
          : "font-medium text-text hover:bg-text/[0.05]",
        isOver && "scale-105 bg-link text-white",
        dragging && !isOver && !active && "bg-link/10",
      )}
    >
      <span aria-hidden="true">{WEEKDAY_SHORT[r.day]}</span>
      <span
        aria-hidden="true"
        className={cx(
          "text-[0.75rem] tabular-nums",
          isOver ? "text-white/85" : active ? "text-text/75" : "text-text-muted",
        )}
      >
        {r.plans.length}
      </span>
    </button>
  );
}

/** Move…: the day (one of the shop's working days) and the tech. */
function MoveSheet({
  moving,
  techs,
  tech,
  workDays,
  onClose,
  onMove,
}: {
  moving: Moving;
  techs: { id: string; name: string }[];
  /** The tech on screen. */
  tech: string | null;
  workDays: number[];
  onClose: () => void;
  onMove: (to: number, tech: string) => void;
}) {
  const { plan: p, from } = moving;
  const start = from ?? p.days[0] ?? workDays[0] ?? 1;
  const options = sortDays([...workDays, start]);
  const [day, setDay] = useState(options.includes(start) ? start : options[0]!);
  const [who, setWho] = useState(
    (p.techId && techs.some((t) => t.id === p.techId) ? p.techId : tech) ?? techs[0]?.id ?? "",
  );
  const others = p.days.filter((d) => d !== from);
  const taken = from != null && day !== from && others.includes(day);
  const same = from != null && day === from && who === p.techId;
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
          description={
            from != null && others.length
              ? `Moves its ${WEEKDAY_NAMES[from]} visit. ${others.map((d) => WEEKDAY_NAMES[d]).join(" and ")} stay${others.length === 1 ? "s" : ""}.`
              : undefined
          }
        />
        {techs.length > 1 ? (
          <div role="radiogroup" aria-labelledby="move-tech">
            <p id="move-tech" className="mb-1.5 font-medium">
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
                    className="flex min-h-11 w-full items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-text/[0.03] active:bg-text/[0.06]"
                  >
                    <span>{t.name}</span>
                    <Check on={who === t.id} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <p className="px-1 text-[0.9375rem] text-text-muted">
          {taken
            ? `It’s already serviced on ${WEEKDAY_NAMES[day]}.`
            : "Its coming visits move to the new day."}
        </p>
        <Button
          type="button"
          className="w-full"
          disabled={!who || taken || same}
          onClick={() => onMove(day, who)}
        >
          Move to {WEEKDAY_NAMES[day]}
        </Button>
      </div>
    </Sheet>
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

/** One choice in an iOS checklist: a title, a line under it, and a checkmark. */
function ChoiceRow({
  on,
  title,
  detail,
  disabled,
  onPick,
}: {
  on: boolean;
  title: string;
  detail?: ReactNode;
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
        className="flex min-h-11 w-full items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-text/[0.03] active:bg-text/[0.06] disabled:opacity-50"
      >
        <span className="min-w-0">
          <span className="block">{title}</span>
          {detail ? <span className="block text-[0.9375rem] text-text-muted">{detail}</span> : null}
        </span>
        <Check on={on} />
      </button>
    </li>
  );
}

const customersWord = (n: number) => `${n} ${n === 1 ? "customer" : "customers"}`;

/** Suggest Days: for Customers to Add (one tech or everyone), or rebuild a tech's week. */
function SuggestSheet({
  tech,
  techs,
  toAdd,
  rebuild,
  onClose,
  onSuggest,
}: {
  tech: { id: string; name: string };
  techs: { id: string; name: string }[];
  toAdd: RoutePlanCard[];
  rebuild: RoutePlanCard[];
  onClose: () => void;
  onSuggest: (plans: string[], techs: string[], asked: RoutePlanCard[]) => void;
}) {
  const [what, setWhat] = useState<"add" | "rebuild">(
    toAdd.length || !rebuild.length ? "add" : "rebuild",
  );
  const [everyone, setEveryone] = useState(false);
  const plans = what === "add" ? toAdd : rebuild;
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
              title={`Rebuild ${tech.name}’s Week`}
              detail={`${customersWord(rebuild.length)} on one day a week, planned again from scratch`}
              disabled={!rebuild.length}
              onPick={() => setWhat("rebuild")}
            />
          </ul>
        </div>
        {what === "add" && techs.length > 1 ? (
          <div role="radiogroup" aria-labelledby="suggest-who">
            <p id="suggest-who" className="mb-1.5 px-4 text-[0.9375rem] text-text-muted">
              Spread across
            </p>
            <ul className="grouped">
              <ChoiceRow on={!everyone} title={tech.name} onPick={() => setEveryone(false)} />
              <ChoiceRow
                on={everyone}
                title="Everyone"
                detail={`${techs.length} techs`}
                onPick={() => setEveryone(true)}
              />
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
          disabled={!plans.length}
          onClick={() =>
            onSuggest(
              plans.map((p) => p.planId),
              what === "add" && everyone ? techs.map((t) => t.id) : [tech.id],
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
    <>
      {/* Room for the last cards to scroll above the bar. */}
      <div aria-hidden="true" className="h-24" />
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
    </>
  );
}
