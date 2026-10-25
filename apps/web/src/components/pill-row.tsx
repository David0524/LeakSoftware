"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cx } from "./ui";

/** Once a session: the first row of pills that scrolls nudges, the rest don't. */
const NUDGED = "pill-row-nudged";

/**
 * A sideways row of pills (filters, whose schedule) that says when it scrolls (owner,
 * 2026-10-25: "The names being scrollable here isn't really intuitive since they fit perfectly.
 * Give a nudge"): while more pills are past its end, the end fades out; and the first time a
 * row that scrolls shows in a session, it slides a little way and back. No slide with Reduce
 * Motion.
 */
export function PillRow({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => {
      const more = el.scrollWidth - el.clientWidth - el.scrollLeft > 4;
      el.toggleAttribute("data-more", more);
    };
    const watch = new ResizeObserver(check);
    watch.observe(el);
    el.addEventListener("scroll", check, { passive: true });
    check();
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let seen = true;
    try {
      seen = sessionStorage.getItem(NUDGED) === "1";
    } catch {}
    // Only a row that scrolls, at its start, and only once it's on screen.
    const nudge = !still && !seen && el.scrollWidth > el.clientWidth + 4 && el.scrollLeft === 0;
    if (nudge) {
      try {
        sessionStorage.setItem(NUDGED, "1");
      } catch {}
      el.scrollTo({ left: 56, behavior: "smooth" });
      // Not cancelled on cleanup: a row left scrolled out would hide its first pills.
      window.setTimeout(() => el.scrollTo({ left: 0, behavior: "smooth" }), 500);
    }
    return () => {
      watch.disconnect();
      el.removeEventListener("scroll", check);
    };
  }, []);
  return (
    <nav
      ref={ref}
      aria-label={label}
      className={cx(
        className,
        "data-more:[mask-image:linear-gradient(to_right,black_calc(100%-2.5rem),transparent)]",
      )}
    >
      {children}
    </nav>
  );
}
