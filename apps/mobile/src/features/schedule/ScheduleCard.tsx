import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { JOB_STATUS_LABELS, NOT_ON_MAP, type JobStatus } from "@leakbook/core";
import { CleaningIcon } from "../maintenance/Cleanings";
import { StatusChip } from "../../ui/components";
import { Grip } from "../../ui/Grip";
import { LockTag } from "../../ui/LockTag";
import { NotOnMapTag } from "../../ui/NotOnMap";
import { TechStripe } from "../../ui/TechDot";
import { WebIcon } from "../../ui/WebIcon";
import { color, font, MAX_TEXT_SCALE, tabular, type } from "../../ui/theme";
import type { Stop } from "./RouteCard";

// A schedule card (docs/design/2026-10-21-schedule-card.md; owner, 2026-10-21: "Redesign those
// tiles too. They look super busy"), the same in Day, Week and Needs a Time, as on the website
// and the iPhone app: two lines. The tech's color stripe and the stop's number, then the time
// and the customer; under them the kind of visit and the street only. Trailing, small icons
// only for exceptions (a lock, not on the map, a cleaning due), or the status when it isn't
// plain Scheduled; then the grip. The whole card opens the job; Move…, the locks, Take Off
// Schedule and Directions are in its touch-and-hold menu and its TalkBack actions.

/** The street alone ("5024 W Las Palmaritas Dr"), without the city or ZIP. */
export function streetOf(address: string): string {
  return address.split(",")[0]!.trim();
}

/** What the card reads as to TalkBack and VoiceOver, exceptions included. */
export function cardLabel(s: Stop, n: number | null, tray = false): string {
  const twoTechs = s.lock?.kind === "two_techs" ? s.lock.label : null;
  return [
    n != null ? `Stop ${n}` : null,
    tray ? null : (s.time ?? "no time"),
    s.customer,
    tray ? s.note : s.tag,
    twoTechs,
    s.address ? streetOf(s.address) : null,
    s.status !== "scheduled" && s.status !== "unscheduled" && !tray
      ? JOB_STATUS_LABELS[s.status]
      : null,
    s.lock && !twoTechs ? s.lock.label : null,
    s.notOnMap || (s.address && !s.location) ? NOT_ON_MAP.title : null,
    s.cleanings?.[0] ? `${s.cleanings[0].name} due` : null,
    s.done ? "done" : null,
  ]
    .filter(Boolean)
    .join(", ");
}

function Badge({ n, status, done }: { n: number; status: JobStatus; done: boolean }) {
  const going = status === "in_progress" && !done;
  return (
    <View
      style={[styles.badge, { backgroundColor: done ? color.pass : going ? color.link : color.bg }]}
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      {done ? (
        <WebIcon name="check" size={14} color={color.onStatus} strokeWidth={3} />
      ) : (
        <Text
          style={[styles.badgeText, tabular, { color: going ? color.onPrimary : color.text }]}
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
  tray = false,
  trailing,
}: {
  stop: Stop;
  /** Its place in the day; null when it has none (Needs a Time). */
  n: number | null;
  /** The tech's color: a 4 pt stripe on the leading edge (null: nobody yet, no stripe). */
  tech: string | null;
  /** Needs a Time: no time line; the note ("No tech yet · booked…") on the second line. */
  tray?: boolean;
  /** More buttons before the grip (Needs a Time's Actions). */
  trailing?: ReactNode;
}) {
  const twoTechs = s.lock?.kind === "two_techs" ? s.lock.label : null;
  const street = s.address ? streetOf(s.address) : null;
  const second = [tray ? s.note : twoTechs ? `${s.tag} · ${twoTechs}` : s.tag, street]
    .filter(Boolean)
    .join(" · ");
  const time = tray ? s.time : (s.time ?? "No time");
  const cleaning = s.cleanings?.[0];
  const status = s.status !== "scheduled" && s.status !== "unscheduled" && !tray;
  return (
    <View style={[styles.face, { backgroundColor: color.surface }]}>
      {tech !== null ? <TechStripe tech={tech} /> : null}
      {n != null ? <Badge n={n} status={s.status} done={s.done} /> : null}
      <View style={[styles.text, s.done && { opacity: 0.7 }]}>
        <Text numberOfLines={1} maxFontSizeMultiplier={MAX_TEXT_SCALE}>
          {time ? (
            <Text style={[type.bodyEmphasis, styles.time, tabular, { color: color.text }]}>
              {`${time}  `}
            </Text>
          ) : null}
          <Text style={[type.bodyEmphasis, { color: color.text }]}>{s.customer}</Text>
        </Text>
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
      {trailing}
      {s.movable ? <Grip width={28} /> : null}
    </View>
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
  time: { fontFamily: font.displayBold },
  text: { flex: 1, minWidth: 0, gap: 1 },
  icons: { flexDirection: "row", alignItems: "center", gap: 4 },
});
