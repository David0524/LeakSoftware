import { Pressable, StyleSheet, Text, View } from "react-native";
import { GestureDetector, type PanGesture } from "react-native-gesture-handler";
import { JOB_STATUS_LABELS, NOT_ON_MAP, type JobStatus } from "@leakbook/core";
import { CleaningIcon } from "../maintenance/Cleanings";
import { SamplePill, StatusChip } from "../../ui/components";
import { Grip } from "../../ui/Grip";
import { LockTag } from "../../ui/LockTag";
import { NotOnMapTag } from "../../ui/NotOnMap";
import { TechStripe } from "../../ui/TechDot";
import { WebIcon } from "../../ui/WebIcon";
import { DriveChip } from "../../ui/DriveChip";
import { driveChipMinutes, driveSpoken } from "../../lib/scheduleTile";
import { useDragHover } from "./ScheduleDrag";
import Svg, { Circle, Path } from "react-native-svg";
import { color, font, MAX_TEXT_SCALE, minTap, space, tabular, type } from "../../ui/theme";
import type { Stop } from "./RouteCard";

// A schedule card (docs/design/2026-10-21-schedule-card.md; owner, 2026-10-21: "Redesign those
// tiles too. They look super busy"), the same in Day, Week and Needs a Time, as on the website
// and the iPhone app: two lines. The tech's color stripe and the stop's number, then the time
// and the customer; under them the kind of visit and the street only. Trailing, small icons
// only for exceptions (a lock, not on the map, a cleaning due), or the status when it isn't
// plain Scheduled; then "⋯" and the grip. A day's stop drags from the grip after a brief rest
// (0.13 s; a flick there scrolls), or from anywhere on it after a 0.4 s touch and hold (owner,
// 2026-10-22); its menu is on "⋯". Only the customer's name opens the job (owner, 2026-10-21:
// "I find myself accidentally opening jobs all the time"), drawn as a link with "›". Move…, the locks, Take Off Schedule and Directions are in
// its touch-and-hold menu and its TalkBack actions.

/** The street alone ("5024 W Las Palmaritas Dr"), without the city or ZIP. */
export function streetOf(address: string): string {
  return address.split(",")[0]!.trim();
}

/** What the card reads as to TalkBack and VoiceOver, exceptions included. */
export function cardLabel(s: Stop, n: number | null): string {
  const twoTechs = s.lock?.kind === "two_techs" ? s.lock.label : null;
  return [
    n != null ? `Stop ${n}` : null,
    s.time ?? "no time",
    s.customer,
    s.tag,
    twoTechs,
    s.address ? streetOf(s.address) : null,
    s.status !== "scheduled" && s.status !== "unscheduled" ? JOB_STATUS_LABELS[s.status] : null,
    s.lock && !twoTechs ? s.lock.label : null,
    s.notOnMap || (s.address && !s.location) ? NOT_ON_MAP.title : null,
    s.cleanings?.[0] ? `${s.cleanings[0].name} due` : null,
    s.done ? "done" : null,
  ]
    .filter(Boolean)
    .join(", ");
}

function Badge({
  n,
  status,
  done,
  big = false,
}: {
  n: number;
  status: JobStatus;
  done: boolean;
  /** A stop tile's: 32 pt, Barlow ExtraBold (the order matters more than the time). */
  big?: boolean;
}) {
  const going = status === "in_progress" && !done;
  return (
    <View
      style={[
        big ? styles.badgeBig : styles.badge,
        { backgroundColor: done ? color.pass : going ? color.link : color.bg },
      ]}
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      {done ? (
        <WebIcon name="check" size={big ? 18 : 14} color={color.onStatus} strokeWidth={3} />
      ) : (
        <Text
          style={[
            big ? styles.badgeTextBig : styles.badgeText,
            tabular,
            { color: going ? color.onPrimary : color.text },
          ]}
          maxFontSizeMultiplier={1.6}
        >
          {n}
        </Text>
      )}
    </View>
  );
}

