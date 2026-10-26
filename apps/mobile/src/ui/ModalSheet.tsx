import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useDiscardChanges } from "./discard";
import { KeyboardAvoider, useKeepFieldVisible } from "./keyboard";
import { confirmDiscard } from "./sheet";
import { color, face, ios, minTap, shape, space, type } from "./theme";

type ReportDirty = (id: string, dirty: boolean) => void;
const SheetDirty = createContext<ReportDirty | null>(null);

/**
 * An editor's unsaved changes (owner, 2026-10-20: "Discard changes?" everywhere). Inside a
 * ModalSheet, its Cancel, Android back, the scrim and leaving the screen ask first; elsewhere,
 * leaving the screen does. Returns `leave` for navigating away after a save (see
 * useDiscardChanges). Fields that save by themselves don't count.
 */
export function useUnsavedChanges(dirty: boolean): (go: () => void) => void {
  const report = useContext(SheetDirty);
  const id = useId();
  useEffect(() => {
    if (!report) return;
    report(id, dirty);
    return () => report(id, false);
  }, [report, id, dirty]);
  return useDiscardChanges(dirty && !report);
}

/**
 * Marks the sheet it is placed in as having unsaved changes while `dirty` (for a sheet whose
 * form is built from parts that don't ask by themselves): closing it any way asks "Discard
 * changes?" first. Renders nothing.
 */
export function UnsavedWhen({ dirty }: { dirty: boolean }) {
  useUnsavedChanges(dirty);
  return null;
}

/**
 * A sheet for one short task that isn't its own route (spec 3.15): Move, Suggested Times,
 * What to Add, a settings row's edit form. It rises from the bottom over a scrim, on the
 * grouped gray, with a grabber and a title bar: Cancel (or Close) at the left, the title in
 * the middle. iPhone uses the system page sheet (swipe down closes it); Android and the
 * browser preview draw it, at most 92% of the screen tall.
 *
 * `locked` (unsaved changes): the scrim doesn't close it; Cancel and Android's back button
 * call `onClose`, which should ask first (owner, 2026-10-20: back asks instead of being
 * ignored). Fields and buttons stay above the keyboard, edge to edge on Android too.
 */
export function ModalSheet({
  visible,
  onClose,
  title,
  cancel = "Cancel",
  locked = false,
  done,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  /** "Close" for read-only sheets. */
  cancel?: string;
  locked?: boolean;
  /** A bold Done (or Save) at the right of the title bar, as iOS sheets have. */
  done?: { label: string; onPress: () => void; disabled?: boolean };
  children: ReactNode;
}) {
  // Forms inside report unsaved changes (useUnsavedChanges): closing then asks first.
  const [dirtyIds, setDirtyIds] = useState<ReadonlySet<string>>(() => new Set());
  const report = useCallback<ReportDirty>((id, dirty) => {
    setDirtyIds((prev) => {
      if (prev.has(id) === dirty) return prev;
      const next = new Set(prev);
      if (dirty) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);
  const dirty = visible && dirtyIds.size > 0;
  useDiscardChanges(dirty);
  const held = locked || dirty;
  const close = dirty ? () => confirmDiscard(onClose) : onClose;
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  // The form scrolls the field being typed in above the keyboard.
  const sheetScroll = useRef<ScrollView>(null);
  const fieldView = useKeepFieldVisible(sheetScroll);
  const bar = (
    <View style={styles.bar}>
      <Pressable
        accessibilityRole="button"
        onPress={close}
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
      {done ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !!done.disabled }}
          disabled={done.disabled}
          onPress={done.onPress}
          hitSlop={4}
          style={({ pressed }) => [
            styles.cancel,
            { alignItems: "flex-end" },
            (pressed || done.disabled) && { opacity: 0.5 },
          ]}
        >
          <Text
            style={[type.body, face.semiBold, { color: color.link }]}
            maxFontSizeMultiplier={1.6}
          >
            {done.label}
          </Text>
        </Pressable>
      ) : (
        <View style={styles.cancel} />
      )}
    </View>
  );
  const body = (
    <ScrollView
      ref={sheetScroll}
      keyboardShouldPersistTaps="handled"
      onScroll={fieldView.onScroll}
      scrollEventThrottle={32}
      onLayout={fieldView.onLayout}
      contentContainerStyle={[styles.content, { paddingBottom: space["6"] + insets.bottom }]}
    >
      <SheetDirty.Provider value={report}>{children}</SheetDirty.Provider>
    </ScrollView>
  );

  if (ios)
    return (
      <Modal
        visible={visible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={held ? undefined : close}
      >
        <View style={[styles.flex, { backgroundColor: color.bg }]}>
          <View style={[styles.grabber, { backgroundColor: color.grabber }]} />
          {bar}
          <KeyboardAvoider style={styles.flex}>{body}</KeyboardAvoider>
        </View>
      </Modal>
    );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={close}
    >
      <Pressable
        accessibilityLabel="Close"
        accessibilityRole="button"
        style={[StyleSheet.absoluteFill, { backgroundColor: color.scrim }]}
        onPress={held ? undefined : close}
      />
      <KeyboardAvoider style={styles.dock} pointerEvents="box-none">
        <View
          accessibilityViewIsModal
          style={[styles.panel, { backgroundColor: color.bg, maxHeight: height * 0.92 }]}
        >
          <View style={[styles.grabber, { backgroundColor: color.grabber }]} />
          {bar}
          {body}
        </View>
      </KeyboardAvoider>
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
    // Shrinks to what the keyboard leaves, so the title bar (Cancel, Save) never rides off the
    // top of the screen while a tall form is being typed in; the form scrolls inside it.
    flexShrink: 1,
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
