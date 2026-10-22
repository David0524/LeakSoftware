import { router } from "expo-router";
import { useRef, useState } from "react";
import { Linking, Text, type TextInput } from "react-native";
import { AuthFrame } from "../../features/auth/AuthFrame";
import { API_URL } from "../../lib/config";
import { useSession } from "../../state/session";
import { Button, FieldGroup, FieldRow, Notice } from "../../ui/components";
import { color, ios, MAX_TEXT_SCALE, type } from "../../ui/theme";

/** Sign In (spec 5.13; the website's sign-in page). */
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

  // A trial is started on the website on iPhone (no sign-ups for a paid service in the app,
  // spec 8.4); Android creates the account here.
  const trial = () =>
    ios && API_URL ? void Linking.openURL(`${API_URL}/sign-up`) : router.push("/sign-up");

  return (
    <AuthFrame
      title="Sign In"
      intro={
        <Text
          style={[type.body, { color: color.textMuted, textAlign: "center" }]}
          maxFontSizeMultiplier={MAX_TEXT_SCALE}
        >
          New to Sundeck Pro?{" "}
          <Text
            accessibilityRole="link"
            onPress={trial}
            style={{ color: color.link, textDecorationLine: "underline" }}
          >
            Start a free trial
          </Text>
          .
        </Text>
      }
    >
      <FieldGroup labelWidth={96}>
        <FieldRow
          label="Email"
          value={email}
          onChangeText={setEmail}
          placeholder="name@example.com"
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
          placeholder="Required"
          secureTextEntry
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
      <Button
        title="Forgot Password?"
        kind="quiet"
        wide
        onPress={() => router.push({ pathname: "/forgot-password", params: { email } })}
      />
      {__DEV__ ? (
        <Notice>
          Demo accounts (dev only): tech@demo.leakbook.test or owner@demo.leakbook.test, password
          leakbook-demo
        </Notice>
      ) : null}
    </AuthFrame>
  );
}
