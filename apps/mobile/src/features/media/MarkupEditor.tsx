import { useRef, useState, type ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  MARKUP_COLORS,
  MARKUP_TEXT_SIZE_MAX,
  MARKUP_TEXT_SIZE_MIN,
  moveText,
  penShape,
  resizeText,
  shapeAtTap,
  shapeFromDrag,
  textShape,
  type MarkupColor,
  type MarkupShape,
} from "@leakbook/core";
import { Button, Field, Segmented, T } from "../../ui/components";
import { confirmDestructive } from "../../ui/confirm";
import { MarkupLayer } from "../../ui/MarkupLayer";
import { Slider } from "../../ui/Slider";
import { useSheetLock } from "../../ui/sheet";
import { color, face, markupColor, minTap, space, type } from "../../ui/theme";

type Tool = "pen" | "arrow" | "circle" | "text";

const COLOR_NAMES: Record<MarkupColor, string> = { red: "Red", yellow: "Yellow", white: "White" };

/**
 * Mark Up (spec 6.5), full screen: Cancel, the title and Save in the bar; the picture on navy;
 * under it the tool (Pen first, owner 2026-10-19), the label for text, the color, Undo and
 * Clear All, and the caption. Used for photos and for the job's pool diagram (owner,
 * 2026-10-19: "Add markup tools to the pool diagrams"), as the website's MarkupEditor. Shapes
 * are fractions of the picture. Without `caption` there is no caption field (diagrams).
 */
