import { router } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";
import { calculate, type Job } from "@leakbook/core";
import { useInspectionConfig, useJobInspection } from "../../data/inspection";
import { T } from "../../ui/components";
import { color, font, radius, space } from "../../ui/theme";
import { OutcomeChip } from "./OutcomeChip";

export function TestsTab({ job }: { job: Job }) {
  const config = useInspectionConfig(job.company_id);
  const insp = useJobInspection(job.company_id, job.id);

  return (
    <View style={{ gap: space["3"] }}>
      {insp.tests.length === 0
        ? null
        : insp.tests.map((t) => {
            const type = config.testTypeById.get(t.test_type_id);
            const component = t.job_component_id
              ? insp.componentById.get(t.job_component_id)
              : undefined;
            const where = String(t.data.line_name ?? t.data.location ?? component?.label ?? "");
            const summary = type ? calculate(type, t.data).summary : null;
            return (
              <Pressable
                key={t.id}
                accessibilityRole="button"
                onPress={() => router.push(`/jobs/${job.id}/test/${t.id}`)}
                style={({ pressed }) => [styles.item, pressed && { opacity: 0.85 }]}
              >
                <View style={{ flex: 1, gap: 2 }}>
                  <T variant="strong">
                    {type?.name ?? "Test"}
                    {where ? ` · ${where}` : ""}
                  </T>
                  {(summary ?? t.data.observation) ? (
                    <T variant="muted">{summary ?? String(t.data.observation)}</T>
                  ) : null}
                </View>
                <OutcomeChip outcome={t.outcome} />
              </Pressable>
            );
          })}
      {insp.tests.length === 0 ? (
        <T variant="muted">No tests recorded yet. Pick one to add.</T>
      ) : (
        <T variant="label">Add a test</T>
      )}
      <View style={styles.wrap}>
        {config.testTypes.map((tt) => (
          <Pressable
            key={tt.id}
            accessibilityRole="button"
            onPress={() => router.push(`/jobs/${job.id}/test/new?type=${tt.id}`)}
            style={styles.add}
          >
            <T variant="strong" style={styles.addText}>
              + {tt.name}
            </T>
          </Pressable>
        ))}
      </View>
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
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: space["2"] },
  add: {
    minHeight: 48,
    justifyContent: "center",
    paddingHorizontal: space["4"],
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: color.navy,
    backgroundColor: color.surface,
  },
  addText: { fontFamily: font.displayBold, color: color.navy },
});
