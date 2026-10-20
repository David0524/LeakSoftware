import { router } from "expo-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Animated,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import {
  HERO_ACTION_LABELS,
  JOB_TYPE_LABELS,
  NOT_ON_MAP,
  formatAddress,
  heroActions,
  heroDrive,
  heroHeadline,
  heroSegmentsSpoken,
  propertyLocation,
  toE164,
  type TodayHero,
} from "@leakbook/core";
import type { JobView } from "../../data/jobs";
import { useConversations, useLine } from "../../data/texting";
import { useCompany } from "../../state/session";
import { getServices } from "../../lib/services";
import { startJobValues } from "../../lib/todayHero";
import { TodayComplete } from "../job/CompleteJob";
import { Button, RoundButton, useReduceMotion } from "../../ui/components";
import { haptics } from "../../ui/haptics";
import { NotOnMapTag } from "../../ui/NotOnMap";
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

/**
 * Today's card for the stop the tech is on (owner, 2026-10-20; docs/plans/today-hero.md), as
 * the website's today-hero.tsx: the Live Activity (here, Android's current-stop notification)
 * brought into the app, in its water blue. The name opens the job, the address opens
 * directions, and the main button is the moment's (On My Way, Start Job, Open Checklist with
 * Mark Complete). Message, Call and Directions sit on the "Next: …" line, which keeps the card
 * a row shorter (owner, 2026-10-20). Someone looking at another tech's day gets no main button.
 * It reads as one item with the Live Activity's spoken sentence; its buttons follow.
 */
export function TodayHeroCard({
  hero,
  job,
  next,
  mine,
  day,
  driveMin,
  notOnMap,
  onMyWay,
  onDirections,
}: {
  hero: TodayHero;
  /** The stop on the card (the one just done, in the done moment). */
  job: JobView | undefined;
  /** The next stop not done, for On My Way from a done card. */
  next: JobView | undefined;
  /** The tech's own day (not an owner looking at a teammate's). */
  mine: boolean;
  /** The shop's local day. */
  day: string;
  /** The drive to the card's stop, for "14 min drive" before leaving. */
  driveMin: number | null;
  notOnMap: boolean;
  /** On My Way for a stop, as the card's main button. */
  onMyWay: (job: JobView) => ReactNode;
  onDirections: (job: JobView) => void;
}) {
  const c = hero.content;
  const actions = heroActions(hero.moment, mine);
  const target = hero.moment === "done" ? next : job;
  const drive = job ? heroDrive(hero.moment, driveMin) : null;
  // "At the pool · Stop 2 of 3"; under the name, "Leak detection · 14 min drive".
  const top =
    hero.moment === "day_done"
      ? heroHeadline(hero)
      : `${heroHeadline(hero)} · Stop ${hero.stop} of ${hero.stops}`;
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
  const company = useCompany();
  const line = useLine(company.id);
  const conversations = useConversations(company.id);
  // Message, Call and Directions for the card's stop, while it's still to come or under way.
  const contact = Boolean(target && hero.moment !== "done" && (phone || target.property));

  /** Text the customer as the job page does: the shop's number when it's on, else the phone's
   *  own texts. */
  function textCustomer(number: string) {
    if (line?.status === "active" && target?.customer) {
      const e164 = toE164(number);
      const conversation = e164 ? conversations.find((x) => x.phone === e164) : undefined;
      router.push(
        conversation
          ? `/messages/${conversation.id}`
          : `/messages/new?customer=${target.customer.id}&job=${target.id}`,
      );
    } else void Linking.openURL(`sms:${number.replace(/[^\d+]/g, "")}`);
  }

  function startJob(j: JobView) {
    getServices().sync.write("job", j.id, j.company_id, startJobValues(j, new Date()));
    haptics.light();
  }

  return (
    <View testID="today-hero" style={[styles.card, { backgroundColor: color.water, padding: pad }]}>
      {/* One item for TalkBack: the Live Activity's sentence. A tap opens the job. */}
      <Pressable
        accessibilityRole={job ? "link" : "text"}
        accessibilityLabel={c.spoken}
        accessibilityHint={job ? "Opens the job" : undefined}
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
        </Animated.View>
      </Pressable>

      {details ? (
        <View style={styles.details}>
          {address ? (
            // Plain text that opens directions, as iOS shows a tappable address; a warning
            // symbol right after it when the map can't find it (owner, 2026-10-20).
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={`${address}${notOnMap ? `, ${NOT_ON_MAP.title}` : ""}, directions in Maps`}
              onPress={() => onDirections(job)}
              style={({ pressed }) => [styles.detail, pressed && { opacity: 0.6 }]}
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
            </Pressable>
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

      {/* The next stop, with Message, Call and Directions on its line (owner, 2026-10-20: "find
          a better place for the call/direction icon … so we can shorten the card"). Without a
          next stop the circles sit alone at the right. */}
      {c.next || contact ? (
        <View style={styles.nextLine}>
          {c.next ? (
            <Text
              style={[type.secondary, styles.nextText, { color: soft }]}
              maxFontSizeMultiplier={MAX_TEXT_SCALE}
            >
              {c.next}
            </Text>
          ) : null}
          {contact && target ? (
            <View style={styles.round}>
              {phone ? (
                <RoundButton
                  onWater
                  icon="message"
                  label={`Text ${targetName}`}
                  onPress={() => textCustomer(phone)}
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
            </View>
          ) : null}
        </View>
      ) : null}

      {/* One row, equal widths: style, not size, marks the main action (buttons.md). */}
      {(target && actions.primary) || (actions.complete && job) ? (
        <View style={[styles.buttons, stacked && styles.buttonsStacked]}>
          {actions.primary && target ? (
            <View style={stacked ? undefined : styles.slot}>
              {actions.primary === "on_my_way" ? onMyWay(target) : null}
              {actions.primary === "start_job" ? (
                <Button
                  kind="onWater"
                  title={HERO_ACTION_LABELS.start_job}
                  accessibilityLabel={`${HERO_ACTION_LABELS.start_job} for ${targetName}`}
                  onPress={() => startJob(target)}
                />
              ) : null}
              {actions.primary === "open_checklist" ? (
                <Button
                  kind="onWater"
                  title={HERO_ACTION_LABELS.open_checklist}
                  onPress={() => router.push(`/jobs/${target.id}?section=checklist`)}
                />
              ) : null}
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

      {/* One segment per stop: done, this one, still to come. Read as "2 of 7 stops done". */}
      <View
        accessible
        accessibilityLabel={heroSegmentsSpoken(hero)}
        testID="hero-progress"
        style={styles.progress}
      >
        {hero.segments.map((s, i) => (
          <View
            key={i}
            style={[
              styles.segment,
              {
                backgroundColor:
                  s === "done" ? white : s === "current" ? tint(white, 0.7) : tint(white, 0.28),
              },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

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
  addressLine: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
  addressText: { flexShrink: 1, minWidth: 0 },
  nextLine: {
    marginTop: space["3"],
    flexDirection: "row",
    alignItems: "center",
    gap: space["3"],
  },
  nextText: { flex: 1, minWidth: 0 },
  round: { flexShrink: 0, marginLeft: "auto", flexDirection: "row", gap: space["2"] },
  buttons: { marginTop: space["4"], flexDirection: "row", gap: 10 },
  // At the largest text sizes the two buttons stack, each the full width.
  buttonsStacked: { flexDirection: "column" },
  slot: { flex: 1, minWidth: 0 },
  progress: { marginTop: space["4"], flexDirection: "row", gap: space["1"] },
  segment: { flex: 1, height: 4, borderRadius: shape.pill },
});