export function ScheduleCardFace({
  stop: s,
  n,
  tech,
  onOpen,
  onHold,
  onMore,
  gripGesture,
}: {
  stop: Stop;
  /** Its place in the day; null when it has none (Needs a Time). */
  n: number | null;
  /** The tech's color: a 4 pt stripe on the leading edge (null: nobody yet, no stripe). */
  tech: string | null;
  /** Opens the job, from the customer's name (absent on the carried copy). */
  onOpen?: () => void;
  /** The card's touch-and-hold menu, from the name too (the body has it already). */
  onHold?: () => void;
  /** Its menu on a "⋯" button, where touch and hold lifts it to drag instead (a day's stops). */
  onMore?: () => void;
  /** The drag, on the grip only (absent on the carried copy and stops that can't move). */
  gripGesture?: PanGesture;
}) {
  const twoTechs = s.lock?.kind === "two_techs" ? s.lock.label : null;
  const street = s.address ? streetOf(s.address) : null;
  const second = [twoTechs ? `${s.tag} · ${twoTechs}` : s.tag, street].filter(Boolean).join(" · ");
  const time = s.time ?? "No time";
  const cleaning = s.cleanings?.[0];
  const status = s.status !== "scheduled" && s.status !== "unscheduled";
  return (
    <View style={[styles.face, { backgroundColor: color.surface }]}>
      {tech !== null ? <TechStripe tech={tech} /> : null}
      {n != null ? <Badge n={n} status={s.status} done={s.done} /> : null}
      <View style={[styles.text, s.done && { opacity: 0.7 }]}>
        <View style={styles.line}>
          {time ? (
            <Text
              numberOfLines={1}
              style={[type.bodyEmphasis, styles.time, tabular, { color: color.text }]}
              maxFontSizeMultiplier={MAX_TEXT_SCALE}
            >
              {time}
            </Text>
          ) : null}
          {onOpen ? (
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={`Open ${s.customer}`}
              onPress={onOpen}
              onLongPress={onHold}
              hitSlop={{ top: 12, bottom: 12, left: 6, right: 8 }}
              style={({ pressed }) => [styles.name, pressed && { opacity: 0.5 }]}
            >
              <Name customer={s.customer} />
            </Pressable>
          ) : (
            <View style={styles.name}>
              <Name customer={s.customer} />
            </View>
          )}
          {s.sample ? <SamplePill /> : null}
        </View>
        {second ? (
          <Text
            numberOfLines={1}
            style={[type.secondary, { color: color.textMuted }]}
            maxFontSizeMultiplier={MAX_TEXT_SCALE}
          >
            {second}
          </Text>
        ) : null}
      </View>
      {/* Exceptions only, as small icons; the status instead when it isn't plain Scheduled. */}
      {status ? (
        <StatusChip status={s.status} />
      ) : (
        <View style={styles.icons}>
          {s.lock && !twoTechs ? <LockTag lock={s.lock} /> : null}
          {s.notOnMap || (s.address && !s.location) ? <NotOnMapTag size={17} /> : null}
          {cleaning ? (
            <View accessible accessibilityRole="image" accessibilityLabel={`${cleaning.name} due`}>
              <CleaningIcon kind={cleaning.kind} size={18} tone={color.textMuted} />
            </View>
          ) : null}
        </View>
      )}
      {onMore ? <MoreButton customer={s.customer} onPress={onMore} /> : null}
      {s.movable && gripGesture ? (
        <GestureDetector gesture={gripGesture}>
          {/* 44 × 44 to touch; its own responder, so a touch here is never the card's tap or
              touch and hold. */}
          <View
            collapsable={false}
            testID="schedule-grip"
            style={styles.gripHit}
            onStartShouldSetResponder={() => true}
            accessible={false}
            importantForAccessibility="no-hide-descendants"
          >
            <Grip width={28} />
          </View>
        </GestureDetector>
      ) : s.movable ? (
        <Grip width={28} />
      ) : null}
    </View>
  );
}

/**
 * What a stop tile reads as to TalkBack: its number, the customer, the kind of visit (it's off
 * the tile, so it's read here), the time, the drive to it, then the rest.
 */
export function tileLabel(s: Stop, n: number, fromOffMap = false): string {
  const twoTechs = s.lock?.kind === "two_techs" ? s.lock.label : null;
  const missing = s.notOnMap || Boolean(s.address && !s.location);
  const drive = driveChipMinutes(s.legMin, missing, fromOffMap);
  return [
    `Stop ${n}`,
    s.customer,
    s.visit,
    s.time ?? "no time",
    drive != null ? driveSpoken(drive) : null,
    s.tag !== s.visit ? s.tag : null,
    s.address ? streetOf(s.address) : null,
    s.status !== "scheduled" && s.status !== "unscheduled" ? JOB_STATUS_LABELS[s.status] : null,
    s.lock && !twoTechs ? s.lock.label : null,
    missing ? NOT_ON_MAP.title : null,
    s.cleanings?.[0] ? `${s.cleanings[0].name} due` : null,
    s.done ? "done" : null,
  ]
    .filter(Boolean)
    .join(", ");
}

