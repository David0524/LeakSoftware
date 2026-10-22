"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/** A time in the viewer's own time zone ("3:45 PM"), once the page is live in the browser. */
export function LocalTime({ iso }: { iso: string }) {
  const text = useSyncExternalStore(
    subscribe,
    () => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
    () => "",
  );
  return <time dateTime={iso}>{text}</time>;
}
