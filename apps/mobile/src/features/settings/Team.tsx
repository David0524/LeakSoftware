import { useEffect, useState } from "react";
import { Alert, Share, StyleSheet, View } from "react-native";
import {
  ROLE_LABELS,
  assignableRoles,
  canMakeJobs,
  requiresFinishPhoto,
  requiresFinishedChecklist,
  roleLabel,
  seesAllJobs,
  type Role,
} from "@leakbook/core";
import { useTeam, type TeamMember } from "../../data/schedule";
import {
  removeTeamProfile,
  saveTeamProfile,
  useTeamProfiles,
  type TeamProfile,
} from "../../data/teamProfiles";
import { teamProfileValues, type TeamProfileForm } from "../../lib/teamProfile";
import { API_URL } from "../../lib/config";
import { getServices } from "../../lib/services";
import { useCompany, useSession } from "../../state/session";
import {
  Button,
  FieldGroup,
  FieldRow,
  Group,
  ListRow,
  Section,
  Segmented,
  T,
  Toggle,
} from "../../ui/components";
import { chooseAction, confirmDestructive } from "../../ui/confirm";
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
// the people, each person's role and access changed in a sheet, and each person's profile
// (owner, 2026-10-20). Memberships, profiles, and the shop's settings are synced rows; invites
// are server rows, made with the website's functions.

const ABOUT: Record<Role, string> = {
  owner: "Everything, including Sundeck Pro billing, payments setup, and who has which role.",
  admin: "Office staff: schedule, customers, jobs, quotes, invoices, and settings.",
  tech: "Runs jobs on the phone.",
};

