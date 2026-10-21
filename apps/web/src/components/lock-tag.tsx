import { DayLockIcon, LockIcon, TimeLockIcon } from "./icons";
import { cx } from "./ui";

/**
 * What keeps a job in place. A lock is an icon only (owner, 2026-10-20: "Do icons"): a calendar
 * with a padlock for a day lock, a clock with a padlock for a time lock, a padlock for both;
 * read aloud and shown on hover as "Day locked", "Time locked" or "Locked". "Two techs" stays
 * words.
 */
export function LockTag({
  lock,
  className,
}: {
  lock: { label: string; kind: "day" | "time" | "both" | "two_techs" };
  className?: string;
}) {
  if (lock.kind === "two_techs")
    return (
      <span
        data-testid="lock-tag"
        className={cx("text-[0.8125rem] font-semibold text-text-muted", className)}
      >
        {lock.label}
      </span>
    );
  const Icon = lock.kind === "day" ? DayLockIcon : lock.kind === "time" ? TimeLockIcon : LockIcon;
  return (
    <span
      data-testid="lock-tag"
      title={lock.label}
      className={cx("inline-flex shrink-0 text-text-muted", className)}
    >
      <Icon className="size-[1.125rem]" />
      <span className="sr-only">{lock.label}</span>
    </span>
  );
}
