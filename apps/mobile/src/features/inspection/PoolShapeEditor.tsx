import { useLayoutEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View, type GestureResponderEvent } from "react-native";
import Svg, { Circle, G, Path, Rect } from "react-native-svg";
import {
  CLEARED_DIAGRAM,
  DIAGRAM_SHAPES,
  DRAWING_MAX,
  LANDMARKS,
  LANDMARKS_MAX,
  centerLayout,
  clampLandmarkSize,
  clampSpaR,
  drawnPath,
  drawnShapeFrom,
  parseDiagramLayout,
  poolDiagram,
  spaSizeFor,
  type DiagramLayout,
  type DiagramShape,
  type DrawnShape,
  type Landmark,
  type LandmarkKind,
  type Property,
  type SpaShape,
  tapLandmark,
  landmarkTaps,
} from "@leakbook/core";
import type { JsonValue } from "@leakbook/sync";
import { useSession } from "../../state/session";
import { Button, Segmented, T, Toggle } from "../../ui/components";
import { confirmDestructive } from "../../ui/confirm";
import { haptics } from "../../ui/haptics";
import { DiagramShapes, LandmarkArt } from "../../ui/PoolDiagram";
import { color, face, minTap, shape as radii, space, type } from "../../ui/theme";
import { formChanged } from "../../lib/discard";
import { useUnsavedChanges } from "../../ui/ModalSheet";

// The Pool Shape sheet (owner, 2026-10-19), as the website's PoolShapeEditor
// (apps/web/src/components/pool-shape-editor.tsx): ten tiles in two rows of five (the seven
// preset shapes with Draw, Clear, and Landmarks), Mirror and Has a spa, and the drawing itself,
// where the spa is moved (drag), reshaped (tap), and resized (pinch, or its corner handle).

const W = 160;
const H = 100;
const unit = (n: number) => Math.round(Math.min(1, Math.max(0, n)) * 10_000) / 10_000;
type Tool = "line" | "circle" | "pen";
const TOOLS: { value: Tool; label: string }[] = [
  { value: "line", label: "Line" },
  { value: "circle", label: "Circle" },
  { value: "pen", label: "Freeform" },
];
type Point = { x: number; y: number };
type Spa = { x: number; y: number; r: number; shape: SpaShape };
type Press = {
  what: "spa" | "resize" | "landmark" | "landmark-resize" | "draw" | "pinch" | null;
  index?: number;
  start: Point;
  moved: boolean;
  startR?: number;
  startGap?: number;
};

