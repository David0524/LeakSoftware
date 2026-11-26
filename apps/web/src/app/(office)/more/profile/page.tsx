import type { Metadata } from "next";
import { TECH_CARD_TEXT, endAtOf, homeMapStatus } from "@leakbook/core";
import { StartFromForm } from "@/components/start-from";
import { TechPhotoPicker } from "@/components/tech-photo-picker";
import { PageHeader } from "@/components/ui";
import { getOffice } from "@/lib/auth";
import { getCompany, getTeam, signedAssetUrls } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { memberStartOf } from "@/server/member-start";

export const metadata: Metadata = { title: "My Profile · Sundeck Pro" };

/**
 * More › My Profile: where your own day starts (owner, 2026-10-21: "Techs/owners need to be able
 * to set if they start their day from home or from the shop"), and your photo for reports
 * (2026-11-26). Techs and owners alike.
 */
export default async function MyProfilePage() {
  const office = await getOffice();
  const [start, team] = await Promise.all([
    memberStartOf(await createClient(), office.company.id, office.user.id),
    getTeam(office),
  ]);
  // Tech photos, once the database has them (migration 20261022005900).
  const photosReady = "second_for" in (await getCompany(office));
  const me = team.find((m) => m.user_id === office.user.id);
  const photo = me?.photo_path ? (await signedAssetUrls([me.photo_path])).get(me.photo_path) : null;
  return (
    <>
      <PageHeader
        back={{ href: "/more", label: "More" }}
        title="My Profile"
        subtitle={office.user.name ?? office.user.email}
      />
      <div className="max-w-xl space-y-6">
        {me && photosReady ? (
          <TechPhotoPicker
            memberId={me.membership_id}
            url={photo ?? null}
            name={me.name}
            color={me.color}
            label={TECH_CARD_TEXT.myPhoto}
            footer={TECH_CARD_TEXT.myPhotoFooter}
          />
        ) : null}
        <StartFromForm
          id="me"
          startFrom={start?.start_from === "home" ? "home" : "shop"}
          endAt={endAtOf(start ?? { start_from: "shop" })}
          homeAddress={start?.home_address ?? ""}
          missing={homeMapStatus(start) === "missing"}
        />
      </div>
    </>
  );
}
