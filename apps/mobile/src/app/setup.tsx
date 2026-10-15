import { useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { Block, Button, FieldGroup, FieldRow, Notice, Screen, T } from "../ui/components";
import { AuthTitle, BrandHeader } from "../ui/BrandHeader";
import { useSession, useSyncStatus } from "../state/session";
import { color, ios } from "../ui/theme";

/** Shown after sign-in until this phone has a company: first download, create, or join. */
export default function Setup() {
  const { services, user, signOut } = useSession();
  const status = useSyncStatus();
  const [companyName, setCompanyName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"create" | "join" | null>(null);

  async function call(kind: "create" | "join") {
    setError(null);
    if (kind === "create" && !companyName.trim()) return setError("Enter your company name.");
    if (kind === "join" && !inviteCode.trim())
      return setError("Enter the invite code from your email.");
    setBusy(kind);
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const { error: rpcError } =
      kind === "create"
        ? await services.supabase.rpc("create_company", {
            company_name: companyName.trim(),
            company_timezone: timezone,
          })
        : await services.supabase.rpc("accept_invite", { invite_token: inviteCode.trim() });
    if (rpcError) {
      setBusy(null);
      return setError(
        /network|fetch/i.test(rpcError.message)
          ? "No connection. Try again when you're online."
          : rpcError.message,
      );
    }
    await services.sync.syncNow();
    setBusy(null);
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
        <AuthTitle title="Set Up Your Company" />
        <T variant="muted" style={ios && { textAlign: "center" }}>
          Signed in as {user?.email}
        </T>
        {error ? (
          <Notice tone="error" tinted>
            {error}
          </Notice>
        ) : null}
        <Block
          title="Start a New Company"
          note="You’ll be the owner. You can invite your techs after."
        >
          <FieldGroup labelWidth={132}>
            <FieldRow
              label="Company name"
              value={companyName}
              onChangeText={setCompanyName}
              placeholder={ios ? "Required" : undefined}
              autoCapitalize="words"
              autoComplete="organization"
              textContentType="organizationName"
              returnKeyType="go"
              onSubmitEditing={() => void call("create")}
            />
          </FieldGroup>
          <Button
            title="Create Company"
            onPress={() => void call("create")}
            loading={busy === "create"}
          />
        </Block>
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
              onSubmitEditing={() => void call("join")}
            />
          </FieldGroup>
          <Button
            title="Join"
            kind="secondary"
            onPress={() => void call("join")}
            loading={busy === "join"}
          />
        </Block>
        <Button title="Sign Out" kind="quiet" onPress={() => void signOut()} />
      </Screen>
    </View>
  );
}
