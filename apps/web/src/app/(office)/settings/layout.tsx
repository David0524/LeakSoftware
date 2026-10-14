import type { Metadata } from "next";
import { Suspense } from "react";
import { NavLinks } from "@/components/nav-links";
import { PageSkeleton } from "@/components/page-skeleton";
import { Notice } from "@/components/ui";
import { getOffice } from "@/lib/auth";
import { SETTINGS_SECTIONS } from "@/lib/settings-sections";

// Each section names itself; a tech (who sees only the notice below) still gets a title.
export const metadata: Metadata = { title: "Settings · Tidemark" };

export default function SettingsLayout({ children }: LayoutProps<"/settings">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <OwnersOnly>{children}</OwnersOnly>
    </Suspense>
  );
}

async function OwnersOnly({ children }: { children: React.ReactNode }) {
  const office = await getOffice();
  if (!office.isOwner) {
    return (
      <div className="max-w-xl">
        <h1 className="mb-4 font-display text-3xl font-extrabold">Settings</h1>
        <Notice tone="warning">
          Settings are for owners. Ask an owner of {office.company.name} if something needs to
          change.
        </Notice>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-8 md:grid-cols-[200px_minmax(0,1fr)]">
      <aside className="min-w-0">
        <NavLinks links={SETTINGS_SECTIONS} vertical label="Settings sections" />
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
