"use client";

import { useState } from "react";
import type { HowToGroup } from "./howto";

/**
 * "How do I…?": every task in the manual in plain words, linked to where it's shown (owner,
 * 2026-11-16). On the web a search box narrows the list as you type; in the PDF each task
 * carries its page number (scripts/build-manuals.mjs fills them in).
 */
export function HowToIndex({ groups }: { groups: HowToGroup[] }) {
  const [query, setQuery] = useState("");
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = groups
    .map((g) => ({
      ...g,
      items: g.items.filter((i) => words.every((w) => i.task.toLowerCase().includes(w))),
    }))
    .filter((g) => g.items.length > 0);
  return (
    <section id="how-do-i" className="m-howto" aria-labelledby="how-do-i-title">
      <h2 id="how-do-i-title" className="m-contents-title">
        How do I…?
      </h2>
      <p className="m-howto-lede">
        The story runs in order. When you need one thing, find it here.
      </p>
      <div className="m-howto-search m-web-only">
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="m20 20-4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search tasks: payment, pin, schedule…"
          aria-label="Search tasks"
        />
      </div>
      <div className="m-howto-groups">
        {shown.map((g) => (
          <div key={g.title} className="m-howto-group">
            <p className="m-contents-part">{g.title}</p>
            <ul>
              {g.items.map((i) => (
                <li key={i.task + i.to}>
                  <a href={`#${i.to}`}>
                    <span>{i.task}</span>
                    <span className="m-contents-page" data-toc-page={i.to} />
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className="m-howto-empty">
          Nothing matches “{query}”. Try another word, or see the questions at the back.
        </p>
      ) : null}
    </section>
  );
}
