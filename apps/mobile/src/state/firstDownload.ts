import { useEffect, useState } from "react";

// Getting Ready's finish (gestures spec section 11): when the first download ends, the pool
// is full and the percent turns into a checkmark for 0.6 s, then the app opens. Setup and the
// root stack each follow the same steps from the same status, so they move together.

/** How long the finished check shows before the app opens. */
export const FINISH_MS = 600;

type Step = "downloading" | "finishing" | "open";

/** The next step for the download's state: pure, so it's tested without a phone. */
export function firstDownloadStep(step: Step, initialSyncDone: boolean): Step {
  if (!initialSyncDone) return "downloading";
  return step === "downloading" ? "finishing" : step;
}

/**
 * Whether the first download is done and its check has shown (`open`), and whether the check
 * is showing now (`finishing`). A phone that was already set up opens at once.
 */
export function useFirstDownloadOpen(initialSyncDone: boolean): {
  open: boolean;
  finishing: boolean;
} {
  const [step, setStep] = useState<Step>(initialSyncDone ? "open" : "downloading");
  const next = firstDownloadStep(step, initialSyncDone);
  if (next !== step) setStep(next);
  useEffect(() => {
    if (step !== "finishing") return;
    const t = setTimeout(() => setStep("open"), FINISH_MS);
    return () => clearTimeout(t);
  }, [step]);
  return { open: next === "open", finishing: next === "finishing" };
}