interface Invite {
  id: string;
  email: string;
  role: Role;
  token: string;
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
  const profiles = useTeamProfiles(company.id);
  const profileOf = new Map(profiles.filter((p) => p.user_id).map((p) => [p.user_id!, p]));
  const others = profiles.filter((p) => !p.user_id).sort((a, b) => a.name.localeCompare(b.name));
  const [editingProfile, setEditingProfile] = useState<ProfileTarget | null>(null);
  const [invites, setInvites] = useState<Invite[] | null>(null);
  const [inviting, setInviting] = useState(false);
  const [round, setRound] = useState(0);
  // Invites are server rows (not synced): read here, made and revoked with the website's
  // functions (create_invite, revoke_invite), so they need a connection.
  useEffect(() => {
    void getServices()
      .supabase.from("invite")
      .select("id, email, role, token")
      .eq("company_id", company.id)
      .is("accepted_at", null)
      .is("revoked_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .then(({ data }) => setInvites((data ?? []) as Invite[]));
  }, [company.id, round]);
  const link = (i: Invite) => `${API_URL ?? "https://sundeckpro.com"}/invite/${i.token}`;
  function inviteActions(i: Invite) {
    chooseAction({
      title: i.email,
      actions: [
        {
          label: "Share Invite Link",
          onPress: () =>
            void Share.share({ message: `Join ${company.name} on Sundeck Pro: ${link(i)}` }),
        },
        {
          label: "Revoke Invite",
          onPress: () =>
            confirmDestructive({
              title: "Revoke this invite? The link will stop working.",
              confirm: "Revoke Invite",
              onConfirm: () =>
                void getServices()
                  .supabase.rpc("revoke_invite", { invite_id: i.id })
                  .then(({ error }) => {
                    if (error) Alert.alert("Couldn’t revoke", error.message);
                    else setRound((n) => n + 1);
                  }),
            }),
        },
      ],
    });
  }

  const settings = company.settings as unknown as Record<string, unknown>;
  const seesAll = seesAllJobs("tech", settings);
  const makesJobs = canMakeJobs("tech", settings);
  function saveVisibility(next: { techs_see_all_jobs?: boolean; techs_make_jobs?: boolean }) {
    getServices().sync.write("company", company.id, company.id, {
      settings: { ...settings, techs_see_all_jobs: seesAll, techs_make_jobs: makesJobs, ...next },
    } as never);
    haptics.success();
  }
  function saveSetting(next: Record<string, boolean>) {
    getServices().sync.write("company", company.id, company.id, {
      settings: { ...settings, ...next },
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

        {/* What Complete Job waits for (owner, 2026-10-19: "Owners/admins can decide whether
            the tech needs to fill out the checklist/submit picture first"). */}
        <Section title="Completing a job">
          <Group>
            <View style={styles.setting}>
              <Toggle
                label="Finish the checklist first"
                value={requiresFinishedChecklist(settings)}
                onChange={(v) => saveSetting({ require_checklist_to_finish: v })}
              />
              <T variant="secondary" muted>
                On: Complete Job waits until every checklist item is answered.
              </T>
            </View>
            <View style={styles.setting}>
              <Toggle
                label="Take a pool photo first"
                value={requiresFinishPhoto(settings)}
                onChange={(v) => saveSetting({ require_finish_photo: v })}
              />
              <T variant="secondary" muted>
                On: Complete Job, and sending a report, wait until the job has a photo.
              </T>
            </View>
          </Group>
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
              <ListRow
                key={i.id}
                title={i.email}
                detail={roleLabel(i.role)}
                accessibilityHint="Share the link or revoke the invite"
                onPress={() => inviteActions(i)}
              />
            ))}
            <ListRow title="+ Invite Someone" tone="link" onPress={() => setInviting(true)} />
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

        <Section
          title="Profiles"
          footer="Each person’s phone, email, address, emergency contact, and notes. Only owners and admins see them."
        >
          <Group>
            {team.map((m) => {
              const profile = profileOf.get(m.user_id);
              return (
                <ListRow
                  key={`profile-${m.membership_id}`}
                  title={profile?.name ?? m.name}
                  subtitle={profile?.phone ?? undefined}
                  detail={profile ? undefined : "Add Details"}
                  onPress={() => setEditingProfile({ member: m, profile })}
                />
              );
            })}
            {others.map((p) => (
              <ListRow
                key={p.id}
                title={p.name}
                subtitle={[p.phone, "No app"].filter(Boolean).join(" · ")}
                onPress={() => setEditingProfile({ profile: p })}
              />
            ))}
            <ListRow title="Add Person" tone="link" onPress={() => setEditingProfile({})} />
          </Group>
        </Section>
      </SettingsList>
      <EditSheet
        open={editingProfile != null}
        title={editingProfile?.profile?.name ?? editingProfile?.member?.name ?? "Add Person"}
        onClose={() => setEditingProfile(null)}
      >
        {editingProfile ? (
          <ProfileForm
            target={editingProfile}
            onDone={(message) => {
              setEditingProfile(null);
              sheet.done(message);
            }}
          />
        ) : null}
      </EditSheet>
      <EditSheet
        open={sheet.editing != null && sheet.editing !== "new"}
        title={sheet.editing && sheet.editing !== "new" ? sheet.editing.name : ""}
        onClose={sheet.close}
      >
        {sheet.editing && sheet.editing !== "new" ? (
          <MemberForm member={sheet.editing} owner={owner} onDone={sheet.done} />
        ) : null}
      </EditSheet>
      <EditSheet open={inviting} title="Invite Someone" onClose={() => setInviting(false)}>
        <InviteForm
          owner={owner}
          onDone={(message) => {
            setInviting(false);
            setRound((n) => n + 1);
            sheet.done(message);
          }}
        />
      </EditSheet>
    </>
  );
}

