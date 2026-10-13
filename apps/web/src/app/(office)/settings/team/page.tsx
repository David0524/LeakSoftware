import type { Metadata } from "next";
import { inviteMember, revokeInvite, updateMember } from "@/app/actions/settings";
import { CopyLink, SField, SettingsForm } from "@/components/settings-forms";
import { Card, Empty, PageHeader, Select } from "@/components/ui";
import { getOffice } from "@/lib/auth";
import { getTeam } from "@/lib/data";
import { siteOrigin } from "@/lib/origin";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Team · Tidemark" };

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
  const [team, { data: invites }, origin] = await Promise.all([
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
  ]);
  const open = (invites ?? []) as Invite[];

  return (
    <>
      <PageHeader
        title="Team"
        subtitle="Techs run jobs on the phone. Owners also manage settings, pricing, and payments."
      />
      <div className="space-y-6">
        <Card>
          <h2 className="mb-4 font-display text-xl font-bold">Invite someone</h2>
          <SettingsForm action={inviteMember} submit="Create Invite" primary>
            <div className="grid gap-4 sm:grid-cols-[1fr_200px]">
              <SField label="Email" name="email" type="email" autoComplete="off" required />
              <Select
                label="Role"
                name="role"
                defaultValue="tech"
                options={[
                  { value: "tech", label: "Tech" },
                  { value: "owner", label: "Owner" },
                ]}
              />
            </div>
          </SettingsForm>
        </Card>

        <Card>
          <h2 className="mb-1 font-display text-xl font-bold">Open invites</h2>
          <p className="mb-4 text-text-muted">
            Send the link by text or email. It works once, for that email address, for 14 days.
          </p>
          {open.length === 0 ? (
            <Empty>No open invites.</Empty>
          ) : (
            <ul className="space-y-4">
              {open.map((i) => (
                <li key={i.id} className="rounded-md border border-border p-4" data-testid="invite">
                  <p className="font-semibold">
                    {i.email}{" "}
                    <span className="font-normal text-text-muted">
                      · {i.role === "owner" ? "Owner" : "Tech"}
                    </span>
                  </p>
                  <div className="mt-2">
                    <CopyLink url={`${origin}/invite/${i.token}`} />
                  </div>
                  <div className="mt-3">
                    <SettingsForm
                      action={revokeInvite}
                      submit="Revoke Invite"
                      danger
                      confirm="Revoke this invite? The link will stop working."
                    >
                      <input type="hidden" name="id" value={i.id} />
                    </SettingsForm>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="mb-4 font-display text-xl font-bold">People</h2>
          <ul className="divide-y divide-border">
            {team.map((m) => (
              <li key={m.membership_id} className="py-4">
                <SettingsForm
                  action={updateMember}
                  className="flex flex-wrap items-end gap-4"
                  inline
                >
                  <input type="hidden" name="id" value={m.membership_id} />
                  <div className="min-w-48 flex-1">
                    <p className="font-semibold">
                      {m.name}
                      {m.user_id === office.user.id ? (
                        <span className="font-normal text-text-muted"> (you)</span>
                      ) : null}
                    </p>
                    <p className="text-[15px] text-text-muted">{m.email}</p>
                  </div>
                  <Select
                    label="Role"
                    name="role"
                    id={`role-${m.membership_id}`}
                    defaultValue={m.role}
                    options={[
                      { value: "tech", label: "Tech" },
                      { value: "owner", label: "Owner" },
                    ]}
                  />
                  <Select
                    label="Access"
                    name="status"
                    id={`status-${m.membership_id}`}
                    defaultValue={m.status}
                    options={[
                      { value: "active", label: "Active" },
                      { value: "disabled", label: "Turned off" },
                    ]}
                  />
                </SettingsForm>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
