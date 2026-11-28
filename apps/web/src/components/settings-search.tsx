"use client";

import { useState } from "react";
import { SETTINGS_SEARCH_TEXT, searchSettings, settingsNoResults } from "@leakbook/core";
import { Grouped, Row } from "./ui";

/**
 * Settings with a search field at the top (owner, 2026-11-27), as iOS Settings has: typing
 * replaces the list with the pages that match, each saying which setting matched (core
 * settings-search.ts).
 */
export function SettingsSearchList({
  groups,
  initial = "",
}: {
  groups: { title: string; sections: { href: string; label: string; detail?: string }[] }[];
  /** A search to start with (Settings opened as /settings?q=deposit). */
  initial?: string;
}) {
  const [query, setQuery] = useState(initial);
  const pages = groups.flatMap((g) => g.sections);
  const keyOf = (href: string) => href.replace(/^\/settings\//, "");
  const hrefOf = new Map(pages.map((p) => [keyOf(p.href), p.href]));
  const results = searchSettings(
    query,
    pages.map((p) => keyOf(p.href)),
  );
  return (
    <div className="space-y-6">
      <div role="search" className="relative">
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-muted"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.25"
          strokeLinecap="round"
        >
          <circle cx="10.5" cy="10.5" r="6.5" />
          <path d="M15.5 15.5 20 20" />
        </svg>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={SETTINGS_SEARCH_TEXT.placeholder}
          aria-label={SETTINGS_SEARCH_TEXT.label}
          data-testid="settings-search"
          className="min-h-11 w-full min-w-0 rounded-[10px] bg-fill pr-3 pl-9 text-text placeholder:text-placeholder focus:outline-3 focus:outline-focus"
        />
      </div>
      {!query.trim() ? (
        groups.map((g) => (
          <Grouped key={g.title} title={g.title}>
            {g.sections.map((s) => (
              <Row key={s.href} href={s.href} label={s.label} detail={s.detail} />
            ))}
          </Grouped>
        ))
      ) : results.length ? (
        <Grouped>
          {results.map((r) => (
            <Row
              key={r.key}
              href={hrefOf.get(r.key) ?? `/settings/${r.key}`}
              label={r.label}
              detail={r.match ?? undefined}
            />
          ))}
        </Grouped>
      ) : (
        <p role="status" className="py-10 text-center text-text-muted">
          {settingsNoResults(query)}
        </p>
      )}
    </div>
  );
}
