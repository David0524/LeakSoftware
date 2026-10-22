"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { usageFlush, usageInput, usageScreen, usageTick } from "@/lib/usage-client";

/**
 * Counts screen time in the office for the Admin portal's Usage (owner, 2026-10-22): the
 * screen open, while the tab is in front and in use; sent every minute and on leaving.
 */
export function UsageTracker({ companyId }: { companyId: string }) {
  const path = usePathname();
  useEffect(() => usageScreen(path, companyId), [path, companyId]);
  useEffect(() => {
    const input = () => usageInput();
    const visibility = () => {
      usageTick();
      if (document.visibilityState === "hidden") usageFlush(true);
    };
    const leave = () => usageFlush(true);
    const events = ["pointerdown", "keydown", "wheel", "touchstart", "scroll"] as const;
    for (const e of events) addEventListener(e, input, { passive: true, capture: true });
    document.addEventListener("visibilitychange", visibility);
    addEventListener("pagehide", leave);
    const tick = setInterval(usageTick, 15_000);
    const flush = setInterval(() => usageFlush(), 60_000);
    return () => {
      for (const e of events) removeEventListener(e, input, { capture: true });
      document.removeEventListener("visibilitychange", visibility);
      removeEventListener("pagehide", leave);
      clearInterval(tick);
      clearInterval(flush);
      usageFlush(true);
    };
  }, []);
  return null;
}
