import { useEffect } from "react";
import type { RecentKind } from "@leakbook/core";
import { getServices } from "../../lib/services";
import { rememberOpened } from "../../lib/shopSearch";

/**
 * A customer or job screen was shown: it goes first under Recent in search (docs/plans/
 * search-and-activity.md section 1), as the website's RememberRecent. Pass null until the
 * record has loaded.
 */
export function useRememberOpened(
  item: {
    kind: Extract<RecentKind, "customer" | "job">;
    id: string;
    title: string;
    detail: string | null;
  } | null,
): void {
  const kind = item?.kind;
  const id = item?.id;
  const title = item?.title;
  const detail = item?.detail ?? null;
  useEffect(() => {
    if (!kind || !id || title === undefined) return;
    rememberOpened(getServices().kv, {
      kind,
      id,
      title,
      detail,
      open: { screen: kind, id },
    });
  }, [kind, id, title, detail]);
}
