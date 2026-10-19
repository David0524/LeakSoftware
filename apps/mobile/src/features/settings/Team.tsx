import { useEffect, useState } from "react";
import { Linking, View } from "react-native";
import {
  ROLE_LABELS,
  assignableRoles,
  canMakeJobs,
  roleLabel,
  seesAllJobs,
  type Role,
} from "@leakbook/core";
import { useTeam, type TeamMember } from "../../data/schedule";
import { API_URL } from "../../lib/config";
import { getServices } from "../../lib/services";
import { useCompany, useSession } from "../../state/session";
import { Group, ListRow, Section, Segmented, T, Toggle } from "../../ui/components";
import { haptics } from "../../ui/haptics";
import { Select } from "../../ui/Select";
import { space } from "../../ui/theme";
import {
  EditSheet,
  FormActions,
  ManagersOnly,
  OwnerOnly,
  SettingsList,
  useEditSheet,
} from "./SettingsList";

// Settings › Team (the website's settings/team): what techs can do (owners), open invites, and
// the people, each person's role and access changed in a sheet. Memberships and the shop's
// settings are synced rows; invites are made on the website (they aren't on the phone).

const ABOUT: Record<Role, string> = {
  owner: "Everything, including Sundeck Pro billing, payments setup, and who has which role.",
  admin: "Office staff: schedule, customers, jobs, quotes, invoices, and settings.",
  tech: "Runs jobs on the phone.",
};

interface Invite {
  id: string;
  email: string;
  role: Role;
}

export function Team() {
  return (
    <ManagersOnly title="Team">
      <TeamPage />
    </ManagersOnly>
  );
}

function TeamPage() {
  const company = useCompany();
  const { membership, user } = useSession();
  const owner = membership?.role === "owner";
  const team = useTeam(company.id);
  const sheet = useEditSheet<TeamMember>();
  const [invites, setInvites] = useState<Invite[] | null>(null);
  useEffect(() => {
    void getServices()
      .supabase.from("invite")
      .select("id, email, role")
      .eq("company_id", company.id)
      .is("accepted_at", null)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .then(({ data }) => setInvites((data ?? []) as Invite[]));
  }, [company.id]);

  const settings = company.settings as unknown as Record<string, unknown>;
  const seesAll = seesAllJobs("tech", settings);
  const makesJobs = canMakeJobs("tech", settings);
  function saveVisibility(next: { techs_see_all_jobs?: boolean; techs_make_jobs?: boolean }) {
    getServices().sync.write("company", company.id, company.id, {
      settings: { ...settings, techs_see_all_jobs: seesAll, techs_make_jobs: makesJobs, ...next },
    } as never);
    haptics.success();
  }

  return (
    <>
      <SettingsList
        title="Team"
        subtitle="Techs run jobs on the phone. Admins run the office. Owners also handle billing, payments setup, and roles."
        notice={sheet.notice}
      >
        <Section title="What techs can do">
          {owner ? (
            <View style={{ gap: space["3"] }}>
              <Segmented
                label="Techs see"
                value={seesAll ? "all" : "own"}
                onChange={(v) => saveVisibility({ techs_see_all_jobs: v === "all" })}
                options={[
                  { value: "all", label: "Every Job" },
                  { value: "own", label: "Only Their Own" },
                ]}
              />
              <Group>
                <Toggle
                  inList
                  label="Techs can make new jobs"
                  value={makesJobs}
                  onChange={(v) => saveVisibility({ techs_make_jobs: v })}
                />
              </Group>
            </View>
          ) : (
            <View style={{ gap: space["2"] }}>
              <T>
                Techs see {seesAll ? "every job" : "only their own jobs"} and{" "}
                {makesJobs ? "can" : "can’t"} make new jobs.
              </T>
              <OwnerOnly />
            </View>
          )}
        </Section>

        <Section
          title="Open invites"
          footer={
            invites?.length
              ? "Send the link by text or email. It works once, for that email address, for 14 days."
              : invites
                ? "No open invites."
                : "Open invites show when there’s a signal."
          }
        >
          <Group>
            {(invites ?? []).map((i) => (
              <ListRow key={i.id} title={i.email} detail={roleLabel(i.role)} />
            ))}
            <ListRow
              title="+ Invite Someone"
              tone="link"
              accessibilityHint="Opens Settings › Team on the website"
              onPress={() => API_URL && void Linking.openURL(`${API_URL}/settings/team`)}
            />
          </Group>
        </Section>

        <Section title="People">
          <Group>
            {team.map((m) => (
              <ListRow
                key={m.membership_id}
                onPress={() => sheet.open(m)}
                detail={roleLabel(m.role) + (m.status === "disabled" ? " · Turned off" : "")}
              >
                <T>
                  {m.name}
                  {m.user_id === user?.id ? <T muted> (you)</T> : null}
                </T>
                {m.email ? (
                  <T variant="secondary" muted>
                    {m.email}
                  </T>
                ) : null}
              </ListRow>
            ))}
          </Group>
        </Section>
      </SettingsList>
      <EditSheet
        open={sheet.editing != null && sheet.editing !== "new"}
        title={sheet.editing && sheet.editing !== "new" ? sheet.editing.name : ""}
        onClose={sheet.close}
      >
        {sheet.editing && sheet.editing !== "new" ? (
          <MemberForm member={sheet.editing} owner={owner} onDone={sheet.done} />
        ) : null}
      </EditSheet>
    </>
  );
}

function MemberForm({
  member,
  owner,
  onDone,
}: {
  member: TeamMember;
  owner: boolean;
  onDone: (m: string) => void;
}) {
  const company = useCompany();
  const roles = assignableRoles(owner ? "owner" : "admin");
  const [role, setRole] = useState<Role>(member.role);
  const [status, setStatus] = useState(member.status);
  function save() {
    // Only owners change roles (the database refuses it for anyone else too).
    getServices().sync.write("membership", member.membership_id, company.id, {
      ...(owner ? { role } : {}),
      status,
    });
    haptics.success();
    onDone("Saved.");
  }
  return (
    <>
      {member.email ? (
        <T variant="secondary" muted>
          {member.email}
        </T>
      ) : null}
      {roles.length < 2 ? (
        <View style={{ gap: 4 }}>
          <T variant="bodyMedium">Role: {ROLE_LABELS[role]}</T>
          <T variant="secondary" muted>
            {ABOUT[role]}
          </T>
        </View>
      ) : (
        <View style={{ gap: 4 }}>
          <Segmented
            label="Role"
            value={role}
            onChange={setRole}
            options={roles.map((r) => ({ value: r, label: ROLE_LABELS[r] }))}
          />
          <T variant="secondary" muted>
            {ABOUT[role]}
          </T>
        </View>
      )}
      {member.role === "owner" && !owner ? (
        <OwnerOnly />
      ) : (
        <Select
          label="Access"
          value={status}
          onChange={setStatus}
          options={[
            { value: "active", label: "Active" },
            { value: "disabled", label: "Turned off" },
          ]}
        />
      )}
      <FormActions submit="Save" onSubmit={save} />
    </>
  );
}
