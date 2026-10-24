import { router, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useRef, useState } from "react";
import { StyleSheet, Text, type TextInput } from "react-native";
import {
  HEARD_FROM_NONE,
  HEARD_FROM_OPTIONS,
  HEARD_FROM_OTHER_MAX,
  HEARD_FROM_OTHER_PLACEHOLDER,
  HEARD_FROM_QUESTION,
  heardFromLink,
  passwordProblem,
  TERMS_CONSENT,
  type HeardFrom,
} from "@leakbook/core";
import { AuthFrame } from "../../features/auth/AuthFrame";
import { API_URL } from "../../lib/config";
import { Button, FieldGroup, FieldRow, Notice, PickerRow, T } from "../../ui/components";
import { PasswordRow } from "../../ui/PasswordRow";
import { useSession } from "../../state/session";
import { color } from "../../ui/theme";

export default function SignUp() {
  const { signUp } = useSession();
  // A sign-up link's ?from=<option> (or ?ref=) picks the answer (owner, 2026-10-24).
  const params = useLocalSearchParams<{ from?: string; ref?: string }>();
  const [heardFrom, setHeardFrom] = useState<HeardFrom | null>(() => heardFromLink(params));
  const [heardOther, setHeardOther] = useState("");
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
    const weak = passwordProblem(password);
    if (weak) return setError(weak);
    setBusy(true);
    setError(null);
    const r = await signUp(name, email, password, heardFrom, heardOther);
    setBusy(false);
    if (r.error) setError(r.error);
    if (r.confirmEmail) setConfirm(true);
  }

  return (
    <AuthFrame
      title="Create an Account"
      intro="If your company already uses Sundeck Pro, ask the owner to invite this email, then sign up here."
    >
      {confirm ? (
        <Notice tone="success">
          Check your email and tap the link to confirm your account, then sign in.
        </Notice>
      ) : null}
      <FieldGroup labelWidth={104}>
        <FieldRow
          label="Your name"
          value={name}
          onChangeText={setName}
          placeholder="Required"
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
          placeholder="name@example.com"
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          autoComplete="email"
          keyboardType="email-address"
          textContentType="username"
          next={passwordRef}
        />
        <PasswordRow
          ref={passwordRef}
          label="Password"
          value={password}
          onChangeText={setPassword}
          placeholder="Required"
          autoComplete="new-password"
          textContentType="newPassword"
          // Suggested passwords follow the rules; their symbols are ones Supabase counts.
          passwordRules="minlength: 10; required: lower; required: upper; required: digit; required: [-!@#$%^&*()_+=;:,.?];"
          returnKeyType="go"
          onSubmitEditing={submit}
          meter
        />
      </FieldGroup>
      {/* "How did you hear about us?" (owner, 2026-10-24): optional, same list as the website. */}
      <FieldGroup>
        <PickerRow
          label={HEARD_FROM_QUESTION}
          placeholder={HEARD_FROM_NONE}
          options={HEARD_FROM_OPTIONS.map((o) => ({ value: o.key, label: o.label }))}
          value={heardFrom}
          onChange={setHeardFrom}
        />
        {heardFrom === "other" ? (
          <FieldRow
            label="Where you heard about us"
            layout="full"
            placeholder={HEARD_FROM_OTHER_PLACEHOLDER}
            value={heardOther}
            onChangeText={setHeardOther}
            maxLength={HEARD_FROM_OTHER_MAX}
            autoCorrect={false}
          />
        ) : null}
      </FieldGroup>
      {error ? <Notice tone="error">{error}</Notice> : null}
      <Button title={busy ? "Creating…" : "Create Account"} wide onPress={submit} disabled={busy} />
      <TermsConsent />
      <Button
        title="I Already Have an Account"
        kind="quiet"
        wide
        onPress={() => (router.canGoBack() ? router.back() : router.replace("/sign-in"))}
      />
    </AuthFrame>
  );
}

/**
 * "By creating an account, you agree to the Terms and Privacy Policy." under Create Account
 * (owner, 2026-10-24), as on the website's sign-ups and the iPhone app: quiet secondary text,
 * 15 pt, centered. The links open in the in-app browser.
 */
function TermsConsent() {
  const c = TERMS_CONSENT;
  const open = (path: string) =>
    void WebBrowser.openBrowserAsync(`${API_URL ?? "https://sundeckpro.com"}${path}`);
  return (
    <T variant="secondary" muted style={styles.consent}>
      {c.before}
      <Text
        style={styles.link}
        accessibilityRole="link"
        onPress={() => open(`/in-app${c.termsPath}`)}
      >
        {c.terms}
      </Text>
      {c.between}
      <Text
        style={styles.link}
        accessibilityRole="link"
        onPress={() => open(`/in-app${c.privacyPath}`)}
      >
        {c.privacy}
      </Text>
      {c.after}
    </T>
  );
}

const styles = StyleSheet.create({
  consent: { textAlign: "center" },
  link: { color: color.link, textDecorationLine: "underline" },
});
