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
} from "react";
import {
  PLAN_MOVE_CHOICES,
  asksPlanMove,
  backLegLabel,
  directionsHref,
  durationLabel,
  planMovedBanner,
  startLegLabel,
  visitMovedBanner,
  weekday,
  type CleaningKind,
  type JobLock,
  type JobStatus,
  type LatLng,
  type RouteStart,
} from "@leakbook/core";
import { scheduleJob } from "@/app/actions/jobs";
import { setServiceDay, undoServiceDays, type PlanUndo } from "@/app/actions/service-days";
import type { RoutePlanCard } from "@/lib/service-routes";
import {
  CustomersToAdd,
  PLAN_DRAG,
  PlanDrop,
  type PlanDragData,
  type PlanDrops,
} from "./customers-to-add";
import { SideSectionTitle } from "./side-section";
import { TechDot, TechStripe } from "./tech-dot";
import { hasLock, toggleLock } from "@/lib/row-menu";
import { TopScroller } from "./top-scroller";
import { RowActions, RowMenuButton, formOf, type MenuEntry, type SwipeAction } from "./row-actions";
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
import { Sheet, useChoice } from "./sheet";
import { showBanner } from "./top-banner";
import { useFlip } from "./use-flip";
import { Button, StatusBadge, buttonClass, cx, pillClass } from "./ui";
import { NO_CONNECTION, whenOffline } from "@/lib/offline";

type Tech = { id: string; name: string; color?: string | null };

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
  /**
   * Its schedule as the job page's Schedule form holds it (null: no time yet), so Lock Day
   * and Lock Time save through that form's action.
   */
  schedule?: { date: string; time: string; hours: string; tech: string; lock: JobLock } | null;
  /**
   * A maintenance plan's visit (owner, 2026-10-20): moving it to another day or tech asks
   * Change Schedule or Just This Visit. Its plan, its status as core reads it, and whether a
   * Just This Visit already moved it (for Undo).
   */
  plan?: { id: string; status: JobStatus; moved: boolean } | null;
}

export interface BoardColumn {
  /** "techId|date" */
  key: string;
  /** Phones show one person at a time (picked with chips); desktop shows everyone. */
  phoneHidden?: boolean;
  techId: string;
  title: string;
  /** The tech's color (Settings › Team): a dot by their name, a stripe on their cards. */
  color?: string | null;
  date: string;
  /** Where the tech's day starts and ends: their home when they start there, else the shop. */
  start: RouteStart;
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

/**
 * What a stop's swipes and menu do (gestures.md section 12): the same as Move…, Move's Take
 * Off Schedule, and the job page's lock picker.
 */
interface StopActions {
  move: (s: BoardStop) => void;
  takeOff: (s: BoardStop) => void;
  lock: (s: BoardStop, part: "day" | "time") => void;
  /** It waits in Needs a Time (nothing to take off). */
  inTray: (id: string) => boolean;
  /** A drag just ended: the click it ends with doesn't open the job. */
  dragged: () => boolean;
}
const BoardActions = createContext<StopActions | null>(null);

/** A stop's menu: Open, Move…, Lock Day, Lock Time, Take Off Schedule, Directions. */
function stopMenu(s: BoardStop, a: StopActions | null): MenuEntry[] {
  const lock = s.schedule?.lock;
  const canLock = !!a && s.draggable && !!s.schedule;
  return [
    { label: "Open", href: `/jobs/${s.id}` },
    a && s.draggable && { label: "Move…", onSelect: () => a.move(s) },
    canLock && {
      label: hasLock(lock!, "day") ? "Unlock Day" : "Lock Day",
      onSelect: () => a!.lock(s, "day"),
    },
    canLock && {
      label: hasLock(lock!, "time") ? "Unlock Time" : "Lock Time",
      onSelect: () => a!.lock(s, "time"),
    },
    a &&
      s.draggable &&
      !a.inTray(s.id) && { label: "Take Off Schedule", onSelect: () => a.takeOff(s) },
    s.address && {
      label: "Directions",
      href: directionsHref({ address: s.address, location: s.location }),
      external: true,
    },
  ];
}

/** A stop's swipes: Move… to the left; Lock Day and Lock Time to the right. */
function stopSwipes(s: BoardStop, a: StopActions | null) {
  if (!a || !s.draggable) return {};
  const trailing: SwipeAction[] = [{ label: "Move…", tone: "blue", onSelect: () => a.move(s) }];
  const lock = s.schedule?.lock;
  const leading: SwipeAction[] | undefined = s.schedule
    ? [
        {
          label: hasLock(lock!, "day") ? "Unlock Day" : "Lock Day",
          tone: "orange",
          onSelect: () => a.lock(s, "day"),
        },
        {
          label: hasLock(lock!, "time") ? "Unlock Time" : "Lock Time",
          tone: "orange",
          onSelect: () => a.lock(s, "time"),
        },
      ]
    : undefined;
  return { leading, trailing };
}

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
  // A customer to add lands only where the pointer is: a tech's day, never the nearest stop.
  if (String(args.active.id).startsWith(PLAN_DRAG)) return hits;
  return hits.length ? hits : closestCenter(args);
};

