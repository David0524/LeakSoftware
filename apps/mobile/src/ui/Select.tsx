import { useState, type ReactNode } from "react";
import {
  ActionSheetIOS,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { T } from "./components";
import { Glass } from "./Glass";
import { TechDot } from "./TechDot";
import { haptics } from "./haptics";
import { color, face, ios, MAX_TEXT_SCALE, minTap, shape, space, type } from "./theme";
import { WebIcon } from "./WebIcon";

// Selects and pull-down menus (spec 3.14 "Select", 3.15 action sheets). iPhone opens the
// system action sheet; Android and the browser preview draw the same panels (decision 2),
// since Android's own dialog holds only three buttons.

export interface MenuItem {
  label: string;
  onPress: () => void;
  /** Red, for Remove Item… and the like. */
  destructive?: boolean;
  /** The current choice: a check beside it. */
  checked?: boolean;
  /** A tech's color key: their dot before the name (team and week spec section 3). */
  dot?: string | null;
}

export interface MenuConfig {
  title?: string;
  message?: string;
  items: MenuItem[];
}

/**
 * A menu the screen opens from a control: `open(config)` shows it; render `element` once in
 * the screen (it is the drawn panel on Android; nothing on iPhone).
 */
export function useMenu(): { open: (config: MenuConfig) => void; element: ReactNode } {
  const [config, setConfig] = useState<MenuConfig | null>(null);
  function open(next: MenuConfig) {
    if (ios) {
      const destructive = next.items.findIndex((i) => i.destructive);
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: next.title,
          message: next.message,
          options: [...next.items.map((i) => (i.checked ? `${i.label} ✓` : i.label)), "Cancel"],
          cancelButtonIndex: next.items.length,
          destructiveButtonIndex: destructive >= 0 ? destructive : undefined,
        },
        (index) => next.items[index]?.onPress(),
      );
      return;
    }
    setConfig(next);
  }
  const element = ios ? null : <MenuSheet config={config} onClose={() => setConfig(null)} />;
  return { open, element };
}

/** The drawn action sheet: a glass panel of choices, then Cancel on its own panel. */
function MenuSheet({ config, onClose }: { config: MenuConfig | null; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={config !== null}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable
        style={[styles.scrim, { backgroundColor: color.scrim }]}
        onPress={onClose}
        accessibilityLabel="Close"
        accessibilityRole="button"
      />
      <View
        style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, space["2"]) }]}
        pointerEvents="box-none"
      >
        <Glass style={styles.panel}>
          {config?.title || config?.message ? (
            <View style={styles.head}>
              {config.title ? (
                <Text style={[styles.headTitle, { color: color.textMuted }]}>{config.title}</Text>
              ) : null}
              {config.message ? (
                <Text style={[styles.headMessage, { color: color.textMuted }]}>
                  {config.message}
                </Text>
              ) : null}
            </View>
          ) : null}
          <ScrollView style={{ maxHeight: 420 }} bounces={false}>
            {config?.items.map((item, i) => (
              <Pressable
                key={`${item.label}-${i}`}
                accessibilityRole="button"
                accessibilityState={{ selected: item.checked }}
                android_ripple={{ color: color.ripple }}
                onPress={() => {
                  onClose();
                  item.onPress();
                }}
                style={({ pressed }) => [
                  styles.action,
                  (i > 0 || config.title || config.message) && {
                    borderTopWidth: StyleSheet.hairlineWidth,
                    borderTopColor: color.separator,
                  },
                  pressed && { backgroundColor: color.rowPressed },
                ]}
              >
                {item.dot !== undefined ? <TechDot tech={item.dot} /> : null}
                <Text
                  style={[styles.actionText, { color: item.destructive ? color.fail : color.link }]}
                  maxFontSizeMultiplier={1.6}
                  numberOfLines={2}
                >
                  {item.label}
                </Text>
                {item.checked ? (
                  <Text style={[styles.actionText, { color: color.link }]}>✓</Text>
                ) : null}
              </Pressable>
            ))}
          </ScrollView>
        </Glass>
        <Glass style={styles.panel}>
          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            style={({ pressed }) => [
              styles.action,
              pressed && { backgroundColor: color.rowPressed },
            ]}
          >
            <Text style={[styles.actionText, face.semiBold, { color: color.link }]}>Cancel</Text>
          </Pressable>
        </Glass>
      </View>
    </Modal>
  );
}

/**
 * A select (spec 3.14): an outlined field showing the chosen value ("Choose…" until there is
 * one) with an up-down chevron; tapping opens the choices. The label sits above it.
 */
export function Select<V extends string>({
  label,
  options,
  value,
  onChange,
  placeholder = "Choose…",
  hint,
  error,
  disabled = false,
  style,
}: {
  label?: string;
  options: { value: V; label: string }[];
  value: V | null;
  onChange: (v: V) => void;
  placeholder?: string;
  hint?: string;
  error?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const menu = useMenu();
  const current = options.find((o) => o.value === value)?.label;
  return (
    <View style={[styles.field, style]}>
      {label ? <T variant="bodyMedium">{label}</T> : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          label ? `${label}, ${current ?? placeholder}` : (current ?? placeholder)
        }
        accessibilityHint={error ?? hint}
        accessibilityState={{ disabled }}
        disabled={disabled}
        android_ripple={{ color: color.ripple }}
        onPress={() =>
          menu.open({
            title: label,
            items: options.map((o) => ({
              label: o.label,
              checked: o.value === value,
              onPress: () => {
                if (o.value === value) return;
                haptics.selection();
                onChange(o.value);
              },
            })),
          })
        }
        style={({ pressed }) => [
          styles.box,
          {
            backgroundColor: color.surface,
            borderColor: error ? color.fail : color.controlBorder,
          },
          pressed && { opacity: 0.7 },
          disabled && { opacity: 0.5 },
        ]}
      >
        <Text
          style={[type.body, styles.value, { color: color.text }]}
          numberOfLines={1}
          maxFontSizeMultiplier={MAX_TEXT_SCALE}
        >
          {current ?? placeholder}
        </Text>
        <WebIcon name="updown" size={16} color={color.text} strokeWidth={2.2} />
      </Pressable>
      {error ? (
        <T variant="secondary" style={{ color: color.fail }}>
          {error}
        </T>
      ) : hint ? (
        <T variant="secondary" muted>
          {hint}
        </T>
      ) : null}
      {menu.element}
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0 },
  sheet: {
    position: "absolute",
    left: space["2"],
    right: space["2"],
    bottom: 0,
    gap: space["2"],
  },
  panel: { borderRadius: shape.actionSheet, overflow: "hidden" },
  head: {
    paddingHorizontal: space["4"],
    paddingVertical: space["3"],
    alignItems: "center",
    gap: 2,
  },
  headTitle: { ...face.semiBold, fontSize: 13, lineHeight: 18, textAlign: "center" },
  headMessage: { ...face.regular, fontSize: 13, lineHeight: 18, textAlign: "center" },
  action: {
    minHeight: 56,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    paddingHorizontal: space["4"],
    gap: space["2"],
  },
  actionText: { ...face.regular, fontSize: 20, lineHeight: 25, textAlign: "center" },
  field: { gap: space["1"] },
  box: {
    minHeight: minTap,
    borderWidth: 1,
    borderRadius: shape.field,
    paddingHorizontal: space["3"],
    paddingVertical: space["2"],
    flexDirection: "row",
    alignItems: "center",
    gap: space["2"],
  },
  value: { flex: 1 },
});
