import { Pressable, StyleSheet, View } from "react-native";
import { companyServices, tipFor, type TipPackage } from "@leakbook/core";
import { useSession } from "../state/session";
import { useWalkthrough } from "../state/walkthrough";
import { T } from "./components";
import { haptics } from "./haptics";
import { cardShadow, color, minTap, shape, space } from "./theme";
import { WebIcon } from "./WebIcon";

/**
 * This screen's tip, once (walkthrough, 2026-10-16), drawn as the website's tip card (spec
 * 3.11): a lightbulb, the title over the message, and a round close button in the corner.
 * `pkg` narrows it to a pool visit or a leak inspection on a shop that does both.
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
    <View style={[styles.tip, { backgroundColor: color.surface }, cardShadow()]}>
      <View style={styles.icon}>
        <WebIcon name="lightbulb" size={24} color={color.link} strokeWidth={2} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <T variant="bodyEmphasis">{tip.title}</T>
        <T variant="secondary" muted>
          {tip.message}
        </T>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close Tip"
        onPress={() => {
          haptics.light();
          walkthrough.dismiss(tip.id);
        }}
        style={styles.close}
      >
        <WebIcon name="close" size={16} color={color.textMuted} strokeWidth={2} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  tip: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space["3"],
    borderRadius: shape.card,
    paddingVertical: space["3"],
    paddingLeft: space["4"],
    paddingRight: space["1"],
  },
  icon: { marginTop: 2 },
  close: {
    width: minTap,
    height: minTap,
    marginTop: -space["1"],
    alignItems: "center",
    justifyContent: "center",
  },
});
