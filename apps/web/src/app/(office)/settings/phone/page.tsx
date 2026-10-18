import type { Metadata } from "next";
import { formatPhone, onMyWayVia, toE164 } from "@leakbook/core";
import { cancelNumber, keepNumber, saveLine, saveMyPhone } from "@/app/actions/texting";
import { OnMyWayForm } from "@/components/on-my-way-form";
import { NumberPicker } from "@/components/phone-settings";
import {
  SField,
  SSwitch,
  STextArea,
  SettingsFields,
  SettingsForm,
  SettingsSection,
} from "@/components/settings-forms";
import { Checkbox, PageHeader } from "@/components/ui";
import { getOffice } from "@/lib/auth";
import { getCompany, getTeam } from "@/lib/data";
import { getLine, myPhone } from "@/lib/messages";
import { createClient } from "@/lib/supabase/server";
import { twilioConfigured } from "@/server/twilio";

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
  const active = team.filter((t) => t.status === "active");
  const { data: profiles } = await supabase
    .from("profile")
    .select("id, phone")
    .in(
      "id",
      active.map((t) => t.user_id),
    );
  const phones = new Map((profiles ?? []).map((p) => [p.id as string, p.phone as string | null]));
  // Nobody chosen: the owners' phones ring.
  const rings = (id: string, role: string) =>
    line?.ring_user_ids.length ? line.ring_user_ids.includes(id) : role === "owner";

  return (
    <>
      <PageHeader
        back={{ href: "/settings", label: "Settings" }}
        title="Phone and Texting"
        subtitle="Text and call customers from one company number the whole team shares."
      />
      <div className="max-w-2xl space-y-6">
        {!twilioConfigured() ? (
          <p className="rounded-2xl bg-status-info/12 px-4 py-3">
            Demo: texting isn’t connected on this server, so numbers are made up and texts are saved
            without being sent.
          </p>
        ) : null}

        {line ? (
          <SettingsSection title="Company number" boxed>
            <p className="text-[1.375rem] font-semibold">{formatPhone(line.number)}</p>
            <p className="mt-1 text-text-muted">
              {line.status === "active"
                ? "Working. Texts and calls show up in Messages."
                : "Your own number is being set up for texting. It usually takes a few days."}
            </p>
            {line.status === "pending" ? (
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
          <>
            <SettingsSection title="Get a new number" boxed>
              <p className="mb-4 text-text-muted">
                A local number that texts, sends photos, and takes calls. Included with Sundeck Pro.
              </p>
              <NumberPicker />
            </SettingsSection>
            <SettingsSection title="Or use your shop’s number">
              <SettingsForm action={keepNumber} submit="Set Up My Number">
                <SettingsFields labelWidth="6rem">
                  <SField
                    label="Number"
                    name="number"
                    type="tel"
                    autoComplete="off"
                    placeholder="(480) 555-0100"
                    required
                    hint="Sundeck Pro registers it for texting. It takes a few days."
                  />
                </SettingsFields>
              </SettingsForm>
            </SettingsSection>
          </>
        )}

        {line ? (
          <SettingsSection title="Texts and calls">
            <SettingsForm action={saveLine} primary>
              <SettingsFields labelWidth="8rem">
                <SSwitch
                  label="Photos in texts"
                  name="pictures"
                  defaultChecked={line.pictures}
                  hint="Send and receive pictures (MMS)."
                />
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
                hint="Calls you place ring here first, then connect from the company number. Each person adds their own on the phone app or here."
              />
            </SettingsFields>
          </SettingsForm>
        </SettingsSection>
      </div>
    </>
  );
}