/** One tile: a small drawing over its name. */
function Tile({
  label,
  on,
  onPress,
  role,
  children,
}: {
  label: string;
  on: boolean;
  onPress: () => void;
  role: "toggle" | "expand" | "button";
  children: React.ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={
        role === "toggle" ? { selected: on } : role === "expand" ? { expanded: on } : undefined
      }
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        on
          ? { backgroundColor: color.tinted, borderColor: color.link }
          : { backgroundColor: color.fill, borderColor: "transparent" },
        pressed && { opacity: 0.8 },
      ]}
    >
      <Svg width="100%" height={28} viewBox={`0 0 ${W} ${H}`}>
        {children}
      </Svg>
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.75}
        maxFontSizeMultiplier={1.4}
        style={[
          styles.tileText,
          on ? [face.semiBold, { color: color.link }] : { color: color.text },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function PoolShapeEditor({ property, onDone }: { property: Property; onDone: () => void }) {
  const { services } = useSession();
  const savedShape = (property.diagram_shape as DiagramShape | null | undefined) ?? null;
  // Opened on the centered pool, with what's placed moved along (owner, 2026-10-20), and
  // always saved centered, as the website's editor.
  const layout = centerLayout(parseDiagramLayout(property.diagram_layout));
  const [shape, setShape] = useState<DiagramShape | null>(savedShape);
  const [hasSpa, setHasSpa] = useState(property.has_spa);
  const [mirror, setMirror] = useState(layout.mirror === true);
  const [spa, setSpa] = useState<Spa | null>(
    layout.spa
      ? {
          x: layout.spa.x,
          y: layout.spa.y,
          r: poolDiagram(savedShape, true, layout).spa!.r,
          shape: layout.spa.shape ?? "round",
        }
      : null,
  );
  const [drawing, setDrawing] = useState<DrawnShape[]>(layout.drawing ?? []);
  const [landmarks, setLandmarks] = useState<Landmark[]>(layout.landmarks ?? []);
  // Unsaved entries ask before closing (owner, 2026-10-20: "Discard changes?" everywhere).
  const entries = { shape, hasSpa, mirror, spa, drawing, landmarks };
  const [startEntries] = useState(entries);
  useUnsavedChanges(formChanged(startEntries, entries));
  const [panel, setPanel] = useState<"landmarks" | "draw" | null>(null);
  const [tool, setTool] = useState<Tool>("line");
  const [placing, setPlacing] = useState<LandmarkKind | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [stroke, setStroke] = useState<Point[] | null>(null);
  const [width, setWidth] = useState(0);
  const height = (width * H) / W;

  // Where the spa is drawn now: placed, or the default corner.
  const drawnSpa = poolDiagram(shape, hasSpa, { mirror, centered: true }).spa;
  const spaNow: Spa | null = hasSpa
    ? (spa ??
      (drawnSpa ? { x: drawnSpa.cx / W, y: drawnSpa.cy / H, r: drawnSpa.r, shape: "round" } : null))
    : null;
  const next: DiagramLayout = {
    centered: true,
    ...(mirror ? { mirror: true } : {}),
    ...(hasSpa && spa
      ? { spa: { x: spa.x, y: spa.y, r: spa.r, size: spaSizeFor(spa.r), shape: spa.shape } }
      : {}),
    ...(drawing.length ? { drawing } : {}),
    ...(landmarks.length ? { landmarks } : {}),
  };
  const d = poolDiagram(shape, hasSpa, next);
  const setSpaR = (r: number) => spaNow && setSpa({ ...spaNow, r: clampSpaR(r) });
  const toggleSpaShape = () =>
    spaNow && setSpa({ ...spaNow, shape: spaNow.shape === "square" ? "round" : "square" });

  // The gesture handlers read the latest state through this ref (the responder is made once).
  const live = useRef({ spaNow, d, landmarks, drawing, panel, placing, tool, selected });
  const view = useRef<View>(null);
  const origin = useRef({ x: 0, y: 0 });
  const box = useRef({ w: 0, h: 0 });
  useLayoutEffect(() => {
    live.current = { spaNow, d, landmarks, drawing, panel, placing, tool, selected };
    box.current = { w: width, h: height };
  });
  const press = useRef<Press>({ what: null, start: { x: 0, y: 0 }, moved: false });
  const strokeRef = useRef<Point[] | null>(null);

  const at = (pageX: number, pageY: number): Point => ({
    x: unit((pageX - origin.current.x) / (box.current.w || 1)),
    y: unit((pageY - origin.current.y) / (box.current.h || 1)),
  });

  // The selected landmark: an X at its top right deletes it (owner, 2026-10-19), and the
  // handle at its bottom right resizes it, as the spa's does.
  const picked = selected !== null ? d.landmarks[selected] : undefined;
  const setLandmarkSize = (index: number, size: number) =>
    setLandmarks((all) =>
      all.map((l, i) => (i === index ? { ...l, s: clampLandmarkSize(size) } : l)),
    );
  const flipLandmark = (index: number) =>
    setLandmarks((all) => all.map((l, i) => (i === index ? tapLandmark(l) : l)));
  const removeLandmark = (index: number) => {
    setLandmarks((all) => all.filter((_, i) => i !== index));
    setSelected(null);
  };

  const gap = (e: GestureResponderEvent) => {
    const [a, b] = e.nativeEvent.touches;
    return a && b ? Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY) : 0;
  };
  function down(p: Point) {
    const { spaNow: s, d: dd, landmarks: lm, panel: pn, placing: pl, selected: sel } = live.current;
    if (pn === "draw") {
      press.current = { what: "draw", start: p, moved: false };
      strokeRef.current = [p];
      setStroke([p]);
      return;
    }
    if (pl) {
      if (lm.length < LANDMARKS_MAX) setLandmarks([...lm, { kind: pl, ...p }]);
      setPlacing(null);
      haptics.selection();
      press.current = { what: null, start: p, moved: false };
      return;
    }
    const pk = sel !== null ? dd.landmarks[sel] : undefined;
    const near = (x: number, y: number) => Math.hypot(p.x * W - x, p.y * H - y) <= 6;
    if (sel !== null && pk && near(pk.cx + pk.size / 2, pk.cy - pk.size / 2)) {
      removeLandmark(sel);
      haptics.selection();
      press.current = { what: null, start: p, moved: false };
      return;
    }
    if (sel !== null && pk && near(pk.cx + pk.size / 2, pk.cy + pk.size / 2)) {
      press.current = { what: "landmark-resize", index: sel, start: p, moved: false };
      return;
    }
    const onHandle =
      !!s && Math.hypot((p.x - s.x) * W - s.r * 0.71, (p.y - s.y) * H - s.r * 0.71) <= 6;
    const onSpa = !!s && Math.hypot((p.x - s.x) * W, (p.y - s.y) * H) <= s.r + 2;
    if (onHandle) press.current = { what: "resize", start: p, moved: false, startR: s!.r };
    else if (onSpa) press.current = { what: "spa", start: p, moved: false };
    else {
      // The top one under the finger (the last drawn).
      let i = -1;
      dd.landmarks.forEach((l, k) => {
        if (
          Math.abs(p.x * W - l.cx) <= l.size / 2 + 2 &&
          Math.abs(p.y * H - l.cy) <= l.size / 2 + 2
        )
          i = k;
      });
      press.current =
        i >= 0
          ? { what: "landmark", index: i, start: p, moved: false }
          : { what: null, start: p, moved: false };
      if (i < 0) setSelected(null);
    }
  }
  const handlers = {
    onStartShouldSetResponder: () => true,
    onStartShouldSetResponderCapture: () => true,
    onMoveShouldSetResponder: () => true,
    onMoveShouldSetResponderCapture: () => true,
    onResponderTerminationRequest: () => false,
    onResponderGrant: (e: GestureResponderEvent) => {
      const { pageX, pageY, locationX, locationY } = e.nativeEvent;
      // Where the drawing is now (the sheet may have scrolled): from the press itself, or
      // measured when the press has no position in the view.
      if (Number.isFinite(locationX) && Number.isFinite(locationY)) {
        origin.current = { x: pageX - locationX, y: pageY - locationY };
        down(at(pageX, pageY));
      } else
        view.current?.measure((_x, _y, _w, _h, left, top) => {
          origin.current = { x: left, y: top };
          down(at(pageX, pageY));
        });
    },
    onResponderMove: (e: GestureResponderEvent) => {
      const now = press.current;
      const { spaNow: s, landmarks: lm, panel: pn, d: dd, selected: sel } = live.current;
      const pk = sel !== null ? dd.landmarks[sel] : undefined;
      if (e.nativeEvent.touches.length === 2 && (pk || s) && pn !== "draw") {
        // A pinch resizes the selected landmark, otherwise the spa (owner, 2026-10-19).
        if (now.what !== "pinch")
          press.current = {
            what: "pinch",
            start: now.start,
            moved: true,
            startR: pk ? pk.size : s!.r,
            startGap: gap(e),
          };
        else if (now.startGap) {
          const scaled = now.startR! * (gap(e) / now.startGap);
          if (pk && sel !== null) setLandmarkSize(sel, scaled);
          else if (s) setSpa({ ...s, r: clampSpaR(scaled) });
        }
        return;
      }
      const p = at(e.nativeEvent.pageX, e.nativeEvent.pageY);
      if (!now.moved && Math.hypot((p.x - now.start.x) * W, (p.y - now.start.y) * H) > 2)
        now.moved = true;
      if (now.what === "draw") {
        strokeRef.current = [...(strokeRef.current ?? []), p];
        setStroke(strokeRef.current);
      } else if (now.what === "spa" && now.moved && s) setSpa({ ...s, x: p.x, y: p.y });
      else if (now.what === "resize" && s)
        setSpa({ ...s, r: clampSpaR(Math.hypot((p.x - s.x) * W, (p.y - s.y) * H)) });
      else if (now.what === "landmark-resize" && pk && now.index !== undefined)
        setLandmarkSize(
          now.index,
          2 * Math.max(Math.abs(p.x * W - pk.cx), Math.abs(p.y * H - pk.cy)),
        );
      else if (now.what === "landmark" && now.moved && now.index !== undefined)
        setLandmarks(lm.map((l, i) => (i === now.index ? { ...l, x: p.x, y: p.y } : l)));
    },
    onResponderRelease: (e: GestureResponderEvent) => {
      const now = press.current;
      const { spaNow: s, drawing: dr, tool: tl, selected: sel } = live.current;
      if (now.what === "draw" && strokeRef.current) {
        const made = drawnShapeFrom(tl, [
          ...strokeRef.current,
          at(e.nativeEvent.pageX, e.nativeEvent.pageY),
        ]);
        if (made && dr.length < DRAWING_MAX) setDrawing([...dr, made]);
        strokeRef.current = null;
        setStroke(null);
      } else if (now.what === "spa" && !now.moved && s)
        // Tapping the spa switches it round and square (owner, 2026-10-19).
        setSpa({ ...s, shape: s.shape === "square" ? "round" : "square" });
      else if (now.what === "landmark" && !now.moved && now.index !== undefined) {
        // A tap selects a landmark; a tap on the selected one mirrors it (owner, 2026-10-19).
        if (now.index === sel) flipLandmark(now.index);
        else setSelected(now.index);
      }
      press.current = { what: null, start: { x: 0, y: 0 }, moved: false };
    },
    onResponderTerminate: () => {
      strokeRef.current = null;
      setStroke(null);
      press.current = { what: null, start: { x: 0, y: 0 }, moved: false };
    },
  };

  function clearAll() {
    confirmDestructive({
      title: "Clear the pool diagram?",
      message: "The shape, spa, drawing, and landmarks are removed. Pins and markup stay.",
      confirm: "Clear Diagram",
      onConfirm: () => {
        setShape(CLEARED_DIAGRAM.shape);
        setHasSpa(CLEARED_DIAGRAM.hasSpa);
        setMirror(false);
        setSpa(null);
        setDrawing([]);
        setLandmarks([]);
        setSelected(null);
        setPanel("draw");
      },
    });
  }

  function save() {
    // The same row the website's savePoolDiagram writes.
    const saved = parseDiagramLayout(next);
    services.sync.write("property", property.id, property.company_id, {
      diagram_shape: shape || null,
      has_spa: hasSpa,
      diagram_layout: Object.keys(saved).length ? (saved as unknown as JsonValue) : null,
    });
    haptics.success();
    onDone();
  }

  const preview = stroke ? drawnShapeFrom(tool, stroke) : null;
  const spaLabel = spaNow
    ? `Spa, ${spaNow.shape === "square" ? "square" : "round"}, size ${Math.round(spaNow.r)}`
    : null;
  const move = (dx: number, dy: number) =>
    spaNow && setSpa({ ...spaNow, x: unit(spaNow.x + dx), y: unit(spaNow.y + dy) });
  const pickedLabel = picked ? LANDMARKS.find((l) => l.key === picked.kind)!.label : null;
  const landmarkActions =
    picked && pickedLabel
      ? [
          { name: "landmarkLarger", label: `Make the ${pickedLabel} Larger` },
          { name: "landmarkSmaller", label: `Make the ${pickedLabel} Smaller` },
          {
            name: "landmarkFlip",
            label:
              picked && landmarkTaps(picked.kind) === "turn"
                ? `Turn the ${pickedLabel}`
                : `Flip the ${pickedLabel}`,
          },
          { name: "landmarkDelete", label: `Delete the ${pickedLabel}` },
        ]
      : [];
  const actions = spaNow
    ? [
        { name: "moveLeft", label: "Move Spa Left" },
        { name: "moveRight", label: "Move Spa Right" },
        { name: "moveUp", label: "Move Spa Up" },
        { name: "moveDown", label: "Move Spa Down" },
        { name: "larger", label: "Larger" },
        { name: "smaller", label: "Smaller" },
        {
          name: "spaShape",
          label: spaNow.shape === "square" ? "Make the Spa Round" : "Make the Spa Square",
        },
      ]
    : [];

  const rows = [
    DIAGRAM_SHAPES.slice(0, 5).map((s) => ({ kind: "shape" as const, s })),
    // Row 2 (owner, 2026-10-19): the creative tiles between Grecian and Figure 8.
    [
      ...DIAGRAM_SHAPES.slice(5, -1).map((s) => ({ kind: "shape" as const, s })),
      { kind: "draw" as const },
      { kind: "clear" as const },
      { kind: "landmarks" as const },
      ...DIAGRAM_SHAPES.slice(-1).map((s) => ({ kind: "shape" as const, s })),
    ],
  ];

  return (
    <View style={{ gap: space["5"] }}>
      <View style={{ gap: space["1"] }}>
        <T variant="bodyMedium">Pool shape</T>
        <View accessibilityLabel="Pool shape" style={{ gap: 6 }}>
          {rows.map((row, ri) => (
            <View key={ri} style={styles.tileRow}>
              {row.map((t) =>
                t.kind === "shape" ? (
                  <Tile
                    key={t.s.key}
                    label={t.s.label}
                    role="toggle"
                    on={shape === t.s.key}
                    onPress={() => setShape(shape === t.s.key ? null : t.s.key)}
                  >
                    <Path
                      d={poolDiagram(t.s.key, false, { centered: true }).pool}
                      fill={color.diagramWater}
                      stroke={color.water}
                      strokeWidth={5}
                    />
                  </Tile>
                ) : t.kind === "landmarks" ? (
                  <Tile
                    key="landmarks"
                    label="Landmarks"
                    role="expand"
                    on={panel === "landmarks"}
                    onPress={() => {
                      setPanel(panel === "landmarks" ? null : "landmarks");
                      setPlacing(null);
                    }}
                  >
                    <LandmarkArt parts={LANDMARKS[0]!.parts} transform="translate(56 2) scale(2)" />
                  </Tile>
                ) : t.kind === "draw" ? (
                  <Tile
                    key="draw"
                    label="Draw"
                    role="toggle"
                    on={panel === "draw"}
                    onPress={() => setPanel(panel === "draw" ? null : "draw")}
                  >
                    <Path
                      d="M30 80 C50 20 80 90 100 40 S130 20 135 30"
                      fill="none"
                      stroke={panel === "draw" ? color.link : color.text}
                      strokeWidth={6}
                      strokeLinecap="round"
                    />
                  </Tile>
                ) : (
                  <Tile key="clear" label="Clear" role="button" on={false} onPress={clearAll}>
                    <Path
                      d="M58 22 L102 78 M102 22 L58 78"
                      fill="none"
                      stroke={color.text}
                      strokeWidth={6}
                      strokeLinecap="round"
                    />
                  </Tile>
                ),
              )}
            </View>
          ))}
        </View>
      </View>

      {panel === "landmarks" ? (
        <View style={{ gap: space["2"] }}>
          <View accessibilityLabel="Landmarks" style={styles.chips}>
            {LANDMARKS.map((l) => {
              const on = placing === l.key;
              return (
                <Pressable
                  key={l.key}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  onPress={() => setPlacing(on ? null : l.key)}
                  style={({ pressed }) => [
                    styles.chip,
                    on
                      ? { backgroundColor: color.tinted, borderColor: color.link }
                      : { backgroundColor: color.fill, borderColor: "transparent" },
                    pressed && { opacity: 0.8 },
                  ]}
                >
                  <Svg width={24} height={24} viewBox="0 0 24 24">
                    <LandmarkArt parts={l.parts} />
                  </Svg>
                  <Text
                    style={[
                      type.secondary,
                      face.medium,
                      { color: on ? color.link : color.text },
                      on && face.semiBold,
                    ]}
                    maxFontSizeMultiplier={1.6}
                  >
                    {l.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {/* Only while placing one; nothing under the picker otherwise (owner, 2026-10-26). */}
          {placing ? (
            <T variant="secondary" muted>
              {`Tap the drawing to put the ${LANDMARKS.find((l) => l.key === placing)!.label.toLowerCase()} there.`}
            </T>
          ) : null}
        </View>
      ) : null}

      {panel === "draw" ? (
        <View style={{ gap: space["2"] }}>
          <View style={styles.drawRow}>
            <View style={{ flexShrink: 1 }}>
              <Segmented
                label="Draw"
                value={tool}
                onChange={setTool}
                options={TOOLS}
                fill={false}
              />
            </View>
            <Button
              title="Undo"
              kind="secondary"
              disabled={drawing.length === 0}
              onPress={() => setDrawing(drawing.slice(0, -1))}
              style={{ alignSelf: "flex-end" }}
            />
          </View>
          <T variant="secondary" muted>
            Drag on the drawing. Draw on a shape, or Clear and start from nothing.
          </T>
        </View>
      ) : null}

      <View style={{ gap: space["2"] }}>
        <Toggle label="Mirror (flip left to right)" value={mirror} onChange={setMirror} />
        <Toggle label="Has a spa" value={hasSpa} onChange={setHasSpa} />
      </View>

      <View style={{ gap: space["2"] }}>
        <View
          ref={view}
          onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
          style={[
            styles.drawing,
            { backgroundColor: color.surface, borderColor: color.controlBorder },
            width > 0 && { height },
          ]}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={[
            "Pool drawing",
            spaLabel,
            landmarks.length ? `${landmarks.length} landmarks` : null,
            drawing.length ? `${drawing.length} drawn` : null,
          ]
            .filter(Boolean)
            .join(", ")}
          accessibilityActions={[
            { name: "increment", label: "Larger" },
            { name: "decrement", label: "Smaller" },
            ...landmarkActions,
            ...actions,
          ]}
          onAccessibilityAction={(e) => {
            const name = e.nativeEvent.actionName;
            if (name === "moveLeft") move(-0.02, 0);
            else if (name === "moveRight") move(0.02, 0);
            else if (name === "moveUp") move(0, -0.02);
            else if (name === "moveDown") move(0, 0.02);
            else if ((name === "larger" || name === "increment") && spaNow) setSpaR(spaNow.r + 2);
            else if ((name === "smaller" || name === "decrement") && spaNow) setSpaR(spaNow.r - 2);
            else if (name === "spaShape") toggleSpaShape();
            else if (selected !== null && picked) {
              if (name === "landmarkLarger") setLandmarkSize(selected, picked.size + 2);
              else if (name === "landmarkSmaller") setLandmarkSize(selected, picked.size - 2);
              else if (name === "landmarkFlip") flipLandmark(selected);
              else if (name === "landmarkDelete") removeLandmark(selected);
            }
          }}
          {...handlers}
        >
          {width > 0 ? (
            <Svg width={width} height={height} viewBox={`0 0 ${W} ${H}`} pointerEvents="none">
              <DiagramShapes d={d} />
              {preview ? (
                <Path
                  d={drawnPath(preview)}
                  fill="none"
                  stroke={color.water}
                  strokeWidth={2}
                  strokeDasharray="4 3"
                  strokeLinecap="round"
                />
              ) : null}
              {picked ? (
                <G>
                  <Rect
                    x={picked.cx - picked.size / 2 - 1.5}
                    y={picked.cy - picked.size / 2 - 1.5}
                    width={picked.size + 3}
                    height={picked.size + 3}
                    rx={3}
                    fill="none"
                    stroke={color.link}
                    strokeWidth={1.2}
                    strokeDasharray="3 2"
                  />
                  {/* Delete: an X in the top-right corner. */}
                  <Circle
                    cx={picked.cx + picked.size / 2}
                    cy={picked.cy - picked.size / 2}
                    r={4.5}
                    fill={color.fail}
                  />
                  <Path
                    d={`M${picked.cx + picked.size / 2 - 1.8} ${picked.cy - picked.size / 2 - 1.8} l3.6 3.6 m0 -3.6 l-3.6 3.6`}
                    stroke={color.paper}
                    strokeWidth={1.3}
                    strokeLinecap="round"
                  />
                  {/* Resize: the same handle as the spa's. */}
                  <Circle
                    cx={picked.cx + picked.size / 2}
                    cy={picked.cy + picked.size / 2}
                    r={3.2}
                    fill={color.surface}
                    stroke={color.link}
                    strokeWidth={1.5}
                  />
                </G>
              ) : null}
              {d.spa && panel !== "draw" ? (
                // The spa's resize handle, at its lower right.
                <Circle
                  cx={d.spa.cx + d.spa.r * 0.71}
                  cy={d.spa.cy + d.spa.r * 0.71}
                  r={3.2}
                  fill={color.surface}
                  stroke={color.link}
                  strokeWidth={1.5}
                />
              ) : null}
            </Svg>
          ) : null}
        </View>
        {/* Only the one action nothing shows: tapping the spa turns it (owner, 2026-10-26). */}
        {hasSpa ? (
          <T variant="secondary" muted>
            Tap the spa to make it round or square.
          </T>
        ) : null}
      </View>

      <Button title="Save Pool Shape" wide onPress={save} />
    </View>
  );
}

const styles = StyleSheet.create({
  tileRow: { flexDirection: "row", gap: 6 },
  tile: {
    flex: 1,
    minHeight: minTap,
    alignItems: "center",
    gap: space["1"],
    paddingTop: 6,
    paddingBottom: space["1"],
    paddingHorizontal: 1,
    borderRadius: radii.block,
    borderWidth: 2,
  },
  tileText: { ...face.medium, fontSize: 12, lineHeight: 15, letterSpacing: -0.2 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: {
    minHeight: minTap,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: space["3"],
    borderRadius: radii.pill,
    borderWidth: 2,
  },
  drawRow: { flexDirection: "row", alignItems: "flex-end", gap: space["3"] },
  // userSelect: a drag in the browser build doesn't select the spa's label.
  drawing: {
    width: "100%",
    borderWidth: 1,
    borderRadius: 12,
    overflow: "hidden",
    userSelect: "none",
  },
});
