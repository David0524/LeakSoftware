import type { Metadata } from "next";
import { NOTIFICATION_KINDS, notificationOn } from "@leakbook/core";
import { saveNotificationPrefs } from "@/app/actions/notifications";
import { SSwitch, SettingsForm } from "@/components/settings-forms";
import { PageHeader } from "@/components/ui";
import { getOffice } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/server/admin";

export const metadata: Metadata = { title: "Notifications · Sundeck Pro" };

/**
 * More › Notifications (owner, 2026-10-19): which kinds reach this person's phones. Everyone
 * sets their own; on unless turned off.
 */
export default async function NotificationsPage() {
  const office = await getOffice();
  const [{ data: profile }, phones] = await Promise.all([
    (await createClient())
      .from("profile")
      .select("notification_prefs")
      .eq("id", office.user.id)
      .maybeSingle(),
    // push_device is server-only: the count of this person's phones, for the line below.
    (async () => {
      const admin = adminClient();
      if (!admin) return 0;
      const { count } = await admin
        .from("push_device")
        .select("id", { count: "exact", head: true })
        .eq("user_id", office.user.id);
      return count ?? 0;
    })(),
  ]);
  const prefs = profile?.notification_prefs;
  return (
    <>
      <PageHeader back={{ href: "/more", label: "More" }} title="Notifications" />
      <div className="max-w-xl space-y-3">
        <SettingsForm action={saveNotificationPrefs} full>
          {NOTIFICATION_KINDS.map((k) => (
            <SSwitch
              key={k.key}
              label={k.label}
              name={k.key}
              defaultChecked={notificationOn(prefs, k.key)}
              hint={k.hint}
            />
          ))}
        </SettingsForm>
        <p className="px-4 text-[0.9375rem] text-text-muted sm:px-0">
          {phones === 0
            ? "Notifications go to the Sundeck Pro app on your phone. Sign in there and allow notifications."
            : `Notifications go to the Sundeck Pro app on ${phones === 1 ? "your phone" : `your ${phones} phones`}.`}
        </p>
      </div>
    </>
  );
}
