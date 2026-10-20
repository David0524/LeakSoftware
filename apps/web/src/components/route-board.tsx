"use client";

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useOptimistic,
  useRef,
  useState,
  useTransition,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { durationLabel, type CleaningKind, type JobStatus, type LatLng } from "@leakbook/core";
import { DayMap } from "./day-map";
import { CleaningIcon, KeyIcon } from "./icons";
import { LockTag } from "./lock-tag";
import { PlanWeek } from "./plan-week";
import { dayMap, weekdayName } from "@/lib/day-map";
import { NotOnMapTag } from "./not-on-map";
import {
  moveJob,
  planRoute,
  suggestTimes,
  type RouteResult,
  type Suggestion,
} from "@/app/actions/routes";
import { AddressLink, OpenRouteInMaps } from "./open-in-maps";
import { Sheet } from "./sheet";
import { showBanner } from "./top-banner";
import { useFlip } from "./use-flip";
import { Button, StatusBadge, buttonClass, cx, pillClass } from "./ui";

// The schedule as routes (routing, owner request 2026-10-13): each tech's day in order with
// the driving between stops. Drag a job by its grip to another place, tech, or day (mouse,
// touch, or keyboard; phones too, owner 2026-10-20); Move… (or a swipe left on the stop) does
// the same in a sheet. Jobs waiting for a time sit in the tray with suggestions that fit them
// into the routes already planned.

export interface BoardStop {
  id: string;
  number: number | null;
  customer: string;
  address: string;
  location: LatLng | null;
  /** "8:15 AM", or null with no time. */
  time: string | null;
  status: JobStatus;
  /**
   * What keeps it in place: its lock ("Day locked", "Time locked", "Locked", with a padlock)
   * or "Two techs".
   */
  lock: { label: string; kind: "day" | "time" | "both" | "two_techs" } | null;
  /** Started jobs stay put. */
  draggable: boolean;
  /** Driving in from the stop before (null: not on a route). */
  legMin: number | null;
  /** Minutes short of that drive. */
  shortMin: number;
  /**
   * The pill on the card: the kind of visit ("Leak detection", "Repair", "Maintenance", "Pool
   * inspection"), or "Second tech, with …" / "With …" for a two-tech job.
   */
  tag: string;
  /** The address wasn't found on the map, so drive times leave the stop out. */
  notOnMap: boolean;
  /** The pool's access notes (gate code, which gate, dogs): one line on the card. */
  access: string | null;
  /** Needs a Time's second line: the tag, Not on map, when it's booked. */
  note?: string | null;
  /** The plan's cleanings due on this visit: filter, salt cell (owner, 2026-10-20). */
  cleanings?: { kind: CleaningKind; name: string }[];
}

export interface BoardColumn {
  /** "techId|date" */
  key: string;
  /** Phones show one person at a time (picked with chips); desktop shows everyone. */
  phoneHidden?: boolean;
  techId: string;
  title: string;
  date: string;
  stops: BoardStop[];
  driveMin: number;
  backLegMin: number | null;
  back: string | null;
  overtimeMin: number;
  routeHref: string | null;
  /** Which app routeHref opens (the device's choice). */
  routeApp: "apple" | "google";
  /** Today or later: can be planned and dropped on. */
  open: boolean;
}

export interface TrayJob extends BoardStop {
  kind: string;
}

const TRAY = "tray";

type Lists = Record<string, BoardStop[]>;

interface Move {
  job: string;
  to: string;
  index: number;
}

function applyMove(lists: Lists, m: Move): Lists {
  let moving: BoardStop | null = null;
  const next: Lists = {};
  for (const [k, list] of Object.entries(lists)) {
    next[k] = list.filter((s) => {
      if (s.id !== m.job) return true;
      moving = s;
      return false;
    });
  }
  if (!moving) return lists;
  const target = next[m.to] ?? [];
  const placed: BoardStop = { ...(moving as BoardStop), time: null, legMin: null, shortMin: 0 };
  next[m.to] = [...target.slice(0, m.index), placed, ...target.slice(m.index)];
  return next;
}

/** The pointer's box first (for empty days and week cells), else the nearest stop. */
const collision: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  return hits.length ? hits : closestCenter(args);
};

