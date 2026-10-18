import { router } from "expo-router";
import { useRef, useState } from "react";
import { View, type TextInput } from "react-native";
import { Button, FieldGroup, FieldRow, Notice, Screen, T } from "../../ui/components";
import { useSession } from "../../state/session";
import { AuthTitle, BrandHeader } from "../../ui/BrandHeader";
import { color, ios, space } from "../../ui/theme";

export default function SignUp() {
  const { signUp } = useSession();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

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
    <View style={{ flex: 1, backgroundColor: color.bg }}>
      {ios ? null : <BrandHeader />}
      <Screen>
        <AuthTitle title="Create an Account" />
        <T variant="muted" style={ios && { textAlign: "center", paddingHorizontal: space["4"] }}>
          If your company already uses Sundeck Pro, ask the owner to invite this email, then sign up
          here.
        </T>
        {error ? (
          <Notice tone="error" tinted>
            {error}
          </Notice>
        ) : null}
        {confirm ? (
          <Notice tinted={ios}>
            Check your email and tap the link to confirm your account, then sign in.
          </Notice>
        ) : null}
        <FieldGroup labelWidth={104}>
          <FieldRow
            label="Your name"
            value={name}
            onChangeText={setName}
            placeholder={ios ? "Required" : undefined}
            autoCapitalize="words"
            autoCorrect={false}
            autoComplete="name"
            textContentType="name"
            next={emailRef}
          />
          <FieldRow
            ref={emailRef}
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder={ios ? "name@company.com" : undefined}
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            autoComplete="email"
            keyboardType="email-address"
            textContentType="username"
            next={passwordRef}
          />
          <FieldRow
            ref={passwordRef}
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder={ios ? "Required" : undefined}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="new-password"
            textContentType="newPassword"
            passwordRules="minlength: 10;"
            returnKeyType="go"
            onSubmitEditing={submit}
            hint="At least 10 characters."
          />
        </FieldGroup>
        <Button title="Create Account" onPress={submit} loading={busy} />
        <Button title="I Already Have an Account" kind="quiet" onPress={() => router.back()} />
      </Screen>
    </View>
  );
}
