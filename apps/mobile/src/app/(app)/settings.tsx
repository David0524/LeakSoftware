import Constants from "expo-constants";
import { router } from "expo-router";
import { formatPhone, offersPool, toE164, roleLabel } from "@leakbook/core";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Linking, View } from "react-native";
import { call } from "../../data/reports";
import { API_URL } from "../../lib/config";
import { useSession, useSyncStatus } from "../../state/session";
import {
  Button,
  Card,
  Choice,
  Field,
  Group,
  ListRow,
  Notice,
  Screen,
  Section,
  T,
} from "../../ui/components";
import { confirmDestructive } from "../../ui/confirm";
import { color, ios, space } from "../../ui/theme";
import { useWalkthrough } from "../../state/walkthrough";

/**
 * My mobile number (company texting): calls I place from the company number ring it first,
 * and incoming calls can ring it. Saved to my profile on the server.
 */
function MyPhone() {
  const { services } = useSession();
  const [phone, setPhone] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    services.sync
      .myPhone()
      .then((p) => setPhone((now) => now ?? (p ? formatPhone(toE164(p) ?? p) : "")))
      .catch(() => {});
  }, [services]);
  async function save() {
    const e164 = toE164(phone);
    if (!e164) return Alert.alert("Check the number", "Enter a US mobile number.");
    setSaving(true);
    try {
      await services.sync.saveMyPhone(e164);
      setPhone(formatPhone(e164));
      Alert.alert("Saved", "Calls you place from Messages ring this number first.");
    } catch (e) {
      Alert.alert("Couldn’t save", e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }
  return (
    <Section title="My mobile number">
      <Field
        label="Mobile"
        value={phone ?? ""}
        onChangeText={setPhone}
        keyboardType="phone-pad"
        textContentType="telephoneNumber"
        autoComplete="tel"
        hint="Calls you place from Messages ring here first, then connect from the company number."
      />
      <Button title="Save Number" kind="secondary" onPress={() => void save()} loading={saving} />
    </Section>
  );
}

/** A note under a grouped list, lined up with the rows' text on iPhone. */
const footer = { paddingHorizontal: ios ? space["4"] : 0 };

export default function Settings() {
  const { services, user, company, companies, membership, setActiveCompany, signOut } =
    useSession();
  const walkthrough = useWalkthrough();
  const status = useSyncStatus();
  const { sync, encrypted } = services;

  function confirmSignOut() {
    const changes = status.pending + status.problems.length;
    const files = status.uploads.waiting;
    const parts = [
      changes > 0 ? `${changes} change${changes === 1 ? "" : "s"}` : null,
      files > 0
        ? `${files} photo${files === 1 ? "" : "s"} or recording${files === 1 ? "" : "s"}`
        : null,
    ].filter(Boolean);
    confirmDestructive({
      title: "Sign out?",
      message:
        parts.length > 0
          ? `${parts.join(" and ")} haven’t reached the office yet. Signing out deletes them from this phone.`
          : "Your work is saved to the office. Signing out removes it from this phone.",
      confirm: "Sign Out",
      cancel: "Stay Signed In",
      onConfirm: () => void signOut(),
    });
  }

  const [deleting, setDeleting] = useState(false);

  /** Delete My Account (App Store rule 5.1.1(v)). The server decides: now, or a request. */
  function confirmDelete() {
    confirmDestructive({
      title: "Delete your account?",
      message:
        "This removes your sign-in and the work on this phone. Jobs, reports, and invoices stay with the shop. If you’re the shop’s only owner, the shop’s data is deleted too, within 30 days.",
      confirm: "Delete Account",
      onConfirm: () => {
        setDeleting(true);
        void call<{ status: "deleted" | "requested"; message?: string }>("/api/account/delete", {})
          .then(async (r) => {
            if (r.status === "deleted") return signOut();
            Alert.alert("Request sent", r.message ?? "We’ll email you when it’s done.");
          })
          .catch((e: unknown) =>
            Alert.alert("Couldn’t delete", e instanceof Error ? e.message : String(e)),
          )
          .finally(() => setDeleting(false));
      },
    });
  }

  const open = (path: string) => API_URL && void Linking.openURL(`${API_URL}${path}`);

  const last = status.lastSyncedAt ? new Date(status.lastSyncedAt).toLocaleString() : "Never";

  return (
    <Screen>
      <Section title="Account" grouped>
        <Group>
          <ListRow
            title={user?.email ?? ""}
            subtitle={`${company?.name ?? ""} · ${roleLabel(membership?.role)}`}
          />
          {API_URL ? (
            // Set up on the website, where the code can be scanned (owner, 2026-10-16).
            <ListRow
              title="Two-Step Sign-In"
              accessibilityRole="link"
              onPress={() => open("/more/two-step")}
            />
          ) : null}
          {/* This phone's details. */}
          <ListRow
            title="Local data"
            detail={encrypted ? "Encrypted" : "Not encrypted (Expo Go preview)"}
          />
          <ListRow title="Device ID" subtitle={sync.store.deviceId} />
          <ListRow title="App version" detail={Constants.expoConfig?.version ?? "dev"} />
        </Group>
        {companies.length > 1 ? (
          <Choice
            label="Company"
            options={companies.map((c) => ({ value: c.id, label: c.name }))}
            value={company?.id ?? null}
            onChange={setActiveCompany}
          />
        ) : null}
      </Section>

      <Section title="Sync" grouped>
        <Group>
          <ListRow title="Last synced" detail={last} />
          <ListRow title="Waiting to sync" detail={String(status.pending)} />
          <ListRow title="Waiting to upload" detail={String(status.uploads.waiting)} />
        </Group>
        {status.phase === "offline" ? (
          <T variant="muted" style={footer}>
            This phone is offline. Changes are saved here and sync later.
          </T>
        ) : null}
        {status.error ? (
          <T variant="muted" style={footer}>
            Last error: {status.error}
          </T>
        ) : null}
        {status.uploads.lastError ? (
          <T variant="muted" style={footer}>
            Last upload error: {status.uploads.lastError}
          </T>
        ) : null}
        {status.phase === "signed_out" ? (
          <Notice tone="warning">
            Your sign-in expired. Sign in again to keep syncing; nothing on this phone is lost.
          </Notice>
        ) : null}
        {status.phase === "signed_out" ? (
          <Button title="Sign In Again" onPress={() => router.push("/reauth")} />
        ) : (
          <Button
            title="Sync Now"
            kind="secondary"
            onPress={() => {
              sync.retryUploads();
            }}
            loading={status.phase === "syncing"}
          />
        )}
      </Section>

      {status.problems.length > 0 ? (
        <Section title="Changes that could not be saved">
          {status.problems.map((p) => (
            <Card key={p.seq}>
              <T variant="strong">
                {p.table.replace(/_/g, " ")}: {p.fields.join(", ")}
              </T>
              <T variant="muted">{p.error}</T>
              <Button
                title="Discard This Change"
                kind="danger"
                onPress={() => sync.discardProblem(p.seq)}
              />
            </Card>
          ))}
        </Section>
      ) : null}

      <Section title="Tools" grouped>
        <Group>
          <ListRow title="Messages" chevron onPress={() => router.push("/messages")} />
          {company && offersPool(company.settings) ? (
            <ListRow
              title="Chemical Calculator"
              chevron
              onPress={() => router.push("/chemicals")}
            />
          ) : null}
          {/* Every tip comes back, starting with the welcome cards (walkthrough, 2026-10-16). */}
          <ListRow
            title="Show Tips Again"
            tone="link"
            onPress={() => {
              walkthrough.reset();
              router.push("/welcome");
            }}
          />
        </Group>
      </Section>

      <MyPhone />

      {API_URL ? (
        <Section title="Help" grouped>
          <Group>
            <ListRow
              title="Status and Support"
              accessibilityRole="link"
              onPress={() => open("/status")}
            />
            <ListRow
              title="Privacy Policy"
              accessibilityRole="link"
              onPress={() => open("/privacy")}
            />
            <ListRow
              title="Terms of Service"
              accessibilityRole="link"
              onPress={() => open("/terms")}
            />
          </Group>
        </Section>
      ) : null}

      {ios ? (
        // iPhone: red action rows, as at the end of iOS Settings screens.
        <>
          <Group>
            <ListRow title="Sign Out" tone="destructive" onPress={confirmSignOut} />
          </Group>
          {API_URL ? (
            <Group>
              <ListRow
                title="Delete My Account"
                tone="destructive"
                onPress={deleting ? undefined : confirmDelete}
                trailing={deleting ? <ActivityIndicator color={color.fail} /> : undefined}
              />
            </Group>
          ) : null}
        </>
      ) : (
        <View style={{ gap: space["2"] }}>
          <Button title="Sign Out" kind="danger" onPress={confirmSignOut} />
          {API_URL ? (
            <Button
              title="Delete My Account"
              kind="quiet"
              loading={deleting}
              onPress={confirmDelete}
            />
          ) : null}
        </View>
      )}
    </Screen>
  );
}
