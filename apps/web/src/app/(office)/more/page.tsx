import type { Metadata } from "next";
import { cookies } from "next/headers";
import { ACTIVITY_DETAIL, NOTIFICATION_KINDS, notificationOn } from "@leakbook/core";
import { signOut } from "@/app/actions/auth";
import { showTipsAgain } from "@/app/actions/walkthrough";
import { DeleteAccount } from "@/components/delete-account";
import { SignOutForm } from "@/components/sign-out-form";
import { FeatureRequest } from "@/components/feature-request";
import { MapsChoice } from "@/components/maps-choice";
import { AppearanceChoice } from "@/components/theme-toggle";
import { Grouped, PageHeader, Row } from "@/components/ui";
import { getOffice } from "@/lib/auth";
import { getCompany } from "@/lib/data";
import { officeLinks } from "@/lib/nav";
import { activityUnread } from "@/lib/activity";
import { Dot } from "@/components/nav-links";
import { createClient } from "@/lib/supabase/server";
import { CONTACT_EMAIL } from "@/lib/site";

export const metadata: Metadata = { title: "More · Sundeck Pro" };

/**
 * Phones: the sections that don't fit in the tab bar, then this device's settings, then help,
 * as iOS inset grouped lists.
 */
export default async function MorePage() {
  const office = await getOffice();
  const [company, dot] = await Promise.all([getCompany(office), activityUnread(office)]);
  const rest = officeLinks(office.isManager, company.settings, 0, dot).slice(4);
  const { data: profile } = await (
    await createClient()
  )
    .from("profile")
    .select("two_step, notification_prefs")
    .eq("id", office.user.id)
    .maybeSingle();
  const twoStep = Boolean(profile?.two_step);
  const saved = (await cookies()).get("lb_maps")?.value;
  const maps = saved === "apple" || saved === "google" ? saved : "auto";
  return (
    <>
      <PageHeader title="More" subtitle={office.user.name ?? office.user.email} />
      <div className="max-w-xl space-y-6">
        <Grouped>
          {rest.map((l) => (
            <Row
              key={l.href}
              href={l.href}
              label={l.label}
              detail={l.href === "/activity" ? ACTIVITY_DETAIL : undefined}
              value={l.dot ? <Dot label="New activity" /> : undefined}
            />
          ))}
        </Grouped>
        <Grouped title="Your account">
          <Row
            href="/more/notifications"
            label="Notifications"
            value={
              NOTIFICATION_KINDS.every((k) => notificationOn(profile?.notification_prefs, k.key))
                ? "On"
                : NOTIFICATION_KINDS.some((k) => notificationOn(profile?.notification_prefs, k.key))
                  ? "Some"
                  : "Off"
            }
            detail="Texts, new jobs, quotes, payments, reports, and Live Activity"
          />
          <Row
            href="/more/two-step"
            label="Two-Step Sign-In"
            value={twoStep ? "On" : "Off"}
            detail="A code from your phone after your password"
          />
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
            { href: `mailto:${CONTACT_EMAIL}`, label: "Contact Us", detail: CONTACT_EMAIL },
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
                <span className="min-w-0 flex-1">
                  {l.label}
                  {"detail" in l ? (
                    <span className="block text-[0.9375rem] text-text-muted">{l.detail}</span>
                  ) : null}
                </span>
                <span
                  aria-hidden="true"
                  className="shrink-0 text-xl leading-none text-text-muted/70"
                >
                  ›
                </span>
              </a>
            </li>
          ))}
          <li>
            <FeatureRequest />
          </li>
          <li>
            {/* Every screen's tip, and Getting Started, come back (owner, 2026-10-16). */}
            <form action={showTipsAgain}>
              <button
                type="submit"
                className="flex min-h-11 w-full items-center px-4 py-2.5 text-left text-link hover:bg-text/[0.03] active:bg-text/[0.06]"
              >
                Show Tips Again
              </button>
            </form>
          </li>
        </Grouped>
        {/* Phones: Sign Out lives here (wider screens have it in the header), on its own
            row, centered and red, as iOS draws it. */}
        <SignOutForm action={signOut} className="sm:hidden">
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
        </SignOutForm>
        <DeleteAccount />
      </div>
    </>
  );
}
