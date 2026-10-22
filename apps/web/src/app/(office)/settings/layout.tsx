import type { Metadata } from "next";
import { Suspense } from "react";
import { SettingsShellSkeleton } from "@/components/page-skeleton";
import { SettingsNav } from "@/components/settings-nav";
import { Notice } from "@/components/ui";
import { getOffice } from "@/lib/auth";
import { getCompany } from "@/lib/data";
import { settingsGroups } from "@/lib/settings-sections";

// Each section names itself; a tech (who sees only the notice below) still gets a title.
export const metadata: Metadata = { title: "Settings · Sundeck Pro" };

export default function SettingsLayout({ children }: LayoutProps<"/settings">) {
  return (
    <Suspense fallback={<SettingsShellSkeleton />}>
      <OwnersOnly>{children}</OwnersOnly>
    </Suspense>
  );
}

async function OwnersOnly({ children }: { children: React.ReactNode }) {
  const office = await getOffice();
  if (!office.isManager) {
    return (
      <div className="max-w-xl">
        <h1 className="mb-4 font-display text-3xl font-extrabold">Settings</h1>
        <Notice tone="warning">
          Settings are for owners and admins. Ask one at {office.company.name} if something needs to
          change.
        </Notice>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-8 md:grid-cols-[232px_minmax(0,1fr)]">
      {/* Phones and tablets: the sections are a grouped list on Settings itself, and each
          section's navigation bar goes back to it. Wider: a sidebar that stays in view. */}
      <aside className="min-w-0 max-md:hidden">
        <div className="sticky top-16 -ml-3 max-h-[calc(100vh-5rem)] overflow-y-auto border-r-[0.5px] border-separator pr-4 pb-4">
          <SettingsNav groups={settingsGroups((await getCompany(office)).settings)} />
        </div>
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
