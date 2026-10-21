import { router } from "expo-router";
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Reanimated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import {
  HERO_ACTION_LABELS,
  JOB_TYPE_LABELS,
  NOT_ON_MAP,
  formatAddress,
  heroActions,
  heroDrive,
  heroTopLine,
  heroSegmentsSpoken,
  propertyLocation,
  type TodayHero,
} from "@leakbook/core";
import type { JobView } from "../../data/jobs";
import { getServices } from "../../lib/services";
import { heroAdjustValue, heroSwipeStep, rubberBand, stepStop } from "../../lib/heroBrowse";
import { startJobValues } from "../../lib/todayHero";
import { TodayComplete } from "../job/CompleteJob";
import { CleaningIcon } from "../maintenance/Cleanings";
import { Button, RoundButton, useReduceMotion } from "../../ui/components";
import { haptics } from "../../ui/haptics";
import { NotOnMapTag } from "../../ui/NotOnMap";
import { useNoSwipe } from "../../ui/SwipeNav";
import { UndoRow } from "../../ui/Undo";
import { WebIcon } from "../../ui/WebIcon";
import {
  color,
  face,
  font,
  MAX_TEXT_SCALE,
  shape,
  space,
  tabular,
  tint,
  type,
} from "../../ui/theme";

/** The card settles on a stop with a 0.35 s spring, no bounce (gestures spec section 1). */
const SETTLE = { duration: 350, dampingRatio: 1 } as const;

/**
 * Today's card for the stop the tech is on (owner, 2026-10-20; docs/plans/today-hero.md), as
 * the website's today-hero.tsx: the Live Activity (here, Android's current-stop notification)
 * brought into the app, in its water blue. The name opens the job, the address is plain text
 * (Directions is the round button), and the main button is the moment's (Start, or Open Checklist with Mark
 * Complete). Before leaving and while driving, Start shares one row with the round buttons
 * (Message, Call, Directions); on site they sit on the "Next: …" line (owner, 2026-10-20).
 * On My Way lives in Message (docs/design/2026-10-20-gestures.md section 2), so there's one
 * text button and one navigation button. Someone looking at another tech's day gets no main
 * button.
 *
 * It shows any stop (gestures spec section 1): swipe it left or right (it follows the finger,
 * settles with a spring and resists past either end; a vertical drag still scrolls), tap a
 * progress segment (44 pt tall), or adjust it with TalkBack ("Stop 2 of 3, Derek Jeter"). While
 * it shows a stop the tech picked, Back to Now takes the figure's place. With Reduce Motion the
 * stop cross-fades instead of sliding.
 */