export function RouteBoard({
  mode,
  columns,
  tray,
  techs,
  today,
  weekDays,
  maps = null,
  workDates = [],
  planDates = null,
  planWaiting = 0,
}: {
  mode: "day" | "week";
  columns: BoardColumn[];
  /** Needs a Time; null hides it (techs don't see it: owner, 2026-10-18). */
  tray: TrayJob[] | null;
  techs: { id: string; name: string }[];
  today: string;
  /** Week mode: the days across, as [date, label]. */
  weekDays?: [string, string][];
  /** Day maps (when the shop's maps are set up): whose shop, and where it is. */
  maps?: { company: string; depot: LatLng | null } | null;
  /** Week mode: the shop's working days, which get a map even when empty. */
  workDates?: string[];
  /** Week mode, owners and admins: Plan Week for these days (today and later). */
  planDates?: string[] | null;
  /** Jobs in Needs a Time with nobody on them that Plan Week could place. */
  planWaiting?: number;
}) {
  const initial = useMemo(() => {
    const lists: Lists = { [TRAY]: tray ?? [] };
    for (const c of columns) lists[c.key] = c.stops;
    return lists;
  }, [columns, tray]);
  const [lists, optimistic] = useOptimistic(initial, applyMove);
  // Moves and Optimize run apart, so a move made while a day is optimizing isn't held up, and
  // only the day being optimized shows it.
  const [, start] = useTransition();
  const [optimizing, startOptimize] = useTransition();
  const [planning, setPlanning] = useState<string | null>(null);
  const [dragging, setDragging] = useState<BoardStop | null>(null);
  const [moving, setMoving] = useState<BoardStop | null>(null);
  const byKey = useMemo(() => new Map(columns.map((c) => [c.key, c])), [columns]);
  // Stable, so the open sheet isn't re-focused each time the board re-renders.
  const closeMove = useCallback(() => setMoving(null), []);
  // A stable id keeps dnd-kit's generated ids the same on the server and in the browser.
  const dndId = useId();

  const sensors = useSensors(
    // Drags start from the grip only. A mouse picks the job up once it moves a little; a
    // finger after a short press (owner, 2026-10-20: drag and drop on phones again), so a
    // flick that lands on the grip doesn't move a job. The grip doesn't scroll the page
    // (touch-none), and while dragging the page scrolls near the screen's edges (autoScroll).
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Phones showing one tech's day: its map and buttons lead, above Needs a Time.
  const shownOnPhone = columns.filter((c) => !c.phoneHidden);
  const lead =
    mode === "day" && shownOnPhone.length === 1 && (lists[shownOnPhone[0]!.key] ?? []).length
      ? shownOnPhone[0]!
      : null;

  const where = (id: string) => Object.keys(lists).find((k) => lists[k]!.some((s) => s.id === id));

  // The board as it is and as it's being dragged: lists that reorder slide into place.
  const board = useRef<HTMLDivElement>(null);
  useFlip(board, !!dragging);

  // Results show as a short banner at the top of the screen (owner, 2026-10-20), in the same
  // frame as the reordered day: set in the transition, shown once it's on screen.
  const [result, setResult] = useState<(RouteResult & { at: number }) | null>(null);
  const report = (r: RouteResult) => setResult({ ...r, at: Date.now() });
  useEffect(() => {
    if (!result) return;
    if (result.error) showBanner({ tone: "error", message: result.error });
    else if (result.message)
      showBanner({
        tone: result.detail ? "warning" : "success",
        message: result.message,
        detail: result.detail,
      });
  }, [result]);

  function run(move: Move, call: () => Promise<RouteResult>) {
    start(async () => {
      optimistic(move);
      const r = await call();
      // Updates after an await join the transition only when wrapped, so the banner shows
      // with the refreshed day, not before it.
      start(() => report(r));
    });
  }

  /** Optimize a tech's day: the button says so at once, and the rest of the page still works. */
  function optimize(techId: string, date: string) {
    setPlanning(`${techId}|${date}`);
    startOptimize(async () => {
      const r = await planRoute(techId, date);
      startOptimize(() => {
        report(r);
        setPlanning(null);
      });
    });
  }
  const optimizingKey = optimizing ? planning : null;

  /** Move a job to a list ("techId|date", "none|date", or the tray) at a place. */
  function moveTo(job: string, to: string, index: number) {
    if (to === TRAY) {
      run({ job, to, index: 0 }, () => moveJob({ job, tech: null, date: null, index: 0 }));
      return;
    }
    const col = byKey.get(to);
    const [tech, date] = to.split("|") as [string, string];
    if (col && !col.open) {
      report({ error: "Pick today or a later day." });
      return;
    }
    // No tech: the job keeps its time and waits in Needs a Time.
    const none = tech === "none";
    run({ job, to: none ? TRAY : to, index: none ? 0 : index }, () =>
      moveJob({ job, tech: none ? null : tech, date: date!, index }),
    );
  }

  function onDragStart(e: DragStartEvent) {
    const id = String(e.active.id);
    setDragging(
      Object.values(lists)
        .flat()
        .find((s) => s.id === id) ?? null,
    );
  }

  function onDragEnd(e: DragEndEvent) {
    setDragging(null);
    const id = String(e.active.id);
    const over = e.over ? String(e.over.id) : null;
    const from = where(id);
    if (!over || !from) return;
    const to = over in lists ? over : where(over);
    if (!to) return;
    const list = lists[to]!;
    let index =
      over in lists ? list.filter((s) => s.id !== id).length : list.findIndex((s) => s.id === over);
    if (to === from) {
      const at = list.findIndex((s) => s.id === id);
      if (over in lists) index = list.length - 1;
      if (index === at) return;
    }
    if (to === TRAY && from === TRAY) return;
    moveTo(id, to, Math.max(0, index));
  }

  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={collision}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDragging(null)}
      autoScroll={{ threshold: { x: 0.2, y: 0.15 }, acceleration: 12 }}
      accessibility={{
        screenReaderInstructions: {
          draggable:
            "To pick up a job, press Space or Enter. Use the arrow keys to move it, Space or Enter to drop it, or Escape to cancel.",
        },
      }}
    >
      <div ref={board}>
        {lead ? (
          <DayLead
            column={lead}
            stops={lists[lead.key] ?? []}
            optimizing={optimizingKey === lead.key}
            busy={optimizing}
            onPlan={() => optimize(lead.techId, lead.date)}
            maps={maps}
            today={today}
          />
        ) : null}

        {tray ? (
          <Tray
            jobs={lists[TRAY] ?? []}
            onMove={setMoving}
            onSuggestion={(job, s) => moveTo(job, `${s.techId}|${s.date}`, s.position)}
          />
        ) : null}

        {mode === "day" ? (
          <div className="grid grid-cols-[minmax(0,1fr)] gap-5 md:grid-cols-[repeat(2,minmax(0,1fr))] xl:grid-cols-[repeat(3,minmax(0,1fr))]">
            {columns.map((c) => (
              <DayColumn
                key={c.key}
                column={c}
                stops={lists[c.key] ?? []}
                optimizing={optimizingKey === c.key}
                busy={optimizing}
                onPlan={() => optimize(c.techId!, c.date)}
                onMove={setMoving}
                maps={maps}
                today={today}
                lead={c.key === lead?.key}
              />
            ))}
          </div>
        ) : (
          <>
            <WeekMaps
              columns={columns}
              lists={lists}
              days={weekDays ?? []}
              workDates={workDates}
              today={today}
              maps={maps}
              planDates={planDates}
              planWaiting={planWaiting}
              optimizingKey={optimizingKey}
              busy={optimizing}
              onPlan={optimize}
            />
            <WeekGrid
              columns={columns}
              lists={lists}
              days={weekDays ?? []}
              today={today}
              onMove={setMoving}
            />
          </>
        )}
      </div>

      <DragOverlay dropAnimation={null}>
        {dragging ? (
          <div className="card max-w-sm p-3 shadow-xl ring-2 ring-link">
            {dragging.time ? (
              <span className="block font-display text-[1.0625rem] font-bold">{dragging.time}</span>
            ) : null}
            <span className="block truncate font-semibold">{dragging.customer}</span>
            <span className="block truncate text-[0.9375rem] text-text-muted">
              {dragging.address}
            </span>
          </div>
        ) : null}
      </DragOverlay>

      {moving ? (
        <MoveSheet
          stop={moving}
          from={where(moving.id) ?? TRAY}
          lists={lists}
          techs={techs}
          today={today}
          onClose={closeMove}
          onMove={(to, index) => {
            setMoving(null);
            moveTo(moving.id, to, index);
          }}
        />
      ) : null}
    </DndContext>
  );
}

