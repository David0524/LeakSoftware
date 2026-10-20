import { Text, View } from "react-native";
import type { LockTagKind } from "../lib/dayMap";
import { color, face, MAX_TEXT_SCALE, type } from "./theme";
import { WebIcon, type WebIconName } from "./WebIcon";

const ICONS: Record<Exclude<LockTagKind, "two_techs">, WebIconName> = {
  day: "dayLock",
  time: "timeLock",
  both: "lock",
};

/**
 * What keeps a job in place (the website's lock-tag.tsx). A lock is an icon only (owner,
 * 2026-10-20: "Do icons"): a calendar with a padlock for a day lock, a clock with a padlock for
 * a time lock, a padlock for both, read aloud as "Day locked", "Time locked" or "Locked".
 * "Two techs" stays words. 18 pt, muted.
 */
export function LockTag({ lock }: { lock: { label: string; kind: LockTagKind } }) {
  if (lock.kind === "two_techs")
    return (
      <Text
        style={[type.footnote, face.semiBold, { color: color.textMuted }]}
        maxFontSizeMultiplier={MAX_TEXT_SCALE}
      >
        {lock.label}
      </Text>
    );
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={lock.label}>
      <WebIcon name={ICONS[lock.kind]} size={18} color={color.textMuted} />
    </View>
  );
}
