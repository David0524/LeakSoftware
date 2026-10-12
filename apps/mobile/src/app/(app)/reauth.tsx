import { router } from "expo-router";
import { useState } from "react";
import { Button, Field, Notice, Screen, T } from "../../ui/components";
import { useSession } from "../../state/session";

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
      <T variant="muted">Signed in as {user?.email}. Everything on this phone stays put.</T>
      {error ? <Notice tone="error">{error}</Notice> : null}
      <Field
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        onSubmitEditing={submit}
      />
      <Button title="Sign In" onPress={submit} loading={busy} />
    </Screen>
  );
}
