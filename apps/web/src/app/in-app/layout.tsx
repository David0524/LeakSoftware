import type { Metadata } from "next";
import { Logo } from "@/components/logo";
import { LightOnly } from "@/components/light-only";
import { COPYRIGHT } from "@/lib/site";

// Privacy, Terms, Security and Status as the iPhone and Android apps open them, in their in-app
// browser (owner, 2026-10-24, for App Review, guideline 3.1.3): the same text, but no menu,
// Pricing, Start Free Trial or home link, so nothing in the app leads to buying on the website.
// Links between these pages stay inside /in-app.

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function InAppLayout({ children }: LayoutProps<"/in-app">) {
  return (
    <>
      <LightOnly />
      <header className="mx-auto flex w-full max-w-2xl items-center px-4 pt-4">
        <Logo height={28} />
      </header>
      <div className="flex flex-1 flex-col">{children}</div>
      <footer className="px-4 py-6 text-center text-[0.9375rem] text-text-muted">
        <p>{COPYRIGHT}</p>
      </footer>
    </>
  );
}
