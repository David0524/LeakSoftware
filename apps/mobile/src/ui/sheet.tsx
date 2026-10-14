import { useNavigation } from "expo-router";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useState,
  type ReactNode,
} from "react";

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

/** Keep the sheet from closing with a swipe while `locked`. Does nothing outside a sheet. */
export function useSheetLock(locked: boolean) {
  const setLock = useContext(SheetLock);
  const id = useId();
  useEffect(() => {
    if (!setLock) return;
    setLock(id, locked);
    return () => setLock(id, false);
  }, [setLock, id, locked]);
}

/** Whether this screen is inside a sheet's stack (so it pushes within the sheet). */
export function useInSheet() {
  return useContext(InSheet);
}