/** A new invite: email and role, made on the server (create_invite); then share its link. */
function InviteForm({ owner, onDone }: { owner: boolean; onDone: (message: string) => void }) {
  const company = useCompany();
  const roles = assignableRoles(owner ? "owner" : "admin");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("tech");
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  async function create() {
    const address = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(address)) return setError("Enter a valid email.");
    setError(undefined);
    setBusy(true);
    try {
      const { error: rpcError } = await getServices().supabase.rpc("create_invite", {
        target_company: company.id,
        invite_email: address,
        invite_role: role,
      });
      if (rpcError) return setError(rpcError.message);
      onDone(`Invite created for ${address}. Tap it under Open invites to share the link.`);
    } catch {
      setError("You’re offline. Invites need a connection.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <View style={{ gap: space["4"] }}>
      <FieldGroup labelWidth={80}>
        <FieldRow
          label="Email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          error={error}
        />
      </FieldGroup>
      {roles.length > 1 ? (
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
      ) : null}
      <Button title="Create Invite" wide loading={busy} onPress={() => void create()} />
    </View>
  );
}

/** Whose profile the sheet holds: a team member's (made on first save), or someone without the app. */
interface ProfileTarget {
  member?: TeamMember;
  profile?: TeamProfile;
}

/**
 * A person's profile (owner, 2026-10-20): name, phone, email, address, emergency contact, and
 * notes, as the website's Settings › Team › Profiles.
 */
function ProfileForm({ target, onDone }: { target: ProfileTarget; onDone: (m: string) => void }) {
  const company = useCompany();
  const { member, profile } = target;
  const [f, setF] = useState<TeamProfileForm>({
    name: profile?.name ?? member?.name ?? "",
    phone: profile?.phone ?? "",
    email: profile?.email ?? member?.email ?? "",
    address: profile?.address ?? "",
    emergency_name: profile?.emergency_name ?? "",
    emergency_phone: profile?.emergency_phone ?? "",
    notes: profile?.notes ?? "",
  });
  const [errors, setErrors] = useState<Partial<Record<keyof TeamProfileForm, string>>>({});
  const set = (k: keyof TeamProfileForm) => (v: string) => setF((o) => ({ ...o, [k]: v }));
  function save() {
    const checked = teamProfileValues(f);
    if ("fields" in checked) return setErrors(checked.fields);
    setErrors({});
    saveTeamProfile(
      company.id,
      checked.values,
      profile ? { id: profile.id } : { userId: member?.user_id ?? null },
    );
    haptics.success();
    onDone(profile ? "Saved." : `Added ${checked.values.name}.`);
  }
  return (
    <View style={{ gap: space["4"] }}>
      {!profile && !member ? (
        <T variant="secondary" muted>
          For someone who works for you without using the app. Invite them above to give them the
          app.
        </T>
      ) : null}
      <FieldGroup labelWidth={88}>
        <FieldRow
          label="Name"
          value={f.name}
          onChangeText={set("name")}
          autoCapitalize="words"
          error={errors.name}
        />
        <FieldRow
          label="Phone"
          value={f.phone}
          onChangeText={set("phone")}
          keyboardType="phone-pad"
        />
        <FieldRow
          label="Email"
          value={f.email}
          onChangeText={set("email")}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          error={errors.email}
        />
        <FieldRow label="Address" value={f.address} onChangeText={set("address")} />
      </FieldGroup>
      <FieldGroup title="Emergency contact" labelWidth={88}>
        <FieldRow
          label="Name"
          value={f.emergency_name}
          onChangeText={set("emergency_name")}
          autoCapitalize="words"
        />
        <FieldRow
          label="Phone"
          value={f.emergency_phone}
          onChangeText={set("emergency_phone")}
          keyboardType="phone-pad"
        />
      </FieldGroup>
      <FieldGroup>
        <FieldRow
          label="Notes"
          value={f.notes}
          onChangeText={set("notes")}
          multiline
          maxLength={4000}
        />
      </FieldGroup>
      <FormActions
        submit={profile ? "Save" : "Save Profile"}
        onSubmit={save}
        remove={
          profile
            ? {
                label: "Delete Profile",
                confirm: "Delete this profile? Their account and jobs stay.",
                onConfirm: () => {
                  removeTeamProfile(company.id, profile.id);
                  haptics.success();
                  onDone("Removed.");
                },
              }
            : undefined
        }
      />
    </View>
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

const styles = StyleSheet.create({
  setting: { paddingHorizontal: space["4"], paddingBottom: space["3"] },
});
