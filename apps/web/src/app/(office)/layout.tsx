import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Logo, Mark } from "@/components/logo";
import { DesktopNav, TabBar } from "@/components/nav-links";
import { AccountMenu } from "@/components/account-menu";
import { BannerHost } from "@/components/top-banner";
import { SupportBanner } from "@/components/support-banner";
import { UsageTracker } from "@/components/usage-tracker";
import { InstantProvider } from "@/components/instant";
import { PullToRefresh } from "@/components/pull-to-refresh";
import { accessNotice, mustFinishSetup } from "@leakbook/core";
import { cx } from "@/components/ui";
import { getOffice } from "@/lib/auth";
import { getAccess, getCompany, mayMakeJobs } from "@/lib/data";
import { unreadCount } from "@/lib/messages";
import { activityUnread } from "@/lib/activity";
import { DesktopSearch } from "@/components/shop-search";
import { desktopNav, officeLinks } from "@/lib/nav";
import { onboardingAvailable } from "@/server/billing";

/**
 * Office shell. The header frame renders at once; everything that depends on who is signed
 * in streams in behind Suspense (cacheComponents).
 */
export default function OfficeLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-full focus:bg-surface focus:px-4 focus:py-2 focus:text-text"
      >
        Skip to Content
      </a>
      {/* Phones use the iOS navigation bar each page draws (PageHeader). Wider screens get one
          light bar that stays in view, after Stripe's (owner, 2026-10-18): the logo, the
          sections as tabs, New Job, Settings, and the account menu. */}
      <header className="glass-bar sticky top-0 z-30 max-sm:hidden">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 lg:gap-6">
          <Link
            href="/home"
            aria-label="Sundeck Pro, Home"
            className="inline-flex min-h-11 shrink-0 items-center"
          >
            <span className="max-lg:hidden">
              <Logo height={26} />
            </span>
            <span className="lg:hidden">
              <Mark height={32} />
            </span>
          </Link>
          <Suspense fallback={<div className="h-11 flex-1" />}>
            <OfficeNav />
          </Suspense>
        </div>
      </header>
      {/* Outside the header: its glass blur would make it the tab bar's positioning box. */}
      <Suspense fallback={null}>
        <PhoneTabs />
      </Suspense>
      {/* Screen time for the Admin portal's Usage (not while staff help a shop). */}
      <Suspense fallback={null}>
        <Usage />
      </Suspense>
      {/* Sundeck Pro staff helping this shop (Admin portal). */}
      <Suspense fallback={null}>
        <SupportBanner />
      </Suspense>
      <Suspense fallback={null}>
        <AccessBanner />
      </Suspense>
      {/* Results (Optimize, moves, Plan Week) as a short banner under the navigation bar. */}
      <Suspense fallback={null}>
        <BannerHost />
      </Suspense>
      {/* Pull down at the top of a list to refresh it (Home Screen app only). */}
      <Suspense fallback={null}>
        <PullToRefresh />
      </Suspense>
      {/* Room for the phone navigation bar above and the tab bar below. A page that marks
          itself data-wide-page (Schedule's Day and Week boards) uses the whole window on a
          computer, with 32 pt gutters (owner, 2026-10-21). */}
      <main
        id="main"
        tabIndex={-1}
        className="mx-auto w-full max-w-7xl flex-1 px-4 pt-[calc(2.75rem+env(safe-area-inset-top))] pb-32 outline-none sm:py-8 has-[[data-wide-page]]:max-w-none lg:has-[[data-wide-page]]:px-8"
      >
        {/* Changes show at once; the server catches up (owner, 2026-10-22). */}
        <InstantProvider>{children}</InstantProvider>
      </main>
    </div>
  );
}

async function Usage() {
  const office = await getOffice();
  return office.support ? null : <UsageTracker companyId={office.company.id} />;
}

async function PhoneTabs() {
  const office = await getOffice();
  const [company, unread, dot] = await Promise.all([
    getCompany(office),
    unreadCount(office),
    activityUnread(office),
  ]);
  return <TabBar links={officeLinks(office.isManager, company.settings, unread, dot)} />;
}

/** Trial ending, payment failed, or read-only (M10 billing). */
async function AccessBanner() {
  const office = await getOffice();
  const access = await getAccess(office);
  // A new shop's owner finishes onboarding before anything else (owner, 2026-10-16); the same
  // rule holds the owner in the iPhone and Android apps (owner, 2026-10-24).
  if (mustFinishSetup(access, office.company.role) && onboardingAvailable()) redirect("/welcome");
  const notice = access ? accessNotice(access) : null;
  if (!notice) return null;
  return (
    <div
      role={notice.tone === "error" ? "alert" : "status"}
      className={cx(
        "border-b-4 bg-surface px-4 py-3",
        notice.tone === "error" ? "border-status-fail" : "border-status-warning",
      )}
    >
      <p className="mx-auto max-w-7xl">
        {notice.text}
        {office.isManager ? (
          <>
            {" "}
            <Link href="/settings/billing" className="font-semibold text-link underline">
              Billing
            </Link>
          </>
        ) : null}
      </p>
    </div>
  );
}

async function OfficeNav() {
  const office = await getOffice();
  const [company, unread, newJob, dot] = await Promise.all([
    getCompany(office),
    unreadCount(office),
    mayMakeJobs(office),
    activityUnread(office),
  ]);
  const links = officeLinks(office.isManager, company.settings, unread, dot);
  // On a computer the Dashboard leads for owners (owner, 2026-10-16); phones keep Today first.
  const dashboard = links.find((l) => l.href === "/dashboard");
  const desktop = dashboard ? [dashboard, ...links.filter((l) => l !== dashboard)] : links;
  // The nav and the account button share one row, so the right side spaces evenly.
  return (
    <div className="flex min-w-0 flex-1 items-center gap-1">
      <DesktopNav
        {...desktopNav(desktop)}
        action={
          <>
            {/* Search across the shop, before New Job; ⌘K or Ctrl+K opens it anywhere. */}
            <DesktopSearch userId={office.user.id} />
            {newJob ? (
              <Link
                href="/jobs/new"
                className="inline-flex min-h-11 items-center"
                aria-label="New Job"
                title="New Job"
              >
                <span className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-3.5 text-[0.9375rem] font-semibold text-on-primary max-lg:px-2.5">
                  <svg
                    viewBox="0 0 24 24"
                    className="size-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.6"
                    strokeLinecap="round"
                    aria-hidden="true"
                  >
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                  <span className="max-lg:sr-only">New Job</span>
                </span>
              </Link>
            ) : null}
          </>
        }
      />
      <AccountMenu
        user={{ name: office.user.name, email: office.user.email }}
        company={{ id: office.company.id, name: office.company.name }}
        companies={office.companies.map((c) => ({ id: c.id, name: c.name }))}
      />
    </div>
  );
}
