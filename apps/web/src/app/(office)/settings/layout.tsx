import { Suspense } from "react";
import { NavLinks } from "@/components/nav-links";
import { PageSkeleton } from "@/components/page-skeleton";
import { Notice } from "@/components/ui";
import { getOffice } from "@/lib/auth";
import { SETTINGS_SECTIONS } from "@/lib/settings-sections";

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
    <div className="grid gap-8 md:grid-cols-[200px_1fr]">
      <aside>
        <NavLinks links={SETTINGS_SECTIONS} vertical label="Settings sections" />
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
