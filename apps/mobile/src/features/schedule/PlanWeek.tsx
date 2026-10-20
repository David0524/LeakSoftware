import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { JobChange } from "@leakbook/core";
import { EVERYONE, PLAN_WEEK_HELP, type WeekPlanOutcome } from "../../lib/weekPlan";
import { Button, Group, ListRow, Notice, SwitchControl, T } from "../../ui/components";
import { ModalSheet } from "../../ui/ModalSheet";
import { color, face, MAX_TEXT_SCALE, minTap, space, type } from "../../ui/theme";
import { WebIcon } from "../../ui/WebIcon";

// Plan Week (owner, 2026-10-20, docs/plans/route-maps.md: "build routes from scratch"), the
// website's plan-week.tsx on Android: one full-width button above the week, a sheet with who to
// plan for and whether Needs a Time joins in, and the result with one Undo for the whole change.
// No alert or confirmation: Undo covers it. Owners and admins.

/** The Plan Week button, its sheet, and the result (with Undo) under it. */
export function PlanWeek({
  techs,
  defaultTech,
  waiting,
  onPlan,
  onUndo,
}: {
  techs: { id: string; name: string }[];
  /** The tech chip picked on Schedule, else Everyone. */
  defaultTech: string | null;
  /** Jobs in Needs a Time with nobody on them that may be placed this week. */
  waiting: number;
  /** Plans and saves the week; the outcome's `undo` puts it back. */
  onPlan: (tech: string, tray: boolean) => WeekPlanOutcome;
  /** Writes the saved rows back; an error, or null when it worked. */
  onUndo: (rows: JobChange[]) => string | null;
}) {
  const fallback = defaultTech && techs.some((t) => t.id === defaultTech) ? defaultTech : EVERYONE;
  const [open, setOpen] = useState(false);
  const [tech, setTech] = useState(fallback);
  const [withTray, setWithTray] = useState(true);
  const [result, setResult] = useState<{ message?: string; error?: string } | null>(null);
  const [undo, setUndo] = useState<JobChange[] | null>(null);

  function plan() {
    setOpen(false);
    const r = onPlan(tech, waiting > 0 && withTray);
    setResult(r.error ? { error: r.error } : { message: r.message });
    setUndo(r.error || !r.undo.length ? null : r.undo);
  }

  function putBack() {
    if (!undo) return;
    const error = onUndo(undo);
    if (error) setResult({ error });
    else {
      setResult({ message: "Put back as it was." });
      setUndo(null);
    }
  }

  const row = (value: string, label: string) => {
    const on = tech === value;
    return (
      <ListRow
        key={value}
        accessibilityLabel={`${label}${on ? ", selected" : ""}`}
        onPress={() => setTech(value)}
        chevron={false}
        trailing={
          <View style={!on && { opacity: 0 }}>
            <WebIcon name="check" size={20} color={color.link} strokeWidth={2.4} />
          </View>
        }
      >
        <T>{label}</T>
      </ListRow>
    );
  };

  return (
    <View style={{ gap: space["3"] }}>
      <Button
        kind="secondary"
        title="Plan Week"
        wide
        onPress={() => {
          setResult(null);
          // The sheet starts from the tech the schedule shows.
          setTech(fallback);
          setWithTray(true);
          setOpen(true);
        }}
      />
      {result?.error ? (
        <Notice tone="error">{result.error}</Notice>
      ) : result?.message ? (
        <Notice tone="success">
          {/* The result, with Undo at its end (one Undo puts the whole week back). */}
          <View style={styles.result}>
            <Text
              style={[type.body, face.medium, { flex: 1, color: color.text }]}
              maxFontSizeMultiplier={MAX_TEXT_SCALE}
            >
              {result.message}
            </Text>
            {undo ? (
              <Button
                kind="quiet"
                title="Undo"
                accessibilityLabel={`Undo, ${result.message}`}
                onPress={putBack}
                style={{ paddingHorizontal: 12, marginRight: -8 }}
              />
            ) : null}
          </View>
        </Notice>
      ) : null}

      <ModalSheet visible={open} onClose={() => setOpen(false)} title="Plan Week">
        {/* Who to plan for, as an iOS checklist: Everyone, then each tech. */}
        <View
          style={{ gap: space["2"] }}
          accessibilityRole="radiogroup"
          accessibilityLabel="Plan for"
        >
          <T variant="secondary" muted style={styles.label}>
            Plan for
          </T>
          <Group>{[row(EVERYONE, "Everyone")]}</Group>
        </View>
        <Group>{techs.map((t) => row(t.id, t.name))}</Group>
        {waiting > 0 ? (
          // Whether jobs nobody has yet come onto the week too (an iOS switch row).
          <Group>
            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <T>Place Jobs from Needs a Time</T>
                <T variant="secondary" muted>
                  {waiting} waiting
                </T>
              </View>
              <SwitchControl
                value={withTray}
                onValueChange={setWithTray}
                label="Place Jobs from Needs a Time"
              />
            </View>
          </Group>
        ) : null}
        <T variant="secondary" muted style={styles.label}>
          {PLAN_WEEK_HELP}
        </T>
        <Button title="Plan Week" wide onPress={plan} />
      </ModalSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  result: { flexDirection: "row", alignItems: "center", gap: space["3"], flex: 1 },
  label: { paddingHorizontal: space["4"] },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space["3"],
    minHeight: minTap,
    paddingHorizontal: space["4"],
    paddingVertical: space["2"],
  },
});
