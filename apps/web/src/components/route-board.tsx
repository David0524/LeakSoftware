"use client";

import { SamplePill } from "./sample-pill";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  pointerWithin,
  rectIntersection,
  useDndContext,
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
  useSyncExternalStore,
  useId,
  useMemo,
  useOptimistic,
  useRef,
  useState,
  useTransition,
  type ReactNode,
  type Ref,
} from "react";
import {
  PLAN_MOVE_CHOICES,
  asksPlanMove,
  directionsHref,
  durationLabel,
  formatDay,
  JOB_STATUS_LABELS,
  planMovedBanner,
  SCHEDULE_DRAG,
  startLegLabel,
  visitMovedBanner,
  weekday,
  formatTime,
  type CleaningKind,
  type JobChange,
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
import {
  RowActions,
  RowMenuButton,
  formOf,
  type MenuEntry,
  type RowActionsHandle,
} from "./row-actions";
import { DayMap } from "./day-map";
import { CleaningIcon, HouseFillIcon } from "./icons";
import { DriveChip } from "./drive-chip";
import { driveChipMinutes, driveFromOffMap, driveHomeLine } from "@/lib/schedule-tile";
import { LockTag } from "./lock-tag";
import { PlanWeek, type PlanWeekPreview } from "./plan-week";
import { dayMap, weekdayName } from "@/lib/day-map";
import { NotOnMapTag } from "./not-on-map";
import {
  moveJob,
  planRoute,
  suggestTimes,
  undoPlanRoute,
  type OptimizeResult,
  type RouteResult,
  type Suggestion,
} from "@/app/actions/routes";
import {
  previewDay,
  previewWeek,
  relayout,
  type Placed,
  type PreviewContext,
  type PreviewJob,
} from "@/lib/schedule-preview";
import { OpenRouteInMaps } from "./open-in-maps";
import { Sheet, useChoice, useConfirm } from "./sheet";
import { Segmented } from "./segmented";
import { showBanner } from "./top-banner";
import { useFlip } from "./use-flip";
import { reducedMotion } from "./row-slide";

// Reordering stops as smoothly as Reorder Techs (owner, 2026-10-21): the order changes at once
// (useOptimistic), the stops in the way slide aside while one is dragged, and the dropped card
// glides into its place. Reduce Motion: no slides.
const SORT_SLIDE = { duration: 300, easing: "cubic-bezier(0.22, 1, 0.36, 1)" };
const DROP_SLIDE = { duration: 250, easing: "cubic-bezier(0.22, 1, 0.36, 1)" };

/** Whether a press began on a schedule card's grip (≡). */
const onGrip = (e: Event) => !!(e.target as Element | null)?.closest?.("[data-grip]");

// A schedule card drags from its grip, by any pointer (owner, 2026-10-21: "I'm still
// struggling to scroll when I have a page full of job tiles"): a mouse or a pen at once
// (GripSensor); a finger once it has rested there briefly (FingerSensor), so a flick that starts
// on the grip scrolls the page (owner, 2026-10-22: "make it slightly less sensitive"). A finger
// on a card's body drags only after a hold, so a page of cards always scrolls. The pointer sensor
// listens on the document, so a drag still ends if the card under the finger is re-rendered away
// mid-drag.
class GripSensor extends PointerSensor {
  static activators = PointerSensor.activators.map((a) => ({
    ...a,
    handler: (...args: Parameters<typeof a.handler>) => {
      const e = args[0].nativeEvent;
      return onGrip(e) && e.pointerType !== "touch" && a.handler(...args);
    },
  }));
}
/** Whether a press began on a stop's tile on a day (Day, Week), not Needs a Time or a customer. */
const onStopTile = (e: Event) => !!(e.target as Element | null)?.closest?.("[data-stop-drag]");
/** The name link and the tile's buttons: a mouse press there clicks, never drags. */
const onControl = (e: Event) =>
  !!(e.target as Element | null)?.closest?.("a, button:not([data-grip]), input, [role=menuitem]");
// Press and hold, then drag, anywhere on a stop's tile (owner, 2026-10-22, as Reminders and
// Things do; docs/design/2026-10-22-schedule-hold-drag.md), the grip kept as a backup. A mouse
// anywhere on the tile but the name and the buttons, once it moves 6 px. Customers to Add tiles
// (no grip): a mouse anywhere once it moves a little.
class TileMouseSensor extends MouseSensor {
  static activators = MouseSensor.activators.map((a) => ({
    ...a,
    handler: (...args: Parameters<typeof a.handler>) => {
      const e = args[0].nativeEvent;
      return !onGrip(e) && !(onStopTile(e) && onControl(e)) && a.handler(...args);
    },
  }));
}
/** The last press on a stop's tile: its pointer, and whether it was a finger. */
const lastTouch = { id: -1, touch: false };

/** How long a finger rests on a stop's tile before it lifts (as iOS's drag and drop). */
export const HOLD_MS = SCHEDULE_DRAG.holdMs;
/** How long a finger rests on a Customers to Add tile before it lifts. */
const PLAN_HOLD_MS = 250;

/** When the page (or a row in it) last scrolled, so a finger landing on a glide only stops it. */
let scrolledAt = Number.NEGATIVE_INFINITY;
const pageGliding = () => performance.now() - scrolledAt < SCHEDULE_DRAG.scrollSettleMs;

// A finger, anywhere (owner, 2026-10-22: "it just needs to avoid flicks and anything else
// unintentional"; core SCHEDULE_DRAG): it rests, moving less than the slop (8 px), for
// gripDwellMs on the grip, HOLD_MS on a stop's tile, PLAN_HOLD_MS on a Customers to Add tile;
// moving further first is the page's scroll (a flick or a swipe), and a finger landing while the
// page still glides only stops it. One sensor for every finger: dnd-kit keeps one handler per
// event name, so two touch sensors would hide one another.
class FingerSensor extends TouchSensor {
  constructor(props: ConstructorParameters<typeof TouchSensor>[0]) {
    const e = props.event;
    const delay = onGrip(e) ? SCHEDULE_DRAG.gripDwellMs : onStopTile(e) ? HOLD_MS : PLAN_HOLD_MS;
    super({
      ...props,
      options: {
        ...props.options,
        activationConstraint: { delay, tolerance: SCHEDULE_DRAG.slopPt },
      },
    });
  }
  static activators = TouchSensor.activators.map((a) => ({
    ...a,
    handler: (...args: Parameters<typeof a.handler>) => !pageGliding() && a.handler(...args),
  }));
}
import { Button, StatusBadge, buttonClass, cx, pillClass } from "./ui";
import { NO_CONNECTION, whenOffline } from "@/lib/offline";

type Tech = { id: string; name: string; color?: string | null };

// The schedule as routes (routing, owner request 2026-10-13): each tech's day in order with
// the driving between stops. Drag a job by its grip to another place, tech, or day (mouse,
// touch, or keyboard; phones too, owner 2026-10-20); Move… on the stop does
// the same in a sheet. Jobs waiting for a time sit in the tray with suggestions that fit them
// into the routes already planned.

export interface BoardStop {
  id: string;
  number: number | null;
  customer: string;
  /** The shop's sample job (owner, 2026-10-22): a Sample pill by the name. */
  sample?: boolean;
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
  /** The kind of visit alone ("Repair"): the first line of the stop's menu title. */
  visit: string;
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
  /**
   * The job as planning reads it, so Optimize and Optimize Week show their new order at once
   * (lib/schedule-preview.ts) while the server saves it.
   */
  planJob?: PreviewJob;
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

/** Optimize couldn't save: the second line of its banner. */
const OPTIMIZE_PUT_BACK = "The order is as it was.";

/**
 * What a stop's menu does (gestures.md section 12): the same as Move…, Move's Take
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
  /**
   * A tile is lifted or a new order is saving: the drive chips keep their room but don't show,
   * since the drives are worked out again once it's saved (the iPhone app's rule).
   */
  drivesHidden: boolean;
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

type Lists = Record<string, BoardStop[]>;

interface Move {
  job: string;
  to: string;
  index: number;
}

/**
 * The board in a new order at once (Optimize, Optimize Week, their Undo): each list's ids in
 * order, and new times shown on the stops that get one.
 */
interface Layout {
  layout: Record<string, string[]>;
  times: Record<string, string | null>;
}

function applyChange(lists: Lists, m: Move | Layout): Lists {
  if ("job" in m) return applyMove(lists, m);
  const all = new Map(Object.values(lists).flatMap((l) => l.map((s) => [s.id, s] as const)));
  const next: Lists = { ...lists };
  for (const [key, ids] of Object.entries(m.layout)) {
    // A shared job is on both techs' lists: each keeps its own tile (its "With …" line).
    const own = new Map((lists[key] ?? []).map((s) => [s.id, s] as const));
    next[key] = ids.flatMap((id) => {
      const s = own.get(id) ?? all.get(id);
      if (!s) return [];
      return id in m.times ? [{ ...s, time: m.times[id] ?? null }] : [s];
    });
  }
  // A shared job's new time shows on the other tech's day too (owner, 2026-10-24).
  for (const [key, list] of Object.entries(next)) {
    if (key in m.layout || !list.some((s) => s.id in m.times)) continue;
    next[key] = list.map((s) => (s.id in m.times ? { ...s, time: m.times[s.id] ?? null } : s));
  }
  return next;
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

/**
 * Where a dragged stop lands follows the tile, not the cursor (owner, 2026-10-22: "it depends
 * on where the cursor, not where the tile is"): the day, week cell, Needs a Time or stop the
 * tile overlaps most, else the nearest stop.
 */
const collision: CollisionDetection = (args) => {
  // A customer to add lands only where the pointer is: a tech's day, never the nearest stop.
  if (String(args.active.id).startsWith(PLAN_DRAG)) return pointerWithin(args);
  const hits = rectIntersection(args);
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
  phone = false,
  preview = null,
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
  /**
   * Week on a phone: day by day, each tech's day a block of stop tiles that drag as on Day
   * (owner, 2026-10-21: "The drag/drop on the week schedule page should be similar to the
   * daily one"), with Needs a Time and Customers to Add above. No sidebar.
   */
  phone?: boolean;
  /** What the browser needs to show Optimize's new order at once (null: wait for the server). */
  preview?: PreviewContext | null;
}) {
  const initial = useMemo(() => {
    const lists: Lists = { [TRAY]: tray ?? [] };
    for (const c of columns) lists[c.key] = c.stops;
    return lists;
  }, [columns, tray]);
  const [lists, optimistic] = useOptimistic(initial, applyChange);
  // Moves and Optimize run apart, so a move made while a day is optimizing isn't held up, and
  // only the day being optimized shows it.
  const [saving, start] = useTransition();
  const [optimizing, startOptimize] = useTransition();
  const [planning, setPlanning] = useState<string | null>(null);
  const [dragging, setDragging] = useState<BoardStop | null>(null);
  const [draggingPlan, setDraggingPlan] = useState<PlanDragData | null>(null);
  const planDrops = useRef<PlanDrops | null>(null);
  const dragEnd = useRef(0);
  const [choose, chooseSheet] = useChoice<"schedule" | "visit">();
  const [confirmMove, confirmSheet] = useConfirm();
  const [moving, setMoving] = useState<BoardStop | null>(null);
  const byKey = useMemo(() => new Map(columns.map((c) => [c.key, c])), [columns]);
  // Stable, so the open sheet isn't re-focused each time the board re-renders.
  const closeMove = useCallback(() => setMoving(null), []);
  // A stable id keeps dnd-kit's generated ids the same on the server and in the browser.
  const dndId = useId();

  const sensors = useSensors(
    // A schedule card from its grip: a mouse at once (GripSensor; a couple of pixels, so a click
    // on the grip isn't a drag), a finger after a brief rest (FingerSensor), so a flick there
    // scrolls the page. A stop's tile on a day also from anywhere else on it: a mouse once it
    // moves 6 px (not from the name or a button), a finger after a 0.4 s hold, so a quick tap
    // or a swipe up or down still scrolls the page. While dragging the page scrolls near the
    // screen's edges (autoScroll). The other cards in the day slide into their new places as one
    // passes them (SORT_SLIDE), so the gap is where it lands. Customers to Add tiles: a mouse
    // anywhere once it moves a little, a finger after a touch and hold.
    useSensor(GripSensor, { activationConstraint: { distance: 2 } }),
    useSensor(TileMouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(FingerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  // A finger that lands while the page glides (a flick's momentum) only stops it: FingerSensor
  // checks when anything last scrolled.
  useEffect(() => {
    const mark = () => {
      scrolledAt = performance.now();
    };
    document.addEventListener("scroll", mark, { capture: true, passive: true });
    return () => document.removeEventListener("scroll", mark, { capture: true });
  }, []);
  // Never stuck mid-drag (owner, 2026-10-21: "it sometimes freezes up"): a pointer let go,
  // cancelled or lost that the drag didn't hear (its card re-rendered away under the finger)
  // cancels it, so no card stays lifted and the page always scrolls again.
  const active = useRef(false);
  const liveDrag = !!dragging || !!draggingPlan;
  useEffect(() => {
    if (!liveDrag) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = (e: Event) => {
      // Our own pointercancel (a hold's drag taking the touch from the page swipe) isn't it.
      if (!e.isTrusted) return;
      // Another finger lifting isn't the dragging one letting go.
      if (e instanceof PointerEvent && !e.isPrimary) return;
      if (typeof TouchEvent !== "undefined" && e instanceof TouchEvent && e.touches.length) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!active.current) return;
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape" }));
      }, 0);
    };
    const kinds = ["pointerup", "pointercancel", "lostpointercapture", "touchend", "touchcancel"];
    for (const k of kinds) window.addEventListener(k, check, true);
    window.addEventListener("blur", check);
    return () => {
      clearTimeout(timer);
      for (const k of kinds) window.removeEventListener(k, check, true);
      window.removeEventListener("blur", check);
    };
  }, [liveDrag]);

  // Phones showing one tech's day: its map and buttons lead, above Needs a Time.
  const shownOnPhone = columns.filter((c) => !c.phoneHidden);
  // Phones' Optimize Week starts from the one tech shown, else everyone.
  const phoneTechs = new Set(shownOnPhone.map((c) => c.techId));
  const phoneTech = phoneTechs.size === 1 ? [...phoneTechs][0]! : null;
  const lead =
    mode === "day" && shownOnPhone.length === 1 && (lists[shownOnPhone[0]!.key] ?? []).length
      ? shownOnPhone[0]!
      : null;

  const where = (id: string) => Object.keys(lists).find((k) => lists[k]!.some((s) => s.id === id));
  /** Week with something to schedule: the sidebar (a tray above the board when narrower). */
  // Day and Week on a computer: Needs a Time (and in Week, Customers to Add) in a sidebar on
  // the left, listed down (owner, 2026-10-21: "needs a time is being moved to the left hand side
  // as a vertical window").
  const side = !phone && (!!tray || (mode === "week" && !!plans));

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

  /**
   * A move, shown at once while it saves. A shared job whose new time runs into its second
   * tech's day isn't saved yet: the server says why (owner, 2026-10-24), the day goes back as
   * it was, and an alert asks; Move Anyway sends it again with `anyway`.
   */
  function run(move: Move, call: (anyway?: boolean) => Promise<RouteResult>, anyway = false) {
    start(async () => {
      optimistic(move);
      const r = await whenOffline(call(anyway), { error: NO_CONNECTION });
      if (r.confirm && !anyway) {
        const ask = r.confirm;
        // After this transition ends, so the alert shows over the day as it is.
        setTimeout(async () => {
          const ok = await confirmMove({
            title: ask.title,
            message: ask.message,
            confirmLabel: ask.action,
            alert: true,
          });
          if (ok) run(move, call, true);
        });
        return;
      }
      // Updates after an await join the transition only when wrapped, so the banner shows
      // with the refreshed day, not before it.
      start(() => report(r));
    });
  }

  /**
   * The board as `changes` would leave it, shown at once (inside a transition, until it ends):
   * Optimize Week, and Undo of either Optimize.
   */
  function showChanges(changes: readonly JobChange[]) {
    if (!preview || !changes.length) return;
    const placed: Record<string, Placed[]> = {};
    for (const [key, list] of Object.entries(lists)) {
      const [t, d] = key === TRAY ? [null, null] : (key.split("|") as [string, string]);
      placed[key] = list.map((x) => ({
        id: x.id,
        key,
        tech: key === TRAY ? x.schedule?.tech || null : t === "none" ? null : t,
        date: key === TRAY ? (x.schedule?.date ?? null) : d,
      }));
    }
    const layout = relayout(placed, changes, preview.timeZone, TRAY);
    if (!layout) return;
    const times: Record<string, string | null> = {};
    for (const c of changes)
      if ("scheduled_start" in c)
        times[c.id] = c.scheduled_start ? formatTime(c.scheduled_start, preview.timeZone) : null;
    optimistic({ layout, times });
  }

  /**
   * Optimize a tech's day (owner, 2026-10-22: "Make Optimize show the new order at once, with
   * Undo"): the stops slide into the order worked out here at once, while the server plans and
   * saves it with the shop's drive times; its answer confirms or corrects the order. The banner
   * says what it saved ("Optimized · 42 min less driving", or "Already the best order") with
   * Undo; a failure puts the old order back and says so.
   */
  function optimize(techId: string, date: string) {
    const key = `${techId}|${date}`;
    setPlanning(key);
    startOptimize(async () => {
      const day = lists[key] ?? [];
      const jobs = day.flatMap((x) => (x.planJob ? [x.planJob] : []));
      const next =
        preview && jobs.length === day.length
          ? previewDay(preview, techId, date, jobs, (t) => {
              const other = lists[`${t}|${date}`];
              return other && other.every((x) => x.planJob)
                ? other.flatMap((x) => (x.planJob ? [x.planJob] : []))
                : null;
            })
          : null;
      if (next) {
        const times: Record<string, string> = {};
        for (const [id, at] of Object.entries(next.starts))
          times[id] = formatTime(at, preview!.timeZone);
        optimistic({ layout: { [key]: next.order }, times });
      }
      const r: OptimizeResult = await whenOffline(planRoute(techId, date), {
        error: NO_CONNECTION,
      });
      startOptimize(() => {
        setPlanning(null);
        optimized(r, techId, date);
      });
    });
  }

  function optimized(r: OptimizeResult, techId: string, date: string) {
    if (r.error) {
      showBanner({ tone: "error", message: r.error, detail: OPTIMIZE_PUT_BACK });
      return;
    }
    const rows = r.undo;
    showBanner({
      tone: r.detail ? "warning" : "success",
      message: r.message ?? "Optimized",
      detail: r.detail,
      action: rows?.length
        ? { label: "Undo", onAction: () => undoOptimize(techId, date, rows) }
        : undefined,
    });
  }

  /** Undo after Optimize: the old order shows at once, then it's saved. */
  function undoOptimize(techId: string, date: string, rows: JobChange[]) {
    start(async () => {
      showChanges(rows);
      const r = await whenOffline(undoPlanRoute(techId, date, rows), { error: NO_CONNECTION });
      start(() =>
        r.error
          ? void showBanner({ tone: "error", message: r.error })
          : void showBanner({ message: r.message ?? "Put back as it was." }),
      );
    });
  }

  /** Optimize Week (PlanWeek) and its Undo, shown at once while they save. */
  function previewPlanWeek(
    input: { techs: string[] | "all"; tray: boolean } | { undo: JobChange[] },
  ) {
    if (!preview) return;
    if ("undo" in input) return showChanges(input.undo);
    const { updates } = previewWeek({
      ctx: preview,
      dates: planDates ?? [],
      techs: input.techs,
      tray: input.tray,
      team: techs.map((t) => t.id),
      dayJobs: (t, d) => (lists[`${t}|${d}`] ?? []).flatMap((x) => (x.planJob ? [x.planJob] : [])),
      waiting: (lists[TRAY] ?? []).flatMap((x) => (x.planJob ? [x.planJob] : [])),
    });
    showChanges(updates);
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
    run({ job, to: none ? TRAY : to, index: none ? 0 : index }, (anyway) =>
      moveJob({ job, tech: none ? null : tech, date: date!, index, anyway }),
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
      // The person just answered for this visit, so a second tech's conflict doesn't ask again.
      const r = await moveJob({
        job: stop.id,
        tech: m.tech,
        date: m.date,
        index: m.index,
        planMoved: true,
        anyway: true,
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
                  run(
                    { job: stop.id, to: `${m.fromTech}|${m.fromDate}`, index: m.fromIndex },
                    (anyway) =>
                      moveJob({
                        anyway,
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
                  run({ job: stop.id, to: from, index: fromIndex }, (anyway) =>
                    moveJob({
                      anyway,
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
    drivesHidden: !!dragging || saving || optimizing,
  };

  function onDragStart(e: DragStartEvent) {
    active.current = true;
    const id = String(e.active.id);
    const ev = e.activatorEvent;
    // A tile lifted by a touch and hold: a tap is felt, and the page's sideways swipe between
    // days lets the touch go, so carrying it sideways never turns the page.
    if (
      typeof TouchEvent !== "undefined" &&
      ev instanceof TouchEvent &&
      !id.startsWith(PLAN_DRAG)
    ) {
      navigator.vibrate?.(10);
      ev.target?.dispatchEvent(
        new PointerEvent("pointercancel", { pointerId: lastTouch.id, bubbles: true }),
      );
    }
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
    active.current = false;
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
        active.current = false;
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
            {/* Phones' Week: Optimize Week leads, above Needs a Time. */}
            {phone && mode === "week" && planDates?.length ? (
              <div className="mb-5">
                <PlanWeek
                  dates={planDates}
                  waiting={planWaiting}
                  techs={techs}
                  defaultTech={phoneTech}
                  buttonClassName="w-full"
                  onPreview={previewPlanWeek}
                />
              </div>
            ) : null}
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
            {phone && plans && mode === "week" ? (
              <div className="mb-5">
                <CustomersToAdd
                  variant="phone"
                  plans={plans.list}
                  techs={techs}
                  workDays={plans.workDays}
                />
              </div>
            ) : null}

            {mode === "day" ? (
              // On a computer or tablet the techs sit side by side in one row that slides
              // sideways (owner, 2026-10-21: "make the techs slide horizontally instead of
              // doing multiple rows"); on phones they stack. Columns snap into place only for
              // touch: with a trackpad or mouse, snapping fought the glide (owner, 2026-10-24).
              <TopScroller
                data-testid="day-columns"
                className="grid grid-cols-[minmax(0,1fr)] gap-5 md:-mx-1 md:flex md:snap-x md:snap-proximity md:pointer-fine:snap-none md:scroll-px-1 md:items-start md:overflow-x-auto md:overscroll-x-contain md:px-1 md:pb-2 md:[scrollbar-width:thin] md:[&>*]:w-[22rem] md:[&>*]:shrink-0 md:[&>*]:snap-start"
              >
                {columns.map((c) => (
                  <DayColumn
                    key={c.key}
                    column={c}
                    stops={lists[c.key] ?? []}
                    optimizing={optimizingKey === c.key}
                    busy={optimizing}
                    onPlan={() => optimize(c.techId!, c.date)}
                    maps={maps}
                    today={today}
                    lead={c.key === lead?.key}
                  />
                ))}
              </TopScroller>
            ) : phone ? (
              <WeekDays columns={columns} lists={lists} days={weekDays ?? []} today={today} />
            ) : (
              <DesktopWeek
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
                onPreview={previewPlanWeek}
              />
            )}
          </div>
        </PlanDrop>
      </BoardActions>

      <DragOverlay dropAnimation={reducedMotion() ? null : DROP_SLIDE}>
        {draggingPlan ? (
          <div className="card max-w-72 px-4 py-2.5 shadow-xl ring-2 ring-link">
            <span className="block truncate font-semibold">{draggingPlan.customer}</span>
            <span className="block truncate text-[0.9375rem] text-text-muted">
              {draggingPlan.address}
            </span>
          </div>
        ) : dragging ? (
          // Carried: the card lifted off the list (its place stays an empty gap).
          <LiftedCard stop={dragging} week={mode === "week"} />
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
      {confirmSheet}
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
      color={c.color ?? null}
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
  maps,
  today,
  lead = false,
}: {
  column: BoardColumn;
  stops: BoardStop[];
  busy: boolean;
  optimizing?: boolean;
  onPlan: () => void;
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
      // The day's stops are one block of tiles: on a phone it sits on the page; wider screens
      // group each tech's day in a faint well so the columns read apart.
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
      {/* One block of touching tiles (docs/design/2026-10-21-schedule-tile.md); the room
          under it takes a drop too. */}
      <div ref={setNodeRef} className="mt-3 min-h-16 flex-1">
        {stops.length === 0 ? (
          <p className="card p-4 text-center text-text-muted">Nothing scheduled.</p>
        ) : (
          <StopBlock column={c} stops={stops} />
        )}
      </div>
    </section>
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
      // On phones too (owner, 2026-10-20). A finger drags the job once it has rested here a
      // moment (FingerSensor); a flick from here scrolls the page (owner, 2026-10-22). No text
      // selection or callout on the press.
      className={cx(
        "grid shrink-0 cursor-grab place-items-center rounded-full text-text-muted select-none [-webkit-touch-callout:none] hover:bg-text/[0.06] active:cursor-grabbing active:bg-link/10 active:text-link",
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
  /** A week cell's tighter tile. */
  small?: boolean;
}) {
  const done = finished(status);
  return (
    // It leads the tile (owner, 2026-10-21: "job order number is more important than expected
    // arrival time"): 32 pt, Barlow ExtraBold.
    <span
      aria-hidden="true"
      className={cx(
        "grid shrink-0 place-items-center rounded-full font-display font-extrabold tabular-nums",
        small ? "size-7 text-[0.9375rem]" : "size-8 text-[1.0625rem]",
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
          className={small ? "size-4" : "size-[1.125rem]"}
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

/** The street alone ("5024 W Las Palmaritas Dr"), without the city or ZIP. */
function streetOf(address: string) {
  return address.split(",")[0]!.trim();
}

/**
 * A schedule card (docs/design/2026-10-21-schedule-card.md; owner, 2026-10-21: "Redesign those
 * tiles too. They look super busy"), the same on a phone and a computer, in Day, Week and
 * Needs a Time: two lines. The tech's color stripe and the stop's number, then the time and
 * the customer; under them the kind of visit and the street. Trailing, small icons only for
 * exceptions (a lock, not on the map, a cleaning due), or the status when it isn't plain
 * Scheduled; then "⋯" and the grip, which alone drags it. Only the customer's name opens the
 * job. Move…, the locks, Take Off Schedule and Directions are in its menu: "⋯", right-click,
 * or touch and hold.
 */
function ScheduleCard({
  stop: s,
  position,
  color,
  listeners,
  attributes,
  menu,
  week = false,
  tray = false,
  trailing,
}: {
  stop: BoardStop;
  /** Its place in the day; null when it has none (Needs a Time). */
  position: number | null;
  color?: string | null;
  listeners: ReturnType<typeof useSortable>["listeners"];
  attributes: ReturnType<typeof useSortable>["attributes"];
  menu: Ref<RowActionsHandle>;
  /** In a week cell (about 10 rem): tighter, the time without AM or PM. */
  week?: boolean;
  /** Needs a Time: no number; the note ("No tech yet · booked…") on the second line. */
  tray?: boolean;
  /** More buttons before the grip (Needs a Time's Actions). */
  trailing?: ReactNode;
}) {
  const actions = use(BoardActions);
  const twoTechs = s.lock?.kind === "two_techs" ? s.lock.label : null;
  const street = s.address ? streetOf(s.address) : null;
  const second = [tray ? s.note : twoTechs ? `${s.tag} · ${twoTechs}` : s.tag, street]
    .filter(Boolean)
    .join(" · ");
  const time = s.time
    ? week
      ? s.time.replace(/\s?(AM|PM)$/, "")
      : s.time
    : tray
      ? null
      : "No time";
  const cleaning = s.cleanings?.[0];
  return (
    <RowActions
      title={`${s.customer}${s.number ? ` · Job #${s.number}` : ""}`}
      menu={stopMenu(s, actions)}
      handle={menu}
      button="none"
      // Touch and hold on the card opens its menu, never a drag (the grip drags).
      className="rounded-[inherit]"
    >
      <div
        data-testid="stop-line"
        // A drag that ends on the card isn't a click on it.
        onClickCapture={(e) => {
          if (actions?.dragged()) {
            e.preventDefault();
            e.stopPropagation();
          }
        }}
        className={cx(
          "relative flex items-center rounded-[inherit] select-none [-webkit-touch-callout:none]",
          // Needs a Time's cards show their well, so the next one's edge reads as a card.
          tray ? "bg-transparent" : "bg-surface",
          week ? "min-h-14 gap-1.5 py-1.5 pl-2.5" : "min-h-16 gap-2.5 py-2 pl-3.5 lg:min-h-14",
          s.draggable ? "pr-0.5" : "pr-2",
        )}
      >
        {color ? <TechStripe color={color} /> : null}
        {position != null ? <StopBadge position={position} status={s.status} small={week} /> : null}
        <div className={cx("min-w-0 flex-1", finished(s.status) && "opacity-70")}>
          <p className="flex min-w-0 items-baseline gap-1.5 leading-snug">
            {time ? (
              <span
                className={cx(
                  "shrink-0 font-bold tabular-nums",
                  week ? "text-[0.8125rem]" : "text-[1.0625rem] lg:text-[0.9375rem]",
                )}
              >
                {time}
              </span>
            ) : null}
            {/* Only the customer's name opens the job (owner, 2026-10-21: "I find myself
                accidentally opening jobs all the time"): a link with "›", its hit area a
                little bigger than the text. The card's body does nothing on a tap. */}
            <Link
              href={`/jobs/${s.id}`}
              draggable={false}
              data-testid="stop-open"
              className={cx(
                "relative inline-flex min-w-0 items-baseline gap-0.5 font-semibold text-link after:absolute after:-inset-x-1.5 after:-inset-y-3 after:content-[''] hover:underline",
                week ? "text-[0.9375rem]" : "text-[1.0625rem] lg:text-[0.9375rem]",
              )}
            >
              <span className="min-w-0 truncate">{s.customer}</span>
              {s.sample ? <SamplePill className="ml-1 shrink-0 self-center" /> : null}
              <span aria-hidden="true" className="shrink-0">
                ›
              </span>
            </Link>
          </p>
          {second ? (
            <p
              className={cx(
                "truncate text-text-muted",
                week ? "text-[0.8125rem]" : "text-[0.9375rem] lg:text-[0.8125rem]",
              )}
              title={s.address ?? undefined}
            >
              {second}
            </p>
          ) : null}
        </div>
        {/* Exceptions only, as small icons; the status instead when it isn't plain Scheduled. */}
        {s.status !== "scheduled" && s.status !== "unscheduled" && !tray ? (
          <span className="relative shrink-0">
            <StatusBadge status={s.status} />
          </span>
        ) : (
          <span className="relative flex shrink-0 items-center gap-1 empty:hidden">
            {s.lock && !twoTechs ? <LockTag lock={s.lock} /> : null}
            {s.notOnMap || (s.address && !s.location) ? <NotOnMapTag /> : null}
            {cleaning ? (
              <span className="inline-flex text-text-muted" title={`${cleaning.name} due`}>
                <CleaningIcon kind={cleaning.kind} className="size-[1.125rem]" />
                <span className="sr-only">{`${cleaning.name} due`}</span>
              </span>
            ) : null}
          </span>
        )}
        {trailing}
        {/* Needs a Time's own "⋯" (trailing) is its one More button, so the name has room. */}
        {trailing ? null : (
          <RowMenuButton
            visible
            className={cx("relative shrink-0", week ? "size-7!" : "size-9!")}
          />
        )}
        {s.draggable ? (
          <Grip
            compact={week}
            label={`Drag ${s.customer}`}
            className={cx("relative", week && "w-5!")}
            {...attributes}
            {...listeners}
          />
        ) : null}
      </div>
    </RowActions>
  );
}

/** The tile as it's carried (DragOverlay): lifted, with a shadow. */
function LiftedCard({ stop: s, week }: { stop: BoardStop; week: boolean }) {
  const street = s.address ? streetOf(s.address) : null;
  const withNote = s.tag !== s.visit ? s.tag : null;
  return (
    <div
      className={cx(
        "card scale-[1.03] cursor-grabbing py-2 pr-3 pl-4 shadow-xl ring-1 ring-text/10 motion-reduce:scale-100",
        week ? "max-w-48" : "max-w-sm",
      )}
    >
      <p className="truncate font-semibold text-link">{s.customer} ›</p>
      {/* No drive chip while it's carried: the drives change where it lands. */}
      <p className="truncate text-[0.9375rem] text-text-muted">
        {[s.time ?? "No time", withNote, street].filter(Boolean).join(" · ")}
      </p>
    </div>
  );
}

/**
 * A schedule stop's tile (docs/design/2026-10-21-schedule-tile.md; owner, 2026-10-21: "The
 * tiles should be thin and touching like in the weekly view … job order number is more
 * important than expected arrival time"), the same in Day and Week, on a phone and a
 * computer: the stop's number leads; line 1 is the customer as the link (only the name opens
 * the job), the exception icons, and the status when it isn't plain Scheduled; line 2 is the
 * drive to it as a chip, then the time, "With …" for a two-tech stop, and the street. The kind
 * of visit is the menu's first title line. "⋯" (not in a week cell) and the grip, which alone
 * drags it, at the trailing edge. The tech's stripe is on the block, not the tile.
 */
function StopTile({
  stop: s,
  position,
  gripRef,
  attributes,
  menu,
  compact = false,
  fromOffMap = false,
}: {
  stop: BoardStop;
  position: number;
  /** The drive into it starts off the map (the stop before, or the start): no chip. */
  fromOffMap?: boolean;
  /** The grip: the keyboard's pick-up (the tile's own presses drag from anywhere on it). */
  gripRef: (el: HTMLElement | null) => void;
  attributes: ReturnType<typeof useSortable>["attributes"];
  menu: Ref<RowActionsHandle>;
  /** A week cell on a computer (about 10 rem): tighter, no "⋯", the time without AM or PM. */
  compact?: boolean;
}) {
  const actions = use(BoardActions);
  const street = s.address ? streetOf(s.address) : null;
  // "With Dana" (or "Second tech, with Luis") for a two-tech stop; the kind of visit is in the
  // menu's title.
  const withNote = s.tag !== s.visit ? s.tag : null;
  const missing = s.notOnMap || (!!s.address && !s.location);
  const drive = driveChipMinutes(s.legMin, missing, fromOffMap);
  const time = s.time ? (compact ? s.time.replace(/\s?(AM|PM)$/, "") : s.time) : "No time";
  const twoTechs = s.lock?.kind === "two_techs";
  const cleaning = s.cleanings?.[0];
  const status = s.status !== "scheduled" && s.status !== "unscheduled";
  // Week's desktop cells (owner, 2026-10-22: "This is insanely busy. It has to be cleaned
  // up"): the number, the name on one line, then the chip and the time. The status is the
  // number's color and check; a lock keeps its icon (it says why a stop won't move); not on
  // the map and cleanings are in the tile's hover text and read out; the grip shows on hover.
  const quiet = compact
    ? [
        status ? JOB_STATUS_LABELS[s.status] : null,
        missing ? "Not found on the map" : null,
        cleaning ? `${cleaning.name} due` : null,
      ].filter((t): t is string => !!t)
    : [];
  return (
    <RowActions
      title={`${s.customer}${s.number ? ` · Job #${s.number}` : ""}`}
      kicker={s.visit}
      menu={stopMenu(s, actions)}
      handle={menu}
      button="none"
      // Touch and hold lifts the tile to drag (owner, 2026-10-22), so its menu is on "⋯", a
      // right click, the menu key and Shift+F10, not the hold.
      longPress={!s.draggable}
      className="rounded-[inherit]"
    >
      <div
        data-testid="stop-line"
        // A drag that ends on the tile isn't a click on it.
        onClickCapture={(e) => {
          if (actions?.dragged()) {
            e.preventDefault();
            e.stopPropagation();
          }
        }}
        title={compact ? [s.customer, ...quiet].join(" · ") : undefined}
        className={cx(
          "group/tile relative flex items-center bg-surface select-none [-webkit-touch-callout:none]",
          compact ? "min-h-12 gap-2 py-1 pl-2.5" : "min-h-[3.625rem] gap-2.5 py-1.5 pl-4",
          s.draggable ? "pr-0.5" : "pr-2",
        )}
      >
        <StopBadge position={position} status={s.status} small={compact} />
        <div className={cx("min-w-0 flex-1", finished(s.status) && "opacity-70")}>
          <p className="flex min-w-0 items-center gap-1.5 leading-snug">
            {/* Only the customer's name opens the job (owner, 2026-10-21: "I find myself
                accidentally opening jobs all the time"), its hit area 44 pt tall. */}
            <Link
              href={`/jobs/${s.id}`}
              draggable={false}
              data-testid="stop-open"
              className={cx(
                "relative inline-flex min-w-0 items-baseline gap-0.5 font-semibold text-link after:absolute after:-inset-x-1.5 after:-inset-y-3 after:content-[''] hover:underline",
                compact ? "text-[0.9375rem]" : "text-[1.0625rem] lg:text-[0.9375rem]",
              )}
            >
              {/* In Week's narrow desktop cells the name takes two lines rather than being cut
                  to a few letters. */}
              <span className="min-w-0 truncate">{s.customer}</span>
              {s.sample ? <SamplePill className="ml-1 shrink-0 self-center" /> : null}
              {compact ? null : (
                <span aria-hidden="true" className="shrink-0">
                  ›
                </span>
              )}
            </Link>
            {quiet.length ? <span className="sr-only">{`, ${quiet.join(", ")}`}</span> : null}
            {/* Exceptions only, as small icons after the name; the status at the line's end
                when the stop isn't plain Scheduled. */}
            {s.lock && !twoTechs ? <LockTag lock={s.lock} className="relative" /> : null}
            {missing && !compact ? <NotOnMapTag /> : null}
            {cleaning && !compact ? (
              <span
                className="relative inline-flex shrink-0 text-text-muted"
                title={`${cleaning.name} due`}
              >
                <CleaningIcon kind={cleaning.kind} className="size-[1.125rem]" />
                <span className="sr-only">{`${cleaning.name} due`}</span>
              </span>
            ) : null}
            {status && !compact ? (
              <span className="relative ml-auto shrink-0">
                <StatusBadge status={s.status} />
              </span>
            ) : null}
          </p>
          <p
            className={cx(
              "flex min-w-0 items-center gap-1.5 text-text-muted",
              compact ? "text-[0.8125rem]" : "text-[0.9375rem] lg:text-[0.8125rem]",
            )}
            title={s.address || undefined}
          >
            {drive != null ? (
              <DriveChip
                minutes={drive}
                className={actions?.drivesHidden ? "invisible" : undefined}
              />
            ) : null}
            {/* The time is never cut short; "With …" and the street are, after it. Week's
                narrow desktop cells show only the chip and the time: the street had room for
                a letter or two. */}
            <span className="shrink-0 tabular-nums">{time}</span>
            {!compact && (withNote || street) ? (
              <span className="min-w-0 truncate">
                {[withNote, street]
                  .filter(Boolean)
                  .map((t) => `· ${t}`)
                  .join(" ")}
              </span>
            ) : null}
          </p>
        </div>
        {/* Week's desktop cells: right click for a mouse; on a touch screen (an iPad), where
            touch and hold drags, "⋯" shows so the menu is still in reach. */}
        <RowMenuButton
          visible
          className={cx(
            "relative shrink-0",
            compact ? "hidden size-7! place-items-center [@media(hover:none)]:grid" : "size-9!",
          )}
        />
        {s.draggable ? (
          <Grip
            compact={compact}
            label={`Drag ${s.customer}`}
            className={cx(
              "relative",
              compact &&
                "w-5! opacity-0 group-hover/tile:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100",
            )}
            ref={gripRef}
            {...attributes}
          />
        ) : null}
      </div>
    </RowActions>
  );
}

/** A stop on a tech's day: its tile, sliding aside as another is dragged past it. */
function StopCard({
  stop: s,
  position,
  compact = false,
  fromOffMap = false,
}: {
  stop: BoardStop;
  position: number;
  compact?: boolean;
  fromOffMap?: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: s.id,
    disabled: !s.draggable,
    transition: reducedMotion() ? null : SORT_SLIDE,
  });
  const menu = useRef<RowActionsHandle>(null);
  return (
    <article
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      data-testid="stop"
      // Press and hold, then drag, anywhere on it (owner, 2026-10-22); the grip at once. The
      // keyboard picks it up from the grip only (its activator).
      data-stop-drag={s.draggable ? "" : undefined}
      {...(s.draggable ? listeners : {})}
      onPointerDownCapture={(e) => {
        lastTouch.id = e.pointerId;
        lastTouch.touch = e.pointerType !== "mouse";
      }}
      // A finger's touch and hold lifts the tile to drag (its menu is on "⋯" and a right
      // click), so the browser's own long-press menu doesn't show.
      onContextMenuCapture={(e) => {
        if (!lastTouch.touch || !s.draggable) return;
        e.preventDefault();
        e.stopPropagation();
      }}
      aria-label={`${s.time ?? "No time"}, ${s.customer}, ${s.visit}`}
      // While carried, its place is an empty gap: never a tile under the one being dragged.
      className={cx("relative", isDragging && "invisible")}
    >
      <StopTile
        stop={s}
        position={position}
        gripRef={setActivatorNodeRef}
        attributes={attributes}
        menu={menu}
        compact={compact}
        fromOffMap={fromOffMap}
      />
    </article>
  );
}

/**
 * One tech's day as one block (docs/design/2026-10-21-schedule-tile.md): their color stripe on
 * its leading edge, the tiles touching with hairlines that start after the stop number, and the
 * drive home as its last line ("27 min back to the shop"). Day and Week, phone and computer.
 */
function StopBlock({
  column: c,
  stops,
  compact = false,
}: {
  column: BoardColumn;
  stops: BoardStop[];
  compact?: boolean;
}) {
  const home = c.techId ? driveHomeLine(c.backLegMin, c.start.label) : null;
  const offMap = stops.map((s) => s.notOnMap || (!!s.address && !s.location));
  return (
    <div
      data-testid="stop-block"
      className={cx("card relative overflow-hidden", compact && "rounded-xl")}
    >
      {c.color ? <TechStripe color={c.color} /> : null}
      <SortableContext
        id={c.key}
        items={stops.map((s) => s.id)}
        strategy={verticalListSortingStrategy}
      >
        <ol data-flip-list={c.key} className={cx("stop-block", compact && "stop-block-compact")}>
          {stops.map((s, i) => (
            <li key={s.id} data-flip={s.id}>
              <StopCard
                stop={s}
                position={i + 1}
                compact={compact}
                fromOffMap={driveFromOffMap(i, offMap, !!c.start.at)}
              />
            </li>
          ))}
        </ol>
      </SortableContext>
      {/* Week's desktop cells leave it to the day's "1 hr 40 min driving" under the block
          (owner, 2026-10-22: "This is insanely busy"). */}
      {home && !compact ? (
        <p
          data-testid="drive-home"
          title={home}
          className={cx(
            "flex items-center gap-1.5 border-t-[0.5px] border-separator text-[0.8125rem] text-text-muted",
            compact ? "py-1.5 pr-2 pl-3" : "py-2 pr-3 pl-4",
          )}
        >
          <HouseFillIcon className="size-3.5 shrink-0" />
          <span className={cx("min-w-0", compact && "text-[0.75rem] leading-4")}>{home}</span>
        </p>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Week: techs down, days across
// ---------------------------------------------------------------------------

/**
 * Week on a phone (docs/design/2026-10-21-schedule-tile.md): day by day, each tech's day as
 * their row (dot, name, "4 stops · 1 hr 44 min") and a block of the same tiles as Day. A stop
 * drags from its grip as on Day: the others slide aside, another day's block takes it at the
 * drop position, Needs a Time takes it off.
 */
function WeekDays({
  columns,
  lists,
  days,
  today,
}: {
  columns: BoardColumn[];
  lists: Lists;
  days: [string, string][];
  today: string;
}) {
  return (
    <div className="space-y-5">
      {days.map(([d]) => {
        const cols = columns.filter((c) => c.date === d && !c.phoneHidden);
        const long = formatDay(d, "long");
        return (
          <section key={d} aria-label={long} data-testid="week-day">
            <h2 className={cx("mb-1 font-display text-lg font-bold", d === today && "text-link")}>
              <Link
                href={`/schedule?view=day&date=${d}`}
                aria-current={d === today ? "date" : undefined}
                className="inline-flex min-h-11 items-center underline-offset-4 hover:underline"
              >
                {long}
                {d === today ? " · Today" : ""}
              </Link>
            </h2>
            <div className="space-y-2">
              {cols.map((c) => (
                <WeekTechDay key={c.key} column={c} stops={lists[c.key] ?? []} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

/** One tech's day in Week on a phone: their row, then the block; the whole of it takes a drop. */
function WeekTechDay({ column: c, stops }: { column: BoardColumn; stops: BoardStop[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: c.key, disabled: !c.open });
  const summary = stops.length
    ? [
        `${stops.length} ${stops.length === 1 ? "stop" : "stops"}`,
        c.driveMin ? `${durationLabel(c.driveMin)} driving` : null,
        // Someone who starts from home: the day's driving is counted from there.
        c.driveMin && c.start.label === "home" ? startLegLabel("home") : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : "Nothing scheduled";
  return (
    <div
      ref={setNodeRef}
      role="group"
      aria-label={`${c.title}, ${c.date}`}
      data-testid="week-route"
      className={cx("-mx-2 rounded-[22px] px-2 pb-1", isOver && "bg-link/5 ring-2 ring-link")}
    >
      <p className="flex min-h-9 items-center gap-2">
        <TechDot color={c.color} />
        <span className="min-w-0 truncate font-semibold">{c.title}</span>
        <span className="ml-auto shrink-0 text-[0.9375rem] text-text-muted tabular-nums">
          {summary}
        </span>
      </p>
      {stops.length ? <StopBlock column={c} stops={stops} /> : null}
    </div>
  );
}

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
  onPreview,
  daysControl,
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
  /** Optimize Week's new order, shown at once while it saves. */
  onPreview: PlanWeekPreview;
  /** 5 Days | 7 Days, at the right of the section's title (null: every day is shown anyway). */
  daysControl: ReactNode;
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
  if (!maps && !planDates && !daysControl) return null;
  const shown = days.filter(
    ([d]) => workDates.includes(d) || (lists[`${tech}|${d}`] ?? []).length > 0,
  );
  const pills = !!maps && techs.length > 1;
  const planWeek = planDates ? (
    <PlanWeek
      dates={planDates}
      waiting={planWaiting}
      techs={techs.map(([id, title]) => ({ id, name: title, color: colors.get(id) }))}
      defaultTech={maps ? tech : null}
      className="contents"
      onPreview={onPreview}
    />
  ) : null;
  return (
    <section aria-labelledby="week-routes" className="mb-5">
      {/* The section's title with its one action, then whose week the maps show. */}
      <div className="mb-2 flex min-h-11 flex-wrap items-center justify-between gap-x-3">
        <h2 id="week-routes" className="font-display text-xl font-bold">
          {maps ? (techs.length > 1 ? "Maps" : `${name}’s Maps`) : "This Week"}
        </h2>
        {/* 5 Days | 7 Days in the title's row, not a row or a column of its own (owner,
            2026-10-22), then Optimize Week when it has no techs' row to sit at the end of. */}
        <div className="flex items-center gap-3">
          {daysControl}
          {planDates && !pills ? planWeek : null}
        </div>
      </div>
      {pills ? (
        // Optimize Week at the end of the techs' row, not in a row of its own (owner,
        // 2026-10-22: "Move optimize week down").
        <div className="mb-3 flex items-center gap-3">
          <nav
            aria-label="Whose routes"
            className="-mx-1 flex min-w-0 flex-1 gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]"
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
          {planDates ? <div className="shrink-0 pb-1">{planWeek}</div> : null}
        </div>
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
                    color={colors.get(tech) ?? null}
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

/** This browser shows Week's 7 days, not only the work days (desktop; "1" is 7 Days). */
const WEEKEND_KEY = "schedule.weekend";
const WEEKEND_EVENT = "schedule-weekend";
let weekendHere = false;

function subscribeWeekend(fn: () => void) {
  addEventListener(WEEKEND_EVENT, fn);
  addEventListener("storage", fn);
  return () => {
    removeEventListener(WEEKEND_EVENT, fn);
    removeEventListener("storage", fn);
  };
}

function readWeekend() {
  try {
    return localStorage.getItem(WEEKEND_KEY) === "1";
  } catch {
    return weekendHere;
  }
}

function writeWeekend(next: boolean) {
  weekendHere = next;
  try {
    localStorage.setItem(WEEKEND_KEY, next ? "1" : "0");
  } catch {
    // Storage blocked: weekendHere keeps it.
  }
  dispatchEvent(new Event(WEEKEND_EVENT));
}

type DesktopWeekProps = Omit<Parameters<typeof WeekMaps>[0], "daysControl">;

/**
 * Week on a computer: the maps, then the grid. The days across are the shop's work days, plus
 * today and any day with something on it (owner, 2026-10-22: "We really only need Mon-Fri"),
 * or all 7: a "5 Days | 7 Days" segmented control in the section's title row picks, and this
 * browser remembers it (owner, 2026-10-22, replacing the narrow "Sat Sun ›" column).
 */
function DesktopWeek(props: DesktopWeekProps) {
  const { columns, lists, days: allDays, workDates, today } = props;
  const weekend = useSyncExternalStore(subscribeWeekend, readWeekend, () => false);
  const always = ([d]: [string, string]) =>
    workDates.includes(d) ||
    d === today ||
    columns.some((c) => c.date === d && (lists[c.key] ?? []).length > 0);
  const work = allDays.filter(always);
  const days = weekend ? allDays : work;
  const control =
    work.length < allDays.length ? (
      <WeekDaysControl
        value={weekend ? "all" : "work"}
        work={work.length}
        all={allDays.length}
        onChange={(v) => writeWeekend(v === "all")}
      />
    ) : null;
  return (
    <div className="min-w-0">
      <WeekMaps {...props} daysControl={control} />
      <WeekGrid
        columns={columns}
        lists={lists}
        days={days}
        today={today}
        optimizingKey={props.optimizingKey}
        busy={props.busy}
        onPlan={props.onPlan}
      />
    </div>
  );
}

/** "5 Days | 7 Days": the segment style (Title Case), with its name for screen readers only. */
function WeekDaysControl({
  value,
  work,
  all,
  onChange,
}: {
  value: "work" | "all";
  work: number;
  all: number;
  onChange: (v: "work" | "all") => void;
}) {
  return (
    <div
      data-testid="week-days-control"
      className="[&>div]:space-y-0 [&>div>p:first-child]:sr-only"
    >
      <Segmented
        label="Days Shown"
        name="week-days"
        value={value}
        onChange={onChange}
        options={[
          { value: "work", label: `${work} Days` },
          { value: "all", label: `${all} Days` },
        ]}
      />
    </div>
  );
}

function WeekGrid({
  columns,
  lists,
  days,
  today,
  optimizingKey,
  busy,
  onPlan,
}: {
  columns: BoardColumn[];
  lists: Lists;
  /** The days shown (DesktopWeek: the work days, or all 7). */
  days: [string, string][];
  today: string;
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
  // Each day at least 10.5 rem, so a stop's name reads (owner, 2026-10-21). When they don't all
  // fit, the table slides sideways, with a second scrollbar on top, as on Day.
  const TECH_REM = 7;
  const DAY_REM = 10.5;
  const minRem = TECH_REM + days.length * DAY_REM;
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
            <col key={d} />
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
                    className="min-w-0 truncate py-1.5 underline-offset-4 hover:underline"
                  >
                    {label}
                    {d === today ? " · Today" : ""}
                  </Link>
                  {optimizingKey?.endsWith(`|${d}`) ? (
                    <span
                      role="status"
                      aria-label="Optimizing…"
                      className="size-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none"
                    />
                  ) : null}
                  <RowMenuButton
                    visible
                    className="ml-auto grid size-8 shrink-0 place-items-center rounded-full text-link hover:bg-link/10 aria-expanded:bg-link/10"
                  />
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
                  <WeekCell key={d} column={col} stops={lists[key] ?? []} today={d === today} />
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
}: {
  column: BoardColumn;
  stops: BoardStop[];
  today: boolean;
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
      {/* The same tiles in the same block as Day (docs/design/2026-10-21-schedule-tile.md). */}
      {stops.length ? <StopBlock column={c} stops={stops} compact /> : <div className="min-h-12" />}
      {c.techId && stops.length ? (
        <p className="mt-1 px-1 text-[0.8125rem] text-text-muted">
          {durationLabel(c.driveMin)} driving
          {c.start.label === "home" ? ` · ${startLegLabel("home")}` : null}
        </p>
      ) : null}
    </td>
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
  const { setNodeRef, isOver: overBox } = useDroppable({ id: TRAY });
  // Lit while a stop from a day hovers over the box or a card in it: let go and it comes off
  // its schedule (the menu's Take Off Schedule).
  const { active, over } = useDndContext();
  const from = active ? String(active.id) : null;
  const fromDay = !!from && !from.startsWith(PLAN_DRAG) && !jobs.some((j) => j.id === from);
  const isOver = fromDay && (overBox || (!!over && jobs.some((j) => j.id === String(over.id))));
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState(true);
  const listId = useId();
  return (
    <section
      ref={setNodeRef}
      aria-label="Needs a Time"
      data-testid="tray"
      data-drop-over={isOver ? "" : undefined}
      className={cx("card p-4", side ? "lg:p-3" : "mb-6", isOver && "bg-link/5 ring-2 ring-link")}
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
          <p className="mt-1 text-[0.9375rem] text-text-muted">Every job has a time.</p>
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
                  // In the sideways row: whole cards and the edge of the next one (12 px,
                  // less than its 14 px inset, so no text is cut): one on phones, two on
                  // tablets, three wider. Opened as a grid (Show All) or listed down in the sidebar,
                  // they take the column's width.
                  className={cx(
                    "shrink-0 snap-start",
                    "w-[calc(100%-0.5rem)]",
                    all
                      ? "md:w-auto"
                      : side
                        ? "md:w-[calc((100%-1.25rem)/2)] lg:w-auto"
                        : "md:w-[calc((100%-1.25rem)/2)] xl:w-[calc((100%-2rem)/3)]",
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
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: j.id,
    transition: reducedMotion() ? null : SORT_SLIDE,
  });
  const menu = useRef<RowActionsHandle>(null);
  const [sheetOpen, setActions] = useState(false);
  const closeActions = useCallback(() => setActions(false), []);
  return (
    <article
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      data-testid="tray-job"
      className={cx(
        // Positioned, so nothing absolutely placed inside (screen-reader text) escapes the
        // sideways-scrolling list and widens the page.
        "well relative overflow-hidden",
        isDragging && "invisible",
      )}
    >
      {/* The schedule card (docs/design/2026-10-21-schedule-card.md), with the note on its
          second line; its "…" button keeps Suggest Times and Move…. No swipes: the list
          scrolls sideways. */}
      <ScheduleCard
        stop={j}
        position={null}
        listeners={listeners}
        attributes={attributes}
        menu={menu}
        tray
        trailing={
          <button
            type="button"
            aria-label={`Actions for ${j.customer}`}
            title="Suggest Times or Move"
            aria-haspopup="dialog"
            onClick={() => setActions(true)}
            className="relative grid size-11 shrink-0 place-items-center rounded-full text-link hover:bg-link/10"
          >
            <svg viewBox="0 0 24 24" className="size-6" fill="currentColor" aria-hidden="true">
              <circle cx="6" cy="12" r="1.8" />
              <circle cx="12" cy="12" r="1.8" />
              <circle cx="18" cy="12" r="1.8" />
            </svg>
          </button>
        }
      />
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
