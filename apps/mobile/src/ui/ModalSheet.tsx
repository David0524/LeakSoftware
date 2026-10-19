import type { ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { color, face, ios, minTap, shape, space, type } from "./theme";

/**
 * A sheet for one short task that isn't its own route (spec 3.15): Move, Suggested Times,
 * What to Add, a settings row's edit form. It rises from the bottom over a scrim, on the
 * grouped gray, with a grabber and a title bar: Cancel (or Close) at the left, the title in
 * the middle. iPhone uses the system page sheet (swipe down closes it); Android and the
 * browser preview draw it, at most 92% of the screen tall.
 *
 * `locked` (unsaved changes): the scrim and the system back button don't close it; Cancel
 * calls `onClose`, which should ask first.
 */
export function ModalSheet({
  visible,
  onClose,
  title,
  cancel = "Cancel",
  locked = false,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  /** "Close" for read-only sheets. */
  cancel?: string;
  locked?: boolean;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const bar = (
    <View style={styles.bar}>
      <Pressable
        accessibilityRole="button"
        onPress={onClose}
        hitSlop={4}
        style={({ pressed }) => [styles.cancel, pressed && { opacity: 0.5 }]}
      >
        <Text style={[type.body, { color: color.link }]} maxFontSizeMultiplier={1.6}>
          {cancel}
        </Text>
      </Pressable>
      <Text
        style={[type.navTitle, styles.title, { color: color.text }]}
        numberOfLines={1}
        accessibilityRole="header"
        maxFontSizeMultiplier={1.6}
      >
        {title}
      </Text>
      <View style={styles.cancel} />
    </View>
  );
  const body = (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[styles.content, { paddingBottom: space["6"] + insets.bottom }]}
    >
      {children}
    </ScrollView>
  );

  if (ios)
    return (
      <Modal
        visible={visible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={locked ? undefined : onClose}
      >
        <View style={[styles.flex, { backgroundColor: color.bg }]}>
          <View style={[styles.grabber, { backgroundColor: color.grabber }]} />
          {bar}
          <KeyboardAvoidingView style={styles.flex} behavior="padding">
            {body}
          </KeyboardAvoidingView>
        </View>
      </Modal>
    );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={locked ? () => {} : onClose}
    >
      <Pressable
        accessibilityLabel="Close"
        accessibilityRole="button"
        style={[StyleSheet.absoluteFill, { backgroundColor: color.scrim }]}
        onPress={locked ? undefined : onClose}
      />
      <KeyboardAvoidingView
        style={styles.dock}
        behavior={Platform.OS === "android" ? undefined : "padding"}
        pointerEvents="box-none"
      >
        <View
          accessibilityViewIsModal
          style={[styles.panel, { backgroundColor: color.bg, maxHeight: height * 0.92 }]}
        >
          <View style={[styles.grabber, { backgroundColor: color.grabber }]} />
          {bar}
          {body}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** A full-width line between a sheet's form and its Delete button. */
export function SheetDivider() {
  return <View style={[styles.divider, { backgroundColor: color.separator }]} />;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  dock: { flex: 1, justifyContent: "flex-end" },
  panel: {
    borderTopLeftRadius: shape.sheet,
    borderTopRightRadius: shape.sheet,
    overflow: "hidden",
  },
  grabber: { alignSelf: "center", width: 36, height: 6, borderRadius: 3, marginTop: space["2"] },
  bar: {
    minHeight: minTap,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space["2"],
  },
  cancel: { minWidth: 72, minHeight: minTap, justifyContent: "center", paddingHorizontal: 8 },
  title: { flex: 1, textAlign: "center", ...face.semiBold },
  content: { paddingHorizontal: space["4"], paddingTop: space["2"], gap: space["4"] },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: space["2"] },
});
