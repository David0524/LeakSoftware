"use client";

import { useEffect } from "react";
import type { RecentItem } from "@leakbook/core";
import { loadRecent, saveRecent } from "@/lib/recent";

/**
 * Opening a customer or a job puts it first under Recent in search. A job opened from one of
 * its quotes or invoices is already there as that quote or invoice, so it isn't added twice.
 */
export function RememberRecent({ userId, item }: { userId: string; item: RecentItem }) {
  const { kind, id, title, detail } = item;
  const screen = item.open.screen;
  useEffect(() => {
    const first = loadRecent(userId)[0];
    if (kind === "job" && first && first.open.screen === "job" && first.open.id === id) return;
    saveRecent(userId, { kind, id, title, detail, open: { screen, id } });
  }, [userId, kind, id, title, detail, screen]);
  return null;
}
