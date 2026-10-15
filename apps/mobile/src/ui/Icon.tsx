import Ionicons from "@expo/vector-icons/Ionicons";
import { SymbolView, type SymbolViewProps, type SymbolWeight } from "expo-symbols";
import type { ColorValue } from "react-native";
import { ios } from "./theme";

type IoniconName = keyof typeof Ionicons.glyphMap;
type SFSymbolName = Extract<SymbolViewProps["name"], string>;

/**
 * The app's icons by meaning. iPhone draws SF Symbols, Apple's own icons, which match the
 * system font's weight; Android (and an iPhone that can't draw a symbol) keeps Ionicons.
 * Symbols on bars and contact buttons are the filled variants, as iOS uses them.
 */
const ICONS = {
  add: { sf: "plus", ion: "add" },
  settings: { sf: "gearshape", ion: "settings-outline" },
  chevron: { sf: "chevron.forward", ion: "chevron-forward" },
  checkmark: { sf: "checkmark", ion: "checkmark" },
  call: { sf: "phone.fill", ion: "call" },
  directions: { sf: "location", ion: "navigate-outline" },
  microphone: { sf: "mic.fill", ion: "mic" },
  video: { sf: "video.fill", ion: "videocam" },
  photo: { sf: "photo.fill", ion: "image" },
  upload: { sf: "icloud.and.arrow.up", ion: "cloud-upload-outline" },
  play: { sf: "play.fill", ion: "play" },
  pause: { sf: "pause.fill", ion: "pause" },
} as const satisfies Record<string, { sf: SFSymbolName; ion: IoniconName }>;

export type IconName = keyof typeof ICONS;

/**
 * An icon. Decorative by default: the control around it carries the accessibility label.
 * `weight` matches the text beside it on iPhone (regular for 17 pt body, semibold for bold).
 */
export function Icon({
  name,
  size = 24,
  color,
  weight = "regular",
}: {
  name: IconName;
  size?: number;
  color: ColorValue;
  weight?: SymbolWeight;
}) {
  const icon = ICONS[name];
  const fallback = (
    <Ionicons
      name={icon.ion}
      size={size}
      color={color}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    />
  );
  if (!ios) return fallback;
  return (
    <SymbolView
      name={icon.sf}
      size={size}
      tintColor={color}
      weight={weight}
      fallback={fallback}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}
