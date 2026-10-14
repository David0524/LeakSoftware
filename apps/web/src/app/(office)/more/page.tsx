import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { signOut } from "@/app/actions/auth";
import { DeleteAccount } from "@/components/delete-account";
import { MapsChoice } from "@/components/maps-choice";
import { PageHeader } from "@/components/ui";
import { getOffice } from "@/lib/auth";
import { officeLinks } from "@/lib/nav";
import { SUPPORT_EMAIL } from "@/lib/site";

export const metadata: Metadata = { title: "More · Tidemark" };

/** Phones: the sections that don't fit in the tab bar. */
export default async function MorePage() {
  const office = await getOffice();
  const rest = officeLinks(office.isOwner).slice(4);
  const saved = (await cookies()).get("lb_maps")?.value;
  const maps = saved === "apple" || saved === "google" ? saved : "auto";
  return (
    <>
      <PageHeader title="More" />
      <ul className="divide-y divide-border overflow-hidden card">
        {rest.map((l) => (
          <li key={l.href}>
            <Link
              href={l.href}
              className="flex min-h-14 items-center justify-between px-4 text-[1.0625rem] font-medium hover:bg-text/[0.04] active:bg-text/[0.06]"
            >
              {l.label}
              <span aria-hidden="true" className="text-text-muted">
                ›
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <div className="mt-6 card px-4 py-1.5">
        <MapsChoice initial={maps} />
      </div>
      <ul className="mt-6 divide-y divide-border overflow-hidden card">
        {[
          { href: `mailto:${SUPPORT_EMAIL}`, label: "Help and Support" },
          { href: "/privacy", label: "Privacy Policy" },
          { href: "/terms", label: "Terms of Service" },
          { href: "/status", label: "System Status" },
        ].map((l) => (
          <li key={l.href}>
            <a
              href={l.href}
              className="flex min-h-14 items-center justify-between px-4 text-[1.0625rem] font-medium hover:bg-text/[0.04] active:bg-text/[0.06]"
            >
              {l.label}
              <span aria-hidden="true" className="text-text-muted">
                ›
              </span>
            </a>
          </li>
        ))}
      </ul>
      <form action={signOut} className="mt-6 sm:hidden">
        <button
          type="submit"
          className="flex min-h-14 w-full items-center rounded-[1.25rem] bg-surface px-4 text-[1.0625rem] font-medium text-status-fail shadow-sm active:bg-text/[0.06]"
        >
          Sign Out
        </button>
      </form>
      <DeleteAccount />
    </>
  );
}
