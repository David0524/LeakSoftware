import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AdminSidebar } from "@/components/admin/sidebar";
import { Logo } from "@/components/logo";
import { SignOutForm } from "@/components/sign-out-form";
import { getUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: { template: "%s · Sundeck Pro Admin", default: "Sundeck Pro Admin" },
  robots: { index: false, follow: false },
};

/**
 * The Admin portal: Sundeck Pro's own back office, not a shop's (owner, 2026-10-22). Desktop
 * only: a narrower window gets a message instead of the pages. A sidebar with the sections,
 * and the staff person's email and Sign Out in the toolbar.
 */
export default function StaffLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh flex-1 flex-col bg-bg">
      <div className="flex flex-1 items-center justify-center p-6 lg:hidden">
        <div className="card max-w-md p-8 text-center">
          <div className="flex justify-center">
            <Logo height={32} />
          </div>
          <h1 className="mt-6 font-display text-2xl font-extrabold">Admin Portal</h1>
          <p className="mt-2 text-text-muted">
            The admin portal is made for a computer. Open it on a screen at least 1024 pixels wide.
          </p>
          <Link href="/" className="mt-4 inline-flex min-h-11 items-center text-link">
            Sundeck Pro Home
          </Link>
        </div>
      </div>
      <div className="flex min-h-dvh flex-1 max-lg:hidden">
        <aside className="sticky top-0 flex h-dvh w-60 shrink-0 flex-col gap-6 overflow-y-auto border-r border-border bg-surface px-3 py-4">
          <Link
            href="/admin"
            aria-label="Sundeck Pro Admin, Overview"
            className="flex min-h-11 items-center gap-2 px-3"
          >
            <Logo height={24} />
            <span className="rounded-full bg-navy px-2 py-0.5 text-[0.75rem] font-bold tracking-wide text-white uppercase">
              Admin
            </span>
          </Link>
          <AdminSidebar />
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="glass-bar sticky top-0 z-30">
            <div className="flex h-14 items-center justify-end gap-3 px-8">
              <Suspense fallback={null}>
                <StaffMenu />
              </Suspense>
            </div>
          </header>
          <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-8 py-8">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}

async function StaffMenu() {
  const user = await getUser();
  return (
    <>
      {user?.email ? <span className="text-[0.9375rem] text-text-muted">{user.email}</span> : null}
      <Link href="/home" className="min-h-11 content-center px-3 text-[0.9375rem] text-link">
        My Office
      </Link>
      <SignOutForm action="/auth/sign-out" method="post">
        <button type="submit" className="min-h-11 px-3 text-[0.9375rem] font-medium text-link">
          Sign Out
        </button>
      </SignOutForm>
    </>
  );
}
