import { NOT_ON_MAP } from "@leakbook/core";
import { cx } from "./ui";

/**
 * A pool whose address wasn't found on the map (owner, 2026-10-20: "we need an indicator for
 * when address doesn't register"), as a warning row in its Pool group.
 */
export function NotOnMapRow() {
  return (
    <li className="flex gap-3 px-4 py-3" data-testid="not-on-map">
      <WarningIcon className="mt-0.5 size-5 shrink-0 text-status-warning" />
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{NOT_ON_MAP.title}</span>
        <span className="block text-[0.9375rem] text-text-muted">{NOT_ON_MAP.detail}</span>
      </span>
    </li>
  );
}

/** The short form beside a stop or a pool: an icon and "Not on map". */
export function NotOnMapTag({ className }: { className?: string }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 text-[0.8125rem] font-semibold text-status-warning",
        className,
      )}
      title={NOT_ON_MAP.title}
    >
      <WarningIcon className="size-4 shrink-0" />
      {NOT_ON_MAP.short}
    </span>
  );
}

function WarningIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3l9.5 17h-19z" />
      <path d="M12 10v4.5M12 17.5v.01" />
    </svg>
  );
}