/** Where a tile's hairline starts: after the stop number (16 + 32 + 10). */
export const TILE_INSET = 58;

/**
 * A stop's tile in a tech's block on Day and Week (docs/design/2026-10-21-schedule-tile.md;
 * owner, 2026-10-21: "The tiles should be thin and touching like in the weekly view … job
 * order number is more important than expected arrival time"), as on the website and the
 * iPhone app: the stop number leads; line 1 is the customer as the link (only the name opens
 * the job) with the exception icons after it, or the status at the line's end; line 2 is the
 * drive to it as a chip, the time, "With …" for a two-tech stop, and the street. The kind of
 * visit is the menu's first title line. "⋯" (its menu) and the grip at the trailing edge; a hold on the tile drags it too.
 * The tech's stripe is on the block (`tech` only on the carried copy).
 */
export function StopTileFace({
  stop: s,
  n,
  tech = null,
  fromOffMap = false,
  onOpen,
  onHold,
  onMore,
  gripGesture,
}: {
  stop: Stop;
  n: number;
  /** The drive into it starts off the map (the stop before, or the start): no chip. */
  fromOffMap?: boolean;
  /** The carried copy's stripe (tiles in a block have the block's). */
  tech?: string | null;
  onOpen?: () => void;
  onHold?: () => void;
  /** Its menu, on "⋯": touch and hold on the tile lifts it to drag (owner, 2026-10-22). */
  onMore?: () => void;
  gripGesture?: PanGesture;
}) {
  const twoTechs = s.lock?.kind === "two_techs";
  const street = s.address ? streetOf(s.address) : null;
  const missing = s.notOnMap || Boolean(s.address && !s.location);
  const drive = driveChipMinutes(s.legMin, missing, fromOffMap);
  // While a tile is lifted the chips keep their room but don't show: the drives change where
  // it lands (the iPhone app's rule). Moves save on the phone at once, so nothing waits after.
  const lifted = useDragHover().id != null;
  const second = [s.time ?? "No time", s.tag !== s.visit ? s.tag : null, street]
    .filter(Boolean)
    .join(" · ");
  const cleaning = s.cleanings?.[0];
  const status = s.status !== "scheduled" && s.status !== "unscheduled";
  return (
    <View style={[styles.tile, { backgroundColor: color.surface }]}>
      {tech !== null ? <TechStripe tech={tech} /> : null}
      <Badge n={n} status={s.status} done={s.done} big />
      <View style={[styles.text, s.done && { opacity: 0.7 }]}>
        <View style={styles.line1}>
          {onOpen ? (
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={`Open ${s.customer}`}
              onPress={onOpen}
              onLongPress={onHold}
              hitSlop={{ top: 12, bottom: 12, left: 6, right: 8 }}
              style={({ pressed }) => [styles.name, pressed && { opacity: 0.5 }]}
            >
              <Name customer={s.customer} />
            </Pressable>
          ) : (
            <View style={styles.name}>
              <Name customer={s.customer} />
            </View>
          )}
          {s.sample ? <SamplePill /> : null}
          {s.lock && !twoTechs ? <LockTag lock={s.lock} /> : null}
          {missing ? <NotOnMapTag size={17} /> : null}
          {cleaning ? (
            <View accessible accessibilityRole="image" accessibilityLabel={`${cleaning.name} due`}>
              <CleaningIcon kind={cleaning.kind} size={18} tone={color.textMuted} />
            </View>
          ) : null}
          {status ? (
            <View style={styles.status}>
              <StatusChip status={s.status} />
            </View>
          ) : null}
        </View>
        <View style={styles.line2}>
          {drive != null ? (
            <View
              style={lifted ? { opacity: 0 } : undefined}
              importantForAccessibility={lifted ? "no-hide-descendants" : "auto"}
            >
              <DriveChip minutes={drive} />
            </View>
          ) : null}
          <Text
            numberOfLines={1}
            style={[type.secondary, tabular, { color: color.textMuted, flexShrink: 1 }]}
            maxFontSizeMultiplier={MAX_TEXT_SCALE}
          >
            {second}
          </Text>
        </View>
      </View>
      {onMore ? <MoreButton customer={s.customer} onPress={onMore} /> : null}
      {s.movable && gripGesture ? (
        <GestureDetector gesture={gripGesture}>
          <View
            collapsable={false}
            testID="schedule-grip"
            style={styles.gripHit}
            onStartShouldSetResponder={() => true}
            accessible={false}
            importantForAccessibility="no-hide-descendants"
          >
            <Grip width={28} />
          </View>
        </GestureDetector>
      ) : s.movable ? (
        <Grip width={28} />
      ) : null}
    </View>
  );
}

