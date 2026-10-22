import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  AppState,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type ScrollView,
} from "react-native";
import { SCHEDULE_DRAG } from "@leakbook/core";
import { Gesture, type PanGesture } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type SharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  autoScrollStep,
  clampScroll,
  insertIndex,
  planDrop,
  scrolled,
  slideFor,
  STOP_HOLD_MS,
  zoneAt,
  type DragItem,
  type DropPlan,
  type DropZone,
  type Rect,
  type Slot,
} from "../../lib/scheduleDrag";
import { TabBarSpace, useReduceMotion, type ScrollMetrics } from "../../ui/components";
import { haptics } from "../../ui/haptics";
import { color, face, MAX_TEXT_SCALE, shape, space, tint, type } from "../../ui/theme";

// Schedule drag and drop (owner, 2026-10-20: "bring back drag/drop on mobile"; the website's
// route board). Rest a finger on a stop's grip (≡) for a moment to pick it up (a firm tap is
// felt; owner, 2026-10-21: "I'm still struggling to scroll when I have a page full of job
// tiles"; 2026-10-22: "make it slightly less sensitive", so a flick that starts on the grip
// scrolls the page: core SCHEDULE_DRAG, 0.13 s within 8 dp, never while the page glides),
// drag it to a place in a tech's day, a day in the week strip, or Needs a Time, and let go. A
// stop's tile on a day also lifts after a 0.4 s touch and hold anywhere on it (owner,
// 2026-10-22, as Reminders and Things do), its menu then on "⋯"; a quick swipe up or down still
// scrolls the page. Needs a Time's cards keep touch and hold for their menu. Customers to Add
// tiles (no grip) still lift after a touch and hold. The page scrolls by itself
// near the top and bottom. Move… in every stop's menu (and its TalkBack actions) does the
// same, and both end in the same move (core moveJobChange, saved through the sync layer).
//
// While a stop is carried, the other stops in a day slide up or down into their new places as
// it passes them (useSlide), so the gap is always where it will land, and its own place is an
// empty gap: never a card under the one being dragged, and no insertion line (owner,
// 2026-10-21: "The cards should slide into new positions as I dangle the tile";
// docs/design/2026-10-21-schedule-card.md). Reduce Motion: they jump.

/** How long a finger rests on a Customers to Add tile before it lifts, as iOS's drag and drop. */
const HOLD_MS = 350;

/** How far a held finger may drift and still count as "held, not dragged" (it opens the menu). */
export const HOLD_SLOP = 10;

/** The navigation bar under the status bar (the page scrolls under it). */
const BAR = 44;

type ZoneInfo = DropZone extends infer Z ? (Z extends DropZone ? Omit<Z, "rect"> : never) : never;

interface DragApi {
  enabled: boolean;
  /** Ref for a drop zone (a route, a day in the strip, Needs a Time). */
  zoneRef: (info: ZoneInfo) => (node: View | null) => void;
  /** Ref for a stop on a route, so a drop lands between stops. */
  slotRef: (id: string, route: string) => (node: View | null) => void;
  begin: (item: DragItem, node: View, ghost: ReactNode, x: number, y: number) => void;
  /** The page is scrolling, or was a moment ago (a flick still gliding): no lift now. */
  scrolling: () => boolean;
  move: (x: number, y: number) => void;
  end: () => void;
  cancel: () => void;
}

/** What's held and where it would land, for the cards to draw. */
export interface DragHover {
  /** The stop being dragged. */
  id: string | null;
  /** The zone under it. */
  zone: string | null;
  /** The drop would be refused there (a past day, Needs a Time for a started job). */
  refused: string | null;
  /** Where it was picked up from, when that's a route: its place there. */
  from: { route: string; index: number } | null;
  /** Where it would land in a route: its place among the others there. */
  target: { route: string; index: number } | null;
  /** How far the stops after its old place move up to close it. */
  closeGap: number;
  /** How far the stops after its new place move down to open it. */
  openGap: number;
  /** When the last drag ended (ms), so the drop doesn't also glide the list. */
  settledAt: number;
}

const noop = () => () => {};
const Api = createContext<DragApi>({
  enabled: false,
  zoneRef: noop,
  slotRef: noop,
  begin: () => {},
  scrolling: () => false,
  move: () => {},
  end: () => {},
  cancel: () => {},
});
const NO_HOVER: DragHover = {
  id: null,
  zone: null,
  refused: null,
  from: null,
  target: null,
  closeGap: 0,
  openGap: 0,
  settledAt: 0,
};
const Hover = createContext<DragHover>(NO_HOVER);

