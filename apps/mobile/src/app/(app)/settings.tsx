import Constants from "expo-constants";
import { router } from "expo-router";
import { useState } from "react";
import { Alert, Linking, View } from "react-native";
import { call } from "../../data/reports";
import { API_URL } from "../../lib/config";
import { useSession, useSyncStatus } from "../../state/session";
import { Button, Card, Choice, Notice, Screen, Section, T } from "../../ui/components";

export default function Settings() {
  const { services, user, company, companies, membership, setActiveCompany, signOut } =
    useSession();
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
    Alert.alert(
      "Sign out?",
      parts.length > 0
        ? `${parts.join(" and ")} haven’t reached the office yet. Signing out deletes them from this phone.`
        : "Your work is saved to the office. Signing out removes it from this phone.",
      [
        { text: "Stay Signed In", style: "cancel" },
        { text: "Sign Out", style: "destructive", onPress: () => void signOut() },
      ],
    );
  }

  const [deleting, setDeleting] = useState(false);

  /** Delete My Account (App Store rule 5.1.1(v)). The server decides: now, or a request. */
  function confirmDelete() {
    Alert.alert(
      "Delete your account?",
      "This removes your sign-in and the work on this phone. Jobs, reports, and invoices stay with the shop. If you’re the shop’s only owner, the shop’s data is deleted too, within 30 days.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete Account",
          style: "destructive",
          onPress: () => {
            setDeleting(true);
            void call<{ status: "deleted" | "requested"; message?: string }>(
              "/api/account/delete",
              {},
            )
              .then(async (r) => {
                if (r.status === "deleted") return signOut();
                Alert.alert("Request Sent", r.message ?? "We’ll email you when it’s done.");
              })
              .catch((e: unknown) =>
                Alert.alert("Couldn’t Delete", e instanceof Error ? e.message : String(e)),
              )
              .finally(() => setDeleting(false));
          },
        },
      ],
    );
  }

  const open = (path: string) => API_URL && void Linking.openURL(`${API_URL}${path}`);

  const last = status.lastSyncedAt ? new Date(status.lastSyncedAt).toLocaleString() : "Never";

  return (
    <Screen>
      <Section title="Account">
        <Card>
          <T variant="strong">{user?.email}</T>
          <T variant="muted">
            {company?.name} · {membership?.role === "owner" ? "Owner" : "Tech"}
          </T>
        </Card>
        {companies.length > 1 ? (
          <Choice
            label="Company"
            options={companies.map((c) => ({ value: c.id, label: c.name }))}
            value={company?.id ?? null}
            onChange={setActiveCompany}
          />
        ) : null}
      </Section>

      <Section title="Sync">
        <Card>
          <T variant="body">Last synced: {last}</T>
          <T variant="body">Waiting to sync: {status.pending}</T>
          <T variant="body">Waiting to upload: {status.uploads.waiting}</T>
          {status.phase === "offline" ? (
            <T variant="muted">This phone is offline. Changes are saved here and sync later.</T>
          ) : null}
          {status.error ? <T variant="muted">Last error: {status.error}</T> : null}
          {status.uploads.lastError ? (
            <T variant="muted">Last upload error: {status.uploads.lastError}</T>
          ) : null}
        </Card>
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

      <Section title="This phone">
        <Card>
          <T variant="body">
            Local data: {encrypted ? "encrypted" : "not encrypted (Expo Go preview)"}
          </T>
          <T variant="muted">Device ID: {sync.store.deviceId}</T>
          <T variant="muted">App version: {Constants.expoConfig?.version ?? "dev"}</T>
        </Card>
      </Section>

      {API_URL ? (
        <Section title="Help">
          <Button title="Status and Support" kind="secondary" onPress={() => open("/status")} />
          <Button title="Privacy Policy" kind="quiet" onPress={() => open("/privacy")} />
          <Button title="Terms of Service" kind="quiet" onPress={() => open("/terms")} />
        </Section>
      ) : null}

      <View style={{ marginTop: 8, gap: 8 }}>
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
    </Screen>
  );
}
