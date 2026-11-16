"use client";

import { useEffect, useRef } from "react";

// Skip Visit and Reschedule are asked for from several places (the job's buttons, its ••• menu,
// the skipped card); the one sheet that owns each answers (owner, 2026-11-16).

const SKIP = "leakbook:skip-visit";
const RESCHEDULE = "leakbook:reschedule-visit";

/** Open the Skip Visit sheet. */
export function requestSkipVisit() {
  window.dispatchEvent(new CustomEvent(SKIP));
}

/** Open the schedule sheet (Suggest Times and Move) for a skipped visit. */
export function requestReschedule() {
  window.dispatchEvent(new CustomEvent(RESCHEDULE));
}

function useEvent(name: string, handler: () => void) {
  const latest = useRef(handler);
  useEffect(() => {
    latest.current = handler;
  });
  useEffect(() => {
    const on = () => latest.current();
    window.addEventListener(name, on);
    return () => window.removeEventListener(name, on);
  }, [name]);
}

export const useSkipVisitRequest = (handler: () => void) => useEvent(SKIP, handler);
export const useRescheduleRequest = (handler: () => void) => useEvent(RESCHEDULE, handler);
