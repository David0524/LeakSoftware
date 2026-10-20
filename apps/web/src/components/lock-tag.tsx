import { LockIcon } from "./icons";
import { cx } from "./ui";

/** What keeps a job in place, with a padlock for a lock ("Day locked"). */
export function LockTag({
  lock,
  className,
}: {
  lock: { label: string; icon: boolean };
  className?: string;
}) {
  return (
    <span
      data-testid="lock-tag"
      className={cx(
        "inline-flex items-center gap-1 text-[0.8125rem] font-semibold text-text-muted",
        className,
      )}
    >
      {lock.icon ? <LockIcon className="size-3.5 shrink-0" /> : null}
      {lock.label}
    </span>
  );
}