/** The block's last line: a house and "27 min back to the shop". */
export function DriveHome({ text }: { text: string }) {
  return (
    <View
      style={[styles.home, { borderTopColor: color.separator }]}
      accessible
      accessibilityLabel={text}
    >
      <Svg width={14} height={14} viewBox="0 0 24 24" fill={color.textMuted}>
        <Path d={HOUSE_FILL} />
      </Svg>
      <Text
        style={[type.footnote, { color: color.textMuted, flexShrink: 1 }]}
        maxFontSizeMultiplier={MAX_TEXT_SCALE}
      >
        {text}
      </Text>
    </View>
  );
}

/** The website's HouseFillIcon. */
const HOUSE_FILL =
  "M11.3 3.3a1 1 0 0 1 1.4 0l8 7.2a.8.8 0 0 1-.5 1.4H19v7.6a1 1 0 0 1-1 1h-3.5v-5.5h-5v5.5H6a1 1 0 0 1-1-1v-7.6H3.8a.8.8 0 0 1-.5-1.4z";

/**
 * A stop's "⋯" (owner, 2026-10-22): its menu (Open, Move…, Lock Day, Lock Time, Take Off
 * Schedule, Directions), since touch and hold on the tile lifts it to drag. 44 × 44 to touch.
 */
function MoreButton({ customer, onPress }: { customer: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`More: ${customer}`}
      testID="schedule-more"
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [styles.more, pressed && { backgroundColor: color.iconTint }]}
    >
      <Svg width={22} height={22} viewBox="0 0 24 24" fill={color.link}>
        <Circle cx={6} cy={12} r={1.8} />
        <Circle cx={12} cy={12} r={1.8} />
        <Circle cx={18} cy={12} r={1.8} />
      </Svg>
    </Pressable>
  );
}

/** The customer's name, as a link: "Rebecca Soto ›". */
function Name({ customer }: { customer: string }) {
  return (
    <Text
      numberOfLines={1}
      style={[type.bodyEmphasis, { color: color.link }]}
      maxFontSizeMultiplier={MAX_TEXT_SCALE}
    >
      {`${customer} ›`}
    </Text>
  );
}

const styles = StyleSheet.create({
  face: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 64,
    paddingLeft: 14,
    paddingRight: 4,
    paddingVertical: 8,
  },
  badge: {
    minWidth: 28,
    height: 28,
    borderRadius: 14,
    paddingHorizontal: 3,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { fontFamily: font.displayBold, fontSize: 15, lineHeight: 20 },
  badgeBig: {
    minWidth: 32,
    height: 32,
    borderRadius: 16,
    paddingHorizontal: 3,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeTextBig: { fontFamily: font.displayExtraBold, fontSize: 17, lineHeight: 22 },
  tile: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 58,
    paddingLeft: 16,
    paddingRight: 4,
    paddingVertical: 6,
  },
  line1: { flexDirection: "row", alignItems: "center", gap: 6, minWidth: 0 },
  line2: { flexDirection: "row", alignItems: "center", gap: 6, minWidth: 0 },
  status: { marginLeft: "auto" },
  home: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingLeft: 16,
    paddingRight: space["3"],
    paddingVertical: space["2"],
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  time: { fontFamily: font.displayBold },
  text: { flex: 1, minWidth: 0, gap: 1 },
  line: { flexDirection: "row", alignItems: "baseline", gap: 8, minWidth: 0 },
  name: { flexShrink: 1, minWidth: 0 },
  gripHit: {
    width: 44,
    height: 44,
    marginLeft: -10,
    marginRight: -4,
    alignItems: "center",
    justifyContent: "center",
  },
  icons: { flexDirection: "row", alignItems: "center", gap: 4 },
  more: {
    width: minTap - 8,
    height: minTap,
    borderRadius: minTap / 2,
    alignItems: "center",
    justifyContent: "center",
  },
});
