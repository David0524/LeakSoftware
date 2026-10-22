"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";

const SECTIONS: { title?: string; links: { href: string; label: string }[] }[] = [
  {
    links: [
      { href: "/admin", label: "Overview" },
      { href: "/admin/shops", label: "Shops" },
      { href: "/admin/people", label: "People" },
      { href: "/admin/finances", label: "Finances" },
    ],
  },
  {
    title: "Help",
    links: [
      { href: "/admin/support", label: "Support" },
      { href: "/admin/health", label: "Health" },
    ],
  },
  {
    title: "Growth",
    links: [
      { href: "/admin/leads", label: "Leads" },
      { href: "/admin/requests", label: "Feature Requests" },
      { href: "/admin/import", label: "Import for a Shop" },
    ],
  },
  {
    title: "Records",
    links: [{ href: "/admin/activity", label: "Activity Log" }],
  },
];

/** The sidebar with the current section highlighted. */
export function CurrentSidebar() {
  return <AdminSidebar path={usePathname()} />;
}

/** The portal's sidebar (sidebars.md): the sections, the current one highlighted. */
export function AdminSidebar({ path }: { path: string | null }) {
  const current = (href: string) =>
    path !== null &&
    (href === "/admin" ? path === "/admin" : path === href || path.startsWith(`${href}/`));
  return (
    <nav aria-label="Admin" className="flex flex-col gap-5">
      {SECTIONS.map((s, i) => (
        <div key={i}>
          {s.title ? (
            <p className="mb-1 px-3 text-[0.8125rem] font-semibold text-text-muted">{s.title}</p>
          ) : null}
          <ul className="flex flex-col gap-0.5">
            {s.links.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  aria-current={current(l.href) ? "page" : undefined}
                  className={cx(
                    "flex min-h-10 items-center rounded-lg px-3 text-[0.9375rem] font-medium transition-colors",
                    current(l.href) ? "bg-link/12 text-link" : "text-text hover:bg-text/[0.05]",
                  )}
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
