import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import {
  formatAddress,
  formatSchedule,
  monthlyUsage,
  readingSummary,
  type Property,
} from "@leakbook/core";
import { useTabBarTop } from "../../../../features/messages/Composer";
import {
  Doses,
  GallonsInput,
  ReadingsFields,
  SubmitReadings,
  useChemCalculator,
} from "../../../../features/chemicals/Calculator";
import { useChemicalLog, usePoolAdditions } from "../../../../data/chemicals";
import { useRow } from "../../../../data/hooks";
import { useTeam } from "../../../../data/schedule";
import { getServices } from "../../../../lib/services";
import { useCompany } from "../../../../state/session";
import { Card, Group, ListRow, Screen, Section, T } from "../../../../ui/components";
import { confirmDestructive } from "../../../../ui/confirm";
import { Glass } from "../../../../ui/Glass";
import { ModalSheet } from "../../../../ui/ModalSheet";
import { color, face, MAX_TEXT_SCALE, minTap, space, tabular, type } from "../../../../ui/theme";

// The pool chemical calculator's own screen (spec 5.11; owner, 2026-10-16), from More and a
// customer's pool: readings fill the screen; What to Add is a glass bar floating above the tab
// bar that opens a sheet. A visit's Checklist has its own Chemicals in place instead
// (features/chemicals/VisitChemicals.tsx, owner 2026-10-24). Opened for a pool, its gallons
// fill in, Submit saves the readings to the pool's chemical log (synced, so it works offline),
// and the log shows below with what was added each month, as on the website.

export default function Chemicals() {
  // Opened for a pool (a visit's or a customer's Chemical), its gallons fill in.
  const params = useLocalSearchParams<{ property?: string; job?: string }>();
  const company = useCompany();
  const found = useRow<Property & { deleted_at?: string | null }>("property", params.property);
  const pool = found && !found.deleted_at ? found : undefined;
  const calc = useChemCalculator(pool, params.job || null);
  const { ready, line, result } = calc;
  const log = useChemicalLog(company.id)
    .filter((r) => pool && r.property_id === pool.id)
    .slice(0, 12);
  const team = useTeam(company.id);
  // What the pool took each month (owner, 2026-10-24), from what techs added on visits.
  const months = monthlyUsage(usePoolAdditions(company.id, pool?.id ?? ""), company.timezone);
  const [sheet, setSheet] = useState(false);
  const barTop = useTabBarTop();

  function remove(id: string) {
    confirmDestructive({
      title: "Remove these readings?",
      message: "They come off the pool’s chemical log.",
      confirm: "Remove Readings",
      onConfirm: () =>
        getServices().sync.write("chemical_reading", id, company.id, {
          deleted_at: new Date().toISOString(),
        }),
    });
  }
  const who = (uid: string | null | undefined) =>
    uid ? team.find((t) => t.user_id === uid)?.name : undefined;

  return (
    <View style={{ flex: 1 }}>
      <Screen title="Chemical" subtitle={pool ? formatAddress(pool) : undefined}>
        <Card style={{ gap: space["4"] }}>
          <T variant="cardTitle">Pool</T>
          <GallonsInput calc={calc} />
        </Card>

        <Card style={{ gap: space["4"] }}>
          <T variant="cardTitle">Readings</T>
          <ReadingsFields calc={calc} />
          {/* Submit: the left side goes into this pool's weekly log (owner, 2026-10-19). */}
          {pool ? (
            <SubmitReadings calc={calc} whose="this pool’s" />
          ) : (
            <View style={[styles.submit, { borderTopColor: color.separator }]}>
              <T variant="secondary" muted>
                To save readings to a pool’s log, open Chemical from a visit or the customer’s pool.
              </T>
            </View>
          )}
        </Card>
        {pool && months.length ? (
          <Section title="Chemicals added" footer="Added on visits, by month.">
            <Group>
              {months.map((m) => (
                <ListRow key={m.month} title={m.label} subtitle={m.line} />
              ))}
            </Group>
          </Section>
        ) : null}
        {pool ? (
          <Section title="Chemical log" footer="One entry for each Submit, newest first.">
            <Group>
              {log.length === 0 ? (
                <ListRow>
                  <T muted>No readings submitted yet</T>
                </ListRow>
              ) : (
                log.map((r) => (
                  <ListRow
                    key={r.id}
                    onDelete={() => remove(r.id)}
                    deleteLabel="Remove"
                    trailing={
                      <Text
                        accessibilityRole="button"
                        accessibilityLabel="Remove these readings"
                        onPress={() => remove(r.id)}
                        style={[type.body, styles.remove, { color: color.fail }]}
                        maxFontSizeMultiplier={MAX_TEXT_SCALE}
                      >
                        Remove
                      </Text>
                    }
                  >
                    <T style={tabular}>{readingSummary(r)}</T>
                    <T variant="secondary" muted>
                      {[
                        formatSchedule(r.recorded_at, new Date(), company.timezone),
                        who(r.recorded_by),
                        r.gallons ? `${r.gallons.toLocaleString("en-US")} gal` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </T>
                  </ListRow>
                ))
              )}
            </Group>
          </Section>
        ) : null}
        {/* Room to scroll the last fields clear of the floating bar. */}
        <View style={{ height: 72 }} />
      </Screen>

      <View style={[styles.dock, { bottom: barTop + space["2"] }]} pointerEvents="box-none">
        <Glass style={styles.bar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`What to Add: ${line}`}
            accessibilityState={{ disabled: !ready }}
            disabled={!ready}
            onPress={() => setSheet(true)}
            style={({ pressed }) => [styles.barInner, pressed && { opacity: 0.7 }]}
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.barLabel, { color: color.textMuted }]}>What to Add</Text>
              <Text
                numberOfLines={1}
                style={[type.bodyEmphasis, { color: ready ? color.text : color.textMuted }]}
                maxFontSizeMultiplier={MAX_TEXT_SCALE}
              >
                {line}
              </Text>
            </View>
            {ready ? <Text style={[type.bodyEmphasis, { color: color.link }]}>Show</Text> : null}
          </Pressable>
        </Glass>
      </View>

      <ModalSheet
        visible={sheet}
        onClose={() => setSheet(false)}
        title="What to Add"
        cancel="Close"
      >
        <Doses result={result} />
      </ModalSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  submit: { gap: space["3"], borderTopWidth: StyleSheet.hairlineWidth, paddingTop: space["4"] },
  remove: { minHeight: minTap, lineHeight: minTap, paddingHorizontal: space["2"] },
  barLabel: { ...face.semiBold, fontSize: 13, lineHeight: 18, textTransform: "uppercase" },
  dock: { position: "absolute", left: space["3"], right: space["3"] },
  bar: { borderRadius: 22 },
  barInner: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: space["3"],
    paddingHorizontal: space["4"],
    paddingVertical: space["2"],
  },
});
