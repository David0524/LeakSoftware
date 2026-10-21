"use client";

import { useActionState } from "react";
import {
  confirmTwoStep,
  startTwoStep,
  turnOffTwoStep,
  verifyTwoStep,
  type SetupState,
} from "@/app/actions/two-step";
import type { FormState } from "@/app/actions/auth";
import { Banner } from "./doc-ui";
import { Button, FieldGroup, GroupedField } from "./ui";
import { orOffline } from "@/lib/offline";

const CODE = {
  inputMode: "numeric" as const,
  autoComplete: "one-time-code",
  pattern: "[0-9 ]*",
  maxLength: 7,
  placeholder: "123456",
};

/** After the password: the code from the authenticator app. */
export function VerifyCodeForm({ next }: { next: string }) {
  const [state, act, pending] = useActionState(orOffline(verifyTwoStep), {} as FormState);
  return (
    <form action={act} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <FieldGroup labelWidth="6rem">
        <GroupedField
          label="Code"
          name="code"
          {...CODE}
          required
          autoFocus
          error={state.fields?.code}
        />
      </FieldGroup>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Checking…" : "Continue"}
      </Button>
    </form>
  );
}

/** More › Two-Step Sign-In: turn it on (scan, then the first code) or off. */
export function TwoStepSettings({ on }: { on: boolean }) {
  const [setup, start, starting] = useActionState(
    orOffline(async () => startTwoStep()),
    {} as SetupState,
  );
  const [confirmed, confirm, confirming] = useActionState(
    orOffline(confirmTwoStep),
    {} as SetupState,
  );
  const [off, turnOff, turningOff] = useActionState(
    orOffline(async () => turnOffTwoStep()),
    {} as FormState,
  );

  if (confirmed.message) return <Banner tone="success">{confirmed.message}</Banner>;
  if (off.message) return <Banner tone="success">{off.message}</Banner>;

  if (on)
    return (
      <form action={turnOff} className="space-y-4">
        <p>
          Two-step sign-in is <strong>on</strong>. Signing in needs your password and a code from
          your authenticator app.
        </p>
        {off.error ? <Banner tone="error">{off.error}</Banner> : null}
        <Button type="submit" kind="danger" disabled={turningOff} className="w-full">
          {turningOff ? "Turning Off…" : "Turn Off Two-Step Sign-In"}
        </Button>
      </form>
    );

  const current = confirmed.factorId ? confirmed : setup;
  if (!current.factorId)
    return (
      <form action={start} className="space-y-4">
        <p>
          Protect your shop’s customer records with a second step: after your password, a 6-digit
          code from an authenticator app on your phone (Apple Passwords, Google Authenticator,
          1Password, or similar). Someone who learns your password still can’t get in.
        </p>
        {setup.error ? <Banner tone="error">{setup.error}</Banner> : null}
        <Button type="submit" disabled={starting} className="w-full">
          {starting ? "Starting…" : "Set Up Two-Step Sign-In"}
        </Button>
      </form>
    );

  return (
    <form action={confirm} className="space-y-4">
      <input type="hidden" name="factorId" value={current.factorId} />
      <p>
        1. Scan this with your authenticator app, or enter the setup key. Keep the key somewhere
        safe: it sets the app up again on a new phone.
      </p>
      {/* eslint-disable-next-line @next/next/no-img-element -- a data: SVG from Supabase */}
      <img
        src={current.qr}
        alt="QR code for your authenticator app"
        width={200}
        height={200}
        className="mx-auto rounded-xl bg-white p-2"
      />
      <p className="text-center font-mono text-[0.9375rem] break-all" data-testid="two-step-secret">
        {current.secret}
      </p>
      <p>2. Enter the 6-digit code the app shows.</p>
      <FieldGroup labelWidth="6rem">
        <GroupedField label="Code" name="code" {...CODE} required error={confirmed.fields?.code} />
      </FieldGroup>
      {confirmed.error ? <Banner tone="error">{confirmed.error}</Banner> : null}
      <Button type="submit" disabled={confirming} className="w-full">
        {confirming ? "Checking…" : "Turn On Two-Step Sign-In"}
      </Button>
    </form>
  );
}
