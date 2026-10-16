import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { signOut, switchCompany } from "@/app/actions/auth";
import { Logo } from "@/components/logo";
import { NavLinks, TabBar } from "@/components/nav-links";
import { ThemeToggle } from "@/components/theme-toggle";
import { accessNotice } from "@leakbook/core";
import { cx } from "@/components/ui";
import { getOffice } from "@/lib/auth";
import { getAccess, getCompany } from "@/lib/data";
import { unreadCount } from "@/lib/messages";
import { officeLinks } from "@/lib/nav";
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
      {/* Phones use the iOS navigation bar each page draws (PageHeader); the brand bar, with
          the desktop navigation, is for wider screens. */}
      <header className="glass-brand sticky top-0 z-30 text-on-header max-sm:hidden">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2">
          <Link
            href="/home"
            aria-label="Tidemark, Home"
            className="inline-flex min-h-11 items-center"
          >
            <Logo height={30} onDark />
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
  return <TabBar links={officeLinks(office.isOwner, company.settings, unread)} />;
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
        {office.isOwner ? (
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
  const links = officeLinks(office.isOwner, company.settings, unread);
  // On a computer the Dashboard leads for owners (owner, 2026-10-16); phones keep Today first.
  const dashboard = links.find((l) => l.href === "/dashboard");
  const desktop = dashboard ? [dashboard, ...links.filter((l) => l !== dashboard)] : links;
  return (
    <>
      <NavLinks links={desktop} className="hidden sm:flex" />
      <div className="ml-auto flex items-center gap-3 text-[0.9375rem]">
        {office.companies.length > 1 ? (
          <form action={switchCompany} className="flex items-center gap-2">
            <label htmlFor="company-switch" className="sr-only">
              Company
            </label>
            <select
              id="company-switch"
              name="company"
              defaultValue={office.company.id}
              className="min-h-11 rounded-md bg-white/10 px-2 text-on-header"
            >
              {office.companies.map((c) => (
                <option key={c.id} value={c.id} className="text-text">
                  {c.name}
                </option>
              ))}
            </select>
            <button type="submit" className="min-h-11 px-2 underline">
              Switch
            </button>
          </form>
        ) : (
          <span className="hidden font-medium sm:inline">{office.company.name}</span>
        )}
        {/* Wider screens reach More (appearance, help, Show Tips Again) from the name. */}
        <Link
          href="/more"
          aria-label={`${office.user.name ?? office.user.email}: account and help`}
          className="hidden min-h-11 content-center text-neutral-300 underline-offset-4 hover:underline md:block"
        >
          {office.user.name ?? office.user.email}
        </Link>
        <ThemeToggle onHeader />
        {/* Phones: Sign Out is on More, away from the appearance button (M11 review M10). */}
        <form action={signOut} className="hidden sm:block">
          <button
            type="submit"
            className="min-h-11 px-2 font-medium underline-offset-4 hover:underline"
          >
            Sign Out
          </button>
        </form>
      </div>
    </>
  );
}