// ---------------------------------------------------------------------------
// Day: one column per tech
// ---------------------------------------------------------------------------

interface DayHeaderProps {
  column: BoardColumn;
  stops: BoardStop[];
  /** Some day is being optimized (Optimize waits for it). */
  busy: boolean;
  /** This day is. */
  optimizing?: boolean;
  onPlan: () => void;
  maps: { company: string; depot: LatLng | null } | null;
  today: string;
}

/** "4 stops · 1 hr 29 min driving · back by 5:04 PM". */
function daySummary(c: BoardColumn, stops: BoardStop[]): string | null {
  if (!c.techId || !stops.length) return null;
  return [
    `${stops.length} ${stops.length === 1 ? "stop" : "stops"}`,
    `${durationLabel(c.driveMin)} driving`,
    c.back ? `back by ${c.back}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function DayFacts({ column: c, stops }: { column: BoardColumn; stops: BoardStop[] }) {
  const summary = daySummary(c, stops);
  return (
    <>
      {summary ? <p className="text-[0.9375rem] text-text-muted">{summary}</p> : null}
      {c.overtimeMin > 0 ? (
        <p className="mt-1 text-[0.9375rem] font-semibold text-status-warning">
          Runs {durationLabel(c.overtimeMin)} past the end of the day.
        </p>
      ) : null}
    </>
  );
}

/** Optimize and the day in the maps app: what a tech's day is for, so they lead. */
function DayButtons({ column: c, stops, busy, optimizing = false, onPlan }: DayHeaderProps) {
  if (!c.techId || !stops.length) return null;
  return (
    <div className="mt-3 grid grid-cols-2 gap-2">
      {c.open ? (
        <OptimizeButton optimizing={optimizing} disabled={busy} onClick={onPlan} className="px-2" />
      ) : null}
      {c.routeHref ? (
        <OpenRouteInMaps href={c.routeHref} app={c.routeApp} compact className="px-2" />
      ) : null}
    </div>
  );
}

/**
 * Optimize (owner, 2026-10-20: "Change 'plan route' to 'optimize'"): a spinner and
 * "Optimizing…" the moment it's pressed, while the rest of the page keeps working.
 */
function OptimizeButton({
  optimizing,
  disabled,
  onClick,
  className,
  label,
}: {
  optimizing: boolean;
  disabled: boolean;
  onClick: () => void;
  className?: string;
  /** Spoken name when several are on screen ("Optimize Tuesday’s Route"). */
  label?: string;
}) {
  return (
    <Button
      type="button"
      kind="secondary"
      disabled={disabled}
      aria-busy={optimizing || undefined}
      aria-label={label}
      onClick={onClick}
      className={cx("gap-2", optimizing && "disabled:opacity-100", className)}
    >
      {optimizing ? (
        <span
          aria-hidden="true"
          className="size-4 shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none motion-reduce:border-r-current motion-reduce:opacity-60"
        />
      ) : null}
      {optimizing ? "Optimizing…" : "Optimize"}
    </Button>
  );
}

function DayColumnMap({
  column: c,
  stops,
  maps,
  today,
  className,
}: Pick<DayHeaderProps, "column" | "stops" | "maps" | "today"> & { className?: string }) {
  const map =
    maps && stops.length ? dayMap({ stops, depot: maps.depot, date: c.date, today }) : null;
  if (!maps || !map || (!map.pins && !map.missing)) return null;
  return (
    <DayMap
      company={maps.company}
      pins={map.pins}
      stops={stops}
      missing={map.missing}
      tech={c.title}
      day={weekdayName(c.date)}
      className={className}
    />
  );
}

/** A tech's day above its stops: the summary, the buttons, then the map. */
function DayHeader(props: DayHeaderProps) {
  return (
    <>
      <DayFacts column={props.column} stops={props.stops} />
      <DayButtons {...props} />
      <DayColumnMap {...props} />
    </>
  );
}

/**
 * Phones, one tech's day: the map leads, right under the tech chips (owner: "uses the maps all
 * the time"), then the summary and the buttons; Needs a Time and the stops follow.
 */
function DayLead(props: DayHeaderProps) {
  return (
    <section aria-label="Route" className="mb-5 sm:hidden">
      <DayColumnMap {...props} className="mb-2" />
      <DayFacts column={props.column} stops={props.stops} />
      <DayButtons {...props} />
    </section>
  );
}

function DayColumn({
  column: c,
  stops,
  busy,
  optimizing = false,
  onPlan,
  onMove,
  maps,
  today,
  lead = false,
}: {
  column: BoardColumn;
  stops: BoardStop[];
  busy: boolean;
  optimizing?: boolean;
  onPlan: () => void;
  onMove: (s: BoardStop) => void;
  maps: { company: string; depot: LatLng | null } | null;
  today: string;
  /** Phones: the day's map, summary and buttons are in DayLead above Needs a Time. */
  lead?: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: c.key, disabled: !c.open });
  return (
    <section
      aria-label={c.title}
      data-testid="route"
      // The stops are cards of their own, as on Today: on a phone they sit on the page; wider
      // screens group each tech's day in a faint well so the columns read apart.
      className={cx(
        "flex flex-col rounded-[22px] sm:bg-text/[0.03] sm:p-3",
        c.phoneHidden && "max-sm:hidden",
        isOver && "bg-link/5 ring-2 ring-link",
      )}
    >
      <h2 className="font-display text-xl font-bold">{c.title}</h2>
      {/* Phones with one tech chosen show this above Needs a Time instead (DayLead). */}
      <div className={lead ? "max-sm:hidden" : undefined}>
        <DayHeader
          column={c}
          stops={stops}
          busy={busy}
          optimizing={optimizing}
          onPlan={onPlan}
          maps={maps}
          today={today}
        />
      </div>
      <SortableContext
        id={c.key}
        items={stops.map((s) => s.id)}
        strategy={verticalListSortingStrategy}
      >
        <ol ref={setNodeRef} data-flip-list={c.key} className="mt-3 min-h-16 flex-1 space-y-1">
          {stops.length === 0 ? (
            <li className="card p-4 text-center text-text-muted">
              {c.open ? "Nothing scheduled. Drop a job here." : "Nothing scheduled."}
            </li>
          ) : null}
          {stops.map((s, i) => (
            <li key={s.id} data-flip={s.id}>
              {s.legMin != null && c.techId ? (
                <Leg
                  minutes={s.legMin}
                  short={s.shortMin}
                  label={i === 0 ? "from the shop" : "drive"}
                />
              ) : null}
              <StopCard stop={s} position={i + 1} onMove={onMove} />
            </li>
          ))}
          {c.techId && stops.length && c.backLegMin != null ? (
            <li>
              <Leg minutes={c.backLegMin} label="back to the shop" short={0} />
            </li>
          ) : null}
        </ol>
      </SortableContext>
    </section>
  );
}

function Leg({
  minutes,
  short,
  label = "drive",
}: {
  minutes: number;
  short: number;
  label?: string;
}) {
  return (
    // Today's connector between stops: a dotted line and the drive.
    <p className="flex items-center gap-2 py-0.5 pl-4 text-[0.9375rem] text-text-muted">
      <span aria-hidden="true" className="h-4 border-l-2 border-dotted border-text-muted" />
      {durationLabel(minutes)} {label}
      {short > 0 ? (
        <span className="font-semibold text-status-warning">· {durationLabel(short)} late</span>
      ) : null}
    </p>
  );
}

export function Grip(props: Record<string, unknown> & { label: string; className?: string }) {
  const { label, className, ...rest } = props;
  return (
    <button
      type="button"
      data-grip
      // A drag from here isn't a swipe to the next day.
      data-no-swipe
      aria-label={label}
      // On phones too (owner, 2026-10-20). touch-none: a finger on the grip drags the job, not
      // the page; no text selection or callout on the long press.
      className={cx(
        "grid size-11 shrink-0 cursor-grab touch-none place-items-center rounded-full text-text-muted select-none [-webkit-touch-callout:none] hover:bg-text/[0.06] active:cursor-grabbing active:bg-link/10 active:text-link",
        className,
      )}
      {...rest}
    >
      <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden="true">
        {[6, 12, 18].map((y) =>
          [9, 15].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.6" />),
        )}
      </svg>
    </button>
  );
}

/** How far a swipe left opens a stop to show Move. */
const REVEAL = 88;

/**
 * Swipe left on a stop (touch only) to show Move behind it, as in iOS lists. A tap on an
 * open stop closes it. The visible Move… button does the same for everyone else.
 */
function useSwipeToReveal(enabled: boolean) {
  const [open, setOpen] = useState(false);
  const [drag, setDrag] = useState<number | null>(null);
  const live = useRef<number | null>(null);
  const gesture = useRef<{ x: number; y: number; base: number; axis: "x" | "y" | null } | null>(
    null,
  );
  const swiped = useRef(false);
  const offset = drag ?? (open ? -REVEAL : 0);
  const end = () => {
    const g = gesture.current;
    gesture.current = null;
    if (!g || g.axis !== "x") return;
    setOpen((live.current ?? g.base) < -REVEAL / 2);
    live.current = null;
    setDrag(null);
  };
  const handlers = enabled
    ? {
        onPointerDown: (e: PointerEvent) => {
          // Touch only, and not on the drag grip.
          if (e.pointerType !== "touch" || (e.target as Element).closest("[data-grip]")) return;
          swiped.current = false;
          gesture.current = { x: e.clientX, y: e.clientY, base: open ? -REVEAL : 0, axis: null };
        },
        onPointerMove: (e: PointerEvent) => {
          const g = gesture.current;
          if (!g) return;
          const dx = e.clientX - g.x;
          const dy = e.clientY - g.y;
          if (!g.axis) {
            if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
            g.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
          }
          if (g.axis !== "x") return;
          swiped.current = true;
          live.current = Math.min(0, Math.max(-REVEAL - 24, g.base + dx));
          setDrag(live.current);
        },
        onPointerUp: end,
        onPointerCancel: end,
        // A swipe isn't a tap on the link under the finger; a tap on an open stop closes it.
        onClickCapture: (e: MouseEvent) => {
          if (swiped.current || open) {
            e.preventDefault();
            e.stopPropagation();
            if (!swiped.current) setOpen(false);
            swiped.current = false;
          }
        },
      }
    : {};
  return { offset, dragging: drag !== null, handlers, close: () => setOpen(false) };
}

/** Done for the day: the report, quote, or invoice is under way or finished. */
function finished(status: JobStatus) {
  return !["unscheduled", "scheduled", "in_progress", "canceled"].includes(status);
}

/** The stop's place in the route, round, as on Today: a check once done, blue while on it. */
function StopBadge({ position, status }: { position: number; status: JobStatus }) {
  const done = finished(status);
  return (
    <span
      aria-hidden="true"
      className={cx(
        "mt-1 grid size-8 shrink-0 place-items-center rounded-full font-display font-bold",
        done
          ? "bg-status-pass text-on-status"
          : status === "in_progress"
            ? "bg-link text-bg"
            : "bg-bg",
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
      ) : (
        position
      )}
    </span>
  );
}

function Chevron() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="size-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

/**
 * A stop on a tech's day, styled like Today's stops (owner, 2026-10-20: "Make the schedule cards
 * a little more appealing. Refer to what the today page looks like"): a soft card with the
 * stop's number in a circle, the time and the customer (a link to the job), Move… and the drag
 * grip on the same row, then the kind of visit as a pill, the address, and the access notes.
 */
function StopCard({
  stop: s,
  position,
  onMove,
}: {
  stop: BoardStop;
  position: number;
  onMove: (s: BoardStop) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: s.id, disabled: !s.draggable });
  const swipe = useSwipeToReveal(s.draggable);
  return (
    <article
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      data-testid="stop"
      aria-label={`${s.time ?? "No time"}, ${s.customer}`}
      className={cx("card relative overflow-hidden", isDragging && "opacity-40")}
    >
      {swipe.offset < 0 ? (
        // Behind the stop, shown by the swipe. Screen readers and keyboards use Move… instead.
        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          onClick={() => {
            swipe.close();
            onMove(s);
          }}
          className="absolute inset-y-0 right-0 bg-link font-semibold text-white"
          style={{ width: Math.max(REVEAL, -swipe.offset) }}
        >
          Move
        </button>
      ) : null}
      <div
        {...swipe.handlers}
        // A swipe on a stop that moves opens Move, not the next day.
        data-no-swipe={s.draggable ? "" : undefined}
        style={swipe.offset ? { transform: `translateX(${swipe.offset}px)` } : undefined}
        className={cx(
          "relative flex touch-pan-y items-start gap-2 rounded-[1.25rem] bg-surface py-1.5 pl-3",
          s.draggable ? "pr-1" : "pr-3",
          !swipe.dragging && "transition-transform duration-200 motion-reduce:transition-none",
        )}
      >
        <StopBadge position={position} status={s.status} />
        <div className="min-w-0 flex-1">
          {/* The time, then the customer under it (always two lines, so the cards in a column
              line up); both open the job. Move… and the grip sit at the end of the row, so the
              lines under it keep the card's full width. */}
          <div className="flex items-start">
            <Link
              href={`/jobs/${s.id}`}
              className={cx(
                "flex min-h-11 min-w-0 flex-1 flex-col justify-center py-1",
                finished(s.status) && "opacity-70",
              )}
            >
              <span className="font-display text-[1.0625rem] leading-snug font-bold whitespace-nowrap tabular-nums">
                {s.time ?? "Saving…"}
              </span>
              <span className="flex min-w-0 items-center gap-0.5 font-semibold text-link">
                <span className="truncate">{s.customer}</span>
                <Chevron />
              </span>
            </Link>
            {s.draggable ? (
              <>
                <button
                  type="button"
                  className={buttonClass("quiet", "shrink-0 px-2")}
                  onClick={() => onMove(s)}
                >
                  Move…
                </button>
                <Grip
                  label={`Drag ${s.customer}`}
                  ref={setActivatorNodeRef}
                  {...attributes}
                  {...listeners}
                />
              </>
            ) : null}
          </div>
          <div className={cx("space-y-1 pb-1.5", s.draggable && "pr-2")}>
            {/* The kind of visit (or the second tech's note) as a pill, then any state worth
                saying: most stops are Scheduled, so that badge is left out. */}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="rounded-full bg-fill px-2.5 py-0.5 text-[0.8125rem] font-semibold text-text">
                {s.tag}
              </span>
              {s.status !== "scheduled" ? <StatusBadge status={s.status} /> : null}
              {s.lock ? <LockTag lock={s.lock} /> : null}
              {s.number ? (
                <span className="text-[0.8125rem] text-text-muted">#{s.number}</span>
              ) : null}
            </div>
            {s.address ? (
              // Not found on the map: a small warning symbol right after the address (owner,
              // 2026-10-20: "Don't waste space with text").
              <p className="flex min-w-0 items-center gap-1.5 text-[0.9375rem]">
                <span className="min-w-0 truncate">
                  <AddressLink address={s.address} location={s.location} muted />
                </span>
                {s.notOnMap || !s.location ? <NotOnMapTag /> : null}
              </p>
            ) : null}
            {s.access && !finished(s.status) ? (
              <p className="flex items-start gap-1.5 text-[0.9375rem] font-medium text-text">
                <KeyIcon className="mt-0.5 size-[1.125rem] shrink-0 text-status-warning" />
                <span className="min-w-0 truncate">
                  <span className="sr-only">Access: </span>
                  {s.access}
                </span>
              </p>
            ) : null}
            {s.cleanings?.length ? (
              <ul className="flex flex-wrap gap-x-3 gap-y-0.5" aria-label="Cleanings due">
                {s.cleanings.map((c) => (
                  <li
                    key={c.name}
                    className="inline-flex items-center gap-1 text-[0.9375rem] font-medium text-text"
                  >
                    <CleaningIcon kind={c.kind} className="size-[1.125rem] shrink-0" />
                    {c.name}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Week: techs down, days across
// ---------------------------------------------------------------------------

/**
 * The week as a row of day maps for one tech (PayThePoolMan's route screen, owner 2026-10-20):
 * each day's name, its map, then Enlarge and Optimize. Pills pick whose week; Plan Week sits at
 * the row's end for owners and admins.
 */
function WeekMaps({
  columns,
  lists,
  days,
  workDates,
  today,
  maps,
  planDates,
  planWaiting,
  busy,
  optimizingKey,
  onPlan,
}: {
  columns: BoardColumn[];
  lists: Lists;
  days: [string, string][];
  workDates: string[];
  today: string;
  maps: { company: string; depot: LatLng | null } | null;
  planDates: string[] | null;
  planWaiting: number;
  busy: boolean;
  optimizingKey: string | null;
  onPlan: (techId: string, date: string) => void;
}) {
  const techs = useMemo(
    () => [...new Map(columns.map((c) => [c.techId, c.title])).entries()],
    [columns],
  );
  const busiest =
    techs.find(([id]) => days.some(([d]) => (lists[`${id}|${d}`] ?? []).length > 0))?.[0] ??
    techs[0]?.[0] ??
    null;
  const [picked, setPicked] = useState<string | null>(null);
  const tech = picked && techs.some(([id]) => id === picked) ? picked : busiest;
  const name = techs.find(([id]) => id === tech)?.[1] ?? "";
  if (!maps && !planDates) return null;
  const shown = days.filter(
    ([d]) => workDates.includes(d) || (lists[`${tech}|${d}`] ?? []).length > 0,
  );
  return (
    <section aria-labelledby="week-routes" className="mb-5">
      {/* The section's title with its one action, then whose week the maps show. */}
      <div className="mb-2 flex min-h-11 flex-wrap items-center justify-between gap-x-3">
        <h2 id="week-routes" className="font-display text-xl font-bold">
          {maps ? (techs.length > 1 ? "Routes" : `${name}’s Routes`) : "This Week"}
        </h2>
        {planDates ? (
          <PlanWeek
            dates={planDates}
            waiting={planWaiting}
            techs={techs.map(([id, title]) => ({ id, name: title }))}
            defaultTech={maps ? tech : null}
            className="contents"
          />
        ) : null}
      </div>
      {maps && techs.length > 1 ? (
        <nav
          aria-label="Whose routes"
          className="-mx-1 mb-3 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]"
        >
          {techs.map(([id, title]) => (
            <button
              key={id}
              type="button"
              aria-pressed={id === tech}
              onClick={() => setPicked(id)}
              className={pillClass(id === tech)}
            >
              {title}
            </button>
          ))}
        </nav>
      ) : null}
      {maps && tech ? (
        <ol className="grid grid-cols-[repeat(auto-fill,minmax(11.5rem,1fr))] gap-3">
          {shown.map(([d]) => {
            const key = `${tech}|${d}`;
            const col = columns.find((c) => c.key === key);
            const stops = lists[key] ?? [];
            const map = dayMap({ stops, depot: maps.depot, date: d, today });
            const day = weekdayName(d);
            return (
              <li
                key={d}
                data-testid="week-map"
                aria-label={day}
                className={cx("card p-2", d === today && "ring-2 ring-link")}
              >
                <h3 className="flex items-baseline justify-between gap-2 px-1.5 pt-0.5 pb-2">
                  <span className={cx("font-semibold", d === today && "text-link")}>
                    {day}
                    {d === today ? <span className="sr-only">, today</span> : null}
                  </span>
                  <span className="text-[0.8125rem] text-text-muted tabular-nums">
                    {stops.length ? `${stops.length} ${stops.length === 1 ? "stop" : "stops"}` : ""}
                  </span>
                </h3>
                <DayMap
                  variant="week"
                  company={maps.company}
                  pins={map.pins}
                  stops={stops}
                  missing={map.missing}
                  tech={name}
                  day={day}
                  action={
                    stops.length ? (
                      <OptimizeButton
                        optimizing={optimizingKey === key}
                        disabled={busy || !col?.open}
                        onClick={() => onPlan(tech, d)}
                        label={optimizingKey === key ? undefined : `Optimize ${day}’s Route`}
                        className="min-w-0 flex-1 px-3 text-[0.9375rem]"
                      />
                    ) : null
                  }
                />
              </li>
            );
          })}
        </ol>
      ) : null}
    </section>
  );
}

function WeekGrid({
  columns,
  lists,
  days,
  today,
  onMove,
}: {
  columns: BoardColumn[];
  lists: Lists;
  days: [string, string][];
  today: string;
  onMove: (s: BoardStop) => void;
}) {
  const rows = [...new Map(columns.map((c) => [c.techId, c.title])).entries()];
  return (
    <div className="overflow-x-auto card">
      <table className="w-full min-w-[880px] table-fixed text-left">
        <thead className="border-b border-border">
          <tr>
            <th scope="col" className="w-32 px-3 py-2 font-medium text-text-muted">
              Tech
            </th>
            {days.map(([d, label]) => (
              <th
                key={d}
                scope="col"
                className={cx(
                  "px-2 py-2 font-medium",
                  d === today ? "text-link" : "text-text-muted",
                )}
              >
                <Link
                  href={`/schedule?view=day&date=${d}`}
                  aria-current={d === today ? "date" : undefined}
                  className="underline-offset-4 hover:underline"
                >
                  {label}
                  {d === today ? " · Today" : ""}
                </Link>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(([techId, name]) => (
            <tr key={techId ?? "none"} className="border-b border-border align-top last:border-0">
              <th scope="row" className="px-3 py-2 font-semibold">
                {name}
              </th>
              {days.map(([d]) => {
                const key = `${techId ?? "none"}|${d}`;
                const col = columns.find((c) => c.key === key)!;
                return (
                  <WeekCell
                    key={d}
                    column={col}
                    stops={lists[key] ?? []}
                    today={d === today}
                    onMove={onMove}
                  />
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function WeekCell({
  column: c,
  stops,
  today,
  onMove,
}: {
  column: BoardColumn;
  stops: BoardStop[];
  today: boolean;
  onMove: (s: BoardStop) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: c.key, disabled: !c.open });
  return (
    <td
      ref={setNodeRef}
      aria-label={`${c.title}, ${c.date}`}
      className={cx(
        "px-1.5 py-2",
        today && "bg-bg",
        isOver && "outline-2 -outline-offset-2 outline-link",
      )}
    >
      <SortableContext id={c.key} items={stops.map((s) => s.id)} strategy={rectSortingStrategy}>
        <ul data-flip-list={c.key} className="min-h-12 space-y-1.5">
          {stops.map((s) => (
            <li key={s.id} data-flip={s.id}>
              <WeekChip stop={s} onMove={onMove} />
            </li>
          ))}
        </ul>
      </SortableContext>
      {c.techId && stops.length ? (
        <p className="mt-1 px-1 text-[0.8125rem] text-text-muted">
          {durationLabel(c.driveMin)} driving
        </p>
      ) : null}
    </td>
  );
}

/**
 * A stop in a week cell: the time, the customer, and the kind of visit, as a small card. The
 * grip sits beside the time, so the name gets the cell's whole width.
 */
function WeekChip({ stop: s, onMove }: { stop: BoardStop; onMove: (s: BoardStop) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: s.id,
    disabled: !s.draggable,
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      data-testid="stop"
      className={cx("well relative", isDragging && "opacity-40")}
    >
      <Link
        href={`/jobs/${s.id}`}
        className={cx(
          "block min-h-11 rounded-2xl px-2 pb-2 active:bg-text/[0.06]",
          finished(s.status) && "opacity-70",
        )}
      >
        <span
          className={cx(
            "flex min-h-11 items-center font-display text-[0.9375rem] font-bold tabular-nums",
            s.draggable && "pr-10",
          )}
        >
          {s.time ?? "Saving…"}
        </span>
        <span
          className="line-clamp-2 block text-[0.9375rem] leading-snug font-semibold text-link"
          title={s.customer}
        >
          {s.customer}
        </span>
        <span className="mt-0.5 line-clamp-1 block text-[0.8125rem] text-text-muted" title={s.tag}>
          {s.tag}
        </span>
        {s.lock ? <LockTag lock={s.lock} className="mt-0.5" /> : null}
      </Link>
      {s.draggable ? (
        <>
          <Grip
            label={`Drag ${s.customer}`}
            className="absolute top-0 right-0"
            {...attributes}
            {...listeners}
          />
          <button type="button" className="sr-only focus:not-sr-only" onClick={() => onMove(s)}>
            Move…
          </button>
        </>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Jobs waiting for a time, with suggestions
// ---------------------------------------------------------------------------

function Tray({
  jobs,
  onMove,
  onSuggestion,
}: {
  jobs: BoardStop[];
  onMove: (s: BoardStop) => void;
  onSuggestion: (job: string, s: Suggestion) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: TRAY });
  const [all, setAll] = useState(false);
  return (
    <section
      ref={setNodeRef}
      aria-labelledby="tray-title"
      data-testid="tray"
      className={cx("card mb-6 p-4", isOver && "ring-2 ring-link")}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id="tray-title" className="font-display text-xl font-bold">
          Needs a Time{jobs.length ? ` (${jobs.length})` : ""}
        </h2>
        {jobs.length > 3 ? (
          <button
            type="button"
            aria-expanded={all}
            onClick={() => setAll((a) => !a)}
            className="-mr-2 min-h-11 px-3 text-[0.9375rem] font-semibold text-link max-md:hidden"
          >
            {all ? "Show Less" : `Show All ${jobs.length}`}
          </button>
        ) : null}
      </div>
      {jobs.length === 0 ? (
        <p className="mt-1 text-[0.9375rem] text-text-muted">
          Every job has a time. Drag a job here to take it off the schedule.
        </p>
      ) : (
        <SortableContext id={TRAY} items={jobs.map((j) => j.id)} strategy={rectSortingStrategy}>
          {/* One row that scrolls sideways (the next card peeks in), so a long list doesn't
              push the routes down; wider screens can open it all as a grid (owner,
              2026-10-18: "super cluttered on desktop"). */}
          <ul
            data-flip-list={TRAY}
            className={cx(
              "relative -mx-4 mt-3 flex snap-x snap-mandatory scroll-px-4 items-start gap-3 overflow-x-auto px-4 pb-1",
              all &&
                "md:mx-0 md:grid md:grid-cols-[repeat(2,minmax(0,1fr))] md:overflow-visible md:px-0 md:pb-0 xl:grid-cols-[repeat(3,minmax(0,1fr))]",
            )}
          >
            {jobs.map((j) => (
              <li
                key={j.id}
                data-flip={j.id}
                className={cx(
                  "w-[88%] max-w-80 shrink-0 snap-start",
                  all && "md:w-auto md:max-w-none",
                )}
              >
                <TrayCard job={j} onMove={onMove} onSuggestion={onSuggestion} />
              </li>
            ))}
          </ul>
        </SortableContext>
      )}
    </section>
  );
}

function TrayCard({
  job: j,
  onMove,
  onSuggestion,
}: {
  job: BoardStop;
  onMove: (s: BoardStop) => void;
  onSuggestion: (job: string, s: Suggestion) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: j.id });
  const [actions, setActions] = useState(false);
  const closeActions = useCallback(() => setActions(false), []);
  return (
    <article
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      data-testid="tray-job"
      className={cx(
        // Positioned, so nothing absolutely placed inside (screen-reader text) escapes the
        // sideways-scrolling list and widens the page.
        "well relative flex items-center gap-1 py-1 pr-1 pl-3",
        isDragging && "opacity-40",
      )}
    >
      {/* Two lines, with the actions behind "…", so a long list stays short (owner,
          2026-10-18: the cards were "a little too bulky"). */}
      <Link href={`/jobs/${j.id}`} className="min-w-0 flex-1 py-1 hover:underline">
        <span className="block truncate">
          <span className="font-semibold">{j.customer}</span>
          <span className="text-text-muted">{j.number ? ` · #${j.number}` : ""}</span>
        </span>
        <span className="flex min-w-0 items-center gap-1.5 text-[0.9375rem] text-text-muted">
          {j.lock ? <LockTag lock={j.lock} className="shrink-0" /> : null}
          {j.address ? <span className="min-w-0 truncate">{j.address}</span> : null}
          {j.notOnMap || !j.location ? <NotOnMapTag /> : null}
          {j.note ? (
            <span className="min-w-0 truncate">
              {j.address ? "· " : ""}
              {j.note}
            </span>
          ) : null}
        </span>
      </Link>
      <button
        type="button"
        aria-label={`Actions for ${j.customer}`}
        title="Suggest Times or Move"
        aria-haspopup="dialog"
        onClick={() => setActions(true)}
        className="grid size-11 shrink-0 place-items-center rounded-full text-link hover:bg-link/10"
      >
        <svg viewBox="0 0 24 24" className="size-6" fill="currentColor" aria-hidden="true">
          <circle cx="6" cy="12" r="1.8" />
          <circle cx="12" cy="12" r="1.8" />
          <circle cx="18" cy="12" r="1.8" />
        </svg>
      </button>
      {/* The grip at the card's trailing edge, as on every card that drags (owner, 2026-10-20:
          "Schedule dragging should be on the right side of the card"). */}
      <Grip label={`Drag ${j.customer}`} ref={setActivatorNodeRef} {...attributes} {...listeners} />
      <Sheet open={actions} onClose={closeActions} title={j.customer}>
        <p className="mb-2 text-[0.9375rem] text-text-muted">
          {[j.number ? `#${j.number}` : null, j.address, j.note].filter(Boolean).join(" · ")}
        </p>
        <Suggestions
          target={{ job: j.id }}
          onPick={(s) => {
            setActions(false);
            onSuggestion(j.id, s);
          }}
          sheetTitle="Suggested Times"
        >
          <button
            type="button"
            className={buttonClass("quiet", "px-2")}
            onClick={() => {
              setActions(false);
              onMove(j);
            }}
          >
            Move…
          </button>
        </Suggestions>
      </Sheet>
    </article>
  );
}

