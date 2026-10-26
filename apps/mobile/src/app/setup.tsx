import { useState } from "react";
import { View } from "react-native";
import { Block, Button, FieldGroup, FieldRow, Notice, Screen, T } from "../ui/components";
import { AuthTitle, BrandHeader } from "../ui/BrandHeader";
import { GettingReady } from "../features/setup/GettingReady";
import { useFirstDownloadOpen } from "../state/firstDownload";
import { useSession, useSyncStatus } from "../state/session";
import { color, ios } from "../ui/theme";

import { friendlyError } from "@leakbook/core";
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
  // The finished check shows for 0.6 s before the app opens (gestures spec section 11).
  const { finishing } = useFirstDownloadOpen(status.initialSyncDone);

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
          : friendlyError(rpcError.message),
      );
    }
    await services.sync.syncNow();
    setBusy(false);
  }
  if (!status.initialSyncDone || finishing) {
    const offline = status.phase === "offline" && !finishing;
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
            // Getting Ready: a pool that fills to the real progress.
            <GettingReady download={status.download} finishing={finishing} />
          )}
          {status.error ? <Notice tone="error">{status.error}</Notice> : null}
          {finishing ? null : (
            <>
              <Button
                title="Try Again"
                kind="secondary"
                onPress={() => void services.sync.syncNow()}
              />
              <Button title="Sign Out" kind="quiet" onPress={() => void signOut()} />
            </>
          )}
        </Screen>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: color.bg }}>
      {ios ? null : <BrandHeader />}
      <Screen>
        <AuthTitle title="Welcome to Sundeck Pro" />
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
          note="A shop’s owner sets it up on a computer, then signs in here with the same email."
        />
        <Button title="Sign Out" kind="quiet" onPress={() => void signOut()} />
      </Screen>
    </View>
  );
}