export function useDragHover(): DragHover {
  return useContext(Hover);
}

export function useDropZones(): Pick<DragApi, "zoneRef" | "slotRef" | "enabled"> {
  return useContext(Api);
}

function measure(node: View): Promise<Rect | null> {
  return new Promise((resolve) => {
    try {
      node.measureInWindow((x, y, width, height) =>
        resolve(width || height ? { x, y, width, height } : null),
      );
    } catch {
      resolve(null);
    }
  });
}

/**
 * The drag and drop for the Schedule: the scope to wrap the page in, the overlay that draws the
 * held card, and the scroll props for the page. `onDrop` gets the plan (core does the move).
 */
export function useScheduleDrag({
  today,
  fallbackTech,
  onDrop,
}: {
  today: string;
  /** Whose day a Needs a Time job joins when dropped on a day in the week strip. */
  fallbackTech: string | null;
  onDrop: (item: DragItem, plan: DropPlan, zone: DropZone | null) => void;
}) {
  const insets = useSafeAreaInsets();
  const tabSpace = useContext(TabBarSpace);
  const { height: windowHeight } = useWindowDimensions();
  const [hover, setHover] = useState<DragHover>(NO_HOVER);
  const [ghost, setGhost] = useState<{ node: ReactNode; width: number } | null>(null);

  const scrollRef = useRef<ScrollView | null>(null);
  const overlayRef = useRef<View>(null);
  const metrics = useRef<ScrollMetrics>({ y: 0, contentHeight: 0, viewHeight: 0 });
  /** When the page last scrolled (ms). */
  const scrolledAt = useRef(0);
  const nodes = useRef(new Map<string, { node: View; zone?: ZoneInfo; slot?: string }>());
  const opts = useRef({ today, fallbackTech, onDrop, top: 0, bottom: 0 });
  useEffect(() => {
    opts.current = {
      today,
      fallbackTech,
      onDrop,
      top: insets.top + BAR,
      bottom: windowHeight - Math.max(tabSpace, insets.bottom),
    };
  });

  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const shown = useSharedValue(0);
  const ghostStyle = useAnimatedStyle(() => ({
    opacity: shown.value,
    transform: [{ translateX: x.value }, { translateY: y.value }, { scale: 1.03 }],
  }));

  const api = useMemo<DragApi>(() => {
    // One drag at a time; everything below lives for that drag.
    let drag: {
      item: DragItem;
      grab: { x: number; y: number };
      origin: { x: number; y: number };
      zones: DropZone[];
      slots: Slot[];
      measuredAt: number;
      ready: boolean;
      pointer: { x: number; y: number };
      plan: DropPlan;
      zone: DropZone | null;
      key: string;
      frame: number | null;
      from: { route: string; index: number } | null;
      /** The carried card's height and the room after it. */
      gap: number;
      /** Each route's distance from one stop to the next. */
      pitch: Map<string, number>;
    } | null = null;

    function place() {
      if (!drag || !drag.ready) return;
      const d = drag;
      x.value = d.pointer.x - d.grab.x - d.origin.x;
      y.value = d.pointer.y - d.grab.y - d.origin.y;
      const dy = metrics.current.y - d.measuredAt;
      const zones = d.zones.map((z) => ({ ...z, rect: scrolled(z.rect, dy) }));
      const slots = d.slots.map((s) => ({ ...s, rect: scrolled(s.rect, dy) }));
      const zone = zoneAt(zones, d.pointer.x, d.pointer.y);
      const index =
        zone?.kind === "route" ? insertIndex(slots, zone.id, d.item.id, d.pointer.y) : 0;
      const plan = planDrop({
        item: d.item,
        zone,
        index,
        today: opts.current.today,
        fallbackTech: opts.current.fallbackTech,
      });
      d.plan = plan;
      d.zone = zone;
      const key = `${zone?.id ?? ""}|${plan.kind === "move" ? plan.index : ""}|${plan.kind}`;
      if (key !== d.key) {
        if (d.key && plan.kind !== "none") haptics.selection();
        d.key = key;
        setHover({
          id: d.item.id,
          zone: zone?.id ?? null,
          refused: plan.kind === "refuse" ? plan.error : null,
          from: d.from,
          target:
            zone?.kind === "route" && (plan.kind === "move" || plan.kind === "none")
              ? { route: zone.id, index }
              : null,
          closeGap: d.gap,
          openGap: zone?.kind === "route" ? (d.pitch.get(zone.id) ?? d.gap) : d.gap,
          settledAt: 0,
        });
      }
    }

    function tick() {
      if (!drag) return;
      const { top, bottom } = opts.current;
      const step = drag.ready ? autoScrollStep(drag.pointer.y, top, bottom) : 0;
      if (step) {
        const m = metrics.current;
        const next = clampScroll(m.y + step, m.contentHeight, m.viewHeight);
        if (next !== m.y) {
          scrollRef.current?.scrollTo({ y: next, animated: false });
          m.y = next;
          place();
        }
      }
      drag.frame = requestAnimationFrame(tick);
    }

    function stop() {
      if (drag?.frame != null) cancelAnimationFrame(drag.frame);
      drag = null;
      shown.value = 0;
      setGhost(null);
      setHover({ ...NO_HOVER, settledAt: Date.now() });
    }

    return {
      enabled: true,
      zoneRef: (info) => (node) => {
        if (node) nodes.current.set(`zone:${info.id}`, { node, zone: info });
        else nodes.current.delete(`zone:${info.id}`);
      },
      slotRef: (id, route) => (node) => {
        if (node) nodes.current.set(`slot:${id}`, { node, slot: route });
        else nodes.current.delete(`slot:${id}`);
      },
      scrolling: () => Date.now() - scrolledAt.current < SCHEDULE_DRAG.scrollSettleMs,
      begin: (item, node, ghostNode, px, py) => {
        if (drag) stop();
        haptics.pickUp();
        const d = {
          item,
          grab: { x: 0, y: 0 },
          origin: { x: 0, y: 0 },
          zones: [] as DropZone[],
          slots: [] as Slot[],
          measuredAt: metrics.current.y,
          ready: false,
          pointer: { x: px, y: py },
          plan: { kind: "none" } as DropPlan,
          zone: null as DropZone | null,
          key: "",
          frame: null as number | null,
          from:
            item.from.kind === "route" ? { route: item.from.route, index: item.from.index } : null,
          gap: 0,
          pitch: new Map<string, number>(),
        };
        drag = d;
        setHover({ ...NO_HOVER, id: item.id, from: d.from });
        const entries = [...nodes.current.entries()];
        void Promise.all([
          measure(node),
          overlayRef.current ? measure(overlayRef.current) : Promise.resolve(null),
          ...entries.map(([, e]) => measure(e.node)),
        ]).then(([card, overlay, ...rects]) => {
          if (drag !== d) return;
          // The card went away before it was measured: nothing is carried.
          if (!card) return stop();
          d.grab = { x: px - card.x, y: py - card.y };
          d.origin = overlay ? { x: overlay.x, y: overlay.y } : { x: 0, y: 0 };
          entries.forEach(([key, e], i) => {
            const rect = rects[i];
            if (!rect) return;
            if (e.zone) d.zones.push({ ...e.zone, rect } as DropZone);
            else if (e.slot) d.slots.push({ id: key.slice("slot:".length), route: e.slot, rect });
          });
          // The carried card's room: from its top to the next stop's, or its height and the
          // usual space after it.
          const byRoute = new Map<string, Slot[]>();
          for (const sl of d.slots) byRoute.set(sl.route, [...(byRoute.get(sl.route) ?? []), sl]);
          for (const [route, list] of byRoute) {
            list.sort((a, b) => a.rect.y - b.rect.y);
            if (list.length > 1) d.pitch.set(route, list[1]!.rect.y - list[0]!.rect.y);
          }
          const own = d.from ? (byRoute.get(d.from.route) ?? []) : [];
          const at = own.findIndex((sl) => sl.id === item.id);
          const next = own[at + 1];
          const prev = own[at - 1];
          d.gap =
            at >= 0 && next
              ? next.rect.y - own[at]!.rect.y
              : at >= 0 && prev
                ? own[at]!.rect.y + own[at]!.rect.height - (prev.rect.y + prev.rect.height)
                : card.height + space["1"];
          d.ready = true;
          setGhost({ node: ghostNode, width: card.width });
          place();
          shown.value = 1;
          d.frame = requestAnimationFrame(tick);
        });
      },
      move: (px, py) => {
        if (!drag) return;
        drag.pointer = { x: px, y: py };
        place();
      },
      end: () => {
        if (!drag) return;
        const d = drag;
        place();
        stop();
        if (d.ready) opts.current.onDrop(d.item, d.plan, d.zone);
      },
      cancel: () => {
        if (drag) stop();
      },
    };
  }, [x, y, shown]);

  // Never stuck mid-drag (owner, 2026-10-21: "it sometimes freezes up"): leaving the app or
  // the Schedule ends any drag, so the page never stays unscrollable.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => s !== "active" && api.cancel());
    return () => {
      sub.remove();
      api.cancel();
    };
  }, [api]);

  const overlay = (
    <View ref={overlayRef} pointerEvents="none" style={StyleSheet.absoluteFill} collapsable={false}>
      {ghost ? (
        <Animated.View
          style={[
            styles.ghost,
            // Lifted: the card floats over the page.
            { width: ghost.width, boxShadow: `0px 12px 28px ${tint(color.navy, 0.24)}` },
            ghostStyle,
          ]}
        >
          {ghost.node}
          {hover.refused ? (
            <View style={[styles.refused, { backgroundColor: color.warning }]}>
              <Text
                style={[type.footnote, face.semiBold, { color: color.onStatus }]}
                maxFontSizeMultiplier={MAX_TEXT_SCALE}
              >
                {hover.refused}
              </Text>
            </View>
          ) : null}
        </Animated.View>
      ) : null}
    </View>
  );

  return {
    api,
    hover,
    overlay,
    dragging: hover.id != null,
    scrollRef,
    onScrollMetrics: (m: Partial<ScrollMetrics>) => {
      if (m.y !== undefined && m.y !== metrics.current.y) scrolledAt.current = Date.now();
      Object.assign(metrics.current, m);
    },
  };
}

