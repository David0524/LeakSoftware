import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { Button, Field, Notice, Screen, T } from "../../ui/components";
import { useSession } from "../../state/session";
import { BrandHeader } from "../../ui/BrandHeader";

export default function SignIn() {
  const { signIn } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    setBusy(true);
    setError(null);
    const err = await signIn(email, password);
    setBusy(false);
    if (err) setError(err);
  }

  return (
    <View style={{ flex: 1 }}>
      <BrandHeader />
      <Screen>
        <T variant="title">Sign In</T>
        {error ? <Notice tone="error">{error}</Notice> : null}
        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="username"
        />
        <Field
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="password"
          textContentType="password"
          onSubmitEditing={submit}
        />
        <Button title="Sign In" onPress={submit} loading={busy} />
        <Button title="Create an Account" kind="quiet" onPress={() => router.push("/sign-up")} />
        {__DEV__ ? (
          <Notice>
            Demo accounts (dev only): tech@demo.leakbook.test or owner@demo.leakbook.test, password
            leakbook-demo
          </Notice>
        ) : null}
      </Screen>
    </View>
  );
}
