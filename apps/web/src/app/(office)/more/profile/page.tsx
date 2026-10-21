import type { Metadata } from "next";
import { homeMapStatus } from "@leakbook/core";
import { StartFromForm } from "@/components/start-from";
import { PageHeader } from "@/components/ui";
import { getOffice } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { memberStartOf } from "@/server/member-start";

export const metadata: Metadata = { title: "My Profile · Sundeck Pro" };

/**
 * More › My Profile: where your own day starts (owner, 2026-10-21: "Techs/owners need to be able
 * to set if they start their day from home or from the shop"). Techs and owners alike.
 */
export default async function MyProfilePage() {
  const office = await getOffice();
  const start = await memberStartOf(await createClient(), office.company.id, office.user.id);
  return (
    <>
      <PageHeader
        back={{ href: "/more", label: "More" }}
        title="My Profile"
        subtitle={office.user.name ?? office.user.email}
      />
      <div className="max-w-xl">
        <StartFromForm
          id="me"
          startFrom={start?.start_from === "home" ? "home" : "shop"}
          homeAddress={start?.home_address ?? ""}
          missing={homeMapStatus(start) === "missing"}
        />
      </div>
    </>
  );
}
