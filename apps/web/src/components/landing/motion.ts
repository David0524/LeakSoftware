"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

const REDUCE = "(prefers-reduced-motion: reduce)";
function subscribeMotion(onChange: () => void) {
  const m = window.matchMedia(REDUCE);
  m.addEventListener("change", onChange);
  return () => m.removeEventListener("change", onChange);
}

/** True when the person asked for less motion (the demos then show their last step, still). */
export function useReducedMotion() {
  return useSyncExternalStore(
    subscribeMotion,
    () => window.matchMedia(REDUCE).matches,
    () => false,
  );
}

/**
 * A demo's current step: steps advance on their own timings while the demo is on screen and
 * loop. `durations` are milliseconds per step. Off screen it pauses; with reduced motion it
 * rests on `still` (the step that shows the most).
 */
export function useSteps<T extends HTMLElement>(durations: number[], still = durations.length - 1) {
  const ref = useRef<T>(null);
  const reduced = useReducedMotion();
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(!!e?.isIntersecting), {
      threshold: 0.35,
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  // Keyed on the timings' values: callers pass a fresh array each render, and re-renders
  // (a count-up ticking) must not restart the step's timer.
  const timings = durations.join(",");
  useEffect(() => {
    if (reduced || !visible) return;
    const ms = timings.split(",").map(Number);
    const t = setTimeout(() => setStep((s) => (s + 1) % ms.length), ms[step]);
    return () => clearTimeout(t);
  }, [step, visible, reduced, timings]);
  return { ref, step: reduced ? still : step, reduced };
}

/** A number that counts up to `to` while `run` is true (0 otherwise; at once with reduced motion). */
export function useCountUp(to: number, run: boolean, ms = 1200) {
  const reduced = useReducedMotion();
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!run || reduced) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      setV(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      setV(0);
    };
  }, [to, run, ms, reduced]);
  if (!run) return 0;
  return reduced ? to : v;
}
