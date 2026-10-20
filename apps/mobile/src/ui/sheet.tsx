import { useFocusEffect, useNavigation } from "expo-router";
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
import { BackHandler, Platform } from "react-native";
import { confirmDestructive } from "./confirm";

type SetLock = (id: string, locked: boolean) => void;

const SheetLock = createContext<SetLock | null>(null);
/** True inside an iPhone sheet's own stack (Add/Edit Test and Finding). */
const InSheet = createContext(false);

/**
 * Wraps a sheet's stack (in its _layout). While any screen inside holds a lock (unsaved
 * entries, drawing on a photo), swiping the sheet down is off, so it can't close by accident;
 * Cancel still asks first.
 */
export function SheetProvider({ children }: { children: ReactNode }) {
  // In a layout, this is the sheet's own entry in the stack that presented it.
  const navigation = useNavigation();
  const [locks, setLocks] = useState<ReadonlySet<string>>(() => new Set());
  const setLock = useCallback<SetLock>((id, locked) => {
    setLocks((prev) => {
      if (prev.has(id) === locked) return prev;
      const next = new Set(prev);
      if (locked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);
  useEffect(() => {
    navigation.setOptions({ gestureEnabled: locks.size === 0 });
  }, [navigation, locks]);
  return (
    <InSheet.Provider value>
      <SheetLock.Provider value={setLock}>{children}</SheetLock.Provider>
    </InSheet.Provider>
  );
}

/**
 * Keep the sheet from closing with a swipe while `locked`. Does nothing outside a sheet. With
 * `onBack`, Android's back button runs it while locked instead of leaving (owner, 2026-10-20:
 * a locked sheet asks on back instead of ignoring it); pass the screen's Cancel.
 */
export function useSheetLock(locked: boolean, onBack?: () => void) {
  const setLock = useContext(SheetLock);
  const id = useId();
  useEffect(() => {
    if (!setLock) return;
    setLock(id, locked);
    return () => setLock(id, false);
  }, [setLock, id, locked]);
  useBackPrompt(locked && Boolean(onBack), () => onBack?.());
}

/**
 * Android's back button runs `onBack` instead of going back while `active` and this screen
 * is in front (owner, 2026-10-20: an editor with unsaved changes asks first, with the same
 * alert as Cancel). Leaving by code (Save, Discard Changes) isn't affected.
 */
export function useBackPrompt(active: boolean, onBack: () => void) {
  const latest = useRef(onBack);
  useEffect(() => {
    latest.current = onBack;
  });
  useFocusEffect(
    useCallback(() => {
      if (!active || Platform.OS !== "android") return;
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        latest.current();
        return true;
      });
      return () => sub.remove();
    }, [active]),
  );
}

/** The question before throwing away typed or drawn changes (Cancel and Android's back). */
export function confirmDiscard(onDiscard: () => void) {
  confirmDestructive({
    title: "Discard changes?",
    confirm: "Discard Changes",
    cancel: "Keep Editing",
    onConfirm: onDiscard,
  });
}

/** Whether this screen is inside a sheet's stack (so it pushes within the sheet). */
export function useInSheet() {
  return useContext(InSheet);
}