/**
 * "Suggest Times": the places a job fits best in the routes already planned. Picking one
 * calls `onPick`; the job page and New Job use it too.
 */
export function Suggestions({
  target,
  onPick,
  children,
  pickLabel = "Schedule",
  sheetTitle,
}: {
  target: { job?: string; property?: string; hours?: number };
  onPick: (s: Suggestion) => void;
  children?: ReactNode;
  pickLabel?: string;
  /** Show the suggestions in a sheet with this title instead of opening them in place. */
  sheetTitle?: string;
}) {
  const [state, setState] = useState<{ list?: Suggestion[]; note?: string; error?: string } | null>(
    null,
  );
  const [loading, start] = useTransition();
  const id = useId();
  const close = useCallback(() => setState(null), []);
  function load() {
    start(async () => {
      const r = await suggestTimes(target);
      setState({ list: r.suggestions, note: r.note, error: r.error });
    });
  }
  const results = state ? (
    <div id={id} className={cx("space-y-2", !sheetTitle && "mt-2")}>
      {state.error ? <p className="text-[0.9375rem] text-status-fail">{state.error}</p> : null}
      {state.note ? <p className="text-[0.9375rem] text-text-muted">{state.note}</p> : null}
      {state.list?.length ? (
        <ul className={sheetTitle ? "grouped" : "space-y-2"} aria-label="Suggested times">
          {state.list.map((s) => (
            <li
              key={`${s.techId}-${s.date}`}
              className={cx(
                "flex flex-wrap items-center justify-between gap-2",
                sheetTitle ? "px-4 py-2.5" : "well p-2",
              )}
            >
              <span>
                <span className="block font-semibold">
                  {s.dayLabel} · {s.timeLabel} · {s.techName}
                </span>
                <span className="block text-[0.9375rem] text-text-muted">
                  {s.addedDriveMin > 0
                    ? `Adds ${durationLabel(s.addedDriveMin)} of driving`
                    : "Adds no driving"}
                  , {s.near}
                </span>
              </span>
              <Button
                type="button"
                kind="secondary"
                onClick={() => {
                  if (sheetTitle) setState(null);
                  onPick(s);
                }}
                aria-label={`${pickLabel} ${s.dayLabel} at ${s.timeLabel} with ${s.techName}`}
              >
                {pickLabel}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  ) : null;
  return (
    <div>
      <div className="mt-1 -ml-2 flex flex-wrap gap-x-1">
        {sheetTitle ? (
          <button
            type="button"
            className={buttonClass("quiet", "px-2")}
            aria-haspopup="dialog"
            disabled={loading}
            onClick={load}
          >
            {loading ? "Finding Times…" : "Suggest Times"}
          </button>
        ) : (
          <button
            type="button"
            className={buttonClass("quiet", "px-2")}
            aria-expanded={state !== null}
            aria-controls={id}
            disabled={loading}
            onClick={state ? () => setState(null) : load}
          >
            {loading ? "Finding Times…" : state ? "Hide Suggestions" : "Suggest Times"}
          </button>
        )}
        {children}
      </div>
      {sheetTitle ? (
        <Sheet open={state !== null} onClose={close} title={sheetTitle}>
          {results}
        </Sheet>
      ) : (
        results
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Move…: the same as dragging, for phones and anyone who'd rather pick
// ---------------------------------------------------------------------------

function MoveSheet({
  stop,
  from,
  lists,
  techs,
  today,
  onClose,
  onMove,
}: {
  stop: BoardStop;
  from: string;
  lists: Lists;
  techs: { id: string; name: string }[];
  today: string;
  onClose: () => void;
  onMove: (to: string, index: number) => void;
}) {
  const [fromTech, fromDate] = from === TRAY ? ["", today] : from.split("|");
  // With only one person to pick (a tech who sees only their own jobs), it's them.
  const [tech, setTech] = useState(
    techs.length === 1 ? techs[0]!.id : fromTech === "none" ? "" : (fromTech ?? ""),
  );
  const [date, setDate] = useState(fromDate && fromDate >= today ? fromDate : today);
  const key = `${tech || "none"}|${date}`;
  // Only days on this page are known here; other days put the job last.
  const others = (lists[key] ?? []).filter((s) => s.id !== stop.id);
  const known = key in lists;
  const [place, setPlace] = useState(() => {
    const at = (lists[key] ?? []).findIndex((s) => s.id === stop.id);
    return at >= 0 ? at : others.length;
  });
  const ids = useId();
  // iOS form rows: the label on the left, the value on the right.
  const row = "flex min-h-11 items-center justify-between gap-3 px-4 py-1.5";
  const control = "min-h-11 min-w-0 max-w-[60%] bg-transparent text-right text-link";
  return (
    <Sheet open onClose={onClose} title={`Move ${stop.customer}`}>
      <p className="mb-4 text-center text-[0.9375rem] text-text-muted">{stop.address}</p>
      <ul className="grouped">
        <li className={row}>
          <label htmlFor={`${ids}-tech`}>Tech</label>
          <select
            id={`${ids}-tech`}
            value={tech}
            onChange={(e) => setTech(e.target.value)}
            className={control}
          >
            {techs.length > 1 ? <option value="">Nobody yet (waits in Needs a Time)</option> : null}
            {techs.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </li>
        <li className={row}>
          <label htmlFor={`${ids}-day`}>Day</label>
          <input
            id={`${ids}-day`}
            type="date"
            value={date}
            min={today}
            onChange={(e) => setDate(e.target.value)}
            className={control}
          />
        </li>
        {tech && known && others.length ? (
          <li className={row}>
            <label htmlFor={`${ids}-place`}>Place in the route</label>
            <select
              id={`${ids}-place`}
              value={Math.min(place, others.length)}
              onChange={(e) => setPlace(Number(e.target.value))}
              className={control}
            >
              <option value={0}>First stop</option>
              {others.map((s, i) => (
                <option key={s.id} value={i + 1}>
                  After {s.customer}
                  {s.time ? ` (${s.time})` : ""}
                </option>
              ))}
            </select>
          </li>
        ) : null}
      </ul>
      <div className="mt-5 flex flex-col gap-2">
        <Button
          type="button"
          onClick={() => onMove(key, tech && known ? Math.min(place, others.length) : 9_999)}
        >
          Move
        </Button>
        {from !== TRAY ? (
          <Button type="button" kind="secondary" onClick={() => onMove(TRAY, 0)}>
            Take Off Schedule
          </Button>
        ) : null}
      </div>
    </Sheet>
  );
}
