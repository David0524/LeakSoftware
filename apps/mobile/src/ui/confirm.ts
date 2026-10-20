import { ActionSheetIOS, Alert, Platform } from "react-native";
import { haptics } from "./haptics";

/**
 * Ask before something that can't be undone (delete, remove, discard, cancel). iPhone shows an
 * action sheet with the red destructive button, as iOS apps do; Android shows its own dialog
 * with the same two buttons. `onConfirm` runs only when the destructive button is tapped, with
 * a warning haptic.
 */
export function confirmDestructive({
  title,
  message,
  confirm,
  cancel = "Cancel",
  onConfirm,
}: {
  title: string;
  message?: string;
  /** The destructive button, in Title Case ("Delete Test"). */
  confirm: string;
  /** The safe button ("Keep"). */
  cancel?: string;
  onConfirm: () => void;
}) {
  const confirmed = () => {
    haptics.warning();
    onConfirm();
  };
  if (Platform.OS === "ios") {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title,
        message,
        options: [confirm, cancel],
        destructiveButtonIndex: 0,
        cancelButtonIndex: 1,
      },
      (index) => {
        if (index === 0) confirmed();
      },
    );
    return;
  }
  Alert.alert(title, message, [
    { text: cancel, style: "cancel" },
    { text: confirm, style: "destructive", onPress: confirmed },
  ]);
}

/**
 * A short menu of choices (Take Photo / Choose from Library). An action sheet on iPhone, the
 * system dialog on Android, each with a Cancel button.
 */
export function chooseAction({
  title,
  message,
  actions,
  cancel = "Cancel",
}: {
  title?: string;
  message?: string;
  actions: { label: string; onPress: () => void }[];
  cancel?: string;
}) {
  if (Platform.OS === "ios") {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title,
        message,
        options: [...actions.map((a) => a.label), cancel],
        cancelButtonIndex: actions.length,
      },
      (index) => actions[index]?.onPress(),
    );
    return;
  }
  Alert.alert(title ?? "", message, [
    ...actions.map((a) => ({ text: a.label, onPress: a.onPress })),
    { text: cancel, style: "cancel" as const },
  ]);
}

/**
 * A centered alert with Cancel and one default (bold) button, on iPhone and Android alike: a
 * question before something that goes out (owner, 2026-10-20: "Ready to send the visit
 * report?"), not an action sheet.
 */
export function confirmAlert({
  title,
  message,
  confirm,
  cancel = "Cancel",
  onConfirm,
}: {
  title: string;
  message?: string;
  /** The default button, in Title Case ("Complete and Send"). */
  confirm: string;
  cancel?: string;
  onConfirm: () => void;
}) {
  Alert.alert(title, message, [
    { text: cancel, style: "cancel" },
    { text: confirm, style: "default", isPreferred: true, onPress: onConfirm },
  ]);
}
