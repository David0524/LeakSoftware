import { useState } from "react";
import { AuthFrame } from "../features/auth/AuthFrame";
import { Button, FieldGroup, FieldRow, Notice } from "../ui/components";
import { useSession, useSyncStatus } from "../state/session";

/**
 * Two-step sign-in (owner, 2026-10-16): the code from the person's authenticator app, after
 * the password or when two-step was turned on from the website. Nothing syncs until it's in.
 */
export default function Code() {
  const { verifyCode, cancelCode } = useSession();
  const status = useSyncStatus();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!/^\d{6}$/.test(code.replace(/\s+/g, ""))) return setError("Enter the 6-digit code.");
    setBusy(true);
    setError(null);
    const err = await verifyCode(code);
    setBusy(false);
    if (err) setError(err);
  }

  return (
    <AuthFrame
      title="Enter Your Code"
      intro="Open your authenticator app and enter the 6-digit code for Sundeck Pro."
    >
      <FieldGroup labelWidth={96}>
        <FieldRow
          label="Code"
          value={code}
          onChangeText={setCode}
          placeholder="123456"
          keyboardType="number-pad"
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          maxLength={7}
          returnKeyType="go"
          onSubmitEditing={submit}
        />
      </FieldGroup>
      {error ? <Notice tone="error">{error}</Notice> : null}
      <Button title={busy ? "Checking…" : "Continue"} wide onPress={submit} disabled={busy} />
      {status.pending > 0 ? (
        <Notice tone="warning">
          This phone has {status.pending} change{status.pending === 1 ? "" : "s"} waiting to send.
          Enter your code to send them; signing out would lose them.
        </Notice>
      ) : null}
      <Button title="Sign Out" kind="quiet" wide onPress={() => void cancelCode()} />
    </AuthFrame>
  );
}
