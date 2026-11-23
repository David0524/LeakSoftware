import { REFER_COPY } from "@leakbook/core";
import { useEffect, useState } from "react";
import { Pressable, Share, StyleSheet, View } from "react-native";
import { API_URL } from "../../lib/config";
import { fetchReferShare, type ReferShare } from "../../lib/referral";
import { getServices } from "../../lib/services";
import { Icon } from "../../ui/Icon";
import { T } from "../../ui/components";
import { color, shape, space } from "../../ui/theme";

/** The shop's referral link for an owner, or null (asked once per shop; null while asking). */
export function useReferShare(companyId: string, role: string | null | undefined) {
  const [share, setShare] = useState<{ key: string; value: ReferShare | null } | null>(null);
  const key = `${companyId}:${role ?? ""}`;
  useEffect(() => {
    if (role !== "owner" || !companyId) return;
    let live = true;
    void fetchReferShare(getServices().supabase, companyId, role, API_URL).then((value) => {
      if (live) setShare({ key, value });
    });
    return () => {
      live = false;
    };
  }, [companyId, role, key]);
  return share?.key === key ? share.value : null;
}

/**
 * Refer a Pool Company (owner, 2026-11-23: "in a color that differs from all of the other
 * buttons there"): its own card in the brand's orange, softly, with an orange icon, that opens
 * the share sheet with the shop's referral link. Owners only; nothing while the link isn't known.
 * No money words (App Store rules 3.1.1 and 3.1.3(f); core refer.ts).
 */
export function ReferRow({ share }: { share: ReferShare }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${REFER_COPY.title}. ${REFER_COPY.subtitle}`}
      accessibilityHint={REFER_COPY.hint}
      onPress={() => void Share.share({ message: share.message }).catch(() => undefined)}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: pressed ? color.safetyPressed : color.safetyTint },
      ]}
      testID="refer-row"
    >
      <View style={[styles.badge, { backgroundColor: color.safetyDeep }]}>
        <Icon name="refer" size={18} weight="semibold" color={color.paper} />
      </View>
      <View style={styles.body}>
        <T variant="bodyEmphasis">{REFER_COPY.title}</T>
        <T variant="secondary" muted>
          {REFER_COPY.subtitle}
        </T>
      </View>
      <Icon name="share" size={20} weight="semibold" color={color.safetyDeep} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 64,
    borderRadius: shape.grouped,
    flexDirection: "row",
    alignItems: "center",
    gap: space["3"],
    paddingHorizontal: space["4"],
    paddingVertical: space["3"],
  },
  badge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  body: { flex: 1, gap: 2 },
});
