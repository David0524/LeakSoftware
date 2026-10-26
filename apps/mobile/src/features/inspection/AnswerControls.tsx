import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { CHOOSE_HINT, CHOOSE_LABEL, type AnswerIcon, type AnswerTone } from "@leakbook/core";
import { haptic, haptics } from "../../ui/haptics";
import { useMenu } from "../../ui/Select";
import { color, face, MAX_TEXT_SCALE, minTap, tint } from "../../ui/theme";
import { WebIcon } from "../../ui/WebIcon";

// A checklist item's answers on its one line (owner, 2026-10-22: "I actually like your icons";
// docs/design/2026-10-22-phone-checklist.md): one icon button per answer, one tap each, the
// chosen one filled in its status color; or, where the answers have no clear icons, one pill
// that opens the action sheet. The same glyphs as the website's and the iPhone's SF Symbols.

function toneFill(tone: AnswerTone): string {
  return tone === "pass"
    ? color.pass
    : tone === "fail"
      ? color.fail
      : tone === "warning"
        ? color.warning
        : tone === "excluded"
          ? color.excluded
          : color.primary;
}

/** The glyph for an answer, on a 24 x 24 artboard (the website's paths). */
export function AnswerGlyph({
  symbol,
  tint: ink,
  size = 16,
}: {
  symbol: AnswerIcon["symbol"];
  tint: string;
  size?: number;
}) {
  const line = {
    fill: "none",
    stroke: ink,
    strokeWidth: 2.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {symbol === "check" ? <Path d="M5 12.5l4.5 4.5L19 7.5" {...line} /> : null}
      {symbol === "xmark" ? <Path d="M6.5 6.5l11 11M17.5 6.5l-11 11" {...line} /> : null}
      {symbol === "drop" ? (
        <Path d="M12 3.5S6 10.2 6 14.5a6 6 0 0 0 12 0C18 10.2 12 3.5 12 3.5z" fill={ink} />
      ) : null}
      {symbol === "exclamation" ? <Path d="M12 5v9.5M12 19v.01" {...line} strokeWidth={3} /> : null}
      {symbol === "minus" ? <Path d="M6 12h12" {...line} /> : null}
      {symbol === "skip" ? (
        <>
          <Path d="M6 6.5l8 5.5-8 5.5z" fill={ink} />
          <Path d="M17.5 6.5v11" {...line} />
        </>
      ) : null}
    </Svg>
  );
}

export interface AnswerIconChoice {
  label: string;
  icon: AnswerIcon;
  chosen: boolean;
  onPress: () => void;
  /** The answer that finishes the item ("Done", "Not Leaking", "No"): a tap you can feel. */
  done?: boolean;
}

/**
 * The answers as icon pills, 40 x 36 inside 44 x 44 targets that touch but don't overlap. Each
 * is labeled with its answer's word for TalkBack and VoiceOver, never the glyph's name.
 */
export function AnswerIconButtons({
  itemLabel,
  choices,
}: {
  itemLabel: string;
  choices: AnswerIconChoice[];
}) {
  return (
    <View style={styles.icons} accessibilityLabel={itemLabel}>
      {choices.map((c) => {
        const fill = toneFill(c.icon.tone);
        return (
          <Pressable
            key={c.label}
            accessibilityRole="button"
            accessibilityLabel={c.label}
            accessibilityState={{ selected: c.chosen }}
            accessibilityHint={c.chosen ? "Tap again to clear" : undefined}
            onPress={() => {
              if (c.done && !c.chosen) haptic("checklistItemDone");
              else haptics.selection();
              c.onPress();
            }}
            style={styles.target}
          >
            {({ pressed }) => (
              <View
                style={[
                  styles.icon,
                  { backgroundColor: c.chosen ? fill : color.fill },
                  pressed && !c.chosen && { opacity: 0.6 },
                ]}
              >
                <AnswerGlyph
                  symbol={c.icon.symbol}
                  tint={
                    c.chosen
                      ? c.icon.tone === "plain"
                        ? color.onPrimary
                        : color.onStatus
                      : color.textMuted
                  }
                />
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * The fallback: the answer as a tinted pill with a chevron ("Choose" in the link blue while
 * unanswered) that opens the action sheet of the options, with Not Done once answered.
 */
export function AnswerMenuPill({
  itemLabel,
  options,
  chosen,
  onChoose,
}: {
  itemLabel: string;
  options: { label: string; tone: AnswerTone }[];
  chosen: string | null;
  onChoose: (label: string | null) => void;
}) {
  const menu = useMenu();
  const tone = options.find((o) => o.label === chosen)?.tone;
  const ink = tone && tone !== "plain" ? toneFill(tone) : color.link;
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${itemLabel}, ${chosen ?? "To Do"}`}
        accessibilityHint={CHOOSE_HINT}
        onPress={() => {
          haptics.light();
          menu.open({
            title: itemLabel,
            items: [
              ...options.map((o) => ({
                label: o.label,
                checked: o.label === chosen,
                onPress: () => {
                  haptics.selection();
                  onChoose(o.label);
                },
              })),
              ...(chosen != null ? [{ label: "Not Done", onPress: () => onChoose(null) }] : []),
            ],
          });
        }}
        style={styles.pillTarget}
      >
        {({ pressed }) => (
          <View
            style={[
              styles.pill,
              { backgroundColor: tone ? tint(ink, 0.14) : color.fill },
              pressed && { opacity: 0.6 },
            ]}
          >
            <Text
              style={[styles.pillText, { color: ink }]}
              numberOfLines={2}
              maxFontSizeMultiplier={MAX_TEXT_SCALE}
            >
              {chosen ?? CHOOSE_LABEL}
            </Text>
            <WebIcon name="chevronDown" size={14} color={ink} strokeWidth={2.6} />
          </View>
        )}
      </Pressable>
      {menu.element}
    </>
  );
}

/** The small "›" at a row's end that opens the item's own screen (44 x 44). */
export function ItemDetailsButton({
  itemLabel,
  onPress,
}: {
  itemLabel: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${itemLabel} Details`}
      accessibilityHint="Opens the item: method, notes, and photos"
      onPress={onPress}
      style={({ pressed }) => [styles.target, pressed && { opacity: 0.5 }]}
    >
      <WebIcon name="chevronRight" size={16} color={color.textMuted} strokeWidth={2.2} />
    </Pressable>
  );
}

/** The flags' tones, for a pool inspection question's options in the menu pill. */
export function flagTone(flag: "ok" | "attention" | "leaking" | "na" | undefined): AnswerTone {
  return flag === "ok"
    ? "pass"
    : flag === "leaking"
      ? "fail"
      : flag === "attention"
        ? "warning"
        : flag === "na"
          ? "excluded"
          : "plain";
}

const styles = StyleSheet.create({
  icons: { flexDirection: "row" },
  target: { width: minTap, height: minTap, alignItems: "center", justifyContent: "center" },
  icon: {
    width: 40,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  pillTarget: { minHeight: minTap, justifyContent: "center", maxWidth: 170 },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  pillText: { ...face.semiBold, fontSize: 15, lineHeight: 19, flexShrink: 1, textAlign: "right" },
});
