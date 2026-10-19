import type { Metadata } from "next";
import { inviteMember, revokeInvite, updateMember } from "@/app/actions/settings";
import {
  assignableRoles,
  canMakeJobs,
  requiresFinishPhoto,
  requiresFinishedChecklist,
  roleLabel,
  seesAllJobs,
} from "@leakbook/core";
import { CompleteJobForm, JobVisibilityForm } from "@/components/job-visibility";
import {
  CopyLink,
  SField,
  SSelect,
  SettingsFields,
  SettingsForm,
  SettingsSection,
} from "@/components/settings-forms";
import {
  SettingsAddRow,
  SettingsListPage,
  SheetDanger,
  SheetRow,
} from "@/components/settings-list";
import { Grouped } from "@/components/ui";
import { OWNER_ONLY, getOffice } from "@/lib/auth";
import { RoleChoice } from "@/components/role-choice";
import { Banner } from "@/components/doc-ui";
import { getCompany, getTeam } from "@/lib/data";
import { siteOrigin } from "@/lib/origin";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Team · Sundeck Pro" };

interface Invite {
  id: string;
  email: string;
  role: string;
  token: string;
  expires_at: string;
}

export default async function TeamSettingsPage() {
  const office = await getOffice();
  const supabase = await createClient();
  const [team, { data: invites }, origin, company] = await Promise.all([
    getTeam(office),
    supabase
      .from("invite")
      .select("id, email, role, token, expires_at")
      .eq("company_id", office.company.id)
      .is("accepted_at", null)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false }),
    siteOrigin(),
    getCompany(office),
  ]);
  const open = (invites ?? []) as Invite[];

  // Owners give any role; admins invite techs and turn people off and on (owner, 2026-10-18).
  const myRole = office.isOwner ? "owner" : "admin";
  const roles = assignableRoles(myRole);

  return (
    <SettingsListPage
      title="Team"
      subtitle="Techs run jobs on the phone. Admins run the office. Owners also handle billing, payments setup, and roles."
      add={{
        label: "Invite Someone",
        // Under the open invites, where the new one appears (owner, 2026-10-16).
        inList: true,
        form: (
          <SettingsForm action={inviteMember} submit="Create Invite" primary full>
            <SettingsFields labelWidth="4.5rem">
              <SField label="Email" name="email" type="email" autoComplete="off" required />
            </SettingsFields>
            <div className="mt-4 px-4 sm:px-0">
              <RoleChoice roles={roles} initial="tech" id="invite-role" />
            </div>
          </SettingsForm>
        ),
      }}
    >
      <SettingsSection title="What techs can do">
        {/* A shop security setting: owners only (owner, 2026-10-18). */}
        {office.isOwner ? (
          <JobVisibilityForm
            seesAll={seesAllJobs("tech", company.settings)}
            makesJobs={canMakeJobs("tech", company.settings)}
          />
        ) : (
          <div className="space-y-2 px-4 sm:px-0">
            <p>
              Techs see{" "}
              {seesAllJobs("tech", company.settings) ? "every job" : "only their own jobs"} and{" "}
              {canMakeJobs("tech", company.settings) ? "can" : "can’t"} make new jobs.
            </p>
            <Banner tone="info">{OWNER_ONLY}</Banner>
          </div>
        )}
      </SettingsSection>

      <SettingsSection title="Completing a job">
        {office.isManager ? (
          <CompleteJobForm
            checklist={requiresFinishedChecklist(company.settings)}
            photo={requiresFinishPhoto(company.settings)}
          />
        ) : null}
      </SettingsSection>

      <Grouped
        title="Open invites"
        footer={
          open.length
            ? "Send the link by text or email. It works once, for that email address, for 14 days."
            : "No open invites."
        }
      >
        {open.map((i) => (
          <SheetRow
            key={i.id}
            testId="invite"
            title={i.email}
            label={<span className="break-all">{i.email}</span>}
            value={roleLabel(i.role)}
          >
            <div className="space-y-2">
              <CopyLink url={`${origin}/invite/${i.token}`} />
              <p className="text-[0.9375rem] text-text-muted">
                Send the link by text or email. It works once, for that email address, for 14 days.
              </p>
            </div>
            {i.role !== "tech" && !office.isOwner ? null : (
              <SheetDanger>
                <SettingsForm
                  action={revokeInvite}
                  submit="Revoke Invite"
                  danger
                  full
                  confirm="Revoke this invite? The link will stop working."
                >
                  <input type="hidden" name="id" value={i.id} />
                </SettingsForm>
              </SheetDanger>
            )}
          </SheetRow>
        ))}
        <SettingsAddRow label="Invite Someone" />
      </Grouped>

      <Grouped title="People">
        {team.map((m) => (
          <SheetRow
            key={m.membership_id}
            title={m.name}
            label={
              <>
                {m.name}
                {m.user_id === office.user.id ? (
                  <span className="text-text-muted"> (you)</span>
                ) : null}
              </>
            }
            detail={m.email ? <span className="break-all">{m.email}</span> : undefined}
            value={roleLabel(m.role) + (m.status === "disabled" ? " · Turned off" : "")}
          >
            <SettingsForm action={updateMember} primary full>
              <input type="hidden" name="id" value={m.membership_id} />
              {m.email ? (
                <p className="mb-4 px-4 text-[0.9375rem] break-all text-text-muted sm:px-0">
                  {m.email}
                </p>
              ) : null}
              <div className="mb-4 px-4 sm:px-0">
                <RoleChoice
                  roles={roles}
                  initial={m.role === "owner" || m.role === "admin" ? m.role : "tech"}
                  id={`role-${m.membership_id}`}
                />
              </div>
              {m.role === "owner" && !office.isOwner ? (
                // Turning an owner off is the owner's (owner, 2026-10-18).
                <div className="px-4 sm:px-0">
                  <input type="hidden" name="status" value={m.status} />
                  <Banner tone="info">{OWNER_ONLY}</Banner>
                </div>
              ) : (
                <SettingsFields labelWidth="5rem">
                  <SSelect
                    label="Access"
                    name="status"
                    id={`status-${m.membership_id}`}
                    defaultValue={m.status}
                    options={[
                      { value: "active", label: "Active" },
                      { value: "disabled", label: "Turned off" },
                    ]}
                  />
                </SettingsFields>
              )}
            </SettingsForm>
          </SheetRow>
        ))}
      </Grouped>
    </SettingsListPage>
  );
}