export const TodayHeroCard = memo(function TodayHeroCard({
  hero,
  job,
  mine,
  day,
  driveMin,
  notOnMap,
  stopIds,
  onBrowse,
  onMessage,
  onDirections,
  doLater,
}: {
  hero: TodayHero;
  /** The stop on the card (the one just done, in the done moment). */
  job: JobView | undefined;
  /** The tech's own day (not an owner looking at a teammate's). */
  mine: boolean;
  /** The shop's local day. */
  day: string;
  /** The drive to the card's stop, for "14 min drive" before leaving. */
  driveMin: number | null;
  notOnMap: boolean;
  /** The day's stops in route order, for swiping and the segments. */
  stopIds: readonly string[];
  /** Show a stop (null: back to the stop the day is on). */
  onBrowse: (id: string | null) => void;
  /** Message for a stop: the On My Way text before arriving, else a blank text. */
  onMessage: (job: JobView) => void;
  onDirections: (job: JobView) => void;
  /**
   * Do Later for the card's stop (docs/plans/today-reorder.md): a secondary button on its own
   * row in the Up next and On the way moments; afterwards "Moved." and Undo in its place for
   * 5 seconds. `canMove` false: this stop can't move (or is already last).
   */
  doLater?: {
    canMove: (job: JobView) => boolean;
    onPress: (job: JobView) => void;
    undo: { text: string; onUndo: () => void } | null;
  };
}) {
  const c = hero.content;
  // The card is about one stop and its buttons are for that stop (gestures spec section 9): a
  // finished stop offers only Reopen Visit or Mark Not Complete.
  const actions = heroActions(hero.moment, mine);
  const target = job;
  const drive = job ? heroDrive(hero.moment, driveMin) : null;
  // "Up next" (the figure says "2 of 3") or "At the pool · Stop 2 of 3"; no clock times (gestures
  // spec section 10). Under the name, "Leak detection · 14 min drive".
  const top = heroTopLine(hero);
  const kind = job ? [JOB_TYPE_LABELS[job.type] ?? "Job", drive].filter(Boolean).join(" · ") : "";
  const address = job?.property ? formatAddress(job.property) : "";
  const details = job && hero.moment !== "done";
  const notes = job
    ? [job.customer?.notes, job.property?.notes]
        .map((n) => n?.trim())
        .filter(Boolean)
        .join(" · ")
    : "";
  const phone = target?.customer?.phone ?? null;
  const targetName = target?.customer?.name ?? "Customer";
  const white = color.paper;
  // Secondary text: white at 92% is 4.8:1 on water blue (85% was 4.3:1).
  const soft = tint(white, 0.92);
  const reduceMotion = useReduceMotion();
  const { width, fontScale } = useWindowDimensions();
  // 20 of padding, 16 on phones narrower than 375.
  const pad = width < 375 ? 16 : 20;
  // At the largest text sizes the figure moves under the name: the top becomes one column.
  const stacked = fontScale >= 1.6;
  // When the moment changes, the text and figure cross-fade in 0.3 s (none with Reduce Motion).
  const [fade] = useState(() => new Animated.Value(1));
  const shown = `${hero.moment}|${c.figure}`;
  const last = useRef(shown);
  useEffect(() => {
    if (last.current === shown) return;
    last.current = shown;
    if (reduceMotion) return fade.setValue(1);
    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: 300, useNativeDriver: true }).start();
  }, [shown, reduceMotion, fade]);
  // Message, Call and Directions for the card's stop, while it's still to come or under way.
  const contact = Boolean(target && hero.moment !== "done" && (phone || target.property));
  const later =
    doLater && job && (hero.moment === "ahead" || hero.moment === "driving") && doLater.canMove(job)
      ? doLater.onPress
      : null;
  const laterUndo = doLater?.undo ?? null;

  const adjustValue = heroAdjustValue(hero, job?.customer?.name);
  // Browsing (gestures spec section 1). The stop the card stands on: none once the day is done,
  // so going back shows the last stop.
  const shownId = hero.moment === "day_done" ? null : hero.stopId;
  const prevId = stepStop(stopIds, shownId, -1);
  const nextId = stepStop(stopIds, shownId, 1);
  const noSwipe = useNoSwipe();
  const [cardWidth, setCardWidth] = useState(0);
  const x = useSharedValue(0);
  const opacity = useSharedValue(1);
  // How the last change came: a swipe (where the finger let go) or a tap.
  const pending = useRef<{ dir: 1 | -1; from: number } | null>(null);
  const cardStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: x.value }],
  }));

  // TalkBack's swipe up or down: the new stop is read once it shows.
  const announce = useRef(false);

  function step(dir: 1 | -1, spoken = false): boolean {
    const id = dir === 1 ? nextId : prevId;
    if (!id) return false;
    haptics.selection();
    announce.current = spoken;
    onBrowse(id === hero.currentId ? null : id);
    return true;
  }

  function swiped(dir: 1 | -1, from: number) {
    pending.current = { dir, from };
    if (!step(dir)) {
      pending.current = null;
      x.set(withSpring(0, SETTLE));
    }
  }
  // The gesture calls the latest `swiped` through one stable function.
  const latestSwiped = useRef(swiped);
  useEffect(() => {
    latestSwiped.current = swiped;
  });
  const [callSwiped] = useState(
    () => (dir: 1 | -1, from: number) => latestSwiped.current(dir, from),
  );

  // The new stop slides in from the side the finger came from, or cross-fades (a tap, Back to
  // Now, Reduce Motion). Before paint, so the old stop never flashes in the new place.
  const lastShown = useRef(shownId);
  // Mark Complete (gestures spec section 9): the finished stop's checkmark shows for 0.6 s and
  // the next stop slides in from the right, as a swipe.
  const check = useSharedValue(0);
  const checkStyle = useAnimatedStyle(() => ({ opacity: check.value }));
  useLayoutEffect(() => {
    if (lastShown.current === shownId) return;
    const was = lastShown.current ? stopIds.indexOf(lastShown.current) : -1;
    lastShown.current = shownId;
    const completed =
      !pending.current && !hero.browsing && was >= 0 && hero.segments[was] === "done";
    const swipe = pending.current;
    pending.current = null;
    if (announce.current) {
      announce.current = false;
      AccessibilityInfo.announceForAccessibility(adjustValue);
    }
    if (swipe && !reduceMotion && cardWidth > 0) {
      x.set(swipe.from + swipe.dir * cardWidth);
      x.set(withSpring(0, SETTLE));
      return;
    }
    if (completed && !reduceMotion && cardWidth > 0) {
      check.set(1);
      check.set(withDelay(450, withTiming(0, { duration: 150 })));
      x.set(cardWidth);
      x.set(withDelay(250, withSpring(0, SETTLE)));
      return;
    }
    x.set(0);
    opacity.set(0);
    opacity.set(withTiming(1, { duration: reduceMotion ? 200 : 250 }));
    // Runs when the stop changes; the rest is read as it is then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownId]);

  // A swipe is not a tap (team and week spec section 1): the name and the card's buttons are
  // React Native Pressables, and when this Pan activates (10 pt sideways) gesture handler's root
  // handler is cancelled, which sends the JS responder a cancel (Android:
  // RNGestureHandlerRootHelper.RootViewGestureHandler.onCancel → onChildStartedNativeGesture;
  // iOS: RNRootViewGestureRecognizer), so no Pressable acts on the lift.
  const pan = useMemo(
    () =>
      Gesture.Pan()
        // Clearly sideways only (owner, 2026-10-21: scrolling that started on the card was
        // "sometimes blocked"): the card takes the drag at 12 pt sideways, but a drag that moves
        // 8 pt up or down first (anything steeper than about 34 degrees) is the page's scroll.
        .activeOffsetX([-12, 12])
        .failOffsetY([-8, 8])
        .onUpdate((e) => {
          if (reduceMotion) return;
          const dx = e.translationX;
          const open = dx < 0 ? Boolean(nextId) : Boolean(prevId);
          x.set(open ? dx : rubberBand(dx, cardWidth || 300));
        })
        .onEnd((e) => {
          const dir = heroSwipeStep(e.translationX, e.velocityX, cardWidth || 300);
          const open = dir === 1 ? Boolean(nextId) : dir === -1 ? Boolean(prevId) : false;
          if (dir !== 0 && open) scheduleOnRN(callSwiped, dir, reduceMotion ? 0 : x.get());
          else x.set(withSpring(0, SETTLE));
        }),
    [reduceMotion, nextId, prevId, cardWidth, x, callSwiped],
  );
  function startJob(j: JobView) {
    getServices().sync.write("job", j.id, j.company_id, startJobValues(j, new Date()));
    haptics.light();
  }

  // Message, Call and Directions for the card's stop.
  const rounds =
    contact && target ? (
      <>
        {phone ? (
          <RoundButton
            onWater
            icon="message"
            label={`Text ${targetName}`}
            onPress={() => onMessage(target)}
          />
        ) : null}
        {phone ? (
          <RoundButton
            onWater
            icon="phone"
            label={`Call ${targetName}`}
            onPress={() => void Linking.openURL(`tel:${phone}`)}
          />
        ) : null}
        {target.property ? (
          <RoundButton
            onWater
            icon="directions"
            label={`Directions to ${targetName}`}
            onPress={() => onDirections(target)}
          />
        ) : null}
      </>
    ) : null;
  const startRow = actions.primary === "start_job" && target ? target : null;

  return (
    <GestureDetector gesture={pan}>
      <Reanimated.View
        testID="today-hero"
        {...noSwipe}
        onLayout={(e) => setCardWidth(e.nativeEvent.layout.width)}
        style={[styles.card, { backgroundColor: color.water, padding: pad }, cardStyle]}
      >
        {/* One item for TalkBack: the Live Activity's sentence, adjustable to change the stop
          ("Stop 2 of 3, Derek Jeter"). A double tap opens the job. */}
        <Pressable
          accessibilityRole="adjustable"
          accessibilityLabel={`${c.spoken} ${heroSegmentsSpoken(hero)}.`}
          accessibilityValue={{ text: adjustValue }}
          accessibilityHint={
            job
              ? "Swipe up or down to change the stop. Double tap opens the job."
              : "Swipe up or down to change the stop."
          }
          accessibilityActions={[
            { name: "increment" },
            { name: "decrement" },
            ...(job ? [{ name: "activate" as const }] : []),
          ]}
          onAccessibilityAction={(e) => {
            const name = e.nativeEvent.actionName;
            if (name === "increment") step(1, true);
            else if (name === "decrement") step(-1, true);
            else if (name === "activate" && job) router.push(`/jobs/${job.id}`);
          }}
          disabled={!job}
          onPress={() => job && router.push(`/jobs/${job.id}`)}
          style={({ pressed }) => pressed && { opacity: 0.8 }}
        >
          <Animated.View style={[styles.top, stacked && styles.topStacked, { opacity: fade }]}>
            <View style={stacked ? styles.topTextStacked : styles.topText}>
              <Text
                style={[type.secondary, face.semiBold, { color: soft }]}
                maxFontSizeMultiplier={MAX_TEXT_SCALE}
              >
                {top}
              </Text>
              {job ? (
                <Text
                  numberOfLines={2}
                  style={[styles.name, { color: white }]}
                  maxFontSizeMultiplier={MAX_TEXT_SCALE}
                >
                  {job.customer?.name ?? "Customer"}
                </Text>
              ) : null}
              {kind ? (
                <Text
                  style={[type.secondary, { color: soft }]}
                  maxFontSizeMultiplier={MAX_TEXT_SCALE}
                >
                  {kind}
                </Text>
              ) : null}
            </View>
            {hero.browsing ? (
              // The stop the tech picked: Back to Now in the figure's place.
              <View style={stacked ? styles.figureStacked : styles.figureBox}>
                <Pressable
                  testID="hero-back-to-now"
                  accessibilityRole="button"
                  accessibilityLabel="Back to Now"
                  accessibilityHint="Shows the stop you're on"
                  onPress={() => {
                    haptics.selection();
                    onBrowse(null);
                  }}
                  style={({ pressed }) => [
                    styles.backToNow,
                    { backgroundColor: tint(white, pressed ? 0.28 : 0.18) },
                  ]}
                >
                  <Text
                    style={[styles.backToNowText, { color: white }]}
                    maxFontSizeMultiplier={MAX_TEXT_SCALE}
                    numberOfLines={1}
                  >
                    Back to Now
                  </Text>
                </Pressable>
              </View>
            ) : (
              <View style={stacked ? styles.figureStacked : styles.figureBox}>
                <Text
                  style={[
                    styles.figure,
                    tabular,
                    { color: white, fontSize: c.figure === "✓" ? 28 : 22 },
                    !stacked && { textAlign: "right" },
                  ]}
                  maxFontSizeMultiplier={MAX_TEXT_SCALE}
                >
                  {c.figure}
                </Text>
                {c.figureLabel ? (
                  <Text
                    style={[type.footnote, { color: soft }, !stacked && { textAlign: "right" }]}
                    maxFontSizeMultiplier={MAX_TEXT_SCALE}
                  >
                    {c.figureLabel}
                  </Text>
                ) : null}
              </View>
            )}
          </Animated.View>
        </Pressable>

        {details ? (
          <View style={styles.details}>
            {address ? (
              // Plain text, not a link: Directions is the round button (owner, 2026-10-20; team
              // and week spec section 1). A warning symbol right after it when the map can't
              // find it.
              <View
                accessible
                accessibilityLabel={`${address}${notOnMap ? `, ${NOT_ON_MAP.title}` : ""}`}
                style={styles.detail}
              >
                <DetailIcon name="pin" lineHeight={type.body.lineHeight} />
                <View style={[styles.detailText, styles.addressLine]}>
                  <Text
                    style={[type.body, face.medium, styles.addressText, { color: white }]}
                    maxFontSizeMultiplier={MAX_TEXT_SCALE}
                  >
                    {address}
                  </Text>
                  {notOnMap ? (
                    <NotOnMapTag size={17} lineHeight={type.body.lineHeight} onWater />
                  ) : null}
                </View>
              </View>
            ) : null}
            {c.access ? (
              <View accessible accessibilityLabel={`Access: ${c.access}`} style={styles.detail}>
                <DetailIcon name="key" lineHeight={type.secondary.lineHeight} />
                <Text
                  style={[type.secondary, styles.detailText, { color: white }]}
                  maxFontSizeMultiplier={MAX_TEXT_SCALE}
                >
                  {c.access}
                </Text>
              </View>
            ) : null}
            {/* The visit's cleanings (owner, 2026-10-20: "The filter/salt cell cleaning alert
              needs to be on the new Today tile"), soonest first: each one's icon and how soon,
              an overdue one as a white pill. Each is read aloud with its name. */}
            {c.cleanings.length ? (
              <View testID="hero-cleanings" style={styles.cleanings}>
                {c.cleanings.map((b, i) => (
                  <View
                    key={`${b.kind}-${i}`}
                    accessible
                    accessibilityLabel={b.spoken}
                    style={styles.cleaning}
                  >
                    <View style={[styles.detailIcon, { height: type.secondary.lineHeight }]}>
                      <CleaningIcon kind={b.kind} size={15} tone={white} />
                    </View>
                    <Text
                      style={[
                        type.secondary,
                        face.medium,
                        b.overdue
                          ? [styles.overdue, { color: color.water, backgroundColor: white }]
                          : { color: white },
                      ]}
                      maxFontSizeMultiplier={MAX_TEXT_SCALE}
                    >
                      {b.label}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}
            {/* The customer's notes, then the pool's (owner, 2026-10-20: "you have to have
              customer notes there"), two lines at most; the job has the rest. */}
            {notes ? (
              <View accessible accessibilityLabel={`Notes: ${notes}`} style={styles.detail}>
                <DetailIcon name="note" lineHeight={type.secondary.lineHeight} />
                <Text
                  numberOfLines={2}
                  style={[type.secondary, styles.detailText, { color: white }]}
                  maxFontSizeMultiplier={MAX_TEXT_SCALE}
                >
                  {notes}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Before leaving and while driving, "Next: …" sits alone, then one row: Start, taking the
          rest of the width, and the round buttons after it (owner, 2026-10-20: "Place 'Start'
          to the left of the three icons. Just to condense space."). On site the round buttons
          sit on the Next line and Open Checklist and Mark Complete share the row below. */}
        {startRow ? (
          <>
            {c.next ? (
              <Text
                style={[type.secondary, styles.nextAlone, { color: soft }]}
                maxFontSizeMultiplier={MAX_TEXT_SCALE}
              >
                {c.next}
              </Text>
            ) : null}
            <View style={[styles.startRow, stacked && styles.buttonsStacked]}>
              <View style={stacked ? undefined : styles.startSlot}>
                <Button
                  kind="onWater"
                  title={HERO_ACTION_LABELS.start_job}
                  accessibilityLabel={`${HERO_ACTION_LABELS.start_job} job for ${targetName}`}
                  onPress={() => startJob(startRow)}
                />
              </View>
              {rounds ? <View style={styles.roundRow}>{rounds}</View> : null}
            </View>
          </>
        ) : (
          <>
            {c.next || rounds ? (
              <View style={styles.nextLine}>
                {c.next ? (
                  <Text
                    style={[type.secondary, styles.nextText, { color: soft }]}
                    maxFontSizeMultiplier={MAX_TEXT_SCALE}
                  >
                    {c.next}
                  </Text>
                ) : null}
                {rounds ? <View style={styles.round}>{rounds}</View> : null}
              </View>
            ) : null}

            {/* One row, equal widths: style, not size, marks the main action (buttons.md). */}
            {actions.undo && job ? (
              <View style={[styles.buttons, stacked && styles.buttonsStacked]}>
                <View style={stacked ? undefined : styles.slot}>
                  <TodayComplete
                    job={job}
                    customer={job.customer?.name ?? "this stop"}
                    customerName={job.customer?.name ?? null}
                    day={day}
                    done
                    onWater
                  />
                </View>
              </View>
            ) : null}
            {(target && actions.primary === "open_checklist") || (actions.complete && job) ? (
              <View style={[styles.buttons, stacked && styles.buttonsStacked]}>
                {actions.primary === "open_checklist" && target ? (
                  <View style={stacked ? undefined : styles.slot}>
                    <Button
                      kind="onWater"
                      title={HERO_ACTION_LABELS.open_checklist}
                      onPress={() => router.push(`/jobs/${target.id}?section=checklist`)}
                    />
                  </View>
                ) : null}
                {actions.complete && job ? (
                  <View style={stacked ? undefined : styles.slot}>
                    <TodayComplete
                      job={job}
                      customer={job.customer?.name ?? "this stop"}
                      customerName={job.customer?.name ?? null}
                      day={day}
                      done={false}
                      onWater
                    />
                  </View>
                ) : null}
              </View>
            ) : null}
          </>
        )}

        {laterUndo ? (
          <View style={[styles.buttons, stacked && styles.buttonsStacked]}>
            <View style={stacked ? undefined : styles.slot}>
              <UndoRow text={laterUndo.text} onUndo={laterUndo.onUndo} onWater />
            </View>
          </View>
        ) : later && job ? (
          <View style={[styles.buttons, stacked && styles.buttonsStacked]}>
            <View style={stacked ? undefined : styles.slot}>
              <Button
                kind="onWaterTinted"
                title="Do Later"
                accessibilityLabel={`Do Later, ${job.customer?.name ?? "this stop"}`}
                onPress={() => later(job)}
              />
            </View>
          </View>
        ) : null}

        {/* The checkmark that marks a stop just completed. */}
        <Reanimated.View pointerEvents="none" style={[styles.checkLayer, checkStyle]}>
          <View style={[styles.checkCircle, { backgroundColor: white }]}>
            <WebIcon name="check" size={36} color={color.water} strokeWidth={3} />
          </View>
        </Reanimated.View>
        {/* One segment per stop: done, this one, still to come. A tap shows that stop; each is
          4 pt to see and 44 pt to tap. TalkBack changes the stop on the card itself. */}
        <View
          testID="hero-progress"
          style={styles.progress}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {hero.segments.map((s, i) => (
            <Pressable
              key={stopIds[i] ?? i}
              testID={`hero-segment-${i}`}
              onPress={() => {
                const id = stopIds[i];
                if (!id || id === shownId) return;
                haptics.selection();
                onBrowse(id === hero.currentId ? null : id);
              }}
              style={styles.segmentHit}
            >
              <View
                style={[
                  styles.segment,
                  {
                    backgroundColor:
                      s === "done" ? white : s === "current" ? tint(white, 0.7) : tint(white, 0.28),
                  },
                ]}
              />
            </Pressable>
          ))}
        </View>
      </Reanimated.View>
    </GestureDetector>
  );
});

/** A detail line's symbol: 15 pt in a 20 pt column, centered on the text's first line. */
function DetailIcon({ name, lineHeight }: { name: "pin" | "key" | "note"; lineHeight?: number }) {
  return (
    <View style={[styles.detailIcon, { height: lineHeight }]}>
      <WebIcon name={name} size={15} color={color.paper} />
    </View>
  );
}

/** Where a stop's directions start: its address and map location. */
export function heroPlace(job: JobView) {
  return {
    address: job.property ? formatAddress(job.property) : "",
    location: propertyLocation(job.property),
  };
}

const styles = StyleSheet.create({
  card: { borderRadius: 22, marginBottom: space["6"] },
  top: { flexDirection: "row", alignItems: "flex-start", gap: space["4"] },
  topStacked: { flexDirection: "column", gap: space["2"] },
  topText: { flex: 1, minWidth: 0, gap: 2 },
  topTextStacked: { gap: 2 },
  name: { fontFamily: font.displayExtraBold, fontSize: 28, lineHeight: 34 },
  figureBox: { flexShrink: 0, alignItems: "flex-end" },
  figureStacked: { alignItems: "flex-start" },
  figure: { fontFamily: font.displayBold, lineHeight: 30 },
  details: { marginTop: space["3"], gap: 6 },
  detail: { flexDirection: "row", alignItems: "flex-start", gap: space["2"] },
  detailIcon: { width: 20, flexShrink: 0, alignItems: "center", justifyContent: "center" },
  detailText: { flex: 1, minWidth: 0 },
  // Cleanings wrap; the first icon sits in the details' symbol column.
  cleanings: { flexDirection: "row", flexWrap: "wrap", columnGap: space["4"], rowGap: 6 },
  cleaning: { flexDirection: "row", alignItems: "center", gap: space["2"] },
  overdue: { borderRadius: shape.pill, paddingHorizontal: space["2"], overflow: "hidden" },
  addressLine: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
  addressText: { flexShrink: 1, minWidth: 0 },
  nextLine: {
    marginTop: space["3"],
    flexDirection: "row",
    alignItems: "center",
    gap: space["3"],
  },
  nextText: { flex: 1, minWidth: 0 },
  nextAlone: { marginTop: space["3"] },
  // Start, then the round buttons, 6 apart: four circles and Start fit a 375 pt phone. At large
  // text sizes, or on a narrower phone, the circles wrap under it, at the right.
  startRow: {
    marginTop: space["3"],
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
  },
  // Start takes what the round buttons leave, never under 100.
  startSlot: { flex: 1, minWidth: 100 },
  roundRow: { flexShrink: 0, marginLeft: "auto", flexDirection: "row", gap: 6 },
  round: { flexShrink: 0, marginLeft: "auto", flexDirection: "row", gap: space["2"] },
  buttons: { marginTop: space["4"], flexDirection: "row", gap: 10 },
  // At the largest text sizes the two buttons stack, each the full width.
  buttonsStacked: { flexDirection: "column" },
  slot: { flex: 1, minWidth: 0 },
  // The bar sits where it did (16 under the content, 20 over the card's edge); its 44 pt tap
  // area reaches into both.
  progress: {
    marginTop: space["4"] - 20,
    marginBottom: -20,
    flexDirection: "row",
    gap: space["1"],
  },
  segmentHit: { flex: 1, height: 44, justifyContent: "center" },
  segment: { height: 4, borderRadius: shape.pill },
  // Back to Now: white at 18%, 15 pt semibold, 44 pt tall.
  backToNow: {
    minHeight: 44,
    borderRadius: shape.pill,
    paddingHorizontal: space["4"],
    alignItems: "center",
    justifyContent: "center",
  },
  backToNowText: { ...face.semiBold, fontSize: 15 },
  checkLayer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  checkCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
  },
});
