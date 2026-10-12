import type { ReactNode } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { JOB_STATUS_LABELS, type JobStatus } from "@leakbook/core";
import { color, font, JOB_STATUS_COLOR, radius, space, touch } from "./theme";

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

type Variant = "title" | "heading" | "label" | "body" | "strong" | "small" | "muted";

export function T({
  variant = "body",
  style,
  children,
  numberOfLines,
}: {
  variant?: Variant;
  style?: StyleProp<TextStyle>;
  children: ReactNode;
  numberOfLines?: number;
}) {
  return (
    <Text style={[text[variant], style]} numberOfLines={numberOfLines}>
      {children}
    </Text>
  );
}

const text = StyleSheet.create({
  title: { fontFamily: font.displayExtraBold, fontSize: 28, lineHeight: 32, color: color.text },
  heading: { fontFamily: font.displayBold, fontSize: 20, lineHeight: 24, color: color.text },
  label: {
    fontFamily: font.displaySemiBold,
    fontSize: 13,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: color.textMuted,
  },
  // Sizes follow iOS Dynamic Type defaults: Body 17/22, Subhead 15/20 (HIG typography.md).
  body: { fontFamily: font.body, fontSize: 17, lineHeight: 22, color: color.text },
  strong: { fontFamily: font.bodySemiBold, fontSize: 17, lineHeight: 22, color: color.text },
  small: { fontFamily: font.body, fontSize: 15, lineHeight: 20, color: color.text },
  muted: { fontFamily: font.body, fontSize: 15, lineHeight: 20, color: color.textMuted },
});

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export function Screen({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  const body = scroll ? (
    <ScrollView contentContainerStyle={styles.screenContent} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  ) : (
    <View style={styles.screenContent}>{children}</View>
  );
  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {body}
    </KeyboardAvoidingView>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Section({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <T variant="label">{title}</T>
        {action}
      </View>
      {children}
    </View>
  );
}

export function Notice({
  tone = "info",
  children,
}: {
  tone?: "info" | "warning" | "error";
  children: ReactNode;
}) {
  const c = tone === "error" ? color.fail : tone === "warning" ? color.warning : color.info;
  return (
    <View style={[styles.notice, { borderLeftColor: c }]}>
      <T variant="small">{children}</T>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

export function Button({
  title,
  onPress,
  kind = "primary",
  loading = false,
  disabled = false,
  style,
}: {
  title: string;
  onPress: () => void;
  kind?: "primary" | "secondary" | "quiet" | "danger";
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const k = buttonKinds[kind];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        k.box,
        (pressed || disabled) && { opacity: disabled ? 0.45 : 0.8 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={k.text.color} />
      ) : (
        <Text style={[styles.buttonText, k.text]}>{title}</Text>
      )}
    </Pressable>
  );
}

const buttonKinds = {
  // Navy on safety orange: white on orange is too faint in sun (brand/BRAND.md).
  primary: { box: { backgroundColor: color.primary }, text: { color: color.onPrimary } },
  secondary: {
    box: { backgroundColor: color.surface, borderWidth: 2, borderColor: color.navy },
    text: { color: color.navy },
  },
  quiet: { box: { backgroundColor: "transparent" }, text: { color: color.link } },
  danger: {
    box: { backgroundColor: color.surface, borderWidth: 2, borderColor: color.fail },
    text: { color: color.fail },
  },
} as const;

export function Field({
  label,
  error,
  hint,
  ...input
}: TextInputProps & { label: string; error?: string; hint?: string }) {
  return (
    <View style={styles.field}>
      <T variant="label">{label}</T>
      <TextInput
        placeholderTextColor={color.textMuted}
        {...input}
        accessibilityLabel={label}
        style={[
          styles.input,
          error ? { borderColor: color.fail } : null,
          input.multiline && styles.multiline,
        ]}
      />
      {error ? (
        <T variant="small" style={{ color: color.fail }}>
          {error}
        </T>
      ) : hint ? (
        <T variant="muted">{hint}</T>
      ) : null}
    </View>
  );
}

export function Choice<V extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label?: string;
  options: { value: V; label: string }[];
  value: V | null;
  onChange: (v: V) => void;
}) {
  return (
    <View style={styles.field}>
      {label ? <T variant="label">{label}</T> : null}
      <View style={styles.choices}>
        {options.map((o) => {
          const on = o.value === value;
          return (
            <Pressable
              key={o.value}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              onPress={() => onChange(o.value)}
              style={[styles.choice, on && styles.choiceOn]}
            >
              <Text style={[styles.choiceText, on && { color: color.onHeader }]}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/**
 * iOS-style segmented control: one row, equal-width segments, for switching between a few
 * closely related views or states (HIG segmented-controls.md). Use Choice for longer lists.
 */
export function Segmented<V extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label?: string;
  options: { value: V; label: string }[];
  value: V | null;
  onChange: (v: V) => void;
}) {
  return (
    <View style={styles.field}>
      {label ? <T variant="label">{label}</T> : null}
      <View style={styles.segmented} accessibilityRole="tablist">
        {options.map((o) => {
          const on = o.value === value;
          return (
            <Pressable
              key={o.value}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              onPress={() => onChange(o.value)}
              style={[styles.segment, on && styles.segmentOn]}
            >
              <Text
                style={[styles.segmentText, on && styles.segmentTextOn]}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {o.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.toggle}>
      <T variant="strong">{label}</T>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: color.water, false: color.neutral200 }}
        accessibilityLabel={label}
      />
    </View>
  );
}

export function StatusChip({ status }: { status: JobStatus }) {
  return (
    <View style={[styles.chip, { backgroundColor: JOB_STATUS_COLOR[status] }]}>
      <Text style={styles.chipText}>{JOB_STATUS_LABELS[status].toUpperCase()}</Text>
    </View>
  );
}

export function Row({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.row, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  screenContent: { padding: space["4"], gap: space["4"], paddingBottom: space["7"] },
  card: {
    backgroundColor: color.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: color.border,
    padding: space["4"],
    gap: space["2"],
  },
  section: { gap: space["2"] },
  sectionHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  notice: {
    backgroundColor: color.surface,
    borderLeftWidth: 4,
    borderRadius: radius.md,
    padding: space["3"],
  },
  button: {
    minHeight: touch + 4,
    borderRadius: radius.md,
    paddingHorizontal: space["5"],
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: { fontFamily: font.displayExtraBold, fontSize: 18, letterSpacing: 0.4 },
  field: { gap: 6 },
  input: {
    minHeight: touch + 4,
    backgroundColor: color.surface,
    borderWidth: 1.5,
    borderColor: color.controlBorder,
    borderRadius: radius.md,
    paddingHorizontal: space["3"],
    fontFamily: font.body,
    fontSize: 17,
    color: color.text,
  },
  multiline: { minHeight: 96, paddingTop: space["3"], textAlignVertical: "top" },
  choices: { flexDirection: "row", flexWrap: "wrap", gap: space["2"] },
  choice: {
    minHeight: touch,
    paddingHorizontal: space["4"],
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: color.controlBorder,
    backgroundColor: color.surface,
    justifyContent: "center",
  },
  choiceOn: { backgroundColor: color.navy, borderColor: color.navy },
  segmented: {
    flexDirection: "row",
    backgroundColor: color.neutral200,
    borderRadius: radius.md,
    padding: 3,
    gap: 3,
  },
  segment: {
    flex: 1,
    minHeight: touch - 4,
    borderRadius: radius.md - 2,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space["2"],
  },
  segmentOn: { backgroundColor: color.surface, borderWidth: 1, borderColor: color.controlBorder },
  segmentText: { fontFamily: font.bodyMedium, fontSize: 15, color: color.text },
  segmentTextOn: { fontFamily: font.bodyBold },
  choiceText: { fontFamily: font.bodySemiBold, fontSize: 15, color: color.text },
  toggle: {
    minHeight: touch,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space["3"],
  },
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.sm,
    alignSelf: "flex-start",
  },
  chipText: { fontFamily: font.displayBold, fontSize: 12, letterSpacing: 0.6, color: "#FFFFFF" },
  row: { flexDirection: "row", alignItems: "center", gap: space["3"] },
});
