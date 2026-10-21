"use client";

import { useRouter } from "next/navigation";

/**
 * A list's sort order as a labeled menu that applies as soon as it's chosen (Invoices, owner
 * 2026-10-20). Without JavaScript, the form's Sort button applies it.
 */
export function SortMenu({
  options,
  value,
  hrefFor,
}: {
  options: { key: string; label: string }[];
  value: string;
  /** The page's address with this sort. */
  hrefFor: Record<string, string>;
}) {
  const router = useRouter();
  // Large text: the menu narrows to the column rather than pushing the page sideways.
  return (
    <label className="flex max-w-full shrink-0 items-center gap-2 text-[0.9375rem] text-text-muted">
      Sort
      <select
        name="sort"
        // Named "Sort" alone, not "Sort" plus every option's text.
        aria-label="Sort"
        value={value}
        onChange={(e) => router.push(hrefFor[e.target.value] ?? "")}
        className="min-h-11 min-w-0 rounded-[10px] border border-control-border bg-surface px-3 text-[1.0625rem] text-text"
      >
        {options.map((o) => (
          <option key={o.key} value={o.key}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
