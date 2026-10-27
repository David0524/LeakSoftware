import { useCallback } from "react";
import { useNavigation, usePreventRemove, useRoute } from "expo-router/react-navigation";
import { createLeaveDecider } from "../lib/discard";
import { confirmDiscard } from "./sheet";

const decider = createLeaveDecider();

/**
 * While `dirty`, leaving this screen in any way (Cancel, back, Android back, swipe, a tab or a
 * notification opening another screen) asks "Discard changes?" first (owner, 2026-10-20).
 * Returns `leave`: wrap the navigation after a successful save in it, so that doesn't ask.
 * `discarded` runs when the person answers Discard Changes: the typed text's draft goes
 * (useDraft's `clear`; owner, 2026-10-27).
 */
export function useDiscardChanges(
  dirty: boolean,
  discarded?: () => void,
): (go: () => void) => void {
  const navigation = useNavigation();
  const { key } = useRoute();
  usePreventRemove(dirty, ({ data }) => {
    const decision = decider.decide(data.action, key);
    if (decision === "skip") return;
    if (decision === "leave") return navigation.dispatch(data.action);
    confirmDiscard(() => {
      discarded?.();
      navigation.dispatch(data.action);
    });
  });
  return useCallback((go: () => void) => decider.leave(key, go), [key]);
}