/** "Luis is on Tuesdays…": the planned tech's name, or nothing for nobody. */
const nameIn = (techs: Tech[], id: string) => techs.find((t) => t.id === id)?.name ?? "";

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
  plans = null,
}: {
  mode: "day" | "week";
  columns: BoardColumn[];
  /** Needs a Time; null hides it (techs don't see it: owner, 2026-10-18). */
  tray: TrayJob[] | null;
  techs: Tech[];
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
  /**
   * Week, owners and admins: Customers to Add (maintenance plans with no day yet), in the
   * sidebar beside Needs a Time (owner, 2026-10-20: Routes moved into Week).
   */
  plans?: { list: RoutePlanCard[]; workDays: number[] } | null;
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
  const [draggingPlan, setDraggingPlan] = useState<PlanDragData | null>(null);
  const planDrops = useRef<PlanDrops | null>(null);
  const dragEnd = useRef(0);
  const [choose, chooseSheet] = useChoice<"schedule" | "visit">();
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
  /** Week with something to schedule: the sidebar (a tray above the board when narrower). */
  // Day and Week on a computer: Needs a Time (and in Week, Customers to Add) in a sidebar on
  // the left, listed down (owner, 2026-10-21: "needs a time is being moved to the left hand side
  // as a vertical window").
  const side = !!tray || (mode === "week" && !!plans);

  // The board as it is and as it's being dragged: lists that reorder slide into place.
  const board = useRef<HTMLDivElement>(null);
  useFlip(board, !!dragging || !!draggingPlan);

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
      const r = await whenOffline(call(), { error: NO_CONNECTION });
      // Updates after an await join the transition only when wrapped, so the banner shows
      // with the refreshed day, not before it.
      start(() => report(r));
    });
  }

  /** Optimize a tech's day: the button says so at once, and the rest of the page still works. */
  function optimize(techId: string, date: string) {
    setPlanning(`${techId}|${date}`);
    startOptimize(async () => {
      const r = await whenOffline(planRoute(techId, date), { error: NO_CONNECTION });
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
      const from = where(job);
      const stop = from ? lists[from]!.find((s) => s.id === job) : undefined;
      // A plan visit taken off the schedule is always a one-off (owner, 2026-10-20): no
      // question, but it's marked moved so the plan never puts it back; Undo restores both.
      if (stop?.plan && from && from !== TRAY) {
        takeOffPlanVisit(stop, from, null);
        return;
      }
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
    // A maintenance plan's visit going to another day or tech asks first (owner, 2026-10-20).
    const from = where(job);
    const stop = from ? lists[from]!.find((s) => s.id === job) : undefined;
    // Nobody yet: to Needs a Time, a one-off like Take Off Schedule (owner, 2026-10-20).
    if (none && stop?.plan && from && from !== TRAY) {
      takeOffPlanVisit(stop, from, date!);
      return;
    }
    if (!none && stop?.plan && from && from !== TRAY) {
      const [fromTech, fromDate] = from.split("|") as [string, string];
      const asks = asksPlanMove(
        { service_plan_id: stop.plan.id, status: stop.plan.status },
        {
          from: { date: fromDate, techId: fromTech === "none" ? null : fromTech },
          to: { date: date!, techId: tech },
        },
      );
      if (asks) {
        const fromIndex = lists[from]!.findIndex((s) => s.id === job);
        void movePlanVisit(stop, { fromTech, fromDate, fromIndex, tech, date: date!, index });
        return;
      }
    }
    run({ job, to: none ? TRAY : to, index: none ? 0 : index }, () =>
      moveJob({ job, tech: none ? null : tech, date: date!, index }),
    );
  }

  /**
   * "Move <Customer>'s visits?" (owner, 2026-10-20, docs/design/2026-10-20-team-week.md
   * section 5): Change Schedule moves the plan, so every coming visit falls on the new weekday
   * with the new tech; Just This Visit moves only this one and marks it moved. Both have Undo.
   */
  async function movePlanVisit(
    stop: BoardStop,
    m: {
      fromTech: string;
      fromDate: string;
      fromIndex: number;
      tech: string;
      date: string;
      index: number;
    },
  ) {
    const plan = stop.plan!;
    const pick = await choose({
      title: PLAN_MOVE_CHOICES.title(stop.customer),
      choices: [
        { key: "schedule", label: PLAN_MOVE_CHOICES.changeSchedule },
        { key: "visit", label: PLAN_MOVE_CHOICES.justThisVisit },
      ],
    });
    if (!pick) return;
    const placed = { job: stop.id, to: `${m.tech}|${m.date}`, index: m.index };
    if (pick === "schedule") {
      start(async () => {
        optimistic(placed);
        const r = await setServiceDay({
          plan: plan.id,
          from: weekday(m.fromDate),
          to: weekday(m.date),
          tech: m.tech,
        });
        const rows = r.undo;
        start(() =>
          r.error
            ? void showBanner({ tone: "error", message: r.error })
            : void showBanner({
                message: planMovedBanner(stop.customer, weekdayName(m.date), nameIn(techs, m.tech)),
                action: rows?.length
                  ? { label: "Undo", onAction: () => undoSchedule(rows) }
                  : undefined,
              }),
        );
      });
      return;
    }
    start(async () => {
      optimistic(placed);
      const r = await moveJob({
        job: stop.id,
        tech: m.tech,
        date: m.date,
        index: m.index,
        planMoved: true,
      });
      start(() =>
        r.error
          ? void showBanner({ tone: "error", message: r.error })
          : void showBanner({
              tone: r.detail ? "warning" : "success",
              message: visitMovedBanner,
              detail: r.detail,
              action: {
                label: "Undo",
                onAction: () =>
                  run({ job: stop.id, to: `${m.fromTech}|${m.fromDate}`, index: m.fromIndex }, () =>
                    moveJob({
                      job: stop.id,
                      tech: m.fromTech === "none" ? null : m.fromTech,
                      date: m.fromDate,
                      index: m.fromIndex,
                      planMoved: plan.moved,
                    }),
                  ),
              },
            }),
      );
    });
  }

  /**
   * A plan visit to Needs a Time, marked moved, with Undo putting both back: off the schedule
   * (`date` null), or with nobody on it, keeping its time on `date`.
   */
  function takeOffPlanVisit(stop: BoardStop, from: string, date: string | null) {
    const plan = stop.plan!;
    const [fromTech, fromDate] = from.split("|") as [string, string];
    const fromIndex = lists[from]!.findIndex((s) => s.id === stop.id);
    start(async () => {
      optimistic({ job: stop.id, to: TRAY, index: 0 });
      const r = await moveJob({ job: stop.id, tech: null, date, index: 0, planMoved: true });
      start(() =>
        r.error
          ? void showBanner({ tone: "error", message: r.error })
          : void showBanner({
              message: r.message ?? "Taken off the schedule.",
              action: {
                label: "Undo",
                onAction: () =>
                  run({ job: stop.id, to: from, index: fromIndex }, () =>
                    moveJob({
                      job: stop.id,
                      tech: fromTech === "none" ? null : fromTech,
                      date: fromDate,
                      index: fromIndex,
                      planMoved: plan.moved,
                    }),
                  ),
              },
            }),
      );
    });
  }

  function undoSchedule(rows: PlanUndo[]) {
    start(async () => {
      const r = await undoServiceDays(rows);
      start(() =>
        r.error
          ? void showBanner({ tone: "error", message: r.error })
          : void showBanner({ message: r.message ?? "Put back as it was." }),
      );
    });
  }

  /** Lock Day or Lock Time: the job page's Schedule form, saved with the lock changed. */
  function lock(stop: BoardStop, part: "day" | "time") {
    const sch = stop.schedule;
    if (!sch) return;
    const next = toggleLock(sch.lock, part);
    const on = hasLock(next, part);
    start(async () => {
      const r = await scheduleJob(
        {},
        formOf({
          job: stop.id,
          date: sch.date,
          time: sch.time,
          hours: sch.hours,
          tech: sch.tech,
          lock: next,
        }),
      );
      const error = r.error ?? Object.values(r.fields ?? {})[0];
      start(() =>
        report(
          error
            ? { error }
            : { message: `${part === "day" ? "Day" : "Time"} ${on ? "locked" : "unlocked"}.` },
        ),
      );
    });
  }
  const actions: StopActions = {
    move: setMoving,
    takeOff: (stop) => moveTo(stop.id, TRAY, 0),
    lock,
    inTray: (id) => (lists[TRAY] ?? []).some((x) => x.id === id),
    dragged: () => Date.now() - dragEnd.current < 400,
  };

  function onDragStart(e: DragStartEvent) {
    const id = String(e.active.id);
    if (id.startsWith(PLAN_DRAG)) {
      setDraggingPlan((e.active.data.current as PlanDragData | undefined) ?? null);
      return;
    }
    setDragging(
      Object.values(lists)
        .flat()
        .find((s) => s.id === id) ?? null,
    );
  }

  function onDragEnd(e: DragEndEvent) {
    setDragging(null);
    setDraggingPlan(null);
    dragEnd.current = Date.now();
    const id = String(e.active.id);
    const over = e.over ? String(e.over.id) : null;
    if (id.startsWith(PLAN_DRAG)) {
      // Touch and hold without moving: the customer's menu, as iOS lifts an item to show it.
      const touch = typeof TouchEvent !== "undefined" && e.activatorEvent instanceof TouchEvent;
      if (touch && Math.hypot(e.delta.x, e.delta.y) < 8) return planDrops.current?.hold(id);
      const key = over ? (over in lists ? over : where(over)) : null;
      if (!key || key === TRAY) return;
      const col = byKey.get(key);
      const [tech, date] = key.split("|") as [string, string];
      if (!col || tech === "none") return;
      if (!col.open) return report({ error: "Pick today or a later day." });
      planDrops.current?.drop(id.slice(PLAN_DRAG.length), tech, date);
      return;
    }
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
      onDragCancel={() => {
        setDragging(null);
        setDraggingPlan(null);
      }}
      autoScroll={{ threshold: { x: 0.2, y: 0.15 }, acceleration: 12 }}
      accessibility={{
        screenReaderInstructions: {
          draggable:
            "To pick up a job, press Space or Enter. Use the arrow keys to move it, Space or Enter to drop it, or Escape to cancel.",
        },
      }}
    >
      <BoardActions value={actions}>
        <PlanDrop value={planDrops}>
          <div
            ref={board}
            // Day and Week on a computer or iPad (≥ 1024 pt): a 280 pt sidebar on the left with
            // Needs a Time, then Customers to Add, scrolling on its own, and the board to its
            // right (owner, 2026-10-20: where you pick and drag from, as in Mail and Calendar).
            // DayLead shows on phones only, so the grid holds the sidebar and the board.
            className={cx(
              side && "lg:grid lg:grid-cols-[280px_minmax(0,1fr)] lg:items-start lg:gap-5",
            )}
          >
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

            {side ? (
              <aside
                aria-label="To schedule"
                data-testid="week-sidebar"
                className="mb-5 space-y-4 lg:sticky lg:top-4 lg:mb-0 lg:max-h-[calc(100dvh-2rem)] lg:overflow-y-auto lg:overscroll-contain lg:pb-1"
              >
                {tray ? (
                  <Tray
                    side
                    jobs={lists[TRAY] ?? []}
                    onMove={setMoving}
                    onSuggestion={(job, s) => moveTo(job, `${s.techId}|${s.date}`, s.position)}
                  />
                ) : null}
                {plans && mode === "week" ? (
                  <CustomersToAdd
                    variant="sidebar"
                    plans={plans.list}
                    techs={techs}
                    workDays={plans.workDays}
                  />
                ) : null}
              </aside>
            ) : tray ? (
              <Tray
                jobs={lists[TRAY] ?? []}
                onMove={setMoving}
                onSuggestion={(job, s) => moveTo(job, `${s.techId}|${s.date}`, s.position)}
              />
            ) : null}

            {mode === "day" ? (
              // On a computer or tablet the techs sit side by side in one row that slides
              // sideways (owner, 2026-10-21: "make the techs slide horizontally instead of
              // doing multiple rows"); on phones they stack.
              <TopScroller
                data-testid="day-columns"
                className="grid grid-cols-[minmax(0,1fr)] gap-5 md:-mx-1 md:flex md:snap-x md:snap-proximity md:scroll-px-1 md:items-start md:overflow-x-auto md:overscroll-x-contain md:px-1 md:pb-2 md:[scrollbar-width:thin] md:[&>*]:w-[22rem] md:[&>*]:shrink-0 md:[&>*]:snap-start"
              >
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
              </TopScroller>
            ) : (
              <div className="min-w-0">
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
                  workDates={workDates}
                  today={today}
                  onMove={setMoving}
                  optimizingKey={optimizingKey}
                  busy={optimizing}
                  onPlan={optimize}
                />
              </div>
            )}
          </div>
        </PlanDrop>
      </BoardActions>

      <DragOverlay dropAnimation={null}>
        {draggingPlan ? (
          <div className="card max-w-72 px-4 py-2.5 shadow-xl ring-2 ring-link">
            <span className="block truncate font-semibold">{draggingPlan.customer}</span>
            <span className="block truncate text-[0.9375rem] text-text-muted">
              {draggingPlan.address}
            </span>
          </div>
        ) : dragging ? (
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
      {chooseSheet}
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

/** "4 stops · 1 hr 29 min driving" (no clock times: owner, 2026-10-21). */
function daySummary(c: BoardColumn, stops: BoardStop[]): string | null {
  if (!c.techId || !stops.length) return null;
  return [
    `${stops.length} ${stops.length === 1 ? "stop" : "stops"}`,
    `${durationLabel(c.driveMin)} driving`,
    // Someone who starts from home: their day's driving is counted from there.
    c.start.label === "home" ? startLegLabel("home") : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function DayFacts({ column: c, stops }: { column: BoardColumn; stops: BoardStop[] }) {
  const summary = daySummary(c, stops);
  return <>{summary ? <p className="text-[0.9375rem] text-text-muted">{summary}</p> : null}</>;
}

/** Optimize and the day in the maps app: what a tech's day is for, so they lead. */
function DayButtons({ column: c, stops, busy, optimizing = false, onPlan }: DayHeaderProps) {
  if (!c.techId || !stops.length) return null;
  // Two side by side; with large text (the column under 14 of its letters wide) one above the
  // other, so neither label runs past its pill.
  return (
    <div className="mt-3 @container">
      <div className="grid grid-cols-1 gap-2 @min-[14em]:grid-cols-2">
        {c.open ? (
          <OptimizeButton
            optimizing={optimizing}
            disabled={busy}
            onClick={onPlan}
            className="px-2"
          />
        ) : null}
        {c.routeHref ? (
          <OpenRouteInMaps href={c.routeHref} app={c.routeApp} compact className="px-2" />
        ) : null}
      </div>
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
    maps && stops.length
      ? dayMap({ stops, depot: c.start.at, startLabel: c.start.label, date: c.date, today })
      : null;
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
      <h2 className="flex items-center gap-2 font-display text-xl font-bold">
        <TechDot color={c.color} />
        {c.title}
      </h2>
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
                <Leg minutes={s.legMin} label={i === 0 ? startLegLabel(c.start.label) : "drive"} />
              ) : null}
              <StopCard stop={s} position={i + 1} onMove={onMove} color={c.color} />
            </li>
          ))}
          {c.techId && stops.length && c.backLegMin != null ? (
            <li>
              <Leg minutes={c.backLegMin} label={backLegLabel(c.start.label)} />
            </li>
          ) : null}
        </ol>
      </SortableContext>
    </section>
  );
}

function Leg({ minutes, label = "drive" }: { minutes: number; label?: string }) {
  return (
    // Today's connector between stops: a dotted line and the drive.
    // Tighter beside desktop's one-line cards, so about 12 stops fit on a day.
    <p className="flex items-center gap-2 py-0.5 pl-4 text-[0.9375rem] text-text-muted lg:py-0 lg:pl-3 lg:text-[0.8125rem]">
      <span aria-hidden="true" className="h-4 border-l-2 border-dotted border-text-muted lg:h-3" />
      {durationLabel(minutes)} {label}
    </p>
  );
}

export function Grip(
  props: Record<string, unknown> & { label: string; className?: string; compact?: boolean },
) {
  const { label, className, compact = false, ...rest } = props;
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
        "grid shrink-0 cursor-grab touch-none place-items-center rounded-full text-text-muted select-none [-webkit-touch-callout:none] hover:bg-text/[0.06] active:cursor-grabbing active:bg-link/10 active:text-link",
        // Desktop's one-line cards: a pointer target the card's height (the whole card drags).
        compact ? "h-8 w-7" : "size-11",
        className,
      )}
      {...rest}
    >
      <svg
        viewBox="0 0 24 24"
        className={compact ? "size-4" : "size-5"}
        fill="currentColor"
        aria-hidden="true"
      >
        {[6, 12, 18].map((y) =>
          [9, 15].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.6" />),
        )}
      </svg>
    </button>
  );
}

