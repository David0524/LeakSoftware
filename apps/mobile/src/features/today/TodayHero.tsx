import { router } from "expo-router";
import type { ReactNode } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import {
  HERO_ACTION_LABELS,
  JOB_TYPE_LABELS,
  NOT_ON_MAP,
  formatAddress,
  heroActions,
  heroDrive,
  heroSegmentsSpoken,
  heroSubtitle,
  propertyLocation,
  type TodayHero,
} from "@leakbook/core";
import type { JobView } from "../../data/jobs";
import { getServices } from "../../lib/services";
import { startJobValues } from "../../lib/todayHero";
import { TodayComplete } from "../job/CompleteJob";
import { Button, RoundButton } from "../../ui/components";
import { haptics } from "../../ui/haptics";
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
 * Mark Complete). Someone looking at another tech's day gets Call and Directions only. It reads
 * as one item with the Live Activity's spoken sentence; its buttons follow.
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
  const subtitle = job ? heroSubtitle(JOB_TYPE_LABELS[job.type] ?? "Job", hero) : "";
  const address = job?.property ? formatAddress(job.property) : "";
  const details = job && hero.moment !== "done";
  const phone = target?.customer?.phone ?? null;
  const targetName = target?.customer?.name ?? "Customer";
  const white = color.paper;
  const soft = tint(white, 0.85);

  function startJob(j: JobView) {
    getServices().sync.write("job", j.id, j.company_id, startJobValues(j, new Date()));
    haptics.light();
  }

  return (
    <View testID="today-hero" style={[styles.card, { backgroundColor: color.water }]}>
      {/* One item for TalkBack: the Live Activity's sentence. A tap opens the job; the name is
          drawn as the link. */}
      <Pressable
        accessibilityRole={job ? "link" : "text"}
        accessibilityLabel={c.spoken}
        accessibilityHint={job ? "Opens the job" : undefined}
        disabled={!job}
        onPress={() => job && router.push(`/jobs/${job.id}`)}
        style={({ pressed }) => [styles.top, pressed && { opacity: 0.8 }]}
      >
        <View style={styles.topText}>
          <Text
            style={[type.secondary, face.semiBold, { color: soft }]}
            maxFontSizeMultiplier={MAX_TEXT_SCALE}
          >
            {c.headline}
          </Text>
          {job ? (
            <Text style={[styles.name, { color: white }]} maxFontSizeMultiplier={MAX_TEXT_SCALE}>
              {job.customer?.name ?? "Customer"}
            </Text>
          ) : null}
          {subtitle ? (
            <Text style={[type.secondary, { color: soft }]} maxFontSizeMultiplier={MAX_TEXT_SCALE}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        <View style={styles.figureBox}>
          <Text
            style={[styles.figure, tabular, { color: white, fontSize: c.figure === "✓" ? 40 : 36 }]}
            maxFontSizeMultiplier={MAX_TEXT_SCALE}
          >
            {c.figure}
          </Text>
          {c.figureLabel ? (
            <Text
              style={[type.secondary, { color: soft, textAlign: "right" }]}
              maxFontSizeMultiplier={MAX_TEXT_SCALE}
            >
              {c.figureLabel}
            </Text>
          ) : null}
        </View>
      </Pressable>

      {details ? (
        <View style={styles.details}>
          {address ? (
            <Text style={[type.body, { color: white }]} maxFontSizeMultiplier={MAX_TEXT_SCALE}>
              <Text
                accessibilityRole="link"
                accessibilityLabel={`${address}, directions in Maps`}
                onPress={() => onDirections(job)}
                style={[face.medium, styles.underline, { textDecorationColor: tint(white, 0.5) }]}
              >
                {address}
              </Text>
              {drive ? <Text style={{ color: soft }}> · {drive}</Text> : null}
            </Text>
          ) : null}
          {notOnMap ? (
            <View accessible accessibilityLabel={NOT_ON_MAP.title} style={styles.iconLine}>
              <WebIcon name="warning" size={16} color={white} />
              <Text
                style={[type.secondary, face.semiBold, { color: white }]}
                maxFontSizeMultiplier={MAX_TEXT_SCALE}
              >
                {NOT_ON_MAP.title}
              </Text>
            </View>
          ) : null}
          {c.access ? (
            <View accessible accessibilityLabel={`Access: ${c.access}`} style={styles.iconLine}>
              <View style={styles.keyIcon}>
                <WebIcon name="key" size={16} color={white} />
              </View>
              <Text
                numberOfLines={1}
                style={[type.secondary, { color: white, flex: 1 }]}
                maxFontSizeMultiplier={MAX_TEXT_SCALE}
              >
                {c.access}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
      {c.next ? (
        <Text
          style={[type.secondary, { color: soft, marginTop: space["2"] }]}
          maxFontSizeMultiplier={MAX_TEXT_SCALE}
        >
          {c.next}
        </Text>
      ) : null}

      {target || actions.complete ? (
        <View style={styles.buttons}>
          {actions.primary === "on_my_way" && target ? onMyWay(target) : null}
          {actions.primary === "start_job" && target ? (
            <Button
              kind="onWater"
              title={HERO_ACTION_LABELS.start_job}
              accessibilityLabel={`${HERO_ACTION_LABELS.start_job} for ${targetName}`}
              onPress={() => startJob(target)}
              style={styles.primary}
            />
          ) : null}
          {actions.primary === "open_checklist" && target ? (
            <Button
              kind="onWater"
              title={HERO_ACTION_LABELS.open_checklist}
              onPress={() => router.push(`/jobs/${target.id}?section=checklist`)}
              style={styles.primary}
            />
          ) : null}
          {actions.complete && job ? (
            <TodayComplete
              job={job}
              customer={job.customer?.name ?? "this stop"}
              customerName={job.customer?.name ?? null}
              day={day}
              done={false}
              onWater
            />
          ) : null}
          {target && hero.moment !== "done" ? (
            <View style={styles.round}>
              {phone ? (
                <RoundButton
                  onWater
                  icon="phone"
                  label={`Call ${targetName}, ${phone}`}
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

/** Where a stop's directions start: its address and map location. */
export function heroPlace(job: JobView) {
  return {
    address: job.property ? formatAddress(job.property) : "",
    location: propertyLocation(job.property),
  };
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 22,
    padding: space["5"],
    marginBottom: space["6"],
  },
  top: { flexDirection: "row", alignItems: "flex-start", gap: space["4"] },
  topText: { flex: 1, minWidth: 0, gap: 2 },
  name: { fontFamily: font.displayExtraBold, fontSize: 28, lineHeight: 34 },
  figureBox: { flexShrink: 0, alignItems: "flex-end" },
  figure: { fontFamily: font.displayExtraBold, lineHeight: 44 },
  details: { marginTop: space["3"], gap: 6 },
  underline: { textDecorationLine: "underline" },
  iconLine: { flexDirection: "row", alignItems: "center", gap: space["2"] },
  keyIcon: { flexShrink: 0 },
  buttons: {
    marginTop: space["4"],
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-start",
    gap: space["2"],
  },
  primary: { paddingHorizontal: 24 },
  round: { marginLeft: "auto", flexDirection: "row", gap: space["2"] },
  progress: { marginTop: space["5"], flexDirection: "row", gap: space["1"] },
  segment: { flex: 1, height: 6, borderRadius: shape.pill },
});