/** Wrap the page in this so its stops can be dragged and its zones take drops. */
export function DragScope({
  api,
  hover,
  children,
}: {
  api: DragApi;
  hover: DragHover;
  children: ReactNode;
}) {
  return (
    <Api.Provider value={api}>
      <Hover.Provider value={hover}>{children}</Hover.Provider>
    </Api.Provider>
  );
}

/** The latest item, ghost and card view for a drag source's gesture (read when it starts). */
class SourceBox {
  item: DragItem | null = null;
  ghost: () => ReactNode = () => null;
  node: View | null = null;
  /** The card's touch-and-hold menu, opened by a hold let go without moving. */
  hold: (() => void) | undefined = undefined;
  /** This source's drag is the one carried. */
  active = false;
  private at = { x: 0, y: 0 };
  private moved = false;
  set(item: DragItem | null, ghost: () => ReactNode, hold?: () => void) {
    this.item = item;
    this.ghost = ghost;
    this.hold = hold;
  }
  /** Where the finger lifted the card; it hasn't moved yet. */
  lift(x: number, y: number) {
    this.at = { x, y };
    this.moved = false;
  }
  /** The finger moved; past HOLD_SLOP it's a drag, not a hold. */
  track(x: number, y: number) {
    if (Math.hypot(x - this.at.x, y - this.at.y) > HOLD_SLOP) this.moved = true;
  }
  /** Let go: the menu when it was only held (and there is one), else the drop. */
  release(api: DragApi, holdMenu: boolean) {
    this.active = false;
    if (this.moved || !this.hold || !holdMenu) return api.end();
    api.cancel();
    this.hold();
  }
  /** The gesture ended without a drop (cancelled, interrupted, or finished). */
  finish(api: DragApi) {
    if (!this.active) return;
    this.active = false;
    api.cancel();
  }
  attach = (node: View | null) => {
    this.node = node;
  };
  start(api: DragApi, x: number, y: number) {
    if (!this.item || !this.node) return;
    this.active = true;
    api.begin(this.item, this.node, this.ghost(), x, y);
  }
}

