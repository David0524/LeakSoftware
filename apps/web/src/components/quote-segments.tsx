"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { QUOTE_SEGMENTS, type QuoteSegment } from "@leakbook/core";
import { quotesHref } from "@/lib/quotes";
import { Segmented } from "./segmented";

/**
 * The Quotes list's Draft | Sent | Accepted | Declined, kept in the address (?segment=). The
 * thumb moves at once; the list follows when the page has loaded. The page keys it by segment.
 */
export function QuoteSegments({ value, q }: { value: QuoteSegment; q: string }) {
  const router = useRouter();
  const [shown, setShown] = useState(value);
  const [, start] = useTransition();
  return (
    <Segmented
      label="Quotes to show"
      hideLabel
      name="segment"
      value={shown}
      fit
      options={QUOTE_SEGMENTS.map((s) => ({ value: s.key, label: s.label }))}
      onChange={(next) => {
        setShown(next);
        start(() => router.replace(quotesHref(next, q), { scroll: false }));
      }}
    />
  );
}
