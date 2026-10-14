"use client";

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
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
import { durationLabel, type JobStatus, type LatLng } from "@leakbook/core";
import {
  moveJob,
  planRoute,
  suggestTimes,
  type RouteResult,
  type Suggestion,
} from "@/app/actions/routes";
import { AddressLink, OpenRouteInMaps } from "./open-in-maps";
import { Sheet } from "./sheet";
import { Button, Notice, StatusBadge, buttonClass, cx } from "./ui";

// The schedule as routes (routing, owner request 2026-10-13): each tech's day in order with
// the driving between stops. Drag a job to another place, tech, or day (mouse, touch, or
// keyboard); on a phone, Move… (or a swipe left on the stop) does the same in a sheet. Jobs waiting for a time sit in the
// tray with suggestions that fit them into the routes already planned.

export interface BoardStop {
  id: string;
  number: number | null;
  customer: string;
  address: string;
  location: LatLng | null;
  /** "8:15 AM", or null with no time. */
  time: string | null;
  status: JobStatus;
  /** "Fixed time", "Two techs", "Started": planning keeps it where it is. */
  lock: string | null;
  /** Started jobs stay put. */
  draggable: boolean;
  /** Driving in from the stop before (null: not on a route). */
  legMin: number | null;
  /** Minutes short of that drive. */
  shortMin: number;
  /** Shown on the second tech's route. */
  note?: string | null;
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
}: {
  mode: "day" | "week";
  columns: BoardColumn[];
  tray: TrayJob[];
  techs: { id: string; name: string }[];
  today: string;
  /** Week mode: the days across, as [date, label]. */
  weekDays?: [string, string][];
}) {
  const initial = useMemo(() => {
    const lists: Lists = { [TRAY]: tray };
    for (const c of columns) lists[c.key] = c.stops;
    return lists;
  }, [columns, tray]);
  const [lists, optimistic] = useOptimistic(initial, applyMove);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<RouteResult & { at?: number }>({});
  const [dragging, setDragging] = useState<BoardStop | null>(null);
  const [moving, setMoving] = useState<BoardStop | null>(null);
  const byKey = useMemo(() => new Map(columns.map((c) => [c.key, c])), [columns]);
  // Stable, so the open sheet isn't re-focused each time the board re-renders.
  const closeMove = useCallback(() => setMoving(null), []);
  // A stable id keeps dnd-kit's generated ids the same on the server and in the browser.
  const dndId = useId();

  const sensors = useSensors(
    // Drags start from the grip, which doesn't scroll on touch (touch-none), so the pointer
    // sensor handles fingers too.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const where = (id: string) => Object.keys(lists).find((k) => lists[k]!.some((s) => s.id === id));

  function run(move: Move | null, call: () => Promise<RouteResult>) {
    start(async () => {
      if (move) optimistic(move);
      const r = await call();
      setResult({ ...r, at: Date.now() });
    });
  }

  /** Move a job to a list ("techId|date", "none|date", or the tray) at a place. */
  function moveTo(job: string, to: string, index: number) {
    if (to === TRAY) {
      run({ job, to, index: 0 }, () => moveJob({ job, tech: null, date: null, index: 0 }));
      return;
    }
    const col = byKey.get(to);
    const [tech, date] = to.split("|") as [string, string];
    if (col && !col.open) {
      setResult({ error: "Pick today or a later day.", at: Date.now() });
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
      accessibility={{
        screenReaderInstructions: {
          draggable:
            "To pick up a job, press Space or Enter. Use the arrow keys to move it, Space or Enter to drop it, or Escape to cancel.",
        },
      }}
    >
      <div aria-live="polite" className="mb-4 empty:hidden">
        {pending ? (
          <Notice>Saving…</Notice>
        ) : result.error ? (
          <Notice tone="error">{result.error}</Notice>
        ) : result.message ? (
          <Notice tone="success">{result.message}</Notice>
        ) : null}
      </div>

      <Tray
        jobs={lists[TRAY] ?? []}
        onMove={setMoving}
        onSuggestion={(job, s) => moveTo(job, `${s.techId}|${s.date}`, s.position)}
      />

      {mode === "day" ? (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-5 md:grid-cols-[repeat(2,minmax(0,1fr))] xl:grid-cols-[repeat(3,minmax(0,1fr))]">
          {columns.map((c) => (
            <DayColumn
              key={c.key}
              column={c}
              stops={lists[c.key] ?? []}
              busy={pending}
              onPlan={() => run(null, () => planRoute(c.techId!, c.date))}
              onMove={setMoving}
            />
          ))}
        </div>
      ) : (
        <WeekGrid
          columns={columns}
          lists={lists}
          days={weekDays ?? []}
          today={today}
          onMove={setMoving}
        />
      )}

      <DragOverlay dropAnimation={null}>
        {dragging ? (
          <div className="rounded-2xl bg-surface p-3 shadow-xl ring-2 ring-link">
            <span className="block font-semibold">{dragging.customer}</span>
            <span className="block text-[0.9375rem] text-text-muted">{dragging.address}</span>
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

function DayColumn({
  column: c,
  stops,
  busy,
  onPlan,
  onMove,
}: {
  column: BoardColumn;
  stops: BoardStop[];
  busy: boolean;
  onPlan: () => void;
  onMove: (s: BoardStop) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: c.key, disabled: !c.open });
  const summary =
    c.techId && stops.length
      ? [
          `${stops.length} ${stops.length === 1 ? "stop" : "stops"}`,
          `${durationLabel(c.driveMin)} driving`,
          c.back ? `back by ${c.back}` : null,
        ]
          .filter(Boolean)
          .join(" · ")
      : null;
  return (
    <section
      aria-label={c.title}
      data-testid="route"
      className={cx(
        "card flex flex-col p-4",
        c.phoneHidden && "max-sm:hidden",
        isOver && "ring-2 ring-link",
      )}
    >
      <h2 className="font-display text-xl font-bold">{c.title}</h2>
      {summary ? <p className="text-[0.9375rem] text-text-muted">{summary}</p> : null}
      {c.overtimeMin > 0 ? (
        <p className="mt-1 text-[0.9375rem] font-semibold text-status-warning">
          Runs {durationLabel(c.overtimeMin)} past the end of the day.
        </p>
      ) : null}
      {/* Planning and driving the route are what this card is for: they lead. */}
      {c.techId && stops.length ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {c.open ? (
            <Button
              type="button"
              kind="secondary"
              disabled={busy}
              onClick={onPlan}
              className="px-2"
            >
              Plan Route
            </Button>
          ) : null}
          {c.routeHref ? (
            <OpenRouteInMaps href={c.routeHref} app={c.routeApp} compact className="px-2" />
          ) : null}
        </div>
      ) : null}
      <SortableContext
        id={c.key}
        items={stops.map((s) => s.id)}
        strategy={verticalListSortingStrategy}
      >
        <ol ref={setNodeRef} className="mt-3 min-h-16 flex-1 space-y-1">
          {stops.length === 0 ? (
            <li className="rounded-2xl bg-text/[0.04] p-4 text-center text-text-muted">
              {c.open ? "Nothing scheduled. Drop a job here." : "Nothing scheduled."}
            </li>
          ) : null}
          {stops.map((s) => (
            <li key={s.id}>
              {s.legMin != null && c.techId ? <Leg minutes={s.legMin} short={s.shortMin} /> : null}
              <StopCard stop={s} onMove={onMove} />
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
    <p className="flex items-center gap-2 py-1 pl-3 text-[0.9375rem] text-text-muted">
      <span aria-hidden="true" className="h-4 border-l-2 border-dotted border-text-muted" />
      {durationLabel(minutes)} {label}
      {short > 0 ? (
        <span className="font-semibold text-status-warning">· {durationLabel(short)} late</span>
      ) : null}
    </p>
  );
}

function Grip(props: Record<string, unknown> & { label: string }) {
  const { label, ...rest } = props;
  return (
    <button
      type="button"
      data-grip
      aria-label={label}
      // Phones use Move… instead: dragging inside a scrolling page is fiddly, and the handle's
      // column took width from the address.
      className="grid min-h-11 min-w-11 cursor-grab touch-none place-items-center rounded-md text-text-muted hover:bg-bg active:cursor-grabbing max-sm:hidden"
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
          // Touch only, and not on the drag handle (wider screens).
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

function StopCard({ stop: s, onMove }: { stop: BoardStop; onMove: (s: BoardStop) => void }) {
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
      className={cx("relative overflow-hidden rounded-2xl", isDragging && "opacity-40")}
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
        style={swipe.offset ? { transform: `translateX(${swipe.offset}px)` } : undefined}
        className={cx(
          "well relative flex touch-pan-y gap-1 p-2",
          !swipe.dragging && "transition-transform duration-200 motion-reduce:transition-none",
        )}
      >
        {s.draggable ? (
          <Grip
            label={`Drag ${s.customer}`}
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
          />
        ) : null}
        {/* Stops that can't move (started) have no grip and no gap for one. */}
        <div className={cx("min-w-0 flex-1", !s.draggable && "pl-1", "max-sm:pl-1")}>
          {/* Time, number, and Move… on one row; the badge only when it says more than
              "Scheduled" (most stops on a schedule are). */}
          <div className="flex items-start gap-2">
            <Link href={`/jobs/${s.id}`} className="block min-h-11 min-w-0 flex-1 hover:underline">
              <span className="font-semibold">{s.time ?? "Saving…"}</span>
              <span className="text-text-muted">{s.number ? ` · #${s.number}` : ""}</span>
              <span className="block truncate">{s.customer}</span>
            </Link>
            {s.draggable ? (
              <button
                type="button"
                className={buttonClass("quiet", "-mt-1.5 -mr-1 shrink-0 px-2")}
                onClick={() => onMove(s)}
              >
                Move…
              </button>
            ) : null}
          </div>
          <p className="truncate text-[0.9375rem]">
            <AddressLink address={s.address} location={s.location} />
          </p>
          {s.note ? <p className="text-[0.9375rem] text-text-muted">{s.note}</p> : null}
          {s.status !== "scheduled" || s.lock || !s.location ? (
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
              {s.status !== "scheduled" ? <StatusBadge status={s.status} /> : null}
              {s.lock ? (
                <span className="rounded-full bg-fill px-2.5 py-0.5 text-[0.8125rem] font-semibold">
                  {s.lock}
                </span>
              ) : null}
              {!s.location ? (
                <span className="text-[0.8125rem] text-status-warning">No map location</span>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Week: techs down, days across
// ---------------------------------------------------------------------------

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
        <ul className="min-h-12 space-y-1.5">
          {stops.map((s) => (
            <li key={s.id}>
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
      className={cx("well flex items-start", isDragging && "opacity-40")}
    >
      {s.draggable ? <Grip label={`Drag ${s.customer}`} {...attributes} {...listeners} /> : null}
      <Link
        href={`/jobs/${s.id}`}
        className="min-h-11 min-w-0 flex-1 rounded-xl py-1.5 pr-1.5 hover:underline active:bg-text/[0.06]"
      >
        <span className="block text-[0.9375rem] font-semibold">{s.time ?? "Saving…"}</span>
        <span className="line-clamp-2 block text-[0.9375rem]" title={s.customer}>
          {s.customer}
        </span>
        {s.lock ? <span className="block text-[0.8125rem] text-text-muted">{s.lock}</span> : null}
      </Link>
      {s.draggable ? (
        <button type="button" className="sr-only focus:not-sr-only" onClick={() => onMove(s)}>
          Move…
        </button>
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
  return (
    <section
      ref={setNodeRef}
      aria-labelledby="tray-title"
      data-testid="tray"
      className={cx("card mb-6 p-4", isOver && "ring-2 ring-link")}
    >
      <h2 id="tray-title" className="font-display text-xl font-bold">
        Needs a Time{jobs.length ? ` (${jobs.length})` : ""}
      </h2>
      {jobs.length === 0 ? (
        <p className="mt-1 text-[0.9375rem] text-text-muted">
          Every job has a time. Drag a job here to take it off the schedule.
        </p>
      ) : (
        <SortableContext id={TRAY} items={jobs.map((j) => j.id)} strategy={rectSortingStrategy}>
          {/* Phones: one row that scrolls sideways (the next card peeks in); wider: a grid. */}
          <ul className="-mx-4 mt-3 flex snap-x snap-mandatory scroll-px-4 items-start gap-3 overflow-x-auto px-4 pb-1 md:mx-0 md:grid md:grid-cols-[repeat(2,minmax(0,1fr))] md:overflow-visible md:px-0 md:pb-0 xl:grid-cols-[repeat(3,minmax(0,1fr))]">
            {jobs.map((j) => (
              <li
                key={j.id}
                className="w-[88%] max-w-80 shrink-0 snap-start md:w-auto md:max-w-none"
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
  return (
    <article
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      data-testid="tray-job"
      className={cx("well flex gap-1 p-2", isDragging && "opacity-40")}
    >
      <Grip label={`Drag ${j.customer}`} ref={setActivatorNodeRef} {...attributes} {...listeners} />
      <div className="min-w-0 flex-1">
        <Link href={`/jobs/${j.id}`} className="block hover:underline">
          <span className="font-semibold">{j.customer}</span>
          <span className="text-text-muted">{j.number ? ` · #${j.number}` : ""}</span>
        </Link>
        <p className="truncate text-[0.9375rem] text-text-muted">{j.address}</p>
        {j.note ? <p className="text-[0.9375rem] text-text-muted">{j.note}</p> : null}
        <Suggestions
          target={{ job: j.id }}
          onPick={(s) => onSuggestion(j.id, s)}
          sheetTitle="Suggested Times"
        >
          <button type="button" className={buttonClass("quiet", "px-2")} onClick={() => onMove(j)}>
            Move…
          </button>
        </Suggestions>
      </div>
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
