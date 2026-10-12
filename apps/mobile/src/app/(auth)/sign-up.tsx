import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { Button, Field, Notice, Screen, T } from "../../ui/components";
import { useSession } from "../../state/session";
import { BrandHeader } from "../../ui/BrandHeader";

export default function SignUp() {
  const { signUp } = useSession();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!name.trim() || !email.trim()) return setError("Enter your name and email.");
    if (password.length < 10) return setError("Use a password of at least 10 characters.");
    setBusy(true);
    setError(null);
    const r = await signUp(name, email, password);
    setBusy(false);
    if (r.error) setError(r.error);
    if (r.confirmEmail) setConfirm(true);
  }

  return (
    <View style={{ flex: 1 }}>
      <BrandHeader />
      <Screen>
        <T variant="title">Create an account</T>
        <T variant="muted">
          If your company already uses LeakBook, ask the owner to invite this email, then sign up
          here.
        </T>
        {error ? <Notice tone="error">{error}</Notice> : null}
        {confirm ? (
          <Notice>Check your email and tap the link to confirm your account, then sign in.</Notice>
        ) : null}
        <Field
          label="Your name"
          value={name}
          onChangeText={setName}
          autoComplete="name"
          textContentType="name"
        />
        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
        />
        <Field
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          textContentType="newPassword"
          hint="At least 10 characters."
        />
        <Button title="Create account" onPress={submit} loading={busy} />
        <Button title="I already have an account" kind="quiet" onPress={() => router.back()} />
      </Screen>
    </View>
  );
}
