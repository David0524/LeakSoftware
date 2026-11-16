"use client";

import { useState } from "react";
import type { FaqTopic } from "@/lib/faq";
import { SEGMENT_TRACK, cx, segmentClass } from "@/components/ui";

type Show = "all" | "pool" | "leak";
const SHOW: [Show, string][] = [
  ["all", "All"],
  ["pool", "Pool Care"],
  ["leak", "Leak Detection"],
];

/**
 * The FAQ page's questions by topic (owner, 2026-11-16), with a segmented control for the kind
 * of shop. Every answer is in the page's HTML for search engines; the control only hides.
 */
export function FaqList({ topics }: { topics: FaqTopic[] }) {
  const [show, setShow] = useState<Show>("all");
  const visible = topics
    .map((t) => ({
      ...t,
      items: t.items.filter((i) => show === "all" || i.for === "both" || i.for === show),
    }))
    .filter((t) => t.items.length > 0);
  return (
    <div>
      <div role="group" aria-label="Kind of shop" className={cx(SEGMENT_TRACK, "mb-2")}>
        {SHOW.map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={show === id}
            onClick={() => setShow(id)}
            className={segmentClass(show === id)}
          >
            {label}
          </button>
        ))}
      </div>
      <nav aria-label="Topics" className="mt-4 flex flex-wrap gap-2">
        {visible.map((t) => (
          <a
            key={t.id}
            href={`#${t.id}`}
            className="min-h-11 content-center rounded-full bg-link/10 px-4 text-[0.9375rem] font-medium text-link"
          >
            {t.title}
          </a>
        ))}
      </nav>
      {visible.map((t) => (
        <section
          key={t.id}
          id={t.id}
          aria-labelledby={`${t.id}-title`}
          className="mt-12 scroll-mt-20"
        >
          <h2 id={`${t.id}-title`} className="font-display text-3xl font-bold">
            {t.title}
          </h2>
          <div className="mt-4 space-y-3">
            {t.items.map((item) => (
              <details key={item.q} className="group card px-5 py-1 open:pb-4">
                <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 font-semibold [&::-webkit-details-marker]:hidden">
                  <span>
                    {item.q}
                    {show === "all" && item.for !== "both" ? (
                      <span className="ml-2 rounded-full bg-fill px-2 py-0.5 align-middle text-[0.8125rem] font-medium text-text-muted">
                        {item.for === "pool" ? "Pool Care" : "Leak Detection"}
                      </span>
                    ) : null}
                  </span>
                  <span
                    aria-hidden="true"
                    className="text-2xl leading-none text-link transition-transform group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <p className="text-text-muted">{item.a}</p>
              </details>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
