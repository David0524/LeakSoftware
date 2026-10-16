import type { Metadata } from "next";
import { cookies } from "next/headers";
import { signOut } from "@/app/actions/auth";
import { DeleteAccount } from "@/components/delete-account";
import { MapsChoice } from "@/components/maps-choice";
import { AppearanceChoice } from "@/components/theme-toggle";
import { Grouped, PageHeader, Row } from "@/components/ui";
import { getOffice } from "@/lib/auth";
import { getCompany } from "@/lib/data";
import { officeLinks } from "@/lib/nav";
import { SUPPORT_EMAIL } from "@/lib/site";

export const metadata: Metadata = { title: "More · Tidemark" };

/**
 * Phones: the sections that don't fit in the tab bar, then this device's settings, then help,
 * as iOS inset grouped lists.
 */
export default async function MorePage() {
  const office = await getOffice();
  const company = await getCompany(office);
  const rest = officeLinks(office.isOwner, company.settings).slice(4);
  const saved = (await cookies()).get("lb_maps")?.value;
  const maps = saved === "apple" || saved === "google" ? saved : "auto";
  return (
    <>
      <PageHeader title="More" subtitle={office.user.name ?? office.user.email} />
      <div className="max-w-xl space-y-6">
        <Grouped>
          {rest.map((l) => (
            <Row key={l.href} href={l.href} label={l.label} />
          ))}
        </Grouped>
        <Grouped title="On this device">
          <Row>
            <div className="min-w-0 flex-1">
              <AppearanceChoice />
            </div>
          </Row>
          <Row>
            <div className="min-w-0 flex-1">
              <MapsChoice initial={maps} />
            </div>
          </Row>
        </Grouped>
        <Grouped title="Help">
          {[
            { href: `mailto:${SUPPORT_EMAIL}`, label: "Help and Support" },
            { href: "/privacy", label: "Privacy Policy" },
            { href: "/terms", label: "Terms of Service" },
            { href: "/status", label: "System Status" },
          ].map((l) => (
            <li key={l.href}>
              {/* Plain links: mail and the public pages are outside the office app. */}
              <a
                href={l.href}
                className="flex min-h-11 items-center gap-3 px-4 py-2.5 hover:bg-text/[0.03] active:bg-text/[0.06]"
              >
                <span className="min-w-0 flex-1">{l.label}</span>
                <span
                  aria-hidden="true"
                  className="shrink-0 text-xl leading-none text-text-muted/70"
                >
                  ›
                </span>
              </a>
            </li>
          ))}
        </Grouped>
        {/* Phones: Sign Out lives here (wider screens have it in the header), on its own
            row, centered and red, as iOS draws it. */}
        <form action={signOut} className="sm:hidden">
          <ul className="grouped">
            <li>
              <button
                type="submit"
                className="flex min-h-11 w-full items-center justify-center px-4 py-2.5 text-status-fail active:bg-text/[0.06]"
              >
                Sign Out
              </button>
            </li>
          </ul>
        </form>
        <DeleteAccount />
      </div>
    </>
  );
}
