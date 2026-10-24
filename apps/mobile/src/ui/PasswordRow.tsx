import { useState, type Ref, type RefObject } from "react";
import { Pressable, StyleSheet, View, type TextInput, type TextInputProps } from "react-native";
import { PASSWORD_RULES, passwordChecks, passwordScore } from "@leakbook/core";
import { FieldRow, T } from "./components";
import { Icon } from "./Icon";
import { color, minTap } from "./theme";

/**
 * A password row (owner, 2026-10-24), as on the website: an eye button to show or hide what's
 * typed and, for a new password, the rules as a checklist with a bar that fills as they're met
 * (packages/core/src/password.ts; Supabase checks them again).
 */
export function PasswordRow({
  meter = false,
  ref,
  ...props
}: Omit<TextInputProps, "secureTextEntry"> & {
  label: string;
  error?: string;
  hint?: string;
  next?: RefObject<TextInput | null>;
  ref?: Ref<TextInput>;
  /** A new password: show the rules as they're met. */
  meter?: boolean;
}) {
  const [shown, setShown] = useState(false);
  const value = String(props.value ?? "");
  return (
    <FieldRow
      {...props}
      ref={ref}
      secureTextEntry={!shown}
      autoCapitalize="none"
      autoCorrect={false}
      spellCheck={false}
      clearButtonMode="never"
      accessory={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={shown ? "Hide password" : "Show password"}
          accessibilityState={{ selected: shown }}
          onPress={() => setShown((s) => !s)}
          style={styles.eye}
        >
          <Icon name={shown ? "hide" : "show"} size={22} color={color.textMuted} />
        </Pressable>
      }
      footer={meter ? <PasswordMeter password={value} /> : undefined}
    />
  );
}

/** The rules as a checklist with a bar: quiet gray until each is met. */
export function PasswordMeter({ password }: { password: string }) {
  const checks = passwordChecks(password);
  const score = passwordScore(password);
  const total = PASSWORD_RULES.length;
  return (
    <View style={styles.meter} testID="password-meter">
      <View
        style={styles.bar}
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel="Password strength"
        accessibilityValue={{
          min: 0,
          max: total,
          now: score,
          text: `${score} of ${total} rules met`,
        }}
      >
        {PASSWORD_RULES.map((r, i) => (
          <View
            key={r.id}
            style={[
              styles.segment,
              {
                backgroundColor:
                  i < score ? (score === total ? color.pass : color.primary) : color.separator,
              },
            ]}
          />
        ))}
      </View>
      {PASSWORD_RULES.map((r) => (
        <View
          key={r.id}
          accessible
          accessibilityLabel={`${r.label}, ${checks[r.id] ? "met" : "not yet"}`}
        >
          <T variant="secondary" muted={!checks[r.id]}>
            <T variant="secondary" style={{ color: checks[r.id] ? color.pass : color.textMuted }}>
              {checks[r.id] ? "✓" : "○"}
            </T>
            {`  ${r.label}`}
          </T>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  eye: { width: minTap, height: minTap, alignItems: "center", justifyContent: "center" },
  meter: { paddingTop: 4, paddingBottom: 10, gap: 2 },
  bar: { flexDirection: "row", gap: 4, marginBottom: 6 },
  segment: { flex: 1, height: 4, borderRadius: 2 },
});
