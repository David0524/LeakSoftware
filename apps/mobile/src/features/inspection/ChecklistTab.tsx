import { router } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";
import { checklistProgress, componentApplies, type Job, type Property } from "@leakbook/core";
import {
  addComponent,
  createChecklist,
  useInspectionConfig,
  useJobInspection,
} from "../../data/inspection";
import { useSession } from "../../state/session";
import { Button, Card, Row, T } from "../../ui/components";
import { color, font, radius, space } from "../../ui/theme";

const STATUS_STYLE = {
  pending: { label: "TO DO", bg: color.neutral200, fg: color.text },
  inspected: { label: "INSPECTED", bg: color.pass, fg: color.onHeader },
  excluded: { label: "EXCLUDED", bg: color.excluded, fg: color.onHeader },
} as const;

export function ChecklistTab({ job, property }: { job: Job; property?: Property }) {
  const { services } = useSession();
  const config = useInspectionConfig(job.company_id);
  const insp = useJobInspection(job.company_id, job.id);
  const progress = checklistProgress(insp.components, insp.results);

  if (insp.components.length === 0) {
    return (
      <Card>
        <T variant="body">No checklist yet for this job.</T>
        <Button
          title="Set up checklist"
          onPress={() =>
            createChecklist(services.sync, job.company_id, job.id, config.componentTypes, {
              has_pool: property?.has_pool ?? true,
              has_spa: property?.has_spa ?? false,
            })
          }
        />
      </Card>
    );
  }

  const groups = config.componentTypes
    .map((type) => ({
      type,
      items: insp.components.filter((c) => c.component_type_id === type.id),
    }))
    .filter(
      (g) =>
        g.items.length > 0 ||
        (g.type.allows_multiple && property && componentApplies(g.type, property)),
    );
  const missing = config.componentTypes.filter(
    (t) => !t.allows_multiple && !insp.components.some((c) => c.component_type_id === t.id),
  );

  return (
    <View style={{ gap: space["3"] }}>
      <T variant="muted">
        {progress.inspected} inspected · {progress.excluded} excluded · {progress.pending} to do
      </T>
      {groups.map(({ type, items }) => (
        <View key={type.id} style={{ gap: space["2"] }}>
          <Row style={{ justifyContent: "space-between" }}>
            <T variant="label">
              {type.name}
              {type.allows_multiple ? ` (${items.length})` : ""}
            </T>
            {type.allows_multiple ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Add ${type.name.toLowerCase()}`}
                hitSlop={10}
                onPress={() =>
                  addComponent(services.sync, job.company_id, job.id, type, insp.components)
                }
              >
                <T variant="strong" style={{ color: color.link }}>
                  + Add {type.name.toLowerCase()}
                </T>
              </Pressable>
            ) : null}
          </Row>
          {items.map((c) => {
            const r = insp.resultByComponent.get(c.id);
            const s = STATUS_STYLE[r?.status ?? "pending"];
            const detail =
              r?.status === "inspected"
                ? r.method
                : r?.status === "excluded"
                  ? r.exclusion_reason
                  : null;
            return (
              <Pressable
                key={c.id}
                accessibilityRole="button"
                onPress={() => router.push(`/jobs/${job.id}/component/${c.id}`)}
                style={({ pressed }) => [styles.item, pressed && { opacity: 0.85 }]}
              >
                <View style={{ flex: 1, gap: 2 }}>
                  <T variant="strong">{c.label}</T>
                  {detail ? <T variant="muted">{detail}</T> : null}
                </View>
                <View style={[styles.chip, { backgroundColor: s.bg }]}>
                  <T variant="small" style={[styles.chipText, { color: s.fg }]}>
                    {s.label}
                  </T>
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
      {missing.length > 0 ? (
        <View style={{ gap: space["2"] }}>
          <T variant="label">Add another component</T>
          <View style={styles.wrap}>
            {missing.map((t) => (
              <Button
                key={t.id}
                title={`+ ${t.name}`}
                kind="secondary"
                onPress={() =>
                  addComponent(services.sync, job.company_id, job.id, t, insp.components)
                }
              />
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: space["3"],
    minHeight: 56,
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.lg,
    padding: space["3"],
  },
  chip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm },
  chipText: { fontFamily: font.displayBold, fontSize: 12, letterSpacing: 0.6 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: space["2"] },
});
