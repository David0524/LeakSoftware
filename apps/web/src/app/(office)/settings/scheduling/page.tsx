import { offersPool } from "@leakbook/core";
import type { Metadata } from "next";
import Link from "next/link";
import {
  formatAddress,
  maintenanceSettings,
  propertyLocation,
  routingSettings,
} from "@leakbook/core";
import { locatePools, locateShop } from "@/app/actions/routes";
import { MarkLocationHere } from "@/components/pool-location";
import { ActionButton, SchedulingForm } from "@/components/scheduling-settings";
import { SettingsSection } from "@/components/settings-forms";
import { PageHeader } from "@/components/ui";
import { getOffice } from "@/lib/auth";
import { getCompany } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { routingConfigured } from "@/server/routing";

export const metadata: Metadata = { title: "Scheduling and Routes · Tidemark" };

export default async function SchedulingSettingsPage() {
  const office = await getOffice();
  const supabase = await createClient();
  const [company, { count: unlocated }] = await Promise.all([
    getCompany(office),
    supabase
      .from("property")
      .select("id", { count: "exact", head: true })
      .eq("company_id", office.company.id)
      .is("deleted_at", null)
      .is("latitude", null),
  ]);
  const s = routingSettings(company.settings);
  const address = formatAddress(company as unknown as Parameters<typeof formatAddress>[0]);
  const shopAt = propertyLocation(
    company as unknown as { latitude: number | null; longitude: number | null },
  );
  const live = routingConfigured();

  return (
    <>
      <PageHeader
        back={{ href: "/settings", label: "Settings" }}
        title="Scheduling and Routes"
        subtitle="Every tech’s route starts and ends at the shop."
      />
      <div className="max-w-2xl space-y-6">
        <SettingsSection title="Working day">
          <SchedulingForm
            pool={offersPool(company.settings)}
            defaults={{
              dayStart: s.dayStart,
              dayEnd: s.dayEnd,
              windowMin: s.windowMin,
              jobHours: String(s.jobMinutes / 60),
              workDays: s.workDays,
              visitMinutes: maintenanceSettings(company.settings).visitMinutes,
              weeksAhead: maintenanceSettings(company.settings).weeksAhead,
            }}
          />
        </SettingsSection>

        <SettingsSection title="Shop location" titleId="shop-location" boxed>
          <p className="font-semibold">{address || "No address yet."}</p>
          <p className="text-[0.9375rem] text-text-muted">
            {shopAt
              ? company.geocoded_address === address
                ? "On the map."
                : "On the map, from an earlier address or the shop’s GPS."
              : "Not on the map yet, so routes can’t count the drive from the shop."}{" "}
            <Link href="/settings/company" className="text-link underline">
              Change the address
            </Link>
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {live ? (
              <ActionButton action={locateShop} label="Find From Address" busyLabel="Finding…" />
            ) : null}
            <MarkLocationHere target="shop" label="Use My Location (at the Shop)" />
          </div>
        </SettingsSection>

        <SettingsSection title="Drive times" boxed>
          <p>
            {live
              ? "Drive times come from road maps (Mapbox) and are kept for a day."
              : "Drive times are estimated from the distance between pools. Road drive times turn on when Tidemark’s routing service is connected."}
          </p>
          <p className="mt-2 text-[0.9375rem] text-text-muted">
            {unlocated
              ? `${unlocated} ${unlocated === 1 ? "pool has" : "pools have"} no map location yet.`
              : "Every pool is on the map."}{" "}
            A tech can mark a pool exactly with Mark Location Here on the job page.
          </p>
          {live && unlocated ? (
            <div className="mt-3">
              <ActionButton action={locatePools} label="Find Pool Locations" busyLabel="Finding…" />
            </div>
          ) : null}
        </SettingsSection>
      </div>
    </>
  );
}
