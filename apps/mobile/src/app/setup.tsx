import { useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { Block, Button, FieldGroup, FieldRow, Notice, Screen, T } from "../ui/components";
import { AuthTitle, BrandHeader } from "../ui/BrandHeader";
import { useSession, useSyncStatus } from "../state/session";
import { color, ios } from "../ui/theme";

/**
 * Shown after sign-in until this phone has a company: first download, or join by invite. New
 * shops start on the website, where the owner sets up the shop and its trial (owner,
 * 2026-10-16); the app doesn't link there, since an iPhone app may not send people to an
 * outside purchase.
 */
export default function Setup() {
  const { services, user, signOut } = useSession();
  const status = useSyncStatus();
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function join() {
    setError(null);
    if (!inviteCode.trim()) return setError("Enter the invite code from your email.");
    setBusy(true);
    const { error: rpcError } = await services.supabase.rpc("accept_invite", {
      invite_token: inviteCode.trim(),
    });
    if (rpcError) {
      setBusy(false);
      return setError(
        /network|fetch/i.test(rpcError.message)
          ? "No connection. Try again when you're online."
          : rpcError.message,
      );
    }
    await services.sync.syncNow();
    setBusy(false);
  }
  if (!status.initialSyncDone) {
    const offline = status.phase === "offline";
    return (
      <View style={{ flex: 1, backgroundColor: color.bg }}>
        {ios ? null : <BrandHeader />}
        <Screen>
          <AuthTitle />
          {offline ? (
            <Notice tone="warning">
              Connect to the internet once so this phone can download your company. After that, it
              works without signal.
            </Notice>
          ) : (
            <View style={{ alignItems: "center", gap: 12, paddingVertical: 32 }}>
              <ActivityIndicator size="large" color={color.water} />
              <T variant="strong">Downloading your company…</T>
            </View>
          )}
          {status.error ? <Notice tone="error">{status.error}</Notice> : null}
          <Button title="Try Again" kind="secondary" onPress={() => void services.sync.syncNow()} />
          <Button title="Sign Out" kind="quiet" onPress={() => void signOut()} />
        </Screen>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: color.bg }}>
      {ios ? null : <BrandHeader />}
      <Screen>
        <AuthTitle title="Welcome to Tidemark" />
        <T variant="muted" style={ios && { textAlign: "center" }}>
          Signed in as {user?.email}
        </T>
        {error ? (
          <Notice tone="error" tinted>
            {error}
          </Notice>
        ) : null}
        <Block
          title="Join Your Team"
          note={`Use the invite code your owner sent to ${user?.email ?? ""}.`}
        >
          <FieldGroup labelWidth={132}>
            <FieldRow
              label="Invite code"
              value={inviteCode}
              onChangeText={setInviteCode}
              placeholder={ios ? "From your email" : undefined}
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              autoComplete="off"
              textContentType="none"
              returnKeyType={ios ? "join" : "go"}
              onSubmitEditing={() => void join()}
            />
          </FieldGroup>
          <Button title="Join" kind="secondary" onPress={() => void join()} loading={busy} />
        </Block>
        <Block
          title="Starting a New Shop?"
          note="The owner sets up the shop on the Tidemark website, then signs in here with the same email."
        />
        <Button title="Sign Out" kind="quiet" onPress={() => void signOut()} />
      </Screen>
    </View>
  );
}
