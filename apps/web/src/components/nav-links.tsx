"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "./ui";

export function NavLinks({
  links,
  vertical = false,
  label = "Main",
}: {
  links: { href: string; label: string }[];
  vertical?: boolean;
  label?: string;
}) {
  const path = usePathname();
  if (vertical) {
    return (
      <nav aria-label={label} className="flex flex-col gap-1">
        {links.map((l) => {
          const active = path === l.href || path.startsWith(`${l.href}/`);
          return (
            <Link
              key={l.href}
              href={l.href}
              aria-current={active ? "page" : undefined}
              className={cx(
                "min-h-11 content-center rounded-md px-3 font-medium",
                active ? "bg-navy text-paper dark:bg-surface dark:text-text" : "hover:bg-surface",
              )}
            >
              {l.label}
            </Link>
          );
        })}
      </nav>
    );
  }
  return (
    <nav aria-label={label} className="flex flex-wrap gap-1">
      {links.map((l) => {
        const active = path === l.href || path.startsWith(`${l.href}/`);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "min-h-11 content-center rounded-md px-3 font-display text-[17px] font-semibold tracking-wide",
              active ? "bg-white/15" : "hover:bg-white/10",
            )}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
