import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { parseMarkup, type DiagramShape, type Job, type Property } from "@leakbook/core";
import { useInspectionConfig, useJobInspection } from "../../data/inspection";
import { Button } from "../../ui/components";
import { ModalSheet } from "../../ui/ModalSheet";
import { PoolDiagram, type DiagramPin } from "../../ui/PoolDiagram";
import { color, space } from "../../ui/theme";
import { PoolShapeEditor } from "./PoolShapeEditor";

/**
 * The job's pool diagram on the Findings tab (owner, 2026-10-19: "More customization to pool
 * shape. Be able to place the spa wherever."), as the website's DiagramPanel
 * (apps/web/src/components/diagram-work.tsx): the drawing with the findings' pins, then Edit
 * Pool Shape (shape, mirror, spa) and Mark Up (job.diagram_markup).
 */
export function DiagramPanel({ job, property }: { job: Job; property: Property }) {
  const config = useInspectionConfig(job.company_id);
  const insp = useJobInspection(job.company_id, job.id);
  const [editing, setEditing] = useState(false);
  const findings = [...insp.findings].sort((a, b) => a.id.localeCompare(b.id));
  const pins: DiagramPin[] = findings
    .map((f, i) => ({ f, n: i + 1 }))
    .filter(({ f }) => f.pin_x != null && f.pin_y != null)
    .map(({ f, n }) => ({
      id: f.id,
      x: Number(f.pin_x),
      y: Number(f.pin_y),
      color: config.severityByKey.get(f.severity_key)?.color ?? color.fail,
      label: String(n),
    }));
  const shape = (property.diagram_shape as DiagramShape | null | undefined) ?? null;
  const markup = parseMarkup(job.diagram_markup).shapes;
  return (
    <View style={{ gap: space["3"] }}>
      <PoolDiagram
        shape={shape}
        hasSpa={property.has_spa}
        layout={property.diagram_layout}
        title={`Pool diagram${pins.length ? ` with ${pins.length} finding pins` : ""}${markup.length ? " and markup" : ""}`}
        pins={pins}
        markup={markup}
      />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space["3"] }}>
        <Button title="Edit Pool Shape" kind="secondary" onPress={() => setEditing(true)} />
        <Button
          title={markup.length ? "Edit Markup" : "Mark Up"}
          kind="secondary"
          onPress={() => router.push(`/jobs/${job.id}/diagram-markup`)}
        />
      </View>
      <ModalSheet visible={editing} onClose={() => setEditing(false)} title="Pool Shape">
        {editing ? <PoolShapeEditor property={property} onDone={() => setEditing(false)} /> : null}
      </ModalSheet>
    </View>
  );
}
