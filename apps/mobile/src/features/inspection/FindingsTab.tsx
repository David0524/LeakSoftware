import { router } from "expo-router";
import { StyleSheet, View } from "react-native";
import { type DiagramShape, type Job, type Property } from "@leakbook/core";
import { useInspectionConfig, useJobInspection } from "../../data/inspection";
import { useSession } from "../../state/session";
import { Button, Group, ListRow, T } from "../../ui/components";
import { PoolDiagram } from "../../ui/PoolDiagram";
import { ShapePicker } from "../../ui/ShapePicker";
import { color, font, space } from "../../ui/theme";

export function FindingsTab({ job, property }: { job: Job; property?: Property }) {
  const { services } = useSession();
  const config = useInspectionConfig(job.company_id);
  const insp = useJobInspection(job.company_id, job.id);
  const ordered = [...insp.findings].sort((a, b) => a.id.localeCompare(b.id));
  const shape = (property?.diagram_shape as DiagramShape | null | undefined) ?? null;

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
          <ShapePicker
            value={shape}
            hint={shape ? undefined : "Not picked yet. Pick one so the diagram matches the pool."}
            onChange={(v) =>
              services.sync.write("property", property.id, property.company_id, {
                diagram_shape: v,
              })
            }
          />
        </>
      ) : null}
      {ordered.length === 0 ? (
        <T variant="muted">No findings yet. Add one for each leak you find.</T>
      ) : (
        // Hairlines start after the number, where the text does.
        <Group separatorInset={space["4"] + NUM + space["3"]}>
          {ordered.map((f, i) => {
            const sev = config.severityByKey.get(f.severity_key);
            const comp = f.job_component_id
              ? insp.componentById.get(f.job_component_id)
              : undefined;
            return (
              <ListRow
                key={f.id}
                onPress={() => router.push(`/jobs/${job.id}/finding/${f.id}`)}
                leading={
                  <View style={[styles.num, { backgroundColor: sev?.color ?? color.fail }]}>
                    <T variant="strong" style={styles.numText}>
                      {i + 1}
                    </T>
                  </View>
                }
                title={f.title}
                subtitle={[
                  sev?.name,
                  comp?.label,
                  f.location_text,
                  f.pin_x == null ? "Not pinned" : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              />
            );
          })}
        </Group>
      )}
      <Button title="Add Finding" onPress={() => router.push(`/jobs/${job.id}/finding/new`)} />
    </View>
  );
}

/** The finding's number badge. */
const NUM = 28;

const styles = StyleSheet.create({
  num: {
    width: NUM,
    height: NUM,
    borderRadius: NUM / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  numText: { fontFamily: font.displayBold, color: color.onHeader },
});
