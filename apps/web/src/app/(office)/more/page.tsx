import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { getOffice } from "@/lib/auth";
import { officeLinks } from "@/lib/nav";

export const metadata: Metadata = { title: "More · Tidemark" };

/** Phones: the sections that don't fit in the tab bar. */
export default async function MorePage() {
  const office = await getOffice();
  const rest = officeLinks(office.isOwner).slice(4);
  return (
    <>
      <PageHeader title="More" />
      <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
        {rest.map((l) => (
          <li key={l.href}>
            <Link
              href={l.href}
              className="flex min-h-14 items-center justify-between px-4 text-[17px] font-medium"
            >
              {l.label}
              <span aria-hidden="true" className="text-text-muted">
                ›
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