export function MarkupEditor({
  ratio,
  background,
  saved,
  caption: savedCaption,
  title = "Mark Up",
  noun = "photo",
  space: markupSpace,
  onCancel,
  onSave,
}: {
  /** Height over width of the picture. */
  ratio: number;
  /** The picture, drawn at the canvas size. */
  background: (width: number, height: number) => ReactNode;
  saved: MarkupShape[];
  caption?: string;
  title?: string;
  /** What the picture is called in the hints: "photo" or "diagram". */
  noun?: string;
  /** Draw the markup in this pixel space (the diagram's 800 x 500), as wherever it is shown. */
  space?: { width: number; height: number };
  onCancel: () => void;
  onSave: (shapes: MarkupShape[], caption: string) => void;
}) {
  const insets = useSafeAreaInsets();
  // Drawing drags on the photo; inside a sheet they must not pull the sheet down.
  useSheetLock(true);
  // Every change is a new entry, so Undo also brings back a Clear All.
  const [history, setHistory] = useState<MarkupShape[][]>([saved]);
  const draft = history[history.length - 1]!;
  const push = (next: MarkupShape[]) => setHistory((h) => [...h, next]);
  const [caption, setCaption] = useState(savedCaption ?? "");
  const dirty = history.length > 1 || caption !== (savedCaption ?? "");
  const [saving, setSaving] = useState(false);

  // Pen first and on by default (owner, 2026-10-19), as on the website.
  const [tool, setTool] = useState<Tool>("pen");
  const [ink, setInk] = useState<MarkupColor>("red");
  const [label, setLabel] = useState("");
  const [labelError, setLabelError] = useState<string | undefined>();

  const [area, setArea] = useState({ width: 0, height: 0 });
  const width = Math.min(area.width, area.height / ratio);
  const height = width * ratio;
  const [live, setLive] = useState<MarkupShape | null>(null);

  // Text can be moved and resized after it's placed (owner, 2026-10-20: "you should be able to
  // adjust text location and size"), as on the website: with the Text tool a tap on a label
  // selects it, a drag moves it, two fingers pinch it, and Size changes it.
  const [picked, setPicked] = useState<number | null>(null);
  const selected = picked !== null && draft[picked]?.type === "text" ? picked : null;
  // The label being dragged or pinched (its index), drawn from `live` meanwhile.
  const [dragging, setDragging] = useState<number | null>(null);
  // The same for the touch handlers, which can run before the next render.
  const held = useRef<number | null>(null);
  const hold = (i: number | null) => {
    held.current = i;
    setDragging(i);
  };
  const pinch = useRef<{ distance: number; size: number } | null>(null);
  const resizing = useRef<number | null>(null);
  // On-screen pixels per unit of text size (MarkupLayer's 24 at 400 wide, in its space).
  const spaceWidth = markupSpace?.width ?? width;
  const textPx = (t: MarkupShape) =>
    t.type === "text"
      ? Math.max(10, 24 * (spaceWidth / 400)) * (t.s ?? 1) * (width / (spaceWidth || 1))
      : 0;
  /** The label under a point (fractions of the picture), topmost first. */
  function textAt(p: { x: number; y: number }): number | null {
    for (let i = draft.length - 1; i >= 0; i--) {
      const t = draft[i]!;
      if (t.type !== "text") continue;
      const px = textPx(t);
      const halfW = Math.max(22, (t.text.length * px * 0.62) / 2);
      const halfH = Math.max(22, px * 0.75);
      const dx = (p.x - t.x) * width;
      // Text sits on its baseline: most of it is above y.
      const dy = (p.y - t.y) * height + px * 0.35;
      if (Math.abs(dx) <= halfW && Math.abs(dy) <= halfH) return i;
    }
    return null;
  }

  const start = useRef({ x: 0, y: 0, pageX: 0, pageY: 0 });
  // The pen's points so far, as fractions of the photo.
  const stroke = useRef<{ x: number; y: number }[]>([]);
  const frac = (x: number, y: number) => ({ x: x / width, y: y / height });
  const startPoint = () => frac(start.current.x, start.current.y);
  const endPoint = (e: GestureResponderEvent) =>
    frac(
      start.current.x + e.nativeEvent.pageX - start.current.pageX,
      start.current.y + e.nativeEvent.pageY - start.current.pageY,
    );

  function release(e: GestureResponderEvent) {
    setLive(null);
    if (tool === "pen") {
      const s = penShape(ink, [...stroke.current, endPoint(e)]);
      stroke.current = [];
      if (s) push([...draft, s]);
      return;
    }
    if (tool === "text") {
      const i = held.current;
      const moved = live;
      hold(null);
      pinch.current = null;
      if (i !== null) {
        // A drag or pinch of a label: its new place or size. A plain tap just selects it.
        if (moved) push(draft.map((x, n) => (n === i ? moved : x)));
        return;
      }
      const s = textShape(ink, startPoint(), label);
      if (s) {
        push([...draft, s]);
        setPicked(draft.length);
        setLabelError(undefined);
      } else setLabelError(`Type a label first, then tap the ${noun}. Tap a label to move it.`);
      return;
    }
    // A drag draws to size; a tap places a default-sized shape.
    const s =
      shapeFromDrag(tool, ink, startPoint(), endPoint(e)) ??
      shapeAtTap(tool, ink, startPoint(), 1 / ratio);
    push([...draft, s]);
  }

  function cancel() {
    if (!dirty) return onCancel();
    confirmDestructive({
      title: "Discard changes?",
      confirm: "Discard Changes",
      cancel: "Keep Editing",
      onConfirm: onCancel,
    });
  }

  return (
    <KeyboardAvoidingView
      style={[styles.editor, { backgroundColor: color.bg }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={{ paddingTop: insets.top, backgroundColor: color.bg }}>
        <View
          style={[
            styles.bar,
            { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.separator },
          ]}
        >
          <View style={styles.barSide}>
            <Pressable
              accessibilityRole="button"
              onPress={cancel}
              style={({ pressed }) => [styles.barButton, pressed && { opacity: 0.5 }]}
            >
              <Text style={[type.body, { color: color.link }]} maxFontSizeMultiplier={1.6}>
                Cancel
              </Text>
            </Pressable>
          </View>
          <Text
            style={[type.navTitle, styles.barTitle, { color: color.text }]}
            accessibilityRole="header"
            maxFontSizeMultiplier={1.6}
          >
            {title}
          </Text>
          <View style={[styles.barSide, { alignItems: "flex-end" }]}>
            <Pressable
              accessibilityRole="button"
              disabled={saving}
              onPress={() => {
                setSaving(true);
                onSave(draft, caption);
              }}
              style={({ pressed }) => [styles.barButton, pressed && { opacity: 0.5 }]}
            >
              <Text
                style={[type.body, face.semiBold, { color: color.link }]}
                maxFontSizeMultiplier={1.6}
              >
                {saving ? "Saving…" : "Save"}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
      <View
        style={[styles.canvasArea, { backgroundColor: color.navy }]}
        onLayout={(e) =>
          setArea({
            width: e.nativeEvent.layout.width - space["4"],
            height: e.nativeEvent.layout.height - space["4"],
          })
        }
      >
        {width > 0 ? (
          <View
            style={{ width, height }}
            onStartShouldSetResponder={() => true}
            onMoveShouldSetResponder={() => true}
            onResponderTerminationRequest={() => false}
            onResponderGrant={(e) => {
              const n = e.nativeEvent;
              start.current = { x: n.locationX, y: n.locationY, pageX: n.pageX, pageY: n.pageY };
              stroke.current = [startPoint()];
              if (tool === "text") {
                const hit = textAt(startPoint());
                hold(hit);
                if (hit !== null) setPicked(hit);
              }
            }}
            onResponderMove={(e) => {
              if (tool === "text") {
                const touches = e.nativeEvent.touches;
                const i = held.current ?? selected;
                const t = i !== null ? draft[i] : undefined;
                if (!t || t.type !== "text" || i === null) return;
                if (touches.length >= 2) {
                  // Two fingers: resize the selected label by how far they spread.
                  const d = Math.hypot(
                    touches[0]!.pageX - touches[1]!.pageX,
                    touches[0]!.pageY - touches[1]!.pageY,
                  );
                  if (!pinch.current) pinch.current = { distance: d || 1, size: t.s ?? 1 };
                  if (held.current === null) hold(i);
                  return setLive(resizeText(t, (pinch.current.size * d) / pinch.current.distance));
                }
                if (held.current === null || pinch.current) return;
                // Follow the finger from where it took hold of the label.
                const p = endPoint(e);
                const from = startPoint();
                return setLive(moveText(t, { x: t.x + p.x - from.x, y: t.y + p.y - from.y }));
              }
              if (tool === "pen") {
                stroke.current.push(endPoint(e));
                return setLive(penShape(ink, stroke.current));
              }
              setLive(shapeFromDrag(tool, ink, startPoint(), endPoint(e)));
            }}
            onResponderRelease={release}
            onResponderTerminate={() => {
              stroke.current = [];
              setLive(null);
              hold(null);
              pinch.current = null;
            }}
            accessibilityLabel={`${noun === "photo" ? "Photo" : "Pool diagram"}. ${tool === "pen" ? "Drag to draw." : "Tap to place, or drag to draw."}`}
          >
            {background(width, height)}
            {/* Never the touch target, so touches are measured on the canvas itself. */}
            <View pointerEvents="none" style={StyleSheet.absoluteFill}>
              <MarkupLayer
                shapes={
                  live && dragging !== null
                    ? draft.map((x, n) => (n === dragging ? live : x))
                    : live
                      ? [...draft, live]
                      : draft
                }
                width={width}
                height={height}
                scale={width / 400}
                space={markupSpace}
              />
              {tool === "text" && selected !== null && !live ? (
                <SelectedBox
                  shape={draft[selected]!}
                  px={textPx(draft[selected]!)}
                  width={width}
                  height={height}
                />
              ) : null}
            </View>
          </View>
        ) : null}
      </View>

      <ScrollView
        style={styles.tools}
        contentContainerStyle={[
          styles.toolsContent,
          { paddingBottom: Math.max(insets.bottom, space["4"]) },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Segmented
          label="Tool"
          fill={false}
          options={[
            { value: "pen", label: "Pen" },
            { value: "arrow", label: "Arrow" },
            { value: "circle", label: "Circle" },
            { value: "text", label: "Text" },
          ]}
          value={tool}
          onChange={setTool}
        />
        {tool === "text" ? (
          <Field
            label="Label"
            value={label}
            onChangeText={(v) => {
              setLabel(v);
              if (v.trim()) setLabelError(undefined);
            }}
            placeholder="Crack"
            maxLength={80}
            error={labelError}
            hint={`Then tap the ${noun} where it goes. Tap a label to select it; drag it to move it.`}
          />
        ) : (
          <T muted>
            {tool === "pen"
              ? "Drag to draw freehand."
              : `Tap to place ${tool === "arrow" ? "an arrow" : "a circle"}, or drag to draw one.`}
          </T>
        )}
        {tool === "text" && selected !== null && draft[selected]?.type === "text" ? (
          <View style={styles.sizeRow}>
            <T variant="bodyMedium">Size</T>
            <Slider
              label="Label size"
              min={MARKUP_TEXT_SIZE_MIN}
              max={MARKUP_TEXT_SIZE_MAX}
              step={0.1}
              value={(draft[selected] as { s?: number }).s ?? 1}
              valueText={`${Math.round(((draft[selected] as { s?: number }).s ?? 1) * 100)}%`}
              onChange={(v) => {
                const next = resizeText(draft[selected]!, v);
                // One Undo step per size change: replace the last step while the slider moves.
                setHistory((h) => {
                  const updated = h[h.length - 1]!.map((x, n) => (n === selected ? next : x));
                  return resizing.current === selected
                    ? [...h.slice(0, -1), updated]
                    : [...h, updated];
                });
                resizing.current = selected;
              }}
              onEnd={() => {
                resizing.current = null;
              }}
            />
            <Button
              title="Delete Label"
              kind="quiet"
              onPress={() => {
                push(draft.filter((_, n) => n !== selected));
                setPicked(null);
              }}
            />
          </View>
        ) : null}
        <View style={styles.colorRow}>
          <View style={styles.colors} accessibilityRole="radiogroup" accessibilityLabel="Color">
            {MARKUP_COLORS.map((c) => (
              <Pressable
                key={c}
                accessibilityRole="radio"
                accessibilityLabel={COLOR_NAMES[c]}
                accessibilityState={{ checked: ink === c }}
                onPress={() => setInk(c)}
                style={styles.swatchHit}
              >
                <View
                  style={[
                    styles.swatch,
                    { backgroundColor: markupColor[c], borderColor: color.controlBorder },
                    ink === c && {
                      borderColor: color.text,
                      boxShadow: `0px 0px 0px 2px ${color.bg}, 0px 0px 0px 4px ${color.text}`,
                    },
                  ]}
                />
              </Pressable>
            ))}
          </View>
          <View style={{ flex: 1 }} />
          <Button
            title="Undo"
            kind="quiet"
            onPress={() => setHistory((h) => (h.length > 1 ? h.slice(0, -1) : h))}
            disabled={history.length < 2}
          />
          <Button
            title="Clear All"
            kind="quiet"
            onPress={() => push([])}
            disabled={draft.length === 0}
          />
        </View>
        {savedCaption !== undefined ? (
          <Field label="Caption (optional)" value={caption} onChangeText={setCaption} />
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** A dashed box around the selected label, over the canvas. */
function SelectedBox({
  shape,
  px,
  width,
  height,
}: {
  shape: MarkupShape;
  px: number;
  width: number;
  height: number;
}) {
  if (shape.type !== "text") return null;
  const w = shape.text.length * px * 0.62 + 16;
  const h = px * 1.3;
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.selected,
        { left: shape.x * width - w / 2, top: shape.y * height - h * 0.8, width: w, height: h },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  editor: { flex: 1 },
  selected: {
    position: "absolute",
    borderRadius: 6,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: "#FFFFFF",
    boxShadow: "0px 0px 0px 1px rgba(0,0,0,0.5)",
  },
  sizeRow: { flexDirection: "row", alignItems: "center", gap: space["3"], flexWrap: "wrap" },
  bar: {
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space["2"],
  },
  barSide: { flex: 1, flexDirection: "row" },
  barTitle: { maxWidth: "55%", textAlign: "center" },
  barButton: { minHeight: minTap, justifyContent: "center", paddingHorizontal: space["2"] },
  canvasArea: { flex: 1, alignItems: "center", justifyContent: "center", padding: space["2"] },
  tools: { flexGrow: 0, maxHeight: "48%" },
  toolsContent: { padding: space["4"], gap: space["4"] },
  colorRow: { flexDirection: "row", alignItems: "center", gap: space["2"], flexWrap: "wrap" },
  colors: { flexDirection: "row", gap: space["2"] },
  swatchHit: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  swatch: { width: 32, height: 32, borderRadius: 16, borderWidth: 2 },
});