/** Done for the day: the report, quote, or invoice is under way or finished. */
function finished(status: JobStatus) {
  return !["unscheduled", "scheduled", "in_progress", "canceled"].includes(status);
}

/** The stop's place in the route, round, as on Today: a check once done, blue while on it. */
function StopBadge({
  position,
  status,
  small = false,
}: {
  position: number;
  status: JobStatus;
  /** Desktop's one-line cards. */
  small?: boolean;
}) {
  const done = finished(status);
  return (
    <span
      aria-hidden="true"
      className={cx(
        "grid shrink-0 place-items-center rounded-full font-display font-bold",
        small ? "size-6 text-[0.8125rem]" : "mt-1 size-8",
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
          className={small ? "size-3.5" : "size-4"}
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
  color,
}: {
  stop: BoardStop;
  position: number;
  onMove: (s: BoardStop) => void;
  /** Whose route it's on: a stripe on the card's leading edge. */
  color?: string | null;
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
  const actions = use(BoardActions);
  return (
    <article
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      data-testid="stop"
      aria-label={`${s.time ?? "No time"}, ${s.customer}`}
      className={cx("card relative overflow-hidden lg:rounded-xl", isDragging && "opacity-40")}
    >
      <CompactCard
        stop={s}
        position={position}
        color={color}
        listeners={listeners}
        attributes={attributes}
      />
      {/* Swipe left for Move…, right for the locks; touch and hold or right-click for the
          menu (gestures.md section 12). The visible Move… does the same for everyone else.
          Computers get the one-line card above instead. */}
      <RowActions
        title={`${s.customer}${s.number ? ` · Job #${s.number}` : ""}`}
        menu={stopMenu(s, actions)}
        {...stopSwipes(s, actions)}
        swipeClassName="rounded-[1.25rem]"
        // Over the card's bottom corner, under Move… and the grip.
        buttonClassName="absolute right-1.5 bottom-1.5"
        className="rounded-[1.25rem] lg:hidden"
      >
        <div
          className={cx(
            "relative flex items-start gap-2 rounded-[1.25rem] bg-surface py-1.5 pl-3.5",
            s.draggable ? "pr-1" : "pr-3",
          )}
        >
          {color ? <TechStripe color={color} /> : null}
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
      </RowActions>
    </article>
  );
}

/**
 * A stop on a computer (≥ 1024 pt; owner, 2026-10-20: "the schedule cards are still way too
 * big"): one line, 36 pt tall, so about 12 stops fit on a day. The tech's color stripe, the stop
 * number, the customer in 15 pt semibold and the kind of visit in 13 pt, the lock and
 * not-on-map symbols, and the grip. Hovering shows the address and time; a click opens the job;
 * it drags from anywhere on the card, the grip included. Right-click for its menu.
 */
function CompactCard({
  stop: s,
  position,
  color,
  listeners,
  attributes,
  week = false,
}: {
  stop: BoardStop;
  /** Its place in the day; null in a week cell, which lists by time. */
  position: number | null;
  color?: string | null;
  /**
   * In a week cell (about 10 rem): the customer's name takes the whole line (owner,
   * 2026-10-21: the name was squeezed to nothing). The kind of visit moves to the tooltip and
   * the screen reader, and "⋯" floats over the line's end on hover instead of keeping a place.
   */
  week?: boolean;
  listeners: ReturnType<typeof useSortable>["listeners"];
  attributes: ReturnType<typeof useSortable>["attributes"];
}) {
  const actions = use(BoardActions);
  // In a week cell "Two techs" goes with the kind of visit: into the tooltip and the screen
  // reader, leaving the line to the name. Lock icons stay.
  const twoTechs = week && s.lock?.kind === "two_techs" ? s.lock.label : null;
  const hint = [s.time, week ? s.tag : null, twoTechs, s.address].filter(Boolean).join(" · ");
  return (
    <RowActions
      title={`${s.customer}${s.number ? ` · Job #${s.number}` : ""}`}
      menu={stopMenu(s, actions)}
      // "⋯" in its own place before the grip, shown on hover and keyboard focus: over the
      // card it covered the name in a narrow week cell.
      button="none"
      className="rounded-xl max-lg:hidden"
    >
      <div
        {...(s.draggable ? listeners : {})}
        title={hint || undefined}
        data-testid="stop-line"
        // A drag that ends on the card isn't a click on it.
        onClickCapture={(e) => {
          if (actions?.dragged()) {
            e.preventDefault();
            e.stopPropagation();
          }
        }}
        className={cx(
          "relative flex items-center gap-1.5 rounded-xl bg-surface pr-0.5 pl-2.5 select-none",
          // A long name takes a second line in a week cell rather than being cut off.
          week ? "min-h-9 py-1" : "h-9",
          s.draggable && "cursor-grab active:cursor-grabbing",
        )}
      >
        {color ? <TechStripe color={color} /> : null}
        {position != null ? (
          <StopBadge position={position} status={s.status} small />
        ) : s.time ? (
          <span className="shrink-0 text-[0.8125rem] font-semibold text-text-muted tabular-nums">
            {s.time.replace(/\s?(AM|PM)$/, "")}
          </span>
        ) : null}
        <Link
          href={`/jobs/${s.id}`}
          draggable={false}
          className={cx(
            "flex min-w-0 flex-1 items-baseline gap-1.5 hover:underline",
            finished(s.status) && "opacity-70",
          )}
        >
          <span
            className={cx(
              "text-[0.9375rem] font-semibold text-link",
              // On Day the name keeps its width and the kind of visit gives way first.
              week
                ? "line-clamp-2 min-w-0 flex-1 leading-tight break-words"
                : "max-w-full shrink-0 truncate",
            )}
          >
            {s.customer}
          </span>
          {week ? null : (
            <span className="min-w-0 truncate text-[0.8125rem] text-text-muted">{s.tag}</span>
          )}
          <span className="sr-only">
            {week ? `, ${s.tag}` : ""}
            {twoTechs ? `, ${twoTechs}` : ""}
            {s.time ? `, ${s.time}` : ""}
            {s.address ? `, ${s.address}` : ""}
          </span>
        </Link>
        {s.lock && !twoTechs ? (
          <LockTag lock={s.lock} className="shrink-0 whitespace-nowrap" />
        ) : null}
        {s.notOnMap || !s.location ? <NotOnMapTag /> : null}
        <RowMenuButton
          className={
            week
              ? cx("absolute top-1/2 -translate-y-1/2 size-7!", s.draggable ? "right-6" : "right-1")
              : "shrink-0 size-7!"
          }
        />
        {s.draggable ? (
          <Grip
            compact
            label={`Drag ${s.customer}`}
            className={week ? "w-5!" : undefined}
            {...attributes}
            {...listeners}
          />
        ) : null}
      </div>
    </RowActions>
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
  const colors = new Map(columns.map((c) => [c.techId, c.color]));
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
          {maps ? (techs.length > 1 ? "Maps" : `${name}’s Maps`) : "This Week"}
        </h2>
        {planDates ? (
          <PlanWeek
            dates={planDates}
            waiting={planWaiting}
            techs={techs.map(([id, title]) => ({ id, name: title, color: colors.get(id) }))}
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
              className={pillClass(id === tech, "gap-2")}
            >
              <TechDot
                color={colors.get(id)}
                className={cx(id === tech && "ring-2 ring-white/90")}
              />
              {title}
            </button>
          ))}
        </nav>
      ) : null}
      {maps && tech ? (
        // One row (owner, 2026-10-21: Friday wrapped onto a line of its own): the work days fit
        // across a computer's window, and slide sideways, with a scrollbar on top too, when
        // they don't. At least five places, so a short week's maps don't stretch.
        <TopScroller
          data-testid="week-maps"
          className="-m-1 overflow-x-auto overscroll-x-contain p-1 [scrollbar-width:thin]"
        >
          <ol
            className="grid gap-3"
            style={{
              gridTemplateColumns: `repeat(${Math.max(shown.length, 5)}, minmax(10.5rem, 1fr))`,
            }}
          >
            {shown.map(([d]) => {
              const key = `${tech}|${d}`;
              const col = columns.find((c) => c.key === key);
              const stops = lists[key] ?? [];
              const start = col?.start ?? { at: maps.depot, label: "shop" as const };
              const map = dayMap({
                stops,
                depot: start.at,
                startLabel: start.label,
                date: d,
                today,
              });
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
                      {stops.length
                        ? `${stops.length} ${stops.length === 1 ? "stop" : "stops"}`
                        : ""}
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
        </TopScroller>
      ) : null}
    </section>
  );
}

function WeekGrid({
  columns,
  lists,
  days,
  workDates,
  today,
  onMove,
  optimizingKey,
  busy,
  onPlan,
}: {
  columns: BoardColumn[];
  lists: Lists;
  days: [string, string][];
  /** The shop's work days; a day off with nothing on it is a narrow column. */
  workDates: string[];
  today: string;
  onMove: (s: BoardStop) => void;
  optimizingKey: string | null;
  busy: boolean;
  onPlan: (techId: string, date: string) => void;
}) {
  const rows = [...new Map(columns.map((c) => [c.techId, c])).values()];
  /**
   * The day's "⋯" menu (owner, 2026-10-20: "you can't optimize" on Routes): Optimize each
   * tech's route that day, and Open Day.
   */
  const dayMenu = (d: string): MenuEntry[] => {
    const open = rows
      .map((r) => columns.find((c) => c.key === `${r.techId}|${d}`))
      .filter((c): c is BoardColumn => !!c && c.open && (lists[c.key] ?? []).length > 0);
    return [
      // While a day is optimizing, Optimize waits (hidden, not dimmed: context-menus.md).
      ...(busy ? [] : open).map((c) => ({
        label: rows.length > 1 ? `Optimize ${c.title}’s Route` : "Optimize Route",
        onSelect: () => onPlan(c.techId, d),
      })),
      "separator",
      { label: "Open Day", href: `/schedule?view=day&date=${d}` },
    ];
  };
  // Each day at least 10.5 rem, so a stop's name reads (owner, 2026-10-21); a day off with
  // nothing on it is 4.5 rem. When they don't all fit, the table slides sideways, with a
  // second scrollbar on top, as on Day.
  const narrow = new Set(
    days
      .map(([d]) => d)
      .filter(
        (d) =>
          !workDates.includes(d) &&
          d !== today &&
          rows.every((r) => !(lists[`${r.techId ?? "none"}|${d}`] ?? []).length),
      ),
  );
  const TECH_REM = 7;
  const DAY_REM = 10.5;
  const NARROW_REM = 4.5;
  const minRem = TECH_REM + days.reduce((n, [d]) => n + (narrow.has(d) ? NARROW_REM : DAY_REM), 0);
  return (
    <TopScroller
      data-testid="week-grid"
      // relative: the screen-reader-only Move buttons are positioned, and would otherwise
      // widen the page past this scroller on a narrow window (or at 200% zoom).
      className="card relative overflow-x-auto overscroll-x-contain [scrollbar-width:thin]"
    >
      <table className="w-full table-fixed text-left" style={{ minWidth: `${minRem}rem` }}>
        {/* Days with no width share what's left equally. */}
        <colgroup>
          <col style={{ width: `${TECH_REM}rem` }} />
          {days.map(([d]) => (
            <col key={d} style={narrow.has(d) ? { width: `${NARROW_REM}rem` } : undefined} />
          ))}
        </colgroup>
        <thead className="border-b border-border">
          <tr>
            <th
              scope="col"
              className="sticky left-0 z-10 bg-surface px-3 py-2 font-medium text-text-muted"
            >
              Tech
            </th>
            {days.map(([d, label]) => (
              <th
                key={d}
                scope="col"
                className={cx(
                  "px-1.5 py-1 font-medium",
                  d === today ? "text-link" : "text-text-muted",
                )}
              >
                <RowActions
                  title={weekdayName(d)}
                  menu={dayMenu(d)}
                  button="none"
                  className="flex items-center gap-1"
                >
                  <Link
                    href={`/schedule?view=day&date=${d}`}
                    aria-current={d === today ? "date" : undefined}
                    title={narrow.has(d) ? label : undefined}
                    className="min-w-0 truncate py-1.5 underline-offset-4 hover:underline"
                  >
                    {/* A narrow day off: its short name ("Sat"); the full date in the title. */}
                    {narrow.has(d) ? (
                      <>
                        <span aria-hidden="true">{label.split(",")[0]}</span>
                        <span className="sr-only">{label}</span>
                      </>
                    ) : (
                      label
                    )}
                    {d === today ? " · Today" : ""}
                  </Link>
                  {optimizingKey?.endsWith(`|${d}`) ? (
                    <span
                      role="status"
                      aria-label="Optimizing…"
                      className="size-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none"
                    />
                  ) : null}
                  {/* A narrow day off has nothing to optimize; its name opens the day. */}
                  {narrow.has(d) ? null : (
                    <RowMenuButton
                      visible
                      className="ml-auto grid size-8 shrink-0 place-items-center rounded-full text-link hover:bg-link/10 aria-expanded:bg-link/10"
                    />
                  )}
                </RowActions>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.techId ?? "none"} className="border-b border-border align-top last:border-0">
              {/* The tech stays in view while the days slide sideways. */}
              <th
                scope="row"
                className="sticky left-0 z-10 bg-surface py-2 pr-1.5 pl-3 font-semibold"
              >
                <span className="flex items-center gap-2">
                  <TechDot color={r.color} />
                  <span className="min-w-0 break-words">{r.title}</span>
                </span>
              </th>
              {days.map(([d]) => {
                const key = `${r.techId ?? "none"}|${d}`;
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
    </TopScroller>
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
        <ul data-flip-list={c.key} className="min-h-12 space-y-1.5 lg:space-y-1">
          {stops.map((s, i) => (
            <li key={s.id} data-flip={s.id}>
              <WeekChip stop={s} position={i + 1} color={c.color} onMove={onMove} />
            </li>
          ))}
        </ul>
      </SortableContext>
      {c.techId && stops.length ? (
        <p className="mt-1 px-1 text-[0.8125rem] text-text-muted">
          {durationLabel(c.driveMin)} driving
          {c.start.label === "home" ? ` · ${startLegLabel("home")}` : null}
        </p>
      ) : null}
    </td>
  );
}

/**
 * A stop in a week cell: the time, the customer, and the kind of visit, as a small card. The
 * grip sits beside the time, so the name gets the cell's whole width.
 */
function WeekChip({
  stop: s,
  position,
  color,
  onMove,
}: {
  stop: BoardStop;
  position: number;
  color?: string | null;
  onMove: (s: BoardStop) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: s.id,
    disabled: !s.draggable,
  });
  const actions = use(BoardActions);
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      data-testid="stop"
      className={cx(
        "well relative overflow-hidden lg:rounded-xl lg:bg-transparent",
        isDragging && "opacity-40",
      )}
    >
      <CompactCard
        stop={s}
        position={position}
        color={color}
        listeners={listeners}
        attributes={attributes}
        week
      />
      {/* Touch and hold or right-click for the stop's menu (gestures.md section 12); no swipes
          in the week's small cells. */}
      <RowActions
        title={`${s.customer}${s.number ? ` · Job #${s.number}` : ""}`}
        menu={stopMenu(s, actions)}
        buttonClassName="absolute right-0.5 bottom-0.5"
        className="rounded-[inherit] lg:hidden"
      >
        {color ? <TechStripe color={color} /> : null}
        <Link
          href={`/jobs/${s.id}`}
          className={cx(
            "block min-h-11 rounded-2xl pr-2 pb-2 pl-3 active:bg-text/[0.06]",
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
          <span
            className="mt-0.5 line-clamp-1 block text-[0.8125rem] text-text-muted"
            title={s.tag}
          >
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
      </RowActions>
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
  side = false,
}: {
  jobs: BoardStop[];
  onMove: (s: BoardStop) => void;
  onSuggestion: (job: string, s: Suggestion) => void;
  /** In Week's sidebar: listed down on wide screens (a row above the board when narrower). */
  side?: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: TRAY });
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState(true);
  const listId = useId();
  return (
    <section
      ref={setNodeRef}
      aria-label="Needs a Time"
      data-testid="tray"
      className={cx("card p-4", side ? "lg:p-3" : "mb-6", isOver && "ring-2 ring-link")}
    >
      <SideSectionTitle
        id={listId}
        title="Needs a Time"
        count={jobs.length}
        open={open}
        onToggle={() => setOpen((o) => !o)}
        action={
          jobs.length > 3 ? (
            <button
              type="button"
              aria-expanded={all}
              onClick={() => setAll((a) => !a)}
              className={cx(
                "-mr-2 min-h-11 shrink-0 px-3 text-[0.9375rem] font-semibold text-link max-md:hidden",
                side && "lg:hidden",
              )}
            >
              {all ? "Show Less" : `Show All ${jobs.length}`}
            </button>
          ) : null
        }
      />
      <div id={listId} hidden={!open}>
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
                side &&
                  "lg:mx-0 lg:mt-2 lg:block lg:space-y-1.5 lg:overflow-visible lg:px-0 lg:pb-0",
              )}
            >
              {jobs.map((j) => (
                <li
                  key={j.id}
                  data-flip={j.id}
                  className={cx(
                    "w-[88%] max-w-80 shrink-0 snap-start",
                    all && "md:w-auto md:max-w-none",
                    side && "lg:w-auto lg:max-w-none",
                  )}
                >
                  <TrayCard job={j} onMove={onMove} onSuggestion={onSuggestion} />
                </li>
              ))}
            </ul>
          </SortableContext>
        )}
      </div>
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
  const [sheetOpen, setActions] = useState(false);
  const closeActions = useCallback(() => setActions(false), []);
  const actions = use(BoardActions);
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
      {/* Touch and hold or right-click for the job's menu (gestures.md section 12); its "…"
          button keeps Suggest Times and Move…. No swipes: the list scrolls sideways. */}
      <RowActions
        title={`${j.customer}${j.number ? ` · Job #${j.number}` : ""}`}
        menu={stopMenu(j, actions)}
        button="none"
        className="flex min-w-0 flex-1 items-center gap-1"
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
        <Grip
          label={`Drag ${j.customer}`}
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
        />
      </RowActions>
      <Sheet open={sheetOpen} onClose={closeActions} title={j.customer}>
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
      const r = await whenOffline(suggestTimes(target), { error: NO_CONNECTION });
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
  techs: Tech[];
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
  const techControl = "min-h-11 min-w-0 max-w-full bg-transparent text-right text-link";
  return (
    <Sheet open onClose={onClose} title={`Move ${stop.customer}`}>
      <p className="mb-4 text-center text-[0.9375rem] text-text-muted">{stop.address}</p>
      <ul className="grouped">
        <li className={row}>
          <label htmlFor={`${ids}-tech`}>Tech</label>
          {/* The chosen tech's dot beside the picker (a select can't show one in its list). */}
          <span className="ml-auto flex min-w-0 max-w-[65%] items-center gap-2">
            {tech ? <TechDot color={techs.find((t) => t.id === tech)?.color} /> : null}
            <select
              id={`${ids}-tech`}
              value={tech}
              onChange={(e) => setTech(e.target.value)}
              className={techControl}
            >
              {techs.length > 1 ? (
                <option value="">Nobody yet (waits in Needs a Time)</option>
              ) : null}
              {techs.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </span>
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
          <li className={cx(row, "py-2.5")}>
            <label htmlFor={`${ids}-place`} className="shrink-0">
              Place in the route
            </label>
            {/* A select can't wrap its value, so the chosen place is shown as text that wraps
                (the row grows to fit "After Lebron James (8:00 AM)"), with the select over it
                to pick (owner, 2026-10-20: "Make place in the route taller"). */}
            <span className="relative min-w-0 flex-1 rounded-md text-right text-link has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-link">
              <span aria-hidden="true" className="block leading-snug break-words">
                {(() => {
                  const at = Math.min(place, others.length);
                  const s = at > 0 ? others[at - 1] : null;
                  return s ? `After ${s.customer}${s.time ? ` (${s.time})` : ""}` : "First stop";
                })()}
              </span>
              <select
                id={`${ids}-place`}
                value={Math.min(place, others.length)}
                onChange={(e) => setPlace(Number(e.target.value))}
                className="absolute inset-0 size-full cursor-pointer appearance-none opacity-0"
              >
                <option value={0}>First stop</option>
                {others.map((s, i) => (
                  <option key={s.id} value={i + 1}>
                    After {s.customer}
                    {s.time ? ` (${s.time})` : ""}
                  </option>
                ))}
              </select>
            </span>
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
