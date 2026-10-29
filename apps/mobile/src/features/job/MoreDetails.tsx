import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Card, T } from "../../ui/components";
import { Icon } from "../../ui/Icon";
import { color, space } from "../../ui/theme";

/**
 * New Job's More Details (owner, 2026-10-29: "New Job in 20 seconds"): one row that opens in
 * place to the fields a call rarely needs. Its second line says what's filled in, else what it
 * holds. The screen opens it for a restored draft or an error inside. The website's MoreDetails.
 */
export function MoreDetails({
  open,
  onToggle,
  line,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  line: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`More Details, ${line}`}
        onPress={onToggle}
      >
        <Card padding={16}>
          <View style={styles.row}>
            <View style={styles.text}>
              <T variant="bodyEmphasis">More Details</T>
              <T variant="secondary" muted>
                {line}
              </T>
            </View>
            <View style={open ? styles.up : styles.down}>
              <Icon name="chevron" size={18} color={color.textMuted} />
            </View>
          </View>
        </Card>
      </Pressable>
      {open ? <Card style={styles.body}>{children}</Card> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space["4"] },
  row: { flexDirection: "row", alignItems: "center", gap: space["3"], minHeight: 44 },
  text: { flex: 1, gap: 2 },
  // The chevron (pointing forward) turns down closed, up open.
  down: { transform: [{ rotate: "90deg" }] },
  up: { transform: [{ rotate: "-90deg" }] },
  body: { gap: space["4"] },
});
