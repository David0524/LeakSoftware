import { useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { Button, Card, Field, Notice, Screen, T } from "../ui/components";
import { BrandHeader } from "../ui/BrandHeader";
import { useSession, useSyncStatus } from "../state/session";
import { color } from "../ui/theme";

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
        <BrandHeader />
        <Screen>
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
      <BrandHeader />
      <Screen>
        <T variant="title">Set Up Your Company</T>
        <T variant="muted">Signed in as {user?.email}</T>
        {error ? <Notice tone="error">{error}</Notice> : null}
        <Card>
          <T variant="heading">Start a New Company</T>
          <T variant="muted">You’ll be the owner. You can invite your techs after.</T>
          <Field
            label="Company name"
            value={companyName}
            onChangeText={setCompanyName}
            autoCapitalize="words"
          />
          <Button
            title="Create Company"
            onPress={() => void call("create")}
            loading={busy === "create"}
          />
        </Card>
        <Card>
          <T variant="heading">Join Your Team</T>
          <T variant="muted">Use the invite code your owner sent to {user?.email}.</T>
          <Field
            label="Invite code"
            value={inviteCode}
            onChangeText={setInviteCode}
            autoCapitalize="none"
          />
          <Button
            title="Join"
            kind="secondary"
            onPress={() => void call("join")}
            loading={busy === "join"}
          />
        </Card>
        <Button title="Sign Out" kind="quiet" onPress={() => void signOut()} />
      </Screen>
    </View>
  );
}
