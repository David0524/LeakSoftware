import Link from "next/link";
import { Logo } from "@/components/logo";
import { LightOnly } from "@/components/light-only";
import { buttonClass } from "@/components/ui";
import { CONTACT_EMAIL } from "@/lib/site";

export default function PublicLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <LightOnly />
      <header className="glass-bar sticky top-0 z-40">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-2">
          <Link
            href="/"
            aria-label="Sundeck Pro home"
            className="inline-flex min-h-11 items-center"
          >
            <Logo height={32} />
          </Link>
          <nav aria-label="Sundeck Pro" className="flex items-center gap-1">
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
              <Link href="/sign-up" className={buttonClass("secondary")}>
                Start Free Trial
              </Link>
            </span>
          </nav>
        </div>
      </header>
      <div className="flex flex-1 flex-col">{children}</div>
      <footer className="flex flex-col items-center gap-3 border-t border-border px-4 py-6 text-center text-[0.9375rem] text-text-muted">
        <p>Sundeck Pro · Field app and office for pool service and leak detection shops</p>
        <nav aria-label="About Sundeck Pro" className="flex flex-wrap justify-center gap-x-1">
          {[
            { href: "/privacy", label: "Privacy" },
            { href: "/terms", label: "Terms" },
            { href: "/security", label: "Security" },
            { href: "/status", label: "Status" },
            { href: `mailto:${CONTACT_EMAIL}`, label: `Contact Us: ${CONTACT_EMAIL}` },
          ].map((l) => (
            <a key={l.href} href={l.href} className="min-h-11 content-center px-3 text-link">
              {l.label}
            </a>
          ))}
        </nav>
      </footer>
    </>
  );
}