/**
 * The gesture and the ref callback for a stop's card. `item` null: it can't be dragged (a
 * canceled job). `ghost` draws the card under the finger.
 *
 * `"grip"` (Needs a Time cards): the gesture goes on the grip only and picks the card up once
 * the finger has rested on it briefly (SCHEDULE_DRAG.gripDwellMs, within slopPt; owner,
 * 2026-10-22: "make it slightly less sensitive"), so a flick or a scroll that starts on the grip
 * is the page's; the card's body scrolls the page, and its touch and hold is the card's menu
 * (its own Pressable), never a drag. The ref goes on the whole card.
 *
 * `"tile"` (stop tiles on a day, Day and Week; owner, 2026-10-22: "Press-and-hold-then-drag on
 * any tile, keeping the grip as a backup"): `gesture` goes on the grip and picks it up after the
 * brief rest, as `"grip"`; `holdGesture` goes on the whole tile and lifts it after a 0.4 s
 * touch and hold (STOP_HOLD_MS, within the same slop), with the same haptic, then drags it the
 * same way. A quick tap stays a tap and a swipe up or down scrolls the page (moving before the hold ends lets the page have it). Held
 * and let go without moving, it settles back: the tile's menu is on its "⋯" button. A touch
 * that lands while the page is still gliding only stops it, and never lifts a card.
 *
 * `"hold"` (Customers to Add tiles): the gesture goes on the whole tile and lifts it after a
 * touch and hold; `onHold` is its menu, opened by a hold let go without moving.
 */
