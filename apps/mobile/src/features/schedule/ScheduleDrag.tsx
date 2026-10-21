import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { StyleSheet, Text, View, useWindowDimensions, type ScrollView } from "react-native";
import { Gesture, type PanGesture } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  autoScrollStep,
  clampScroll,
  insertIndex,
  planDrop,
  scrolled,
  zoneAt,
  type DragItem,
  type DropPlan,
  type DropZone,
  type Rect,
  type Slot,
} from "../../lib/scheduleDrag";
import { TabBarSpace, type ScrollMetrics } from "../../ui/components";
import { haptics } from "../../ui/haptics";
import { color, face, MAX_TEXT_SCALE, shape, space, tint, type } from "../../ui/theme";

// Schedule drag and drop (owner, 2026-10-20: "bring back drag/drop on mobile"; the website's
// route board). Touch and hold a stop to pick it up (a firm tap is felt), drag it to a place in
// a tech's day, a day in the week strip, or Needs a Time, and let go. The page scrolls by itself
// near the top and bottom. Move… on every stop stays the visible and accessible way to do the
// same, and both end in the same move (core moveJobChange, saved through the sync layer).

/** How long a finger rests on a stop before it lifts, as iOS's drag and drop. */
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
}

const noop = () => () => {};
const Api = createContext<DragApi>({
  enabled: false,
  zoneRef: noop,
  slotRef: noop,
  begin: () => {},
  move: () => {},
  end: () => {},
  cancel: () => {},
});
const NO_HOVER: DragHover = { id: null, zone: null, refused: null };
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
  const line = useSharedValue({ x: 0, y: 0, width: 0, on: 0 });
  const ghostStyle = useAnimatedStyle(() => ({
    opacity: shown.value,
    transform: [{ translateX: x.value }, { translateY: y.value }, { scale: 1.03 }],
  }));
  const lineStyle = useAnimatedStyle(() => ({
    opacity: line.value.on,
    width: line.value.width,
    transform: [{ translateX: line.value.x }, { translateY: line.value.y }],
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
      // The line where it would land, between two stops.
      if (zone?.kind === "route" && plan.kind === "move") {
        const others = slots
          .filter((s) => s.route === zone.id && s.id !== d.item.id)
          .sort((a, b) => a.rect.y - b.rect.y);
        const below = others[index];
        const above = others[index - 1];
        const at = below
          ? below.rect.y - 6
          : above
            ? above.rect.y + above.rect.height + 6
            : zone.rect.y + zone.rect.height - 12;
        line.value = {
          x: zone.rect.x + space["3"] - d.origin.x,
          y: at - 1.5 - d.origin.y,
          width: Math.max(0, zone.rect.width - space["3"] * 2),
          on: 1,
        };
      } else if (line.value.on) {
        line.value = { ...line.value, on: 0 };
      }
      const key = `${zone?.id ?? ""}|${plan.kind === "move" ? plan.index : ""}|${plan.kind}`;
      if (key !== d.key) {
        if (d.key && plan.kind !== "none") haptics.selection();
        d.key = key;
        setHover({
          id: d.item.id,
          zone: zone?.id ?? null,
          refused: plan.kind === "refuse" ? plan.error : null,
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
      line.value = { ...line.value, on: 0 };
      setGhost(null);
      setHover(NO_HOVER);
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
        };
        drag = d;
        setHover({ id: item.id, zone: null, refused: null });
        const entries = [...nodes.current.entries()];
        void Promise.all([
          measure(node),
          overlayRef.current ? measure(overlayRef.current) : Promise.resolve(null),
          ...entries.map(([, e]) => measure(e.node)),
        ]).then(([card, overlay, ...rects]) => {
          if (drag !== d || !card) return;
          d.grab = { x: px - card.x, y: py - card.y };
          d.origin = overlay ? { x: overlay.x, y: overlay.y } : { x: 0, y: 0 };
          entries.forEach(([key, e], i) => {
            const rect = rects[i];
            if (!rect) return;
            if (e.zone) d.zones.push({ ...e.zone, rect } as DropZone);
            else if (e.slot) d.slots.push({ id: key.slice("slot:".length), route: e.slot, rect });
          });
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
  }, [x, y, shown, line]);

  const overlay = (
    <View ref={overlayRef} pointerEvents="none" style={StyleSheet.absoluteFill} collapsable={false}>
      <Animated.View style={[styles.line, { backgroundColor: color.link }, lineStyle]} />
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
  release(api: DragApi) {
    if (this.moved || !this.hold) return api.end();
    api.cancel();
    this.hold();
  }
  attach = (node: View | null) => {
    this.node = node;
  };
  start(api: DragApi, x: number, y: number) {
    if (this.item && this.node) api.begin(this.item, this.node, this.ghost(), x, y);
  }
}

/**
 * Touch and hold to drag: the gesture and the ref callback for a stop's card. `item` null: it
 * can't be dragged (a canceled job). `ghost` draws the card under the finger. `onHold` is the
 * card's touch-and-hold menu (gestures spec section 12): a card held and let go without moving
 * opens it, as iOS lifts an item and shows its menu; moved, it's dragged as before.
 */
export function useDragSource(
  item: DragItem | null,
  ghost: () => ReactNode,
  onHold?: () => void,
): { gesture: PanGesture; ref: (node: View | null) => void } {
  const api = useContext(Api);
  const [box] = useState(() => new SourceBox());
  useEffect(() => {
    box.set(item, ghost, onHold);
  });
  const enabled = api.enabled && item != null;
  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .enabled(enabled)
        .activateAfterLongPress(HOLD_MS)
        .onStart((e) => {
          box.lift(e.absoluteX, e.absoluteY);
          box.start(api, e.absoluteX, e.absoluteY);
        })
        .onUpdate((e) => {
          box.track(e.absoluteX, e.absoluteY);
          api.move(e.absoluteX, e.absoluteY);
        })
        .onEnd(() => box.release(api))
        .onFinalize(() => api.cancel()),
    [api, enabled, box],
  );
  return { gesture, ref: box.attach };
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
  line: { position: "absolute", left: 0, top: 0, height: 3, borderRadius: 2 },
  refused: {
    alignSelf: "flex-start",
    borderRadius: shape.pill,
    paddingHorizontal: 10,
    paddingVertical: 2,
  },
});
