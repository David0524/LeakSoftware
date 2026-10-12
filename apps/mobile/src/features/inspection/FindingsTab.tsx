import { router } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";
import { DIAGRAM_SHAPES, type DiagramShape, type Job, type Property } from "@leakbook/core";
import { useInspectionConfig, useJobInspection } from "../../data/inspection";
import { useSession } from "../../state/session";
import { Button, Card, Choice, T } from "../../ui/components";
import { PoolDiagram } from "../../ui/PoolDiagram";
import { color, font, radius, space } from "../../ui/theme";

export function FindingsTab({ job, property }: { job: Job; property?: Property }) {
  const { services } = useSession();
  const config = useInspectionConfig(job.company_id);
  const insp = useJobInspection(job.company_id, job.id);
  const ordered = [...insp.findings].sort((a, b) => a.id.localeCompare(b.id));

  return (
    <View style={{ gap: space["3"] }}>
      {property ? (
        <>
          <PoolDiagram
            shape={property.diagram_shape}
            hasSpa={property.has_spa}
            pins={ordered
              .filter((f) => f.pin_x != null && f.pin_y != null)
              .map((f) => ({
                id: f.id,
                x: Number(f.pin_x),
                y: Number(f.pin_y),
                color: config.severityByKey.get(f.severity_key)?.color ?? color.fail,
                label: String(ordered.indexOf(f) + 1),
              }))}
          />
          <Choice
            label="Pool shape"
            options={DIAGRAM_SHAPES.map((s) => ({ value: s.key, label: s.label }))}
            value={(property.diagram_shape as DiagramShape | undefined) ?? "rectangle"}
            onChange={(v) =>
              services.sync.write("property", property.id, property.company_id, {
                diagram_shape: v,
              })
            }
          />
        </>
      ) : null}
      {ordered.length === 0 ? (
        <Card>
          <T variant="muted">No findings yet. Add one for each leak you find.</T>
        </Card>
      ) : (
        ordered.map((f, i) => {
          const sev = config.severityByKey.get(f.severity_key);
          const comp = f.job_component_id ? insp.componentById.get(f.job_component_id) : undefined;
          return (
            <Pressable
              key={f.id}
              accessibilityRole="button"
              onPress={() => router.push(`/jobs/${job.id}/finding/${f.id}`)}
              style={({ pressed }) => [styles.item, pressed && { opacity: 0.85 }]}
            >
              <View style={[styles.num, { backgroundColor: sev?.color ?? color.fail }]}>
                <T variant="strong" style={styles.numText}>
                  {i + 1}
                </T>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <T variant="strong">{f.title}</T>
                <T variant="muted">
                  {[sev?.name, comp?.label, f.location_text, f.pin_x == null ? "Not pinned" : null]
                    .filter(Boolean)
                    .join(" · ")}
                </T>
              </View>
            </Pressable>
          );
        })
      )}
      <Button title="Add finding" onPress={() => router.push(`/jobs/${job.id}/finding/new`)} />
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
  num: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  numText: { fontFamily: font.displayBold, color: color.onHeader },
});
