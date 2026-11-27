import type { Metadata } from "next";
import { formatPhone, isManagerRole, onMyWayVia, toE164 } from "@leakbook/core";
import { cancelNumber, saveLine, saveMyPhone } from "@/app/actions/texting";
import { OnMyWayForm } from "@/components/on-my-way-form";
import { EditBusiness, NumberSetup } from "@/components/phone-settings";
import {
  SField,
  SSwitch,
  STextArea,
  SettingsFields,
  SettingsForm,
  SettingsSection,
} from "@/components/settings-forms";
import { Checkbox, Notice, PageHeader } from "@/components/ui";
import { getOffice } from "@/lib/auth";
import { getCompany, getTeam } from "@/lib/data";
import { getLine, myPhone } from "@/lib/messages";
import { createClient } from "@/lib/supabase/server";
import { phoneConfigured } from "@/server/phone-line";
import { currentRegistration, registrationView } from "@/server/texting-registration";

export const metadata: Metadata = { title: "Phone and Texting · Sundeck Pro" };

/**
 * The company number (owner, 2026-10-16): customers text and call one number the whole team
 * shares. Calls ring the chosen people's own phones in working hours, then go to voicemail.
 */
export default async function PhoneSettingsPage() {
  const office = await getOffice();
  const supabase = await createClient();
  const [line, team, mine, company] = await Promise.all([
    getLine(office),
    getTeam(office),
    myPhone(office),
    getCompany(office),
  ]);
  const registration = registrationView(
    await currentRegistration(supabase, office.company.id),
    line?.number ?? null,
  );
  const active = team.filter((t) => t.status === "active");
  const { data: profiles } = await supabase
    .from("profile")
    .select("id, phone")
    .in(
      "id",
      active.map((t) => t.user_id),
    );
  const phones = new Map((profiles ?? []).map((p) => [p.id as string, p.phone as string | null]));
  // Nobody chosen: the owners' and admins' phones ring.
  const rings = (id: string, role: string) =>
    line?.ring_user_ids.length ? line.ring_user_ids.includes(id) : isManagerRole(role);

  return (
    <>
      <PageHeader back={{ href: "/settings", label: "Settings" }} title="Phone and Texting" />
      <div className="max-w-2xl space-y-6">
        {!phoneConfigured() ? (
          <Notice tone="info">Texting isn’t switched on for Sundeck Pro yet.</Notice>
        ) : null}
        {line?.status === "active" || registration ? (
          <SettingsSection title="Company number" boxed>
            {line ? (
              <p className="text-[1.375rem] font-semibold">{formatPhone(line.number)}</p>
            ) : null}
            {line?.status === "active" ? (
              <p className="mt-1 text-text-muted">Working. Texts and calls show up in Messages.</p>
            ) : registration ? (
              <div className="mt-2 space-y-2">
                <p className="font-semibold">{registration.title}</p>
                <p className="text-text-muted">{registration.detail}</p>
              </div>
            ) : null}
            {registration?.stage === "needs_changes" ? (
              <div className="mt-4">
                <EditBusiness saved={registration.business} einLast4={registration.ein_last4} />
              </div>
            ) : null}
            {line?.status !== "active" ? (
              <div className="mt-4">
                <SettingsForm
                  action={cancelNumber}
                  submit="Cancel Setup"
                  danger
                  confirm="Stop setting up this number?"
                />
              </div>
            ) : null}
          </SettingsSection>
        ) : (
          // A number entered before registrations (still pending): Use My Own Number, filled in.
          <NumberSetup ownNumber={line ? formatPhone(line.number) : undefined} />
        )}

        {line ? (
          <SettingsSection title="Texts and calls">
            <SettingsForm action={saveLine}>
              <SettingsFields labelWidth="8rem">
                <SSwitch label="Photos in texts" name="pictures" defaultChecked={line.pictures} />
                <STextArea
                  label="Voicemail greeting"
                  name="voicemail_greeting"
                  rows={3}
                  maxLength={400}
                  defaultValue={line.voicemail_greeting ?? ""}
                  placeholder={`Thanks for calling ${office.company.name}. We can’t take your call right now. Leave a message and we’ll call you back.`}
                />
              </SettingsFields>
              <fieldset>
                <legend className="mb-1 font-medium">Calls ring</legend>
                <p className="mb-2 text-[0.9375rem] text-text-muted">
                  In working hours (Scheduling and Routes) these phones ring at once and the first
                  to answer gets the call. After hours, or when nobody answers, callers leave a
                  voicemail.
                </p>
                <div className="grouped px-4">
                  {active.map((t) => {
                    const phone = toE164(phones.get(t.user_id));
                    return (
                      <Checkbox
                        key={t.user_id}
                        name="ring"
                        value={t.user_id}
                        defaultChecked={rings(t.user_id, t.role)}
                        label={`${t.name} · ${phone ? formatPhone(phone) : "no mobile number yet"}`}
                      />
                    );
                  })}
                </div>
              </fieldset>
            </SettingsForm>
          </SettingsSection>
        ) : null}

        <SettingsSection title="On My Way">
          <OnMyWayForm via={onMyWayVia(company.settings)} />
        </SettingsSection>

        <SettingsSection title="Your mobile number">
          <SettingsForm action={saveMyPhone}>
            <SettingsFields labelWidth="6rem">
              <SField
                label="Mobile"
                name="phone"
                type="tel"
                autoComplete="tel"
                placeholder="(480) 555-0100"
                defaultValue={mine ? formatPhone(toE164(mine) ?? mine) : ""}
                hint="Calls you place ring here first. Customers never see this number."
              />
            </SettingsFields>
          </SettingsForm>
        </SettingsSection>
      </div>
    </>
  );
}
