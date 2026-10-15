import Link from "next/link";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { buttonClass } from "@/components/ui";
import { SUPPORT_EMAIL } from "@/lib/site";

export default function PublicLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <header className="glass-bar sticky top-0 z-40">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-2">
          <Link href="/" aria-label="Tidemark home" className="inline-flex min-h-11 items-center">
            <Logo height={32} />
          </Link>
          <nav aria-label="Tidemark" className="flex items-center gap-1">
            <Link
              href="/#field"
              className="hidden min-h-11 content-center px-3 font-medium md:block"
            >
              Features
            </Link>
            <Link
              href="/#pricing"
              className="hidden min-h-11 content-center px-3 font-medium md:block"
            >
              Pricing
            </Link>
            <Link href="/sign-in" className="min-h-11 content-center px-3 font-medium text-link">
              Sign In
            </Link>
            <span className="hidden sm:block">
              <Link href="/sign-up" className={buttonClass("primary")}>
                Start Free Trial
              </Link>
            </span>
          </nav>
        </div>
      </header>
      <div className="flex flex-1 flex-col">{children}</div>
      <footer className="flex flex-col items-center gap-3 border-t border-border py-6 text-center text-[0.9375rem] text-text-muted">
        <p>Tidemark · Field app and office for leak detection and pool service shops</p>
        <nav aria-label="About Tidemark" className="flex flex-wrap justify-center gap-x-1">
          {[
            { href: "/privacy", label: "Privacy" },
            { href: "/terms", label: "Terms" },
            { href: "/status", label: "Status" },
            { href: `mailto:${SUPPORT_EMAIL}`, label: "Support" },
          ].map((l) => (
            <a key={l.href} href={l.href} className="min-h-11 content-center px-3 text-link">
              {l.label}
            </a>
          ))}
        </nav>
        <ThemeToggle />
      </footer>
    </>
  );
}
