import { router } from "expo-router";
import { useState } from "react";
import { Button, FieldGroup, FieldRow, Notice, Screen, T } from "../../ui/components";
import { useSession } from "../../state/session";
import { space } from "../../ui/theme";

/** Restore an expired sign-in without touching local data. */
export default function Reauth() {
  const { user, signIn, services } = useSession();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    const err = await signIn(user?.email ?? "", password);
    if (err) {
      setBusy(false);
      return setError(err);
    }
    await services.sync.syncNow();
    setBusy(false);
    router.back();
  }

  return (
    <Screen>
      <T muted style={{ paddingHorizontal: space["4"], textAlign: "center" }}>
        Signed in as {user?.email}. Everything on this phone stays put.
      </T>
      <FieldGroup labelWidth={96}>
        <FieldRow
          label="Password"
          value={password}
          onChangeText={setPassword}
          placeholder="Required"
          secureTextEntry
          autoFocus
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="go"
          onSubmitEditing={submit}
        />
      </FieldGroup>
      {error ? <Notice tone="error">{error}</Notice> : null}
      <Button title={busy ? "Signing In…" : "Sign In"} wide onPress={submit} disabled={busy} />
    </Screen>
  );
}
