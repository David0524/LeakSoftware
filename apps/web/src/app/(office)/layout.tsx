import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { signOut, switchCompany } from "@/app/actions/auth";
import { Logo } from "@/components/logo";
import { DesktopNav, TabBar } from "@/components/nav-links";
import { ThemeToggle } from "@/components/theme-toggle";
import { accessNotice } from "@leakbook/core";
import { cx } from "@/components/ui";
import { getOffice } from "@/lib/auth";
import { getAccess, getCompany, mayMakeJobs } from "@/lib/data";
import { unreadCount } from "@/lib/messages";
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
      {/* Phones use the iOS navigation bar each page draws (PageHeader). Wider screens get a
          light bar in two rows, after Stripe's (owner, 2026-10-18): the shop and account on
          top, then the sections as tabs, which stay in view while the top row scrolls away. */}
      <header className="glass-bar sticky -top-14 z-30 max-sm:hidden">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4">
          <Link
            href="/home"
            aria-label="Sundeck Pro, Home"
            className="inline-flex min-h-11 items-center"
          >
            <Logo height={28} />
          </Link>
          <Suspense fallback={<div className="h-11 flex-1" />}>
            <AccountBar />
          </Suspense>
        </div>
        <div className="mx-auto max-w-7xl px-4">
          <Suspense fallback={<div className="h-12" />}>
            <OfficeNav />
          </Suspense>
        </div>
      </header>
      {/* Outside the header: its glass blur would make it the tab bar's positioning box. */}
      <Suspense fallback={null}>
        <PhoneTabs />
      </Suspense>
      <Suspense fallback={null}>
        <AccessBanner />
      </Suspense>
      {/* Room for the phone navigation bar above and the tab bar below. */}
      <main
        id="main"
        tabIndex={-1}
        className="mx-auto w-full max-w-7xl flex-1 px-4 pt-[calc(2.75rem+env(safe-area-inset-top))] pb-32 outline-none sm:py-8"
      >
        {children}
      </main>
    </div>
  );
}

async function PhoneTabs() {
  const office = await getOffice();
  const [company, unread] = await Promise.all([getCompany(office), unreadCount(office)]);
  return <TabBar links={officeLinks(office.isManager, company.settings, unread)} />;
}

/** Trial ending, payment failed, or read-only (M10 billing). */
async function AccessBanner() {
  const office = await getOffice();
  const access = await getAccess(office);
  // A new shop's owner finishes onboarding before anything else (owner, 2026-10-16).
  if (office.isOwner && access?.onboarded === false && onboardingAvailable()) redirect("/welcome");
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
  const [company, unread] = await Promise.all([getCompany(office), unreadCount(office)]);
  const links = officeLinks(office.isManager, company.settings, unread);
  // On a computer the Dashboard leads for owners (owner, 2026-10-16); phones keep Today first.
  const dashboard = links.find((l) => l.href === "/dashboard");
  const desktop = dashboard ? [dashboard, ...links.filter((l) => l !== dashboard)] : links;
  return <DesktopNav {...desktopNav(desktop)} />;
}

/** The top row's right side: which shop, New Job, appearance, and the account. */
async function AccountBar() {
  const office = await getOffice();
  const newJob = await mayMakeJobs(office);
  return (
    <>
      {office.companies.length > 1 ? (
        <form action={switchCompany} className="flex items-center gap-1">
          <label htmlFor="company-switch" className="sr-only">
            Company
          </label>
          <select
            id="company-switch"
            name="company"
            defaultValue={office.company.id}
            className="min-h-9 rounded-full border border-link/50 px-3 text-[0.9375rem] font-medium text-link"
          >
            {office.companies.map((c) => (
              <option key={c.id} value={c.id} className="text-text">
                {c.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="min-h-11 px-2 text-[0.9375rem] font-medium text-link hover:underline"
          >
            Switch
          </button>
        </form>
      ) : (
        <span className="truncate rounded-full border border-link/50 px-3 py-0.5 text-[0.9375rem] font-medium text-link">
          {office.company.name}
        </span>
      )}
      <div className="ml-auto flex items-center gap-1 text-[0.9375rem]">
        {/* Wider screens reach More (appearance, help, Show Tips Again) from the name. */}
        <Link
          href="/more"
          aria-label={`${office.user.name ?? office.user.email}: account and help`}
          className="hidden min-h-11 content-center px-2 font-medium text-text-muted hover:text-text md:block"
        >
          {office.user.name ?? office.user.email}
        </Link>
        <ThemeToggle />
        {/* Phones: Sign Out is on More, away from the appearance button (M11 review M10). */}
        <form action={signOut}>
          <button
            type="submit"
            className="min-h-11 px-2 font-medium text-text-muted hover:text-text"
          >
            Sign Out
          </button>
        </form>
        {newJob ? (
          <Link
            href="/jobs/new"
            aria-label="New Job"
            title="New Job"
            className="grid size-11 place-items-center rounded-full"
          >
            <span className="grid size-8 place-items-center rounded-full bg-primary text-on-primary">
              <svg
                viewBox="0 0 24 24"
                className="size-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
            </span>
          </Link>
        ) : null}
      </div>
    </>
  );
}
