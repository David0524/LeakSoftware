"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { REDUCE } from "./motion";

/**
 * Fades its children up once as they first scroll into view (the home page's sections). Only
 * a block still below the screen when the page opens waits for it; content already showing,
 * a page without script, and Reduce Motion never hide anything.
 */
export function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<"shown" | "waiting" | "rise">("shown");
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia(REDUCE).matches) return;
    if (el.getBoundingClientRect().top < window.innerHeight) return;
    setPhase("waiting");
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e?.isIntersecting) return;
        setPhase("rise");
        io.disconnect();
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      className={
        [className, phase === "rise" ? "lp-rise" : ""].filter(Boolean).join(" ") || undefined
      }
      style={
        phase === "waiting"
          ? { opacity: 0 }
          : phase === "rise" && delay
            ? { animationDelay: `${delay}ms` }
            : undefined
      }
    >
      {children}
    </div>
  );
}
