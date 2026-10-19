import { router } from "expo-router";
import { Alert, View } from "react-native";
import { useSession, useSyncStatus } from "../../../../../state/session";
import { confirmDestructive } from "../../../../../ui/confirm";
import { Button, Group, ListRow, Notice, Screen, Section, T } from "../../../../../ui/components";
import { syncSummary } from "../../../../../ui/SyncBar";
import { space } from "../../../../../ui/theme";

/**
 * Sync (spec 6.6, apps only): what this phone has sent and still holds, and changes the
 * office couldn't save, each with a way to let it go.
 */
export default function Sync() {
  const { services } = useSession();
  const status = useSyncStatus();
  const { sync, encrypted } = services;
  const summary = syncSummary(status);
  const last = status.lastSyncedAt ? new Date(status.lastSyncedAt).toLocaleString() : "Never";
  return (
    <Screen title="Sync" subtitle={summary.label}>
      {status.phase === "signed_out" ? (
        <Notice tone="warning">
          Your sign-in expired. Sign in again to keep syncing; nothing on this phone is lost.
        </Notice>
      ) : null}
      <Section
        title=""
        footer={
          status.phase === "offline"
            ? "This phone is offline. Changes are saved here and sync later."
            : undefined
        }
      >
        <Group>
          <ListRow title="Last synced" detail={last} />
          <ListRow title="Waiting to sync" detail={String(status.pending)} />
          <ListRow title="Waiting to upload" detail={String(status.uploads.waiting)} />
        </Group>
      </Section>
      {status.error ? <T muted>Last error: {status.error}</T> : null}
      {status.uploads.lastError ? <T muted>Last upload error: {status.uploads.lastError}</T> : null}
      {status.phase === "signed_out" ? (
        <Button title="Sign In Again" onPress={() => router.push("/reauth")} />
      ) : (
        <Button
          title={status.phase === "syncing" ? "Syncing…" : "Sync Now"}
          onPress={() => {
            sync.retryUploads();
            void sync
              .syncNow()
              .catch((e: unknown) =>
                Alert.alert("Couldn’t sync", e instanceof Error ? e.message : String(e)),
              );
          }}
          disabled={status.phase === "syncing"}
        />
      )}
      {status.problems.length > 0 ? (
        <Section title="Changes that could not be saved">
          <Group>
            {status.problems.map((p) => (
              <View key={p.seq} style={{ padding: space["4"], gap: space["2"] }}>
                <T variant="bodyEmphasis">
                  {p.table.replace(/_/g, " ")}: {p.fields.join(", ")}
                </T>
                <T variant="secondary" muted>
                  {p.error}
                </T>
                <Button
                  title="Discard This Change"
                  kind="danger"
                  onPress={() =>
                    confirmDestructive({
                      title: "Discard this change?",
                      message: "It stays as the office has it.",
                      confirm: "Discard Change",
                      onConfirm: () => sync.discardProblem(p.seq),
                    })
                  }
                />
              </View>
            ))}
          </Group>
        </Section>
      ) : null}
      <Section title="This phone">
        <Group>
          <ListRow title="Device ID" subtitle={sync.store.deviceId} />
          <ListRow
            title="Local data"
            detail={encrypted ? "Encrypted" : "Not encrypted (Expo Go preview)"}
          />
        </Group>
      </Section>
    </Screen>
  );
}
