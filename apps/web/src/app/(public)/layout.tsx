import Link from "next/link";
import { Logo } from "@/components/logo";

export default function PublicLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/" aria-label="LeakBook home">
            <Logo />
          </Link>
          <nav className="flex items-center gap-2">
            <Link href="/sign-in" className="min-h-11 content-center px-3 font-medium text-link">
              Sign In
            </Link>
            <Link
              href="/sign-up"
              className="hidden min-h-11 content-center rounded-md border-2 border-text px-4 font-display font-bold sm:block"
            >
              Start Free Trial
            </Link>
          </nav>
        </div>
      </header>
      <div className="flex flex-1 flex-col">{children}</div>
      <footer className="border-t border-border py-6 text-center text-[15px] text-text-muted">
        LeakBook · Field app and office for pool leak detection shops
      </footer>
    </>
  );
}
