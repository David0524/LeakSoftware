import { router } from "expo-router";
import { Alert, View } from "react-native";
import { useSession, useSyncStatus } from "../../../../../state/session";
import {
  Button,
  Card,
  Group,
  ListRow,
  Notice,
  Screen,
  Section,
  T,
} from "../../../../../ui/components";
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
        title="This phone"
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
          <ListRow
            title="Local data"
            detail={encrypted ? "Encrypted" : "Not encrypted (Expo Go preview)"}
          />
          <ListRow title="Device ID" subtitle={sync.store.deviceId} />
        </Group>
      </Section>
      {status.error ? <T muted>Last error: {status.error}</T> : null}
      {status.uploads.lastError ? <T muted>Last upload error: {status.uploads.lastError}</T> : null}
      {status.phase === "signed_out" ? (
        <Button title="Sign In Again" onPress={() => router.push("/reauth")} />
      ) : (
        <Button
          title="Sync Now"
          kind="secondary"
          onPress={() => {
            sync.retryUploads();
            void sync
              .syncNow()
              .catch((e: unknown) =>
                Alert.alert("Couldn’t sync", e instanceof Error ? e.message : String(e)),
              );
          }}
          loading={status.phase === "syncing"}
        />
      )}
      {status.problems.length > 0 ? (
        <Section title="Changes that could not be saved">
          <View style={{ gap: space["3"] }}>
            {status.problems.map((p) => (
              <Card key={p.seq}>
                <T variant="bodyEmphasis">
                  {p.table.replace(/_/g, " ")}: {p.fields.join(", ")}
                </T>
                <T variant="secondary" muted>
                  {p.error}
                </T>
                <Button
                  title="Discard This Change"
                  kind="danger"
                  onPress={() => sync.discardProblem(p.seq)}
                />
              </Card>
            ))}
          </View>
        </Section>
      ) : null}
    </Screen>
  );
}
