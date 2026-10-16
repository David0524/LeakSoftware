import { Pressable, StyleSheet, View } from "react-native";
import { companyServices, tipFor, type TipPackage } from "@leakbook/core";
import { useSession } from "../state/session";
import { useWalkthrough } from "../state/walkthrough";
import { T } from "./components";
import { haptics } from "./haptics";
import { Icon } from "./Icon";
import { color, radius, space, touch } from "./theme";

/**
 * This screen's tip, once (walkthrough, 2026-10-16), drawn like an iOS TipKit tip: an icon,
 * a short title and message, and a close button. `pkg` narrows it to a pool visit or a leak
 * inspection on a shop that does both.
 */
export function ScreenTip({ screen, pkg }: { screen: string; pkg?: TipPackage }) {
  const { company, membership } = useSession();
  const walkthrough = useWalkthrough();
  if (!company) return null;
  const tip = tipFor({
    platform: "app",
    screen,
    role: membership?.role,
    services: companyServices(company.settings),
    seen: walkthrough.seen,
    pkg,
  });
  if (!tip) return null;
  return (
    <View style={styles.tip}>
      <Icon name="lightbulb" size={24} color={color.link} />
      <View style={{ flex: 1, gap: 2 }}>
        <T variant="strong">{tip.title}</T>
        <T variant="small" style={{ color: color.textMuted }}>
          {tip.message}
        </T>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close Tip"
        hitSlop={8}
        onPress={() => {
          haptics.light();
          walkthrough.dismiss(tip.id);
        }}
        style={styles.close}
      >
        <Icon name="close" size={16} color={color.textMuted} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  tip: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space["3"],
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    paddingVertical: space["3"],
    paddingLeft: space["4"],
    paddingRight: space["1"],
  },
  close: {
    width: touch,
    height: touch,
    marginTop: -space["2"],
    alignItems: "center",
    justifyContent: "center",
  },
});
