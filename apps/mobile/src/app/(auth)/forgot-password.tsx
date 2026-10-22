import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Text } from "react-native";
import { RESET_INTRO, RESET_TITLE, requestPasswordReset } from "../../data/password-reset";
import { AuthFrame } from "../../features/auth/AuthFrame";
import { Button, FieldGroup, FieldRow, Notice } from "../../ui/components";
import { color, MAX_TEXT_SCALE, type } from "../../ui/theme";

/** Forgot Password? (owner, 2026-10-22): the website's Reset Password page. */
export default function ForgotPassword() {
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(params.email ?? "");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    setSent(null);
    const result = await requestPasswordReset(email);
    setBusy(false);
    if ("error" in result) setError(result.error);
    else setSent(result.message);
  }

  return (
    <AuthFrame
      title={RESET_TITLE}
      intro={
        <Text
          style={[type.body, { color: color.textMuted, textAlign: "center" }]}
          maxFontSizeMultiplier={MAX_TEXT_SCALE}
        >
          {RESET_INTRO}
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
          returnKeyType="send"
          onSubmitEditing={submit}
        />
      </FieldGroup>
      {error ? <Notice tone="error">{error}</Notice> : null}
      {sent ? <Notice tone="success">{sent}</Notice> : null}
      <Button
        title={busy ? "Sending…" : "Email Me a Reset Link"}
        wide
        onPress={submit}
        disabled={busy}
      />
      <Button title="Back to Sign In" kind="quiet" wide onPress={() => router.back()} />
    </AuthFrame>
  );
}
