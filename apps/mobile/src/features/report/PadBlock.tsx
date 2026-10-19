import { StyleSheet, View } from "react-native";
import type { SignatureStroke } from "@leakbook/core";
import { Button, T } from "../../ui/components";
import { SignaturePad } from "../../ui/SignaturePad";
import { space } from "../../ui/theme";

/** The pad, "Use your finger." and Clear (spec 6.7). Shared with Review and Sign. */
export function PadBlock({
  strokes,
  setStrokes,
  setDrawing,
  onInk,
}: {
  strokes: SignatureStroke[];
  setStrokes: (s: SignatureStroke[]) => void;
  setDrawing: (d: boolean) => void;
  onInk?: () => void;
}) {
  return (
    <View style={{ gap: space["1"] }}>
      <T variant="bodyMedium">Signature</T>
      <SignaturePad
        strokes={strokes}
        onDrawing={setDrawing}
        onChange={(s) => {
          setStrokes(s);
          onInk?.();
        }}
      />
      <View style={styles.padFoot}>
        <T variant="secondary" muted>
          Use your finger.
        </T>
        <Button
          title="Clear"
          kind="quiet"
          onPress={() => setStrokes([])}
          disabled={strokes.length === 0}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  padFoot: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
});
