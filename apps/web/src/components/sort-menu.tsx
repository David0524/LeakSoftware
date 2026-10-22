"use client";

import { useRouter } from "next/navigation";
import { cx } from "./ui";

/**
 * A list's sort order as a labeled menu that applies as soon as it's chosen (Invoices, owner
 * 2026-10-20). Without JavaScript, the form's Sort button applies it. The Type menu on Jobs and
 * Activity (owner, 2026-10-22) is the same control with its own `label` and `name`.
 */
export function SortMenu({
  options,
  value,
  hrefFor,
  label = "Sort",
  name = "sort",
  compact = false,
}: {
  options: { key: string; label: string }[];
  value: string;
  /** The page's address with this choice. */
  hrefFor: Record<string, string>;
  /** The menu's visible name, which is also its accessible name. */
  label?: string;
  /** The form field's name (the address's parameter). */
  name?: string;
  /**
   * Two menus side by side on a phone (Jobs: Type and Sort): the words go to screen readers
   * only and the menus share the row, so both fit on one line.
   */
  compact?: boolean;
}) {
  const router = useRouter();
  // Large text: the menu narrows to the column rather than pushing the page sideways.
  return (
    <label
      className={cx(
        "flex max-w-full shrink-0 items-center gap-2 text-[0.9375rem] text-text-muted",
        compact && "max-sm:min-w-0 max-sm:flex-1 max-sm:shrink",
      )}
    >
      <span className={compact ? "max-sm:sr-only" : undefined}>{label}</span>
      <select
        name={name}
        // Named "Sort" alone, not "Sort" plus every option's text.
        aria-label={label}
        value={value}
        onChange={(e) => router.push(hrefFor[e.target.value] ?? "")}
        className={cx(
          "min-h-11 min-w-0 rounded-[10px] border border-control-border bg-surface px-3 text-[1.0625rem] text-text",
          compact && "max-sm:w-full",
        )}
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
