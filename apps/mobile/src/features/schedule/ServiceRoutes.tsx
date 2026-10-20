import { router } from "expo-router";
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
  AccessibilityInfo,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type ScrollView,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  estimateDriveMinutes,
  suggestServiceDays,
  workDay,
  type DaySuggestion,
} from "@leakbook/core";
import { planContext, useTeam } from "../../data/schedule";
import { savePlanDays, useRoutePlans } from "../../data/serviceRoutes";
import { autoScrollStep, clampScroll } from "../../lib/scheduleDrag";
import {
  PUT_BACK,
  ROUTE_HOLD_MS,
  SPRING_MS,
  SUGGEST_HELP,
  WEEKDAY_NAMES,
  WEEKDAY_SHORT,
  customersToAdd,
  customersWord,
  dayAt,
  dayDetail,
  daySummary,
  emptyDay,
  firstTech,
  keptMessage,
  leftOutNote,
  moveHint,
  moveWrite,
  movedMessage,
  multiDayNote,
  nothingSuggested,
  overNote,
  planDayDrop,
  rebuildPlans,
  repeatNote,
  routeDay,
  routeDays,
  searchCards,
  segmentLabel,
  sortDays,
  suggestedLabel,
  undoRow,
  withSuggestions,
  type PlanUndo,
  type PlanWrite,
  type RouteDay,
  type RoutePlanCard,
} from "../../lib/serviceRoutes";
import { useCompany, useSession } from "../../state/session";
import {
  Button,
  Card,
  FilterPills,
  Group,
  ListRow,
  Notice,
  Screen,
  SearchField,
  Segmented,
  T,
  TabBarSpace,
  type ScrollMetrics,
} from "../../ui/components";
import { Glass } from "../../ui/Glass";
import { haptics } from "../../ui/haptics";
import { ModalSheet } from "../../ui/ModalSheet";
import { AddressLine, NotOnMapTag } from "../../ui/NotOnMap";
import {
  cardShadow,
  color,
  face,
  font,
  MAX_TEXT_SCALE,
  minTap,
  shape,
  space,
  tabular,
  thumbShadow,
  tint,
  type,
} from "../../ui/theme";
import { WebIcon } from "../../ui/WebIcon";
import { DayMap } from "./DayMap";

// Schedule › Routes (owners and admins; owner, 2026-10-20, docs/plans/route-maps.md part 3,
// the website's service-routes.tsx phone layout): which weekday each pool customer is serviced
// on, and by whom. Tech pills, Customers to Add and Suggest Days as a grouped list, the working
// days as a segmented control, then the day's map and its pools in driving order. Tap a card to
// Move it; touch and hold to drag it onto a day's segment (holding it there opens that day).
// Every change saves through the sync layer at once and has Undo; Suggest Days shows its
// suggestions in place and saves nothing until Keep. Worked out on the phone, so it works
// offline too; the server re-makes each plan's coming visits when the change syncs.

interface Moving {
  plan: RoutePlanCard;
  /** The day it's on (a plan on several days moves one at a time); null: Customers to Add. */
  from: number | null;
}

interface Suggested {
  list: DaySuggestion[];
  left: string[];
  /** What was planned, for the note on what was left out. */
  asked: RoutePlanCard[];
}

type Result = { message?: string; error?: string; undo?: PlanUndo[]; tone?: "success" | "info" };

