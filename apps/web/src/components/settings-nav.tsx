"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cx } from "./ui";

/** Each settings page's symbol in the sidebar (outline, like the tab icons). */
const ICONS: Record<string, ReactNode> = {
  "/settings/company": <path d="M4 21V8l8-5 8 5v13M9 21v-6h6v6M3 21h18" />,
  "/settings/team": (
    <path d="M16 20v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM21 20v-1a4 4 0 0 0-3-3.9M16 4.1a3.5 3.5 0 0 1 0 6.8" />
  ),
  "/settings/import": <path d="M12 3v12M7 10l5 5 5-5M4 17v3h16v-3" />,
  "/settings/scheduling": <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2" />,
  "/settings/phone": (
    <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" />
  ),
  "/settings/price-book": <path d="M4 4h7l9 9-7 7-9-9zM8 8h.01" />,
  "/settings/payments": <path d="M3 6h18v12H3zM3 10h18M7 15h3" />,
  "/settings/billing": <path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h3" />,
  "/settings/components": (
    <path d="M9 6h11M9 12h11M9 18h11M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2" />
  ),
  "/settings/tests": <path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z" />,
  "/settings/severities": <path d="M12 4 2.5 20h19zM12 10v4M12 17h.01" />,
  "/settings/exclusions": <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM5.6 5.6l12.8 12.8" />,
  "/settings/reports": <path d="M14 3H6v18h12V7zM14 3v4h4M9 12h6M9 16h6" />,
};

/**
 * Wider screens: the settings pages down the side, in their groups, each with its symbol;
 * the open page in the link color (owner, 2026-10-18: "like Stripe").
 */
export function SettingsNav({
  groups,
}: {
  groups: { title: string; sections: { href: string; label: string }[] }[];
}) {
  const path = usePathname();
  return (
    <nav aria-label="Settings sections" className="space-y-5">
      {groups.map((g) => (
        <div key={g.title}>
          <h2 className="px-3 pb-1 font-sans text-[0.8125rem] font-semibold text-text-muted">
            {g.title}
          </h2>
          <ul>
            {g.sections.map((s) => {
              const active = path === s.href || path.startsWith(`${s.href}/`);
              return (
                <li key={s.href}>
                  <Link
                    href={s.href}
                    aria-current={active ? "page" : undefined}
                    className={cx(
                      "flex min-h-11 items-center gap-3 rounded-lg px-3 text-[0.9375rem] leading-tight",
                      active ? "font-semibold text-link" : "text-text hover:bg-text/[0.05]",
                    )}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      className={cx("size-5 shrink-0", active ? "text-link" : "text-text-muted")}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      {ICONS[s.href]}
                    </svg>
                    {s.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
