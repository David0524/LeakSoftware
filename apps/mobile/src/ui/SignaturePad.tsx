import { useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { strokePath, type SignatureStroke } from "@leakbook/core";
import { color } from "./theme";

/**
 * A box to sign in with a finger. Strokes are kept as points so the saved signature is a
 * crisp vector drawing. `onChange` gets every stroke after each one ends.
 */
export function SignaturePad({
  strokes,
  onChange,
  onDrawing,
  height = 200,
}: {
  strokes: SignatureStroke[];
  onChange: (strokes: SignatureStroke[]) => void;
  /** True while a finger is down, so a scrolling screen can hold still. */
  onDrawing?: (drawing: boolean) => void;
  height?: number;
}) {
  const [live, setLive] = useState<SignatureStroke | null>(null);
  const current = useRef<SignatureStroke>([]);
  // Page position of the pad's corner, taken when a stroke starts (locationX can jump to a
  // child's coordinates on iOS; page coordinates do not).
  const origin = useRef({ x: 0, y: 0 });

  return (
    <View
      style={[
        styles.pad,
        { height, backgroundColor: color.paper, borderColor: color.controlBorder },
      ]}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderTerminationRequest={() => false}
      onResponderGrant={(e) => {
        const n = e.nativeEvent;
        origin.current = { x: n.pageX - n.locationX, y: n.pageY - n.locationY };
        current.current = [[n.locationX, n.locationY]];
        setLive(current.current);
        onDrawing?.(true);
      }}
      onResponderMove={(e) => {
        const n = e.nativeEvent;
        current.current = [
          ...current.current,
          [n.pageX - origin.current.x, n.pageY - origin.current.y],
        ];
        setLive(current.current);
      }}
      onResponderRelease={() => {
        if (current.current.length) onChange([...strokes, current.current]);
        current.current = [];
        setLive(null);
        onDrawing?.(false);
      }}
      onResponderTerminate={() => {
        current.current = [];
        setLive(null);
        onDrawing?.(false);
      }}
      accessible
      accessibilityLabel="Signature box. Sign with your finger."
    >
      <View pointerEvents="none" style={[styles.line, { backgroundColor: color.controlBorder }]} />
      <Svg pointerEvents="none" style={StyleSheet.absoluteFill}>
        {[...strokes, ...(live ? [live] : [])].map((s, i) => (
          <Path
            key={i}
            d={strokePath(s)}
            // Ink on the white pad stays dark in dark mode too.
            stroke={color.navy}
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        ))}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  // A white block, radius 12, a 1 pt outline (spec 6.7).
  pad: { borderWidth: 1, borderRadius: 12, overflow: "hidden" },
  line: {
    position: "absolute",
    left: 24,
    right: 24,
    bottom: 48,
    height: 1,
  },
});
