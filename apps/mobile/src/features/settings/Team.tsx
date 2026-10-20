import { useEffect, useState } from "react";
import { Alert, Pressable, Share, StyleSheet, Text, View } from "react-native";
import {
  ROLE_LABELS,
  TECH_COLORS,
  assignableRoles,
  canMakeJobs,
  requiresFinishPhoto,
  requiresFinishedChecklist,
  roleLabel,
  seesAllJobs,
  teamOrder,
  type Role,
  type TechColor,
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
  SwitchControl,
  T,
  Toggle,
} from "../../ui/components";
import { chooseAction, confirmDestructive } from "../../ui/confirm";
import { haptics } from "../../ui/haptics";
import { TechDot, techHex } from "../../ui/TechDot";
import { WebIcon } from "../../ui/WebIcon";
import { color, face, MAX_TEXT_SCALE, minTap, space, type } from "../../ui/theme";
import {
  EditSheet,
  FormActions,
  ManagersOnly,
  OwnerOnly,
  SettingsList,
  useEditSheet,
} from "./SettingsList";

// Settings › Team (the website's settings/team): what techs can do (owners), then the people as
// one list (owner, 2026-10-20; docs/design/2026-10-20-team-week.md section 2): the active A to
// Z, then those turned off, most recently first (core teamOrder). Each row has the tech's color
// dot, name, role and an On/Off switch; tapping it opens the profile with Role, Color and the
// switch again. Open invites stay in their own section under the list. Memberships, profiles,
// and the shop's settings are synced rows; invites are server rows, made with the website's
// functions.

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
  // Turned off on this phone, until the server's disabled_at syncs back: first in the list.
  const [offAt, setOffAt] = useState<Map<string, string>>(() => new Map());
  const order = teamOrder(
    team.map((m) => ({
      ...m,
      disabled_at: m.disabled_at ?? offAt.get(m.membership_id) ?? null,
    })),
  );
  /** Owners and admins change anyone's access but their own, and only owners an owner's. */
  const canSwitch = (m: TeamMember) => m.user_id !== user?.id && (owner || m.role !== "owner");
  function setAccess(m: TeamMember, on: boolean) {
    const write = () => {
      getServices().sync.write("membership", m.membership_id, company.id, {
        status: on ? "active" : "disabled",
      });
      setOffAt((was) => {
        const next = new Map(was);
        if (on) next.delete(m.membership_id);
        else next.set(m.membership_id, new Date().toISOString());
        return next;
      });
      haptics.success();
      sheet.done(on ? `${m.name} is on.` : `${m.name} is turned off.`);
    };
    if (on) return write();
    confirmDestructive({
      title: `Turn off ${m.name}? They can’t sign in, and their coming jobs stay as they are.`,
      confirm: "Turn Off",
      onConfirm: write,
    });
  }
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
        <Section title="Active">
          <Group separatorInset={space["4"] + 10 + space["3"]}>
            {order.active.map((m) => (
              <MemberRow
                key={m.membership_id}
                member={m}
                you={m.user_id === user?.id}
                canSwitch={canSwitch(m)}
                onSwitch={(on) => setAccess(m, on)}
                onPress={() => setEditingProfile({ member: m, profile: profileOf.get(m.user_id) })}
              />
            ))}
          </Group>
        </Section>

        {order.off.length ? (
          <Section title="Turned off">
            <Group separatorInset={space["4"] + 10 + space["3"]}>
              {order.off.map((m) => (
                <MemberRow
                  key={m.membership_id}
                  member={m}
                  you={m.user_id === user?.id}
                  canSwitch={canSwitch(m)}
                  onSwitch={(on) => setAccess(m, on)}
                  onPress={() =>
                    setEditingProfile({ member: m, profile: profileOf.get(m.user_id) })
                  }
                />
              ))}
            </Group>
          </Section>
        ) : null}

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

        <Section
          title="Without the app"
          footer="Profiles for people who work for you without using the app. Only owners and admins see them."
        >
          <Group>
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
      </SettingsList>
      <EditSheet
        open={editingProfile != null}
        title={editingProfile?.profile?.name ?? editingProfile?.member?.name ?? "Add Person"}
        onClose={() => setEditingProfile(null)}
      >
        {editingProfile ? (
          <ProfileForm
            target={editingProfile}
            owner={owner}
            canSwitch={editingProfile.member ? canSwitch(editingProfile.member) : false}
            on={
              editingProfile.member
                ? (team.find((m) => m.membership_id === editingProfile.member!.membership_id)
                    ?.status ?? editingProfile.member.status) === "active"
                : true
            }
            onSwitch={(on) => editingProfile.member && setAccess(editingProfile.member, on)}
            onDone={(message) => {
              setEditingProfile(null);
              sheet.done(message);
            }}
          />
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
function ProfileForm({
  target,
  owner,
  canSwitch,
  on,
  onSwitch,
  onDone,
}: {
  target: ProfileTarget;
  /** Only owners change roles (the database refuses it for anyone else too). */
  owner: boolean;
  canSwitch: boolean;
  /** Their access now (the switch acts at once, asking before turning off). */
  on: boolean;
  onSwitch: (on: boolean) => void;
  onDone: (m: string) => void;
}) {
  const company = useCompany();
  const { member, profile } = target;
  const roles = assignableRoles(owner ? "owner" : "admin");
  const [role, setRole] = useState<Role>(member?.role ?? "tech");
  const [tech, setTech] = useState<TechColor>(member?.color ?? "slate");
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
    const { sync } = getServices();
    sync.batch(() => {
      saveTeamProfile(
        company.id,
        checked.values,
        profile ? { id: profile.id } : { userId: member?.user_id ?? null },
      );
      if (member && (role !== member.role || tech !== member.color))
        sync.write("membership", member.membership_id, company.id, {
          ...(owner && role !== member.role ? { role } : {}),
          color: tech,
        });
    });
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
      {member ? (
        <>
          {roles.length < 2 || (member.role === "owner" && !owner) ? (
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
          <ColorPicker value={tech} onChange={setTech} />
          <Group>
            <View style={[styles.switchRow, !canSwitch && { opacity: 0.5 }]}>
              <T style={{ flex: 1 }}>{on ? "On" : "Off"}</T>
              <SwitchControl
                value={on}
                disabled={!canSwitch}
                label={`${member.name}, ${on ? "on" : "off"}`}
                onValueChange={onSwitch}
              />
            </View>
          </Group>
        </>
      ) : null}
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

/**
 * A person in the list: their color dot, name (17) and role (15) under it, and at the right the
 * On/Off switch (disabled for yourself, and for an owner when you're an admin). Tapping the row
 * opens their profile.
 */
function MemberRow({
  member: m,
  you,
  canSwitch,
  onSwitch,
  onPress,
}: {
  member: TeamMember;
  you: boolean;
  canSwitch: boolean;
  onSwitch: (on: boolean) => void;
  onPress: () => void;
}) {
  const on = m.status === "active";
  return (
    <ListRow
      onPress={onPress}
      chevron={false}
      accessibilityLabel={`${m.name}${you ? " (you)" : ""}, ${roleLabel(m.role)}`}
      accessibilityHint="Opens their profile"
      leading={<TechDot tech={m.color} />}
      trailing={
        <View style={!canSwitch && { opacity: 0.5 }}>
          <SwitchControl
            value={on}
            disabled={!canSwitch}
            label={`${m.name}, ${on ? "on" : "off"}`}
            onValueChange={onSwitch}
          />
        </View>
      }
    >
      <T>
        {m.name}
        {you ? <T muted> (you)</T> : null}
      </T>
      <T variant="secondary" muted>
        {roleLabel(m.role)}
      </T>
    </ListRow>
  );
}

/** Color: the ten tech colors as 44 pt swatches with their names; the chosen one is checked. */
function ColorPicker({ value, onChange }: { value: TechColor; onChange: (c: TechColor) => void }) {
  return (
    <View style={{ gap: space["2"] }} accessibilityRole="radiogroup" accessibilityLabel="Color">
      <T variant="bodyMedium">Color</T>
      <View style={styles.swatches}>
        {TECH_COLORS.map((c) => {
          const chosen = c.key === value;
          return (
            <Pressable
              key={c.key}
              accessibilityRole="radio"
              accessibilityLabel={c.label}
              accessibilityState={{ checked: chosen }}
              onPress={() => {
                if (chosen) return;
                haptics.selection();
                onChange(c.key);
              }}
              style={styles.swatch}
            >
              <View style={[styles.swatchDot, { backgroundColor: techHex(c.key) }]}>
                {chosen ? (
                  <WebIcon name="check" size={18} color={color.paper} strokeWidth={3} />
                ) : null}
              </View>
              <Text
                style={[
                  type.footnote,
                  chosen ? face.semiBold : face.regular,
                  { color: color.text },
                ]}
                maxFontSizeMultiplier={MAX_TEXT_SCALE}
                numberOfLines={1}
              >
                {c.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  setting: { paddingHorizontal: space["4"], paddingBottom: space["3"] },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: minTap,
    paddingHorizontal: space["4"],
    paddingVertical: space["2"],
  },
  swatches: { flexDirection: "row", flexWrap: "wrap", gap: space["2"] },
  swatch: { width: 60, minHeight: minTap + 22, alignItems: "center", gap: 4 },
  swatchDot: {
    width: minTap,
    height: minTap,
    borderRadius: minTap / 2,
    alignItems: "center",
    justifyContent: "center",
  },
});