export function ServiceRoutes({
  viewControl,
  headerRight,
}: {
  /** Schedule's Day · Week · Month · Routes control, on its own row. */
  viewControl: ReactNode;
  headerRight?: () => ReactNode;
}) {
  const company = useCompany();
  const { user } = useSession();
  const me = user?.id ?? "";
  const ctx = planContext(company);
  const today = ctx.today;
  const hours = workDay(ctx.settings);
  const workDays = ctx.settings.workDays;
  const team = useTeam(company.id);
  const { cards, rows } = useRoutePlans(company.id, today);

  // Active techs, you first (as on the rest of Schedule).
  const techs = useMemo(
    () =>
      team
        .filter((t) => t.status === "active")
        .sort((a, b) => Number(b.user_id === me) - Number(a.user_id === me))
        .map((t) => ({ id: t.user_id, name: t.name })),
    [team, me],
  );
  const techIds = useMemo(() => techs.map((t) => t.id), [techs]);

  const [suggested, setSuggested] = useState<Suggested | null>(null);
  const shown = useMemo(
    () => (suggested ? withSuggestions(cards, suggested.list) : cards),
    [cards, suggested],
  );
  const suggestedIds = useMemo(() => new Set(suggested?.list.map((s) => s.id)), [suggested]);
  const [picked, setPicked] = useState<string | null>(null);
  const tech = firstTech(cards, techIds, picked);
  const techName = techs.find((t) => t.id === tech)?.name ?? "";
  const days = useMemo(() => routeDays(shown, tech, workDays), [shown, tech, workDays]);
  const routes = useMemo(
    () =>
      days.map((d) => routeDay({ plans: shown, tech, day: d, depot: ctx.depot, workDay: hours })),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ctx and hours are rebuilt each render
    [days, shown, tech, ctx.depot?.lat, ctx.depot?.lng, hours.startMin, hours.endMin],
  );
  const toAdd = useMemo(() => customersToAdd(shown, techIds), [shown, techIds]);
  const [pickedDay, setPickedDay] = useState<number | null>(null);
  const day =
    pickedDay != null && days.includes(pickedDay)
      ? pickedDay
      : (routes.find((r) => r.plans.length)?.day ?? days[0] ?? 1);
  const current = routes.find((r) => r.day === day);

  const [result, setResult] = useState<Result | null>(null);
  const [moving, setMoving] = useState<Moving | null>(null);
  const [sheet, setSheet] = useState<"add" | "suggest" | null>(null);

  // --- Saving ----------------------------------------------------------------------

  function write(list: PlanWrite[]): string | null {
    try {
      savePlanDays(company.id, list);
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  }

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
      haptics.selection();
      return;
    }
    const row = rows.get(m.plan.planId);
    if (!row) return setResult({ error: "This plan is gone. Pull down to refresh." });
    const error = write([moveWrite(row, m, today)]);
    if (error) return setResult({ error });
    haptics.success();
    const message = movedMessage(m.to);
    AccessibilityInfo.announceForAccessibility(message);
    setResult({ message, undo: [undoRow(row)], tone: "success" });
  }

  function undo(list: PlanUndo[]) {
    const error = write(list);
    if (error) return setResult({ error });
    haptics.light();
    setResult({ message: PUT_BACK, tone: "info" });
  }

  function suggest(ids: string[], forTechs: string[], asked: RoutePlanCard[]) {
    setSheet(null);
    setResult(null);
    const wanted = new Set(ids);
    const asPlan = (c: RoutePlanCard) => ({
      id: c.planId,
      techId: c.techId,
      days: c.days,
      location: c.location,
      durationMin: c.durationMin,
    });
    const r = suggestServiceDays({
      place: cards.filter((c) => wanted.has(c.planId)).map(asPlan),
      keep: cards.filter((c) => !wanted.has(c.planId)).map(asPlan),
      techs: forTechs.filter((id) => techIds.includes(id)),
      workDays,
      depot: ctx.depot,
      day: hours,
      drive: estimateDriveMinutes,
    });
    if (!r.suggestions.length)
      return setResult({ message: nothingSuggested(leftOutNote(asked, r.left)), tone: "info" });
    haptics.selection();
    setSuggested({ list: r.suggestions, left: r.left, asked });
  }

  function keep() {
    const s = suggested;
    if (!s) return;
    const writes: PlanWrite[] = [];
    const before: PlanUndo[] = [];
    for (const x of s.list) {
      const row = rows.get(x.id);
      if (!row) continue;
      writes.push(moveWrite(row, { from: null, to: x.day, tech: x.techId }, today));
      before.push(undoRow(row));
    }
    setSuggested(null);
    const error = write(writes);
    if (error) return setResult({ error });
    haptics.success();
    setResult({ message: keptMessage(writes.length), undo: before, tone: "success" });
  }

  // --- Moving ----------------------------------------------------------------------

  const canMove = (p: RoutePlanCard) => !suggested || suggestedIds.has(p.planId);
  const openMove = (plan: RoutePlanCard, from: number | null) => {
    if (!canMove(plan)) return;
    setSheet(null);
    setMoving({ plan, from });
  };

  const drag = useRoutesDrag({
    onSpring: (d) => {
      haptics.selection();
      setPickedDay(d);
    },
    onDrop: (held, to) => {
      const plan = planDayDrop({ plan: held.plan, from: held.from, to, tech });
      if (plan.kind === "none") return;
      if (plan.kind === "refuse") {
        haptics.light();
        setResult({ error: plan.error });
        return;
      }
      move({ plan: held.plan, ...plan });
      setPickedDay(plan.to);
    },
  });

  // --- Views -----------------------------------------------------------------------

  const heldCard = drag.held ? (shown.find((p) => p.planId === drag.held) ?? null) : null;

  if (!cards.length)
    return (
      <Screen
        title="Schedule"
        subtitle="Which day each pool customer is serviced"
        headerRight={headerRight}
      >
        {viewControl}
        <Card style={{ alignItems: "center", gap: space["3"] }}>
          <T variant="heading" style={{ textAlign: "center" }}>
            No Maintenance Plans Yet
          </T>
          <T muted style={{ textAlign: "center" }}>
            Set up a maintenance plan on a customer’s pool to see its day here.
          </T>
          <Button title="Go to Customers" onPress={() => router.push("/customers")} />
        </Card>
      </Screen>
    );

  const notice = result?.error ? (
    <Notice tone="error">{result.error}</Notice>
  ) : result?.message ? (
    <Notice tone={result.tone === "info" ? "info" : "success"}>
      <View style={styles.result}>
        <Text
          style={[type.body, face.medium, { flex: 1, color: color.text }]}
          maxFontSizeMultiplier={MAX_TEXT_SCALE}
        >
          {result.message}
        </Text>
        {result.undo?.length ? (
          <Button
            kind="quiet"
            title="Undo"
            accessibilityLabel={`Undo, ${result.message}`}
            onPress={() => undo(result.undo!)}
            style={{ paddingHorizontal: 12, marginRight: -8 }}
          />
        ) : null}
      </View>
    </Notice>
  ) : null;

  return (
    <DragContext.Provider value={drag.api}>
      <Screen
        title="Schedule"
        subtitle="Which day each pool customer is serviced"
        headerRight={headerRight}
        scrollEnabled={drag.held == null}
        scrollRef={drag.scrollRef}
        onScrollMetrics={drag.onScrollMetrics}
        overlay={
          <>
            {drag.overlay}
            {suggested ? (
              <SuggestBar
                count={suggested.list.length}
                techs={new Set(suggested.list.map((s) => s.techId)).size}
                note={leftOutNote(suggested.asked, suggested.left)}
                onCancel={() => {
                  haptics.light();
                  setSuggested(null);
                }}
                onKeep={keep}
              />
            ) : null}
          </>
        }
      >
        {viewControl}

        {techs.length > 1 ? (
          <FilterPills
            label="Whose routes"
            options={techs.map((t) => ({ value: t.id, label: t.name }))}
            value={tech ?? ""}
            onChange={setPicked}
          />
        ) : null}

        <Group>
          <ListRow
            onPress={() => setSheet("add")}
            accessibilityLabel={`Customers to Add, ${toAdd.length}`}
            detail={
              <T muted style={tabular}>
                {String(toAdd.length)}
              </T>
            }
          >
            <T>Customers to Add</T>
          </ListRow>
          <View style={(suggested || !tech) && { opacity: 0.5 }}>
            <ListRow
              title="Suggest Days"
              tone="link"
              onPress={suggested || !tech ? undefined : () => setSheet("suggest")}
            />
          </View>
        </Group>

        {notice}

        <View style={{ gap: space["3"] }}>
          <DaySegments routes={routes} day={day} onPick={setPickedDay} />
          {current ? (
            <View
              style={{ gap: space["2"] }}
              accessibilityLabel={`${techName}, ${WEEKDAY_NAMES[current.day]}`}
            >
              {current.plans.length ? (
                <DayMap
                  company={company.id}
                  pins={current.pins}
                  missing={current.missing}
                  stops={current.plans.map((p) => ({
                    id: p.planId,
                    time: null,
                    customer: p.customer,
                    detail: p.address,
                  }))}
                  tech={techName}
                  day={WEEKDAY_NAMES[current.day]}
                />
              ) : null}
              <DayFacts route={current} />
              {/* One list for every day, so a card held while its day springs to another
                  stays mounted (hidden) and the drag goes on. */}
              <View style={{ gap: space["2"] }}>
                {current.plans.map((p, i) => (
                  <PlanCard
                    key={p.planId}
                    plan={p}
                    from={current.day}
                    number={i + 1}
                    suggested={suggestedIds.has(p.planId)}
                    disabled={!canMove(p)}
                    onMove={() => openMove(p, current.day)}
                  />
                ))}
                {heldCard && !current.plans.includes(heldCard) ? (
                  <PlanCard
                    key={heldCard.planId}
                    plan={heldCard}
                    from={null}
                    suggested={false}
                    disabled={false}
                    onMove={() => {}}
                    hidden
                  />
                ) : null}
                {current.plans.length ? null : (
                  <View key="empty" style={[styles.empty, { backgroundColor: color.emptyFill }]}>
                    <T muted style={{ textAlign: "center" }}>
                      {emptyDay(current.day)}
                    </T>
                  </View>
                )}
              </View>
            </View>
          ) : null}
        </View>

        {/* Room for the last cards to scroll above the suggestions' bar. */}
        {suggested ? <View style={{ height: 96 }} /> : null}
      </Screen>

      <AddSheet
        open={sheet === "add"}
        plans={toAdd}
        suggestedIds={suggestedIds}
        canMove={canMove}
        onClose={() => setSheet(null)}
        onMove={(p) => openMove(p, null)}
      />

      {sheet === "suggest" && tech ? (
        <SuggestSheet
          tech={{ id: tech, name: techName }}
          techs={techs}
          toAdd={toAdd}
          rebuild={rebuildPlans(cards, tech)}
          onClose={() => setSheet(null)}
          onSuggest={suggest}
        />
      ) : null}

      {moving ? (
        <MoveSheet
          moving={moving}
          techs={techs}
          tech={tech}
          workDays={workDays}
          onClose={() => setMoving(null)}
          onMove={(to, techId) => {
            setMoving(null);
            move({ plan: moving.plan, from: moving.from, to, tech: techId });
          }}
        />
      ) : null}
    </DragContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Drag and drop: a card onto a day's segment
// ---------------------------------------------------------------------------

/** The navigation bar under the status bar (the page scrolls under it). */
const BAR = 44;

interface Held {
  plan: RoutePlanCard;
  from: number | null;
}

interface RoutesDragApi {
  /** The day the held card is over, and what's held. */
  over: number | null;
  held: string | null;
  segmentRef: (day: number) => (node: View | null) => void;
  begin: (held: Held, node: View, ghost: ReactNode, x: number, y: number) => void;
  move: (x: number, y: number) => void;
  end: () => void;
  cancel: () => void;
}

const DragContext = createContext<RoutesDragApi | null>(null);

type Rect = { x: number; y: number; width: number; height: number };

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
 * Hold a card (a firm tap is felt) and drag it onto a day's segment; holding it over a segment
 * opens that day (spring loading). The page scrolls by itself near the top and bottom, as the
 * Schedule's drag does (ScheduleDrag.tsx).
 */
function useRoutesDrag({
  onDrop,
  onSpring,
}: {
  onDrop: (held: Held, day: number | null) => void;
  onSpring: (day: number) => void;
}) {
  const insets = useSafeAreaInsets();
  const tabSpace = useContext(TabBarSpace);
  const { height: windowHeight } = useWindowDimensions();
  const [held, setHeld] = useState<string | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const [ghost, setGhost] = useState<{ node: ReactNode; width: number } | null>(null);
  const scrollRef = useRef<ScrollView | null>(null);
  const overlayRef = useRef<View>(null);
  const metrics = useRef<ScrollMetrics>({ y: 0, contentHeight: 0, viewHeight: 0 });
  const segments = useRef(new Map<number, View>());
  const opts = useRef({ onDrop, onSpring, top: 0, bottom: 0 });
  useEffect(() => {
    opts.current = {
      onDrop,
      onSpring,
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

  const api = useMemo(() => {
    let drag: {
      held: Held;
      grab: { x: number; y: number };
      origin: { x: number; y: number };
      zones: { day: number; rect: Rect }[];
      measuredAt: number;
      ready: boolean;
      pointer: { x: number; y: number };
      day: number | null;
      spring: ReturnType<typeof setTimeout> | null;
      frame: number | null;
    } | null = null;

    function place() {
      if (!drag || !drag.ready) return;
      const d = drag;
      x.value = d.pointer.x - d.grab.x - d.origin.x;
      y.value = d.pointer.y - d.grab.y - d.origin.y;
      const dy = metrics.current.y - d.measuredAt;
      const zones = d.zones.map((z) => ({ ...z, rect: { ...z.rect, y: z.rect.y - dy } }));
      const at = dayAt(zones, d.pointer.x, d.pointer.y);
      if (at === d.day) return;
      d.day = at;
      if (d.spring) clearTimeout(d.spring);
      d.spring = null;
      if (at != null) {
        haptics.selection();
        d.spring = setTimeout(() => opts.current.onSpring(at), SPRING_MS);
      }
      setOver(at);
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
      if (drag?.spring) clearTimeout(drag.spring);
      drag = null;
      shown.value = 0;
      setGhost(null);
      setHeld(null);
      setOver(null);
    }

    return {
      segmentRef: (day: number) => (node: View | null) => {
        if (node) segments.current.set(day, node);
        else segments.current.delete(day);
      },
      begin: (h: Held, node: View, ghostNode: ReactNode, px: number, py: number) => {
        if (drag) stop();
        haptics.pickUp();
        const d = {
          held: h,
          grab: { x: 0, y: 0 },
          origin: { x: 0, y: 0 },
          zones: [] as { day: number; rect: Rect }[],
          measuredAt: metrics.current.y,
          ready: false,
          pointer: { x: px, y: py },
          day: null as number | null,
          spring: null as ReturnType<typeof setTimeout> | null,
          frame: null as number | null,
        };
        drag = d;
        setHeld(h.plan.planId);
        const entries = [...segments.current.entries()];
        void Promise.all([
          measure(node),
          overlayRef.current ? measure(overlayRef.current) : Promise.resolve(null),
          ...entries.map(([, n]) => measure(n)),
        ]).then(([card, overlay, ...rects]) => {
          if (drag !== d || !card) return;
          d.grab = { x: px - card.x, y: py - card.y };
          d.origin = overlay ? { x: overlay.x, y: overlay.y } : { x: 0, y: 0 };
          entries.forEach(([day], i) => {
            const rect = rects[i];
            if (rect) d.zones.push({ day, rect });
          });
          d.ready = true;
          setGhost({ node: ghostNode, width: card.width });
          place();
          shown.value = 1;
          d.frame = requestAnimationFrame(tick);
        });
      },
      move: (px: number, py: number) => {
        if (!drag) return;
        drag.pointer = { x: px, y: py };
        place();
      },
      end: () => {
        if (!drag) return;
        const d = drag;
        place();
        stop();
        if (d.ready) opts.current.onDrop(d.held, d.day);
      },
      cancel: () => {
        if (drag) stop();
      },
    };
  }, [x, y, shown]);

  const overlay = (
    <View ref={overlayRef} pointerEvents="none" style={StyleSheet.absoluteFill} collapsable={false}>
      {ghost ? (
        <Animated.View
          style={[
            styles.ghost,
            { width: ghost.width, boxShadow: `0px 12px 28px ${tint(color.navy, 0.24)}` },
            ghostStyle,
          ]}
        >
          {ghost.node}
        </Animated.View>
      ) : null}
    </View>
  );

  return {
    api: { ...api, over, held } as RoutesDragApi,
    held,
    overlay,
    scrollRef,
    onScrollMetrics: (m: Partial<ScrollMetrics>) => {
      Object.assign(metrics.current, m);
    },
  };
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

/** "14 pools · 6 hr 20 min", and a warning when the day runs long. */
function DayFacts({ route: r }: { route: RouteDay }) {
  const summary = daySummary(r);
  if (!summary) return null;
  const over = overNote(r);
  return (
    <View accessible accessibilityLabel={`${summary}: ${dayDetail(r)}${over ? `. ${over}` : ""}`}>
      <T variant="secondary" muted style={tabular}>
        {summary}
      </T>
      {over ? (
        <Text
          style={[type.secondary, face.semiBold, { color: color.warning }]}
          maxFontSizeMultiplier={MAX_TEXT_SCALE}
        >
          {over}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * The working days as a segmented control, each with its pool count under it. While a card is
 * held, each segment takes the drop, and holding it over one opens that day.
 */
function DaySegments({
  routes,
  day,
  onPick,
}: {
  routes: RouteDay[];
  day: number;
  onPick: (d: number) => void;
}) {
  const drag = useContext(DragContext);
  const dragging = drag?.held != null;
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel="Day"
      style={[styles.track, { backgroundColor: color.fill }]}
    >
      {routes.map((r) => {
        const active = r.day === day;
        const over = dragging && drag?.over === r.day;
        return (
          <Pressable
            key={r.day}
            ref={drag?.segmentRef(r.day)}
            collapsable={false}
            accessibilityRole="radio"
            accessibilityState={{ checked: active }}
            accessibilityLabel={segmentLabel(r)}
            onPress={() => {
              if (active) return;
              haptics.selection();
              onPick(r.day);
            }}
            style={[
              styles.segment,
              active && [{ backgroundColor: color.thumb }, thumbShadow()],
              dragging && !over && !active && { backgroundColor: tint(color.link, 0.1) },
              over && { backgroundColor: color.link, transform: [{ scale: 1.05 }] },
            ]}
          >
            <Text
              style={[
                type.segment,
                active ? face.semiBold : face.medium,
                { color: over ? color.onPrimary : color.text },
              ]}
              numberOfLines={1}
              adjustsFontSizeToFit
              maxFontSizeMultiplier={1.4}
            >
              {WEEKDAY_SHORT[r.day]}
            </Text>
            <Text
              style={[
                styles.count,
                tabular,
                {
                  color: over
                    ? tint(color.onPrimary, 0.85)
                    : active
                      ? tint(color.text, 0.75)
                      : color.textMuted,
                },
              ]}
              maxFontSizeMultiplier={1.4}
            >
              {r.plans.length}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Six dots: the card can be dragged. */
function Grip() {
  return (
    <View style={styles.grip} accessible={false} importantForAccessibility="no-hide-descendants">
      {[0, 1, 2].map((row) => (
        <View key={row} style={{ flexDirection: "row", gap: 4 }}>
          {[0, 1].map((c) => (
            <View key={c} style={[styles.dot, { backgroundColor: tint(color.textMuted, 0.7) }]} />
          ))}
        </View>
      ))}
    </View>
  );
}

/** What a card shows: its number, name, address (warning when not on the map), notes. */
function PlanFace({
  plan: p,
  number,
  suggested,
  grip,
}: {
  plan: RoutePlanCard;
  number?: number;
  suggested: boolean;
  grip: boolean;
}) {
  const note = repeatNote(p);
  return (
    <View style={[styles.face, number == null && { paddingLeft: space["4"] }]}>
      {number != null ? (
        <View style={[styles.number, { backgroundColor: color.fill }]}>
          <Text
            style={[styles.numberText, tabular, { color: color.text }]}
            maxFontSizeMultiplier={1.6}
          >
            {number}
          </Text>
        </View>
      ) : null}
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text
          numberOfLines={2}
          style={[type.body, face.semiBold, { color: color.text }]}
          maxFontSizeMultiplier={MAX_TEXT_SCALE}
        >
          {p.customer}
        </Text>
        {p.address ? (
          <AddressLine notOnMap={!p.location} lineHeight={20}>
            <T variant="secondary" muted numberOfLines={1}>
              {p.address}
            </T>
          </AddressLine>
        ) : !p.location ? (
          <NotOnMapTag lineHeight={20} />
        ) : null}
        {suggested || note ? (
          <View style={styles.chips}>
            {suggested ? (
              <View style={[styles.pill, { backgroundColor: tint(color.link, 0.12) }]}>
                <Text
                  style={[type.footnote, face.semiBold, { color: color.link }]}
                  maxFontSizeMultiplier={MAX_TEXT_SCALE}
                >
                  Suggested
                </Text>
              </View>
            ) : null}
            {note ? (
              <Text
                style={[type.footnote, { color: color.textMuted }]}
                maxFontSizeMultiplier={MAX_TEXT_SCALE}
              >
                {note}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>
      {grip ? <Grip /> : null}
    </View>
  );
}

/** The latest plan, ghost and view for a card's drag gesture (read when it starts). */
class CardBox {
  held: Held | null = null;
  ghost: () => ReactNode = () => null;
  node: View | null = null;
  set(held: Held, ghost: () => ReactNode) {
    this.held = held;
    this.ghost = ghost;
  }
  attach = (node: View | null) => {
    this.node = node;
  };
  start(begin: RoutesDragApi["begin"], x: number, y: number) {
    if (this.held && this.node) begin(this.held, this.node, this.ghost(), x, y);
  }
}

/** Touch and hold a card to drag it: its gesture and the ref for its view. */
function useCardDrag(
  drag: RoutesDragApi | null,
  enabled: boolean,
  held: Held,
  ghost: () => ReactNode,
) {
  const [box] = useState(() => new CardBox());
  useEffect(() => {
    box.set(held, ghost);
  });
  const begin = drag?.begin;
  const moveTo = drag?.move;
  const end = drag?.end;
  const cancel = drag?.cancel;
  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .enabled(enabled)
        .activateAfterLongPress(ROUTE_HOLD_MS)
        .onStart((e) => {
          if (begin) box.start(begin, e.absoluteX, e.absoluteY);
        })
        .onUpdate((e) => moveTo?.(e.absoluteX, e.absoluteY))
        .onEnd(() => end?.())
        .onFinalize(() => cancel?.()),
    [enabled, box, begin, moveTo, end, cancel],
  );
  return { gesture, ref: box.attach };
}

/**
 * A customer on a day (numbered in driving order) or in Customers to Add. Tapping it opens
 * Move…; touching and holding picks it up to drop on a day (when `from` is given or it's in
 * the page; the Customers to Add sheet's cards move with Move…).
 */
function PlanCard({
  plan: p,
  from,
  number,
  suggested,
  disabled,
  onMove,
  draggable = true,
  hidden = false,
}: {
  plan: RoutePlanCard;
  from: number | null;
  number?: number;
  suggested: boolean;
  disabled: boolean;
  onMove: () => void;
  draggable?: boolean;
  /** Kept mounted out of sight while it's held and its day is no longer showing. */
  hidden?: boolean;
}) {
  const drag = useContext(DragContext);
  const enabled = !!drag && draggable && !disabled;
  const { gesture, ref } = useCardDrag(drag, enabled, { plan: p, from }, () => (
    <View style={[styles.clip, { backgroundColor: color.surface }]}>
      <PlanFace plan={p} number={number} suggested={suggested} grip />
    </View>
  ));
  const note = repeatNote(p);
  const label = [
    number != null ? `${number}. ${p.customer}` : p.customer,
    p.address || null,
    !p.location ? "Not found on the map" : null,
    suggested ? "Suggested" : null,
    note,
  ]
    .filter(Boolean)
    .join(", ");
  const card = (
    <View
      ref={ref}
      collapsable={false}
      style={[
        styles.card,
        { backgroundColor: color.surface },
        cardShadow(),
        drag?.held === p.planId && { opacity: 0.35 },
        suggested && { borderWidth: 2, borderColor: tint(color.link, 0.4) },
        hidden && styles.hidden,
      ]}
      pointerEvents={hidden ? "none" : "auto"}
      accessibilityElementsHidden={hidden}
      importantForAccessibility={hidden ? "no-hide-descendants" : "auto"}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={disabled ? undefined : "Opens Move"}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onMove}
        android_ripple={{ color: color.ripple }}
        style={({ pressed }) => [styles.clip, pressed && { backgroundColor: color.rowPressed }]}
      >
        <PlanFace plan={p} number={number} suggested={suggested} grip={enabled} />
      </Pressable>
    </View>
  );
  return draggable ? <GestureDetector gesture={gesture}>{card}</GestureDetector> : card;
}

/** Customers to Add, in a sheet: plans nobody services yet, newest first, with a search. */
function AddSheet({
  open,
  plans,
  suggestedIds,
  canMove,
  onClose,
  onMove,
}: {
  open: boolean;
  plans: RoutePlanCard[];
  suggestedIds: Set<string>;
  canMove: (p: RoutePlanCard) => boolean;
  onClose: () => void;
  onMove: (p: RoutePlanCard) => void;
}) {
  const [query, setQuery] = useState("");
  const list = searchCards(plans, query);
  return (
    <ModalSheet visible={open} onClose={onClose} title="Customers to Add" cancel="Done">
      {plans.length > 4 || query ? (
        <SearchField
          value={query}
          onChangeText={setQuery}
          placeholder="Search"
          label="Search Customers to Add"
        />
      ) : null}
      {plans.length === 0 ? (
        <T muted>Every customer has a day.</T>
      ) : list.length === 0 ? (
        <T muted>No customers to add match “{query.trim()}”.</T>
      ) : (
        <View style={{ gap: space["2"] }}>
          {list.map((p) => (
            <PlanCard
              key={p.planId}
              plan={p}
              from={null}
              suggested={suggestedIds.has(p.planId)}
              disabled={!canMove(p)}
              onMove={() => onMove(p)}
              draggable={false}
            />
          ))}
        </View>
      )}
    </ModalSheet>
  );
}

function CheckMark({ on }: { on: boolean }) {
  return (
    <View style={!on && { opacity: 0 }}>
      <WebIcon name="check" size={20} color={color.link} strokeWidth={2.4} />
    </View>
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
  detail?: string;
  disabled?: boolean;
  onPick: () => void;
}) {
  return (
    <View style={disabled && { opacity: 0.5 }}>
      <ListRow
        accessibilityLabel={`${title}${detail ? `, ${detail}` : ""}${on ? ", selected" : ""}`}
        onPress={disabled ? undefined : onPick}
        chevron={false}
        trailing={<CheckMark on={on} />}
      >
        <T>{title}</T>
        {detail ? (
          <T variant="secondary" muted>
            {detail}
          </T>
        ) : null}
      </ListRow>
    </View>
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
  const note = multiDayNote(p.days, from);
  return (
    <ModalSheet visible onClose={onClose} title={`Move ${p.customer}`}>
      <View style={styles.moveAddress}>
        <AddressLine notOnMap={!p.location} lineHeight={20}>
          <T variant="secondary" muted style={{ textAlign: "center" }}>
            {p.address || "No address"}
          </T>
        </AddressLine>
      </View>
      <View style={{ gap: space["2"] }}>
        <Segmented
          label="Day"
          options={options.map((d) => ({ value: String(d), label: WEEKDAY_SHORT[d] }))}
          value={String(day)}
          onChange={(v) => setDay(Number(v))}
          compact={options.length > 5}
        />
        {note ? (
          <T variant="secondary" muted>
            {note}
          </T>
        ) : null}
      </View>
      {techs.length > 1 ? (
        <View style={{ gap: space["2"] }} accessibilityRole="radiogroup" accessibilityLabel="Tech">
          <T variant="bodyMedium">Tech</T>
          <Group>
            {techs.map((t) => (
              <ChoiceRow key={t.id} on={who === t.id} title={t.name} onPick={() => setWho(t.id)} />
            ))}
          </Group>
        </View>
      ) : null}
      <T variant="secondary" muted style={styles.inset}>
        {moveHint(taken, day)}
      </T>
      <Button
        title={`Move to ${WEEKDAY_NAMES[day]}`}
        wide
        disabled={!who || taken || same}
        onPress={() => onMove(day, who)}
      />
    </ModalSheet>
  );
}

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
    <ModalSheet visible onClose={onClose} title="Suggest Days">
      <View
        style={{ gap: space["2"] }}
        accessibilityRole="radiogroup"
        accessibilityLabel="Suggest for"
      >
        <T variant="secondary" muted style={styles.inset}>
          Suggest for
        </T>
        <Group>
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
        </Group>
      </View>
      {what === "add" && techs.length > 1 ? (
        <View
          style={{ gap: space["2"] }}
          accessibilityRole="radiogroup"
          accessibilityLabel="Spread across"
        >
          <T variant="secondary" muted style={styles.inset}>
            Spread across
          </T>
          <Group>
            <ChoiceRow on={!everyone} title={tech.name} onPick={() => setEveryone(false)} />
            <ChoiceRow
              on={everyone}
              title="Everyone"
              detail={`${techs.length} techs`}
              onPick={() => setEveryone(true)}
            />
          </Group>
        </View>
      ) : null}
      <T variant="secondary" muted style={styles.inset}>
        {SUGGEST_HELP}
      </T>
      <Button
        title="Suggest Days"
        wide
        disabled={!plans.length}
        onPress={() =>
          onSuggest(
            plans.map((p) => p.planId),
            what === "add" && everyone ? techs.map((t) => t.id) : [tech.id],
            plans,
          )
        }
      />
    </ModalSheet>
  );
}

/** The suggestions' bar above the tab bar: how many, what was left out, Cancel and Keep. */
function SuggestBar({
  count,
  techs,
  note,
  onCancel,
  onKeep,
}: {
  count: number;
  techs: number;
  note: string | null;
  onCancel: () => void;
  onKeep: () => void;
}) {
  const insets = useSafeAreaInsets();
  const inTabs = useContext(TabBarSpace) > 0;
  const bottom = inTabs ? Math.max(12, insets.bottom) + 66 + space["2"] : insets.bottom + 12;
  return (
    <View
      pointerEvents="box-none"
      style={[styles.barDock, { bottom }]}
      accessibilityLabel="Suggested days"
    >
      <Glass style={styles.bar}>
        <View style={{ flex: 1, minWidth: 0 }} accessibilityLiveRegion="polite">
          <Text
            style={[type.body, face.semiBold, { color: color.text }]}
            maxFontSizeMultiplier={MAX_TEXT_SCALE}
          >
            {suggestedLabel(count)}
            {techs > 1 ? (
              <Text style={[face.regular, { color: color.textMuted }]}>{` · ${techs} techs`}</Text>
            ) : null}
          </Text>
          {note ? (
            <T variant="secondary" muted numberOfLines={1}>
              {note}
            </T>
          ) : null}
        </View>
        <Button kind="secondary" title="Cancel" onPress={onCancel} />
        <Button title="Keep" onPress={onKeep} />
      </Glass>
    </View>
  );
}

const styles = StyleSheet.create({
  result: { flexDirection: "row", alignItems: "center", gap: space["3"], flex: 1 },
  track: {
    flexDirection: "row",
    alignSelf: "stretch",
    borderRadius: 24,
    padding: 2,
    gap: 2,
  },
  segment: {
    flex: 1,
    minWidth: 0,
    minHeight: minTap + 4,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 2,
    paddingVertical: 4,
  },
  count: { fontSize: 12, lineHeight: 15 },
  empty: { borderRadius: shape.card, padding: space["4"] },
  card: { borderRadius: shape.card },
  clip: { borderRadius: shape.card, overflow: "hidden" },
  face: {
    flexDirection: "row",
    alignItems: "center",
    gap: space["2"],
    minHeight: minTap + 12,
    paddingLeft: space["2"],
    paddingRight: space["1"],
    paddingVertical: space["2"],
  },
  number: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  numberText: { fontFamily: font.displayBold, fontSize: 15, lineHeight: 20 },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: space["2"],
    marginTop: 2,
  },
  pill: { borderRadius: shape.pill, paddingHorizontal: 10, paddingVertical: 2 },
  grip: {
    width: minTap,
    height: minTap,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  dot: { width: 3.5, height: 3.5, borderRadius: 2 },
  ghost: { position: "absolute", left: 0, top: 0, borderRadius: shape.card },
  hidden: { position: "absolute", left: 0, right: 0, top: 0, opacity: 0 },
  moveAddress: { alignItems: "center" },
  inset: { paddingHorizontal: space["4"] },
  barDock: { position: "absolute", left: space["3"], right: space["3"] },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: space["2"],
    borderRadius: 28,
    paddingVertical: space["2"],
    paddingLeft: space["5"],
    paddingRight: space["2"],
  },
});