export function useDragSource(
  item: DragItem | null,
  ghost: () => ReactNode,
  onHold?: () => void,
  mode: "grip" | "hold" | "tile" = "hold",
): { gesture: PanGesture; holdGesture: PanGesture; ref: (node: View | null) => void } {
  const api = useContext(Api);
  const [box] = useState(() => new SourceBox());
  useEffect(() => {
    box.set(item, ghost, onHold);
  });
  // A card that goes away mid-drag (its list re-rendered) ends the drag with it.
  useEffect(() => () => box.finish(api), [api, box]);
  const enabled = api.enabled && item != null;
  const gestures = useMemo(() => {
    const slop = SCHEDULE_DRAG.slopPt;
    const make = (holdMs: number) =>
      Gesture.Pan()
        .runOnJS(true)
        .enabled(enabled)
        .shouldCancelWhenOutside(false)
        // Lifts only once the finger has rested `holdMs` within the slop; moving further first
        // fails it, so the page has the flick or the swipe.
        .activateAfterLongPress(holdMs)
        .failOffsetX([-slop, slop])
        .failOffsetY([-slop, slop])
        // A finger that lands while the page glides only stops it.
        .onTouchesDown((_, manager) => {
          if (api.scrolling()) manager.fail();
        })
        .onStart((e) => {
          box.lift(e.absoluteX, e.absoluteY);
          box.start(api, e.absoluteX, e.absoluteY);
        })
        .onUpdate((e) => {
          box.track(e.absoluteX, e.absoluteY);
          api.move(e.absoluteX, e.absoluteY);
        })
        // Let go: the drop. Interrupted (another gesture or the system took the touch):
        // nothing.
        .onEnd((_, done) => (done ? box.release(api, mode === "hold") : box.finish(api)))
        .onTouchesCancelled(() => box.finish(api))
        .onFinalize(() => box.finish(api));
    return mode === "hold"
      ? { gesture: make(HOLD_MS), holdGesture: make(HOLD_MS) }
      : {
          gesture: make(SCHEDULE_DRAG.gripDwellMs),
          holdGesture: make(STOP_HOLD_MS).enabled(enabled && mode === "tile"),
        };
  }, [api, enabled, box, mode]);
  return { ...gestures, ref: box.attach };
}

/** A quick spring with no bounce, as Reorder Techs' rows. */
const SLIDE = { duration: 300, dampingRatio: 1 } as const;

/**
 * A stop's slide while another is carried past it: a spring into its new place, so the gap is
 * where the carried one will land. Let go, it's back at once (the list has its new order).
 */
export function useSlide(id: string, route: string | null, position: number) {
  const hover = useDragHover();
  const reduceMotion = useReduceMotion();
  const shift = slideFor(hover, id, route, position);
  const dy: SharedValue<number> = useSharedValue(0);
  const carrying = hover.id != null;
  useEffect(() => {
    dy.value = carrying && !reduceMotion ? withSpring(shift, SLIDE) : shift;
  }, [dy, shift, carrying, reduceMotion]);
  return useAnimatedStyle(() => ({ transform: [{ translateY: dy.value }] }));
}

/** Just dropped: the list takes its new order in place, without gliding there again. */
export function justDropped(hover: DragHover) {
  return hover.id == null && Date.now() - hover.settledAt < 600;
}

/** The tint a zone takes while a stop is held over it. */
export function dropTint(hover: DragHover, zone: string): string | undefined {
  if (hover.id == null || hover.zone !== zone) return undefined;
  return hover.refused ? tint(color.warning, 0.14) : color.tinted;
}

const styles = StyleSheet.create({
  ghost: {
    position: "absolute",
    left: 0,
    top: 0,
    gap: space["1"],
    borderRadius: shape.card,
  },
  refused: {
    alignSelf: "flex-start",
    borderRadius: shape.pill,
    paddingHorizontal: 10,
    paddingVertical: 2,
  },
});
