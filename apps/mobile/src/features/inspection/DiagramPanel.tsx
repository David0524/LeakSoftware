import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import {
  SPA_SHAPES,
  SPA_SIZES,
  parseDiagramLayout,
  parseMarkup,
  poolDiagram,
  type DiagramLayout,
  type DiagramShape,
  type Job,
  type Property,
  type SpaShape,
  type SpaSize,
} from "@leakbook/core";
import type { JsonValue } from "@leakbook/sync";
import { useInspectionConfig, useJobInspection } from "../../data/inspection";
import { useSession } from "../../state/session";
import { Button, Segmented, T, Toggle } from "../../ui/components";
import { ModalSheet } from "../../ui/ModalSheet";
import { PoolDiagram, type DiagramPin } from "../../ui/PoolDiagram";
import { ShapePicker } from "../../ui/ShapePicker";
import { color, space } from "../../ui/theme";

const round = (n: number) => Math.round(Math.min(1, Math.max(0, n)) * 10_000) / 10_000;

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
        {editing ? (
          <ShapeForm
            property={property}
            shape={shape}
            layout={parseDiagramLayout(property.diagram_layout)}
            onDone={() => setEditing(false)}
          />
        ) : null}
      </ModalSheet>
    </View>
  );
}

/** Shape, mirror, and the spa: tap the drawing to move the spa (screen readers: Move actions). */
function ShapeForm({
  property,
  shape: savedShape,
  layout,
  onDone,
}: {
  property: Property;
  shape: DiagramShape | null;
  layout: DiagramLayout;
  onDone: () => void;
}) {
  const { services } = useSession();
  const [shape, setShape] = useState<DiagramShape | null>(savedShape);
  const [hasSpa, setHasSpa] = useState(property.has_spa);
  const [mirror, setMirror] = useState(layout.mirror === true);
  const [spaAt, setSpaAt] = useState<{ x: number; y: number } | null>(
    layout.spa ? { x: layout.spa.x, y: layout.spa.y } : null,
  );
  const [size, setSize] = useState<SpaSize>(layout.spa?.size ?? "medium");
  const [spaShape, setSpaShape] = useState<SpaShape>(layout.spa?.shape ?? "round");
  // A size or shape alone keeps the spa where it is drawn now.
  const draft = poolDiagram(shape, hasSpa, { mirror });
  const at = spaAt ?? (draft.spa ? { x: draft.spa.cx / 160, y: draft.spa.cy / 100 } : null);
  const next: DiagramLayout = {
    ...(mirror ? { mirror: true } : {}),
    ...(hasSpa && at && (spaAt || size !== "medium" || spaShape !== "round")
      ? { spa: { x: at.x, y: at.y, size, shape: spaShape } }
      : {}),
  };

  function save() {
    // The same row the website's savePoolDiagram writes.
    const saved = parseDiagramLayout(next);
    services.sync.write("property", property.id, property.company_id, {
      diagram_shape: shape || null,
      has_spa: hasSpa,
      diagram_layout: Object.keys(saved).length ? (saved as unknown as JsonValue) : null,
    });
    onDone();
  }

  const where = at
    ? `${Math.round(at.x * 100)}% from the left, ${Math.round(at.y * 100)}% from the top`
    : "";

  return (
    <View style={{ gap: space["5"] }}>
      <ShapePicker value={shape} onChange={setShape} />
      <View style={{ gap: space["2"] }}>
        <Toggle label="Mirror (flip left to right)" value={mirror} onChange={setMirror} />
        <Toggle label="Has a spa" value={hasSpa} onChange={setHasSpa} />
      </View>
      {hasSpa ? (
        <>
          <View style={{ gap: space["2"] }}>
            <View>
              <T variant="bodyMedium">Where the spa is</T>
              <T variant="secondary" muted>
                Tap the drawing to move the spa anywhere.
              </T>
            </View>
            <PoolDiagram
              shape={shape}
              hasSpa
              layout={next}
              outlined
              pins={[]}
              onPlace={(x, y) => setSpaAt({ x: round(x), y: round(y) })}
              placing={{
                label: "Where the spa is",
                hint: "Swipe up or down to choose Move Left, Right, Up, or Down.",
                value: where,
                onMove: (dx, dy) =>
                  at ? setSpaAt({ x: round(at.x + dx), y: round(at.y + dy) }) : undefined,
              }}
            />
            {spaAt ? (
              <Button
                title="Put the Spa Back in the Corner"
                kind="quiet"
                onPress={() => setSpaAt(null)}
              />
            ) : null}
          </View>
          <Segmented
            label="Spa size"
            value={size}
            onChange={setSize}
            options={SPA_SIZES.map((z) => ({ value: z.key, label: z.label }))}
          />
          <Segmented
            label="Spa shape"
            value={spaShape}
            onChange={setSpaShape}
            options={SPA_SHAPES.map((z) => ({ value: z.key, label: z.label }))}
          />
        </>
      ) : (
        <PoolDiagram shape={shape} hasSpa={false} layout={next} outlined pins={[]} />
      )}
      <Button title="Save Pool Shape" wide onPress={save} />
    </View>
  );
}
