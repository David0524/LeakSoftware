"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import {
  acceptInvite,
  createCompany,
  sendSignInLink,
  signIn,
  startTrial,
  type FormState,
} from "@/app/actions/auth";
import { Button, Field, Notice } from "./ui";

/** The browser's time zone, so a new company's schedule shows local times. */
function TimezoneInput() {
  return (
    <input
      type="hidden"
      name="timezone"
      ref={(el) => {
        if (el) el.value = Intl.DateTimeFormat().resolvedOptions().timeZone;
      }}
    />
  );
}

function Messages({ state }: { state: FormState }) {
  if (state.error) return <Notice tone="error">{state.error}</Notice>;
  if (state.message) return <Notice tone="success">{state.message}</Notice>;
  return null;
}

export function SignInForm({ next }: { next: string }) {
  const [withLink, setWithLink] = useState(false);
  const [passwordState, passwordAction, passwordPending] = useActionState(signIn, {});
  const [linkState, linkAction, linkPending] = useActionState(sendSignInLink, {});

  if (withLink) {
    return (
      <form action={linkAction} className="space-y-4">
        <input type="hidden" name="next" value={next} />
        <Field
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={linkState.values?.email}
        />
        <Messages state={linkState} />
        <Button type="submit" disabled={linkPending} className="w-full">
          {linkPending ? "Sending…" : "Email Me a Sign-In Link"}
        </Button>
        <Button type="button" kind="quiet" className="w-full" onClick={() => setWithLink(false)}>
          Use a Password Instead
        </Button>
      </form>
    );
  }
  return (
    <form action={passwordAction} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <Field
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
        defaultValue={passwordState.values?.email}
      />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
      />
      <Messages state={passwordState} />
      <Button type="submit" disabled={passwordPending} className="w-full">
        {passwordPending ? "Signing In…" : "Sign In"}
      </Button>
      <Button type="button" kind="quiet" className="w-full" onClick={() => setWithLink(true)}>
        Email Me a Sign-In Link Instead
      </Button>
    </form>
  );
}

export function TrialForm() {
  const [state, action, pending] = useActionState(startTrial, {});
  if (state.message) return <Notice tone="success">{state.message}</Notice>;
  return (
    <form action={action} className="space-y-4" noValidate>
      <TimezoneInput />
      <Field
        label="Your name"
        name="name"
        autoComplete="name"
        defaultValue={state.values?.name}
        error={state.fields?.name}
      />
      <Field
        label="Company name"
        name="company"
        autoComplete="organization"
        defaultValue={state.values?.company}
        error={state.fields?.company}
      />
      <Field
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        defaultValue={state.values?.email}
        error={state.fields?.email}
      />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        hint="At least 10 characters."
        error={state.fields?.password}
      />
      <Messages state={state} />
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Setting Up…" : "Start Free Trial"}
      </Button>
      <p className="text-center text-text-muted">
        Already using Tidemark?{" "}
        <Link href="/sign-in" className="text-link underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}

export function SetupForm({ suggested }: { suggested: string }) {
  const [state, action, pending] = useActionState(createCompany, {});
  return (
    <form action={action} className="space-y-4">
      <TimezoneInput />
      <Field
        label="Company name"
        name="company"
        autoComplete="organization"
        defaultValue={state.values?.company ?? suggested}
        error={state.fields?.company}
      />
      <Messages state={state} />
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Creating…" : "Create Company"}
      </Button>
    </form>
  );
}

export function InviteForm({
  token,
  email,
  signedInAs,
}: {
  token: string;
  email: string;
  signedInAs: string | null;
}) {
  const [mode, setMode] = useState<"sign-up" | "sign-in">("sign-up");
  const [state, action, pending] = useActionState(acceptInvite, {});
  if (state.message) return <Notice tone="success">{state.message}</Notice>;

  if (signedInAs) {
    return (
      <form action={action} className="space-y-4">
        <input type="hidden" name="token" value={token} />
        <p>
          Signed in as <strong>{signedInAs}</strong>.
        </p>
        {signedInAs.toLowerCase() !== email.toLowerCase() ? (
          <Notice tone="warning">
            This invite is for {email}. Sign out and sign in with that email to accept it.
          </Notice>
        ) : null}
        <Messages state={state} />
        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Joining…" : "Accept Invite"}
        </Button>
      </form>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="mode" value={mode} />
      <input type="hidden" name="email" value={email} />
      <Field label="Email" name="email-shown" value={email} readOnly disabled />
      {mode === "sign-up" ? (
        <Field
          label="Your name"
          name="name"
          autoComplete="name"
          defaultValue={state.values?.name}
          error={state.fields?.name}
        />
      ) : null}
      <Field
        label={mode === "sign-up" ? "Choose a password" : "Password"}
        name="password"
        type="password"
        autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
        hint={mode === "sign-up" ? "At least 10 characters." : undefined}
        error={state.fields?.password}
      />
      <Messages state={state} />
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Joining…" : mode === "sign-up" ? "Create Account and Join" : "Sign In and Join"}
      </Button>
      <Button
        type="button"
        kind="quiet"
        className="w-full"
        onClick={() => setMode(mode === "sign-up" ? "sign-in" : "sign-up")}
      >
        {mode === "sign-up" ? "I Already Have an Account" : "Create a New Account"}
      </Button>
    </form>
  );
}
