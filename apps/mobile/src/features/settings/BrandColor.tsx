import { File, Paths } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import {
  DEFAULT_BRAND_COLOR,
  base64ToBytes,
  brandColorChoices,
  decodePng,
  isHexColor,
  logoPalette,
  textOnBrand,
} from "@leakbook/core";
import { tokens } from "@leakbook/tokens";
import { T } from "../../ui/components";
import { ModalSheet } from "../../ui/ModalSheet";
import { color, minTap, space, type } from "../../ui/theme";

// The shop's colors in Settings › Company and Branding (owner, 2026-10-22: "You should auto fill
// company colors based on the logo, and give a picker. A hex code alone is not useful"). Same as
// the website's ColorField: a swatch at the row's end opens a color grid, the hex small beside
// it, and swatches with the logo's colors first.

/**
 * A logo's colors: shrunk to 64 px as a PNG, decoded in JavaScript (React Native has no pixel
 * access), then logoPalette. `uri` is a local file or the logo's signed link. None on failure.
 */
export async function logoColorsFrom(uri: string): Promise<string[]> {
  try {
    let local = uri;
    if (/^https?:/.test(uri)) {
      const file = await File.downloadFileAsync(uri, new File(Paths.cache, "logo-colors"), {
        idempotent: true,
      });
      local = file.uri;
    }
    const ctx = ImageManipulator.manipulate(local);
    ctx.resize({ width: 64 });
    const image = await ctx.renderAsync();
    const saved = await image.saveAsync({ format: SaveFormat.PNG, base64: true });
    if (!saved.base64) return [];
    return logoPalette(decodePng(base64ToBytes(saved.base64)).rgba);
  } catch {
    return [];
  }
}

/** A color grid for "More Colors": twelve hues in five shades, then grays. */
function hsl(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const v = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(v * 255)
      .toString(16)
      .padStart(2, "0")
      .toUpperCase();
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}
const SHADES = [0.22, 0.32, 0.42, 0.55, 0.7];
const GRID: string[][] = [
  ...Array.from({ length: 12 }, (_, i) => SHADES.map((l) => hsl(i * 30, 0.7, l))),
  SHADES.map((l) => hsl(210, 0.12, l)),
];

function Swatch({
  value,
  selected,
  label,
  onPress,
  size = 32,
}: {
  value: string;
  selected: boolean;
  label: string;
  onPress: () => void;
  size?: number;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.tap, pressed && { opacity: 0.6 }]}
    >
      <View
        style={[
          styles.ring,
          { width: size + 8, height: size + 8, borderRadius: (size + 8) / 2 },
          selected && { borderColor: color.link },
        ]}
      >
        <View
          style={[
            styles.dot,
            { width: size, height: size, borderRadius: size / 2 },
            value ? { backgroundColor: value } : { backgroundColor: color.surface },
          ]}
        >
          {value ? null : <View style={styles.none} />}
        </View>
      </View>
    </Pressable>
  );
}

export function BrandColorRow({
  label,
  value,
  onChange,
  logoColors,
  optional = false,
  note,
  error,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  logoColors: string[];
  optional?: boolean;
  note?: string;
  error?: string;
}) {
  const [grid, setGrid] = useState(false);
  const valid = isHexColor(value.trim());
  const upper = value.trim().toUpperCase();
  const logo = [...new Set(logoColors.map((c) => c.toUpperCase()))];
  const others = brandColorChoices([], valid ? upper : null).filter((c) => !logo.includes(c));
  const onColor = valid
    ? textOnBrand(upper, tokens.color.brand.navy, tokens.color.brand.paper)
    : "";
  const row = (title: string | null, colors: string[], none: boolean) => (
    <View accessibilityLabel={title ?? `${label} swatches`}>
      {title ? (
        <T variant="footnote" muted>
          {title}
        </T>
      ) : null}
      <View style={styles.swatches}>
        {none ? (
          <Swatch value="" label="None" selected={!upper} onPress={() => onChange("")} />
        ) : null}
        {colors.map((c) => (
          <Swatch
            key={c}
            value={c}
            label={title === "From your logo" ? `${c}, from your logo` : c}
            selected={upper === c}
            onPress={() => onChange(c)}
          />
        ))}
      </View>
    </View>
  );
  return (
    <View style={[styles.part, { backgroundColor: color.surface }]}>
      <View style={styles.head}>
        <T style={{ flex: 1 }}>
          {label}
          {optional ? <T muted> (optional)</T> : null}
        </T>
        <TextInput
          value={value}
          onChangeText={(t) => onChange(t.trim())}
          placeholder={optional ? "None" : DEFAULT_BRAND_COLOR}
          placeholderTextColor={color.placeholder}
          autoCapitalize="characters"
          autoCorrect={false}
          accessibilityLabel={`${label} hex code`}
          style={[type.secondary, styles.hex, { color: color.textMuted }]}
        />
        <Swatch
          value={valid ? upper : ""}
          label={`Choose ${label.toLowerCase()}`}
          selected={false}
          size={36}
          onPress={() => setGrid(true)}
        />
      </View>
      {logo.length ? row("From your logo", logo, false) : null}
      {row(logo.length ? "More colors" : null, others, optional)}
      {note ? (
        <T variant="secondary" muted>
          {note}
        </T>
      ) : null}
      {valid && !optional ? (
        <View style={styles.preview}>
          <View style={[styles.header, { backgroundColor: upper }]}>
            <T variant="bodyEmphasis" style={{ color: onColor }}>
              Report header
            </T>
          </View>
          {onColor !== tokens.color.brand.paper ? (
            <T variant="secondary" muted style={{ flex: 1 }}>
              A light color: documents use dark text on it.
            </T>
          ) : null}
        </View>
      ) : null}
      {error ? (
        <T variant="secondary" style={{ color: color.fail }}>
          {error}
        </T>
      ) : null}
      <ModalSheet visible={grid} onClose={() => setGrid(false)} title={`Choose ${label}`}>
        <ScrollView contentContainerStyle={styles.grid}>
          {GRID.map((shades) => (
            <View key={shades[0]} style={styles.gridRow}>
              {shades.map((c) => (
                <Swatch
                  key={c}
                  value={c}
                  label={c}
                  size={40}
                  selected={upper === c}
                  onPress={() => {
                    onChange(c);
                    setGrid(false);
                  }}
                />
              ))}
            </View>
          ))}
        </ScrollView>
      </ModalSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  part: { borderRadius: 12, padding: space["4"], gap: space["2"] },
  head: { flexDirection: "row", alignItems: "center", gap: space["2"] },
  hex: { minWidth: 84, minHeight: minTap, textAlign: "right", fontVariant: ["tabular-nums"] },
  swatches: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -6 },
  tap: { minWidth: minTap, minHeight: minTap, alignItems: "center", justifyContent: "center" },
  ring: {
    borderWidth: 2,
    borderColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  dot: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.controlBorder,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  none: {
    width: 1.5,
    height: "140%",
    backgroundColor: color.textMuted,
    transform: [{ rotate: "45deg" }],
  },
  preview: { flexDirection: "row", alignItems: "center", gap: space["2"] },
  header: { borderRadius: 999, paddingHorizontal: space["3"], paddingVertical: 6 },
  grid: { padding: space["4"], gap: space["1"] },
  gridRow: { flexDirection: "row", justifyContent: "space-between" },
});
