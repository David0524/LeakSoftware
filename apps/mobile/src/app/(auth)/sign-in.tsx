import { router } from "expo-router";
import { useRef, useState } from "react";
import { View, type TextInput } from "react-native";
import { Button, FieldGroup, FieldRow, Notice, Screen } from "../../ui/components";
import { useSession } from "../../state/session";
import { AuthTitle, BrandHeader } from "../../ui/BrandHeader";
import { color, ios } from "../../ui/theme";

export default function SignIn() {
  const { signIn } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const passwordRef = useRef<TextInput>(null);

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
    <View style={{ flex: 1, backgroundColor: color.bg }}>
      {ios ? null : <BrandHeader />}
      <Screen>
        <AuthTitle title="Sign In" />
        {error ? (
          <Notice tone="error" tinted>
            {error}
          </Notice>
        ) : null}
        <FieldGroup labelWidth={96}>
          <FieldRow
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
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={submit}
          />
        </FieldGroup>
        <Button title="Sign In" wide onPress={submit} loading={busy} />
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
