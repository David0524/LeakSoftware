"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cx } from "@/components/ui";

const ITEMS = [
  { href: "/manual/pool-care", label: "Pool Care Manual", detail: "For pool service shops" },
  {
    href: "/manual/leak-detection",
    label: "Leak Detection Manual",
    detail: "For leak detection shops",
  },
  { href: "/faq", label: "FAQ", detail: "Short answers" },
];

/**
 * Help in the public site's bar (owner, 2026-11-16: "Add the manuals and FAQ pages to the top
 * bar … Or maybe 'help'"): a pull-down like the office's More menu. Closes on a choice, a
 * click outside, or Escape.
 */
export function HelpMenu() {
  const path = usePathname();
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === path;
  const box = useRef<HTMLDivElement>(null);
  const active = path.startsWith("/manual") || path === "/faq";

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpenOn(null);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenOn(null);
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls="help-menu"
        onClick={() => setOpenOn(open ? null : path)}
        className={cx(
          "inline-flex min-h-11 items-center gap-1 px-3 font-medium",
          active && "text-link",
        )}
      >
        Help
        <svg
          viewBox="0 0 24 24"
          className={cx("size-4 transition-transform", open && "rotate-180")}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open ? (
        <ul
          id="help-menu"
          aria-label="Help"
          className="absolute top-full right-0 z-50 mt-1 w-64 overflow-hidden rounded-xl bg-surface py-1 text-text shadow-lg ring-1 ring-black/10 md:right-auto md:left-0"
        >
          {ITEMS.map((i) => (
            <li key={i.href}>
              <Link
                href={i.href}
                aria-current={path === i.href ? "page" : undefined}
                onClick={() => setOpenOn(null)}
                className={cx(
                  "flex min-h-11 flex-col justify-center px-4 py-2",
                  path === i.href ? "text-link" : "hover:bg-text/[0.05]",
                )}
              >
                <span className="text-[1.0625rem] font-semibold">{i.label}</span>
                <span className="text-[0.9375rem] text-text-muted">{i.detail}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
