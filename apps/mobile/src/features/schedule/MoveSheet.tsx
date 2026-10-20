import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { durationLabel, formatDay, type SuggestedTime } from "@leakbook/core";
import { Button, Group, Notice, T } from "../../ui/components";
import { ModalSheet } from "../../ui/ModalSheet";
import { useMenu } from "../../ui/Select";
import { color, MAX_TEXT_SCALE, minTap, space, type } from "../../ui/theme";
import { WebIcon } from "../../ui/WebIcon";
import { DatePicker } from "./Calendar";

// Move {Customer} and Suggested Times (spec 6.3; the website's route-board.tsx MoveSheet and
// Suggestions).

/** A value-style row: the label at the left, the value in the link color at the right. */
function ValueRow({
  label,
  value,
  onPress,
}: {
  label: string;
  value: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${value}`}
      onPress={onPress}
      android_ripple={{ color: color.ripple }}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: color.rowPressed }]}
    >
      <T>{label}</T>
      <View style={styles.value}>
        <Text
          numberOfLines={1}
          style={[type.body, { color: color.link, flexShrink: 1, textAlign: "right" }]}
          maxFontSizeMultiplier={MAX_TEXT_SCALE}
        >
          {value}
        </Text>
        <WebIcon name="updown" size={14} color={color.link} strokeWidth={2.2} />
      </View>
    </Pressable>
  );
}

export interface MoveTarget {
  id: string;
  customer: string;
  address: string;
  /** "techId|date" now, or null when it waits in Needs a Time. */
  from: { tech: string | null; date: string } | null;
  /** False for a started job: it can move, but not come off the schedule (core canUnschedule). */
  unschedulable?: boolean;
}

export function MoveSheet({
  job,
  techs,
  manager,
  today,
  placesFor,
  onClose,
  onMove,
}: {
  job: MoveTarget | null;
  techs: { id: string; name: string }[];
  /** Managers may leave a job with nobody (it waits in Needs a Time). */
  manager: boolean;
  today: string;
  /** The other stops on a tech's day, in order, for "Place in the route". */
  placesFor: (
    tech: string,
    date: string,
    jobId: string,
  ) => { customer: string; time: string | null }[];
  onClose: () => void;
  /** tech null: nobody; date null: take it off the schedule. */
  onMove: (tech: string | null, date: string | null, index: number) => void;
}) {
  return (
    <ModalSheet
      visible={job != null}
      onClose={onClose}
      title={job ? `Move ${job.customer}` : "Move"}
    >
      {job ? (
        <MoveForm
          key={job.id}
          job={job}
          techs={techs}
          manager={manager}
          today={today}
          placesFor={placesFor}
          onMove={onMove}
        />
      ) : null}
    </ModalSheet>
  );
}

function MoveForm({
  job,
  techs,
  manager,
  today,
  placesFor,
  onMove,
}: {
  job: MoveTarget;
  techs: { id: string; name: string }[];
  manager: boolean;
  today: string;
  placesFor: (
    tech: string,
    date: string,
    jobId: string,
  ) => { customer: string; time: string | null }[];
  onMove: (tech: string | null, date: string | null, index: number) => void;
}) {
  const menu = useMenu();
  const [tech, setTech] = useState(techs.length === 1 ? techs[0]!.id : (job.from?.tech ?? ""));
  const [date, setDate] = useState(job.from && job.from.date >= today ? job.from.date : today);
  const [picking, setPicking] = useState(false);
  const others = tech ? placesFor(tech, date, job.id) : [];
  const [place, setPlace] = useState(() => others.length);
  const at = Math.min(place, others.length);
  const nobody = "Nobody yet (waits in Needs a Time)";
  const techName = tech ? (techs.find((t) => t.id === tech)?.name ?? "Teammate") : nobody;
  const placeLabel = (i: number) =>
    i === 0
      ? "First stop"
      : `After ${others[i - 1]!.customer}${others[i - 1]!.time ? ` (${others[i - 1]!.time})` : ""}`;

  return (
    <>
      {job.address ? (
        <T variant="secondary" muted style={{ textAlign: "center" }}>
          {job.address}
        </T>
      ) : null}
      <Group>
        <ValueRow
          label="Tech"
          value={techName}
          onPress={() =>
            menu.open({
              title: "Tech",
              items: [
                ...(manager && techs.length > 1
                  ? [{ label: nobody, checked: !tech, onPress: () => setTech("") }]
                  : []),
                ...techs.map((t) => ({
                  label: t.name,
                  checked: t.id === tech,
                  onPress: () => {
                    setTech(t.id);
                    setPlace(Number.MAX_SAFE_INTEGER);
                  },
                })),
              ],
            })
          }
        />
        <ValueRow label="Day" value={formatDay(date)} onPress={() => setPicking((p) => !p)} />
        {tech && others.length ? (
          <ValueRow
            label="Place in the route"
            value={placeLabel(at)}
            onPress={() =>
              menu.open({
                title: "Place in the route",
                items: Array.from({ length: others.length + 1 }, (_, i) => ({
                  label: placeLabel(i),
                  checked: i === at,
                  onPress: () => setPlace(i),
                })),
              })
            }
          />
        ) : null}
      </Group>
      {picking ? (
        <View style={[styles.picker, { backgroundColor: color.surface }]}>
          <DatePicker
            value={date}
            today={today}
            min={today}
            onChange={(d) => {
              setDate(d);
              setPlace(Number.MAX_SAFE_INTEGER);
              setPicking(false);
            }}
          />
        </View>
      ) : null}
      <View style={{ gap: space["2"], marginTop: space["1"] }}>
        <Button title="Move" wide onPress={() => onMove(tech || null, date, tech ? at : 9_999)} />
        {job.from && job.unschedulable !== false ? (
          <Button
            title="Take Off Schedule"
            kind="secondary"
            wide
            onPress={() => onMove(null, null, 0)}
          />
        ) : null}
      </View>
      {menu.element}
    </>
  );
}

/** Suggested Times: places the job fits, each with a Use button. */
export function SuggestSheet({
  open,
  title,
  suggestions,
  note,
  onClose,
  onPick,
}: {
  open: boolean;
  title: string;
  suggestions: SuggestedTime[];
  note?: string;
  onClose: () => void;
  onPick: (s: SuggestedTime) => void;
}) {
  return (
    <ModalSheet visible={open} onClose={onClose} title={title} cancel="Close">
      {note ? <Notice>{note}</Notice> : null}
      {suggestions.length ? (
        <Group>
          {suggestions.map((s) => (
            <View key={`${s.techId}-${s.date}`} style={styles.suggestion}>
              <View style={{ flex: 1 }}>
                <T variant="bodyEmphasis">
                  {s.dayLabel} at {s.timeLabel} · {s.techName}
                </T>
                <T variant="secondary" muted>
                  {s.addedDriveMin > 0
                    ? `Adds ${durationLabel(s.addedDriveMin)} of driving`
                    : "Adds no driving"}
                  , {s.near}
                </T>
              </View>
              <Button
                kind="quiet"
                title="Use"
                onPress={() => onPick(s)}
                style={{ paddingHorizontal: 12 }}
              />
            </View>
          ))}
        </Group>
      ) : null}
    </ModalSheet>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: minTap,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space["3"],
    paddingHorizontal: space["4"],
    paddingVertical: 6,
  },
  value: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 1,
    maxWidth: "62%",
  },
  picker: { borderRadius: 12, padding: space["3"] },
  suggestion: {
    flexDirection: "row",
    alignItems: "center",
    gap: space["2"],
    paddingLeft: space["4"],
    paddingRight: space["2"],
    paddingVertical: 10,
  },
});
