import Link from "next/link";
import { Logo } from "@/components/logo";

/** Tidemark staff pages: Tidemark's own tools, not a shop's office. */
export default function StaffLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh flex-1 flex-col bg-bg">
      <header className="glass-bar sticky top-0 z-30">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-2">
          <Link href="/" aria-label="Tidemark home" className="inline-flex min-h-11 items-center">
            <Logo height={28} />
          </Link>
          <span className="text-[0.9375rem] font-semibold text-text-muted">Staff</span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
