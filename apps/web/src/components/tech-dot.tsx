import { cx } from "./ui";

// A tech's color (owner, 2026-10-20, docs/design/2026-10-20-team-week.md section 3): a 10 pt dot
// before their name wherever a tech is named, and a 4 pt stripe on the leading edge of their
// Schedule and Week cards. The colors are brand tokens (`color.tech`, light and dark values that
// keep 3:1 on the surface), so dark mode needs nothing here. A color is never the only cue: the
// name is always beside it, so the dot is hidden from screen readers.

/** The token's CSS color for a palette key ("blue"); slate when there's none yet. */
export function techCss(color: string | null | undefined): string {
  return `var(--color-tech-${color && /^[a-z]+$/.test(color) ? color : "slate"})`;
}

export function TechDot({
  color,
  className,
}: {
  /** The tech's palette key (membership.color). */
  color: string | null | undefined;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      data-testid="tech-dot"
      data-color={color ?? undefined}
      className={cx("inline-block size-2.5 shrink-0 rounded-full", className)}
      style={{ backgroundColor: techCss(color) }}
    />
  );
}

/** The 4 pt stripe on a card's leading edge, in the tech's color (inside a positioned card). */
export function TechStripe({ color }: { color: string | null | undefined }) {
  return (
    <span
      aria-hidden="true"
      data-testid="tech-stripe"
      className="pointer-events-none absolute inset-y-0 left-0 w-1"
      style={{ backgroundColor: techCss(color) }}
    />
  );
}
