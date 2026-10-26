import { useEffect } from "react";
import { onRemoved } from "../lib/removedBanner";
import { useResultBanner } from "./ResultBanner";

/**
 * Once, in the signed-in app's layout: "Photo removed" with Undo for five seconds, as the
 * Today and Schedule banners look (owner, 2026-10-26: Undo instead of "Are you sure?").
 */
export function RemovedHost() {
  const banner = useResultBanner();
  useEffect(() => onRemoved(banner.show), [banner.show]);
  return banner.element;
}
