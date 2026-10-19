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
  penShape,
  shapeAtTap,
  shapeFromDrag,
  textShape,
  type MarkupColor,
  type MarkupShape,
} from "@leakbook/core";
import { Button, Field, Segmented, T } from "../../ui/components";
import { confirmDestructive } from "../../ui/confirm";
import { MarkupLayer } from "../../ui/MarkupLayer";
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
      const s = textShape(ink, startPoint(), label);
      if (s) {
        push([...draft, s]);
        setLabelError(undefined);
      } else setLabelError("Type the label first.");
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
            }}
            onResponderMove={(e) => {
              if (tool === "pen") {
                stroke.current.push(endPoint(e));
                return setLive(penShape(ink, stroke.current));
              }
              if (tool !== "text") setLive(shapeFromDrag(tool, ink, startPoint(), endPoint(e)));
            }}
            onResponderRelease={release}
            onResponderTerminate={() => {
              stroke.current = [];
              setLive(null);
            }}
            accessibilityLabel={`${noun === "photo" ? "Photo" : "Pool diagram"}. ${tool === "pen" ? "Drag to draw." : "Tap to place, or drag to draw."}`}
          >
            {background(width, height)}
            <MarkupLayer
              shapes={live ? [...draft, live] : draft}
              width={width}
              height={height}
              scale={width / 400}
              space={markupSpace}
            />
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
            hint={`Then tap the ${noun} where it goes.`}
          />
        ) : (
          <T muted>
            {tool === "pen"
              ? "Drag to draw freehand."
              : `Tap to place ${tool === "arrow" ? "an arrow" : "a circle"}, or drag to draw one.`}
          </T>
        )}
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

const styles = StyleSheet.create({
  editor: { flex: 1 },
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
