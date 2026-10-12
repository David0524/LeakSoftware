import Constants from "expo-constants";
import { router } from "expo-router";
import { Alert, View } from "react-native";
import { useSession, useSyncStatus } from "../../state/session";
import { Button, Card, Choice, Notice, Screen, Section, T } from "../../ui/components";

export default function Settings() {
  const { services, user, company, companies, membership, setActiveCompany, signOut } =
    useSession();
  const status = useSyncStatus();
  const { sync, encrypted } = services;

  function confirmSignOut() {
    const pending = status.pending + status.problems.length;
    Alert.alert(
      "Sign out?",
      pending > 0
        ? `${pending} change${pending === 1 ? " hasn't" : "s haven't"} reached the office yet. Signing out deletes ${pending === 1 ? "it" : "them"} from this phone.`
        : "Your work is saved to the office. Signing out removes it from this phone.",
      [
        { text: "Stay signed in", style: "cancel" },
        { text: "Sign out", style: "destructive", onPress: () => void signOut() },
      ],
    );
  }

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
          {status.phase === "offline" ? (
            <T variant="muted">This phone is offline. Changes are saved here and sync later.</T>
          ) : null}
          {status.error ? <T variant="muted">Last error: {status.error}</T> : null}
        </Card>
        {status.phase === "signed_out" ? (
          <Notice tone="warning">
            Your sign-in expired. Sign in again to keep syncing; nothing on this phone is lost.
          </Notice>
        ) : null}
        {status.phase === "signed_out" ? (
          <Button title="Sign in again" onPress={() => router.push("/reauth")} />
        ) : (
          <Button
            title="Sync now"
            kind="secondary"
            onPress={() => void sync.syncNow()}
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
                title="Discard this change"
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

      <View style={{ marginTop: 8 }}>
        <Button title="Sign out" kind="danger" onPress={confirmSignOut} />
      </View>
    </Screen>
  );
}
