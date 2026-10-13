import Link from "next/link";
import { Suspense } from "react";
import { signOut, switchCompany } from "@/app/actions/auth";
import { Logo } from "@/components/logo";
import { NavLinks, TabBar } from "@/components/nav-links";
import { ThemeToggle } from "@/components/theme-toggle";
import { getOffice } from "@/lib/auth";

/**
 * Office shell. The header frame renders at once; everything that depends on who is signed
 * in streams in behind Suspense (cacheComponents).
 */
export default function OfficeLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="bg-header text-on-header">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2">
          <Link href="/jobs" aria-label="Tidemark jobs" className="py-1">
            <Logo height={30} onDark />
          </Link>
          <Suspense fallback={<div className="h-11 flex-1" />}>
            <OfficeNav />
          </Suspense>
        </div>
      </header>
      {/* Room for the phone tab bar. */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 pt-6 pb-24 sm:py-8">{children}</main>
    </div>
  );
}

async function OfficeNav() {
  const office = await getOffice();
  const links = [
    { href: "/jobs", label: "Jobs" },
    { href: "/schedule", label: "Schedule" },
    { href: "/customers", label: "Customers" },
    { href: "/invoices", label: "Invoices" },
    ...(office.isOwner ? [{ href: "/settings", label: "Settings" }] : []),
  ];
  return (
    <>
      <NavLinks links={links} className="hidden sm:flex" />
      <TabBar links={links} />
      <div className="ml-auto flex items-center gap-3 text-[15px]">
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
        <span className="hidden text-neutral-300 md:inline">
          {office.user.name ?? office.user.email}
        </span>
        <ThemeToggle onHeader />
        <form action={signOut}>
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
