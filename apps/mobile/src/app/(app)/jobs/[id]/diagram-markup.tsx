import { Stack, router, useLocalSearchParams } from "expo-router";
import { View } from "react-native";
import Svg, { Circle, Path, Rect, Text as SvgText } from "react-native-svg";
import {
  parseDiagramLayout,
  parseMarkup,
  poolDiagram,
  type DiagramShape,
  type Job,
  type Markup,
  type MarkupShape,
  type Property,
} from "@leakbook/core";
import type { JsonValue } from "@leakbook/sync";
import { useRow } from "../../../../data/hooks";
import { useInspectionConfig, useJobInspection } from "../../../../data/inspection";
import { MarkupEditor } from "../../../../features/media/MarkupEditor";
import { useSession } from "../../../../state/session";
import { Notice, Screen } from "../../../../ui/components";
import { haptics } from "../../../../ui/haptics";
import { DIAGRAM_MARKUP_SPACE } from "../../../../ui/MarkupLayer";
import { color, font } from "../../../../ui/theme";

/**
 * Mark Up Diagram (owner, 2026-10-19: "Add markup tools to the pool diagrams"): the photo
 * markup tools over the job's pool diagram and its pins. Saves job.diagram_markup (the same
 * format as a photo's markup, fractions of the diagram) through sync, as the website does.
 */
export default function DiagramMarkupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { services } = useSession();
  const job = useRow<Job>("job", id);
  const property = useRow<Property>("property", job?.property_id);
  const config = useInspectionConfig(job?.company_id ?? "");
  const insp = useJobInspection(job?.company_id ?? "", id);
  const hidden = <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />;

  if (!job || !property) {
    return (
      <Screen title="Mark Up Diagram">
        <Notice tone="warning">This job’s pool isn’t on this phone.</Notice>
      </Screen>
    );
  }
  const d = poolDiagram(
    property.diagram_shape as DiagramShape | null,
    property.has_spa,
    parseDiagramLayout(property.diagram_layout),
  );
  const pins = [...insp.findings]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((f, i) => ({ f, n: i + 1 }))
    .filter(({ f }) => f.pin_x != null && f.pin_y != null);

  function save(shapes: MarkupShape[]) {
    const markup: Markup | null = shapes.length > 0 ? { version: 1, shapes } : null;
    services.sync.write("job", job!.id, job!.company_id, {
      diagram_markup: markup as unknown as JsonValue,
    });
    haptics.success();
    router.back();
  }

  return (
    <>
      {hidden}
      <MarkupEditor
        title="Mark Up Diagram"
        noun="diagram"
        ratio={d.height / d.width}
        space={DIAGRAM_MARKUP_SPACE}
        saved={parseMarkup(job.diagram_markup).shapes}
        onCancel={() => router.back()}
        onSave={save}
        background={(w, h) => (
          <View style={{ width: w, height: h, backgroundColor: color.surface, borderRadius: 4 }}>
            <Svg width={w} height={h} viewBox={`0 0 ${d.width} ${d.height}`}>
              <Path d={d.pool} fill={color.diagramWater} stroke={color.water} strokeWidth={2} />
              {d.spa ? (
                d.spa.square ? (
                  <Rect
                    x={d.spa.cx - d.spa.r}
                    y={d.spa.cy - d.spa.r}
                    width={d.spa.r * 2}
                    height={d.spa.r * 2}
                    rx={4}
                    fill={color.diagramWater}
                    stroke={color.water}
                    strokeWidth={2}
                  />
                ) : (
                  <Circle
                    cx={d.spa.cx}
                    cy={d.spa.cy}
                    r={d.spa.r}
                    fill={color.diagramWater}
                    stroke={color.water}
                    strokeWidth={2}
                  />
                )
              ) : null}
              {d.spa ? (
                <SvgText
                  x={d.spa.cx}
                  y={d.spa.cy + 3}
                  fontSize={7}
                  fill={color.water}
                  textAnchor="middle"
                  fontFamily={font.displayBold}
                >
                  SPA
                </SvgText>
              ) : null}
              {pins.map(({ f }) => (
                <Circle
                  key={f.id}
                  cx={Number(f.pin_x) * d.width}
                  cy={Number(f.pin_y) * d.height}
                  r={6}
                  fill={config.severityByKey.get(f.severity_key)?.color ?? color.fail}
                />
              ))}
              {pins.map(({ f, n }) => (
                <SvgText
                  key={`${f.id}-n`}
                  x={Number(f.pin_x) * d.width}
                  y={Number(f.pin_y) * d.height + 2.6}
                  fontSize={7}
                  fill={color.paper}
                  textAnchor="middle"
                  fontFamily={font.displayBold}
                >
                  {n}
                </SvgText>
              ))}
            </Svg>
          </View>
        )}
      />
    </>
  );
}
