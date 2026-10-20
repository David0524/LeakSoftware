import { useState } from "react";
import { InteractionManager, StyleSheet, View } from "react-native";
import type { JobChange } from "@leakbook/core";
import type { BannerNote } from "../../lib/resultBanner";
import {
  EVERYONE,
  PLAN_WEEK_HELP,
  PLAN_WEEK_UNDONE,
  type WeekPlanOutcome,
} from "../../lib/weekPlan";
import { Button, Group, ListRow, SwitchControl, T } from "../../ui/components";
import { ModalSheet } from "../../ui/ModalSheet";
import { color, minTap, space } from "../../ui/theme";
import { WebIcon } from "../../ui/WebIcon";

// Plan Week (owner, 2026-10-20, docs/plans/route-maps.md: "build routes from scratch"), the
// website's plan-week.tsx on Android: one full-width button above the week, a sheet with who to
// plan for and whether Needs a Time joins in, and the result with one Undo for the whole change
// in Schedule's banner (owner, 2026-10-20). No alert or confirmation: Undo covers it. Owners and
// admins. The button shows "Planning…" first; the week is worked out once that's on screen.

/** The Plan Week button and its sheet; the result goes to Schedule's banner. */
export function PlanWeek({
  techs,
  defaultTech,
  waiting,
  onPlan,
  onUndo,
  onResult,
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
  /** Shows the result (with Undo) in the banner at the top of the screen. */
  onResult: (note: BannerNote) => void;
}) {
  const fallback = defaultTech && techs.some((t) => t.id === defaultTech) ? defaultTech : EVERYONE;
  const [open, setOpen] = useState(false);
  const [tech, setTech] = useState(fallback);
  const [withTray, setWithTray] = useState(true);
  const [busy, setBusy] = useState(false);

  function plan() {
    setOpen(false);
    setBusy(true);
    const forTech = tech;
    const tray = waiting > 0 && withTray;
    // After the sheet has gone and "Planning…" shows, so the tap never freezes.
    requestAnimationFrame(() => {
      void InteractionManager.runAfterInteractions(() =>
        setTimeout(() => {
          try {
            const r = onPlan(forTech, tray);
            if (r.error) return onResult({ tone: "error", message: r.error });
            const rows = r.undo;
            onResult({
              tone: "success",
              message: r.message ?? "Week planned",
              undo: rows.length ? () => putBack(rows) : undefined,
            });
          } finally {
            setBusy(false);
          }
        }, 0),
      );
    });
  }

  function putBack(rows: JobChange[]) {
    const error = onUndo(rows);
    onResult(
      error ? { tone: "error", message: error } : { tone: "info", message: PLAN_WEEK_UNDONE },
    );
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
        title={busy ? "Planning…" : "Plan Week"}
        loading={busy}
        wide
        onPress={() => {
          // The sheet starts from the tech the schedule shows.
          setTech(fallback);
          setWithTray(true);
          setOpen(true);
        }}
      />
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
