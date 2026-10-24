"use client";

import Link from "next/link";
import { useActionState, useRef, useState, type FocusEvent } from "react";
import {
  acceptInvite,
  createCompany,
  requestPasswordReset,
  sendSignInLink,
  setNewPassword,
  signIn,
  startTrial,
  type FormState,
} from "@/app/actions/auth";
import { captureLead } from "@/app/actions/leads";
import { parseServices, type Services } from "@leakbook/core";
import { Banner } from "./doc-ui";
import { HeardFromField } from "./heard-from-field";
import { ServicesChoice } from "./services-form";
import { Button, buttonClass, FieldGroup, GroupedField } from "./ui";
import { orOffline } from "@/lib/offline";

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
  if (state.error) return <Banner tone="error">{state.error}</Banner>;
  if (state.message) return <Banner tone="success">{state.message}</Banner>;
  return null;
}

/** Keyboard and autofill settings for each kind of field (iOS: the right keyboard, no caps). */
const EMAIL = {
  type: "email",
  inputMode: "email",
  autoComplete: "email",
  autoCapitalize: "none",
  autoCorrect: "off",
  spellCheck: false,
  placeholder: "name@example.com",
} as const;
const NAME = {
  autoComplete: "name",
  autoCapitalize: "words",
  autoCorrect: "off",
  spellCheck: false,
  placeholder: "Full name",
} as const;
const COMPANY = {
  autoComplete: "organization",
  autoCapitalize: "words",
  autoCorrect: "off",
  spellCheck: false,
  placeholder: "Your shop’s name",
} as const;
const PHONE = {
  type: "tel",
  inputMode: "tel",
  autoComplete: "tel",
  placeholder: "(555) 555-0100",
} as const;
const PASSWORD = {
  type: "password",
  autoCapitalize: "none",
  autoCorrect: "off",
  spellCheck: false,
  placeholder: "Required",
} as const;

export function SignInForm({ next }: { next: string }) {
  const [withLink, setWithLink] = useState(false);
  const [passwordState, passwordAction, passwordPending] = useActionState(orOffline(signIn), {});
  const [linkState, linkAction, linkPending] = useActionState(orOffline(sendSignInLink), {});

  if (withLink) {
    return (
      <form action={linkAction} className="space-y-4">
        <input type="hidden" name="next" value={next} />
        <FieldGroup labelWidth="6rem">
          <GroupedField
            label="Email"
            name="email"
            {...EMAIL}
            required
            defaultValue={linkState.values?.email}
          />
        </FieldGroup>
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
      <FieldGroup labelWidth="6rem">
        <GroupedField
          label="Email"
          name="email"
          {...EMAIL}
          required
          defaultValue={passwordState.values?.email}
        />
        <GroupedField
          label="Password"
          name="password"
          {...PASSWORD}
          autoComplete="current-password"
          required
        />
      </FieldGroup>
      <Messages state={passwordState} />
      <Button type="submit" disabled={passwordPending} className="w-full">
        {passwordPending ? "Signing In…" : "Sign In"}
      </Button>
      <Link href="/forgot-password" className={buttonClass("quiet", "w-full")}>
        Forgot Password?
      </Link>
      <Button type="button" kind="quiet" className="w-full" onClick={() => setWithLink(true)}>
        Email Me a Sign-In Link Instead
      </Button>
    </form>
  );
}

/** Forgot Password? (owner, 2026-10-22): the email for a link to choose a new password. */
export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(orOffline(requestPasswordReset), {});
  return (
    <form action={action} className="space-y-4">
      <FieldGroup labelWidth="6rem">
        <GroupedField
          label="Email"
          name="email"
          {...EMAIL}
          required
          defaultValue={state.values?.email}
        />
      </FieldGroup>
      <Messages state={state} />
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Sending…" : "Email Me a Reset Link"}
      </Button>
      <Link href="/sign-in" className={buttonClass("quiet", "w-full")}>
        Back to Sign In
      </Link>
    </form>
  );
}

/** The new password, typed twice, from the reset link. Done: on to the office. */
export function NewPasswordForm() {
  const [state, action, pending] = useActionState(orOffline(setNewPassword), {});
  if (state.message)
    return (
      <div className="space-y-4">
        <Banner tone="success">
          {state.message} Every other device was signed out: sign in there with the new password.
        </Banner>
        <Link href="/home" className={buttonClass("primary", "w-full")}>
          Continue to Sundeck Pro
        </Link>
      </div>
    );
  return (
    <form action={action} className="space-y-4">
      <FieldGroup labelWidth="9rem">
        <GroupedField
          label="New password"
          name="password"
          {...PASSWORD}
          autoComplete="new-password"
          minLength={10}
          maxLength={72}
          required
          error={state.fields?.password}
        />
        <GroupedField
          label="Type it again"
          name="confirm"
          {...PASSWORD}
          autoComplete="new-password"
          required
        />
      </FieldGroup>
      <p className="text-[0.9375rem] text-text-muted max-sm:px-4">At least 10 characters.</p>
      <Messages state={state} />
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Saving…" : "Save New Password"}
      </Button>
    </form>
  );
}

export function TrialForm({
  services = "pool",
  heardFrom = null,
}: {
  services?: Services;
  /** Preselected from a sign-up link's ?from= (owner, 2026-10-24). */
  heardFrom?: string | null;
}) {
  const [state, action, pending] = useActionState(orOffline(startTrial), {});
  // Leads (owner, 2026-10-16): once the email is valid, what's typed so far is kept, so
  // Sundeck Pro can help people who don't finish. Sent again only when something changed.
  const sent = useRef("");
  function keep(e: FocusEvent<HTMLFormElement>) {
    const f = new FormData(e.currentTarget);
    const fields = {
      email: String(f.get("email") ?? "").trim(),
      name: String(f.get("name") ?? ""),
      company: String(f.get("company") ?? ""),
      phone: String(f.get("phone") ?? ""),
      services: String(f.get("services") ?? ""),
    };
    const key = JSON.stringify(fields);
    if (!/^\S+@\S+\.\S+$/.test(fields.email) || key === sent.current) return;
    sent.current = key;
    void captureLead(fields);
  }
  if (state.message) return <Banner tone="success">{state.message}</Banner>;
  return (
    <form action={action} onBlur={keep} className="space-y-4" noValidate>
      <TimezoneInput />
      <FieldGroup labelWidth="8.25rem">
        <GroupedField
          label="Your name"
          name="name"
          {...NAME}
          defaultValue={state.values?.name}
          error={state.fields?.name}
        />
        <GroupedField
          label="Company name"
          name="company"
          {...COMPANY}
          defaultValue={state.values?.company}
          error={state.fields?.company}
        />
        <GroupedField
          label="Email"
          name="email"
          {...EMAIL}
          defaultValue={state.values?.email}
          error={state.fields?.email}
        />
        <GroupedField
          label="Mobile phone"
          name="phone"
          {...PHONE}
          defaultValue={state.values?.phone}
          error={state.fields?.phone}
        />
        <GroupedField
          label="Password"
          name="password"
          {...PASSWORD}
          autoComplete="new-password"
          hint="At least 10 characters."
          error={state.fields?.password}
        />
      </FieldGroup>
      <ServicesChoice initial={parseServices(state.values?.services) ?? services} />
      <HeardFromField
        initial={state.values?.heard_from ?? heardFrom}
        initialOther={state.values?.heard_from_other}
      />
      <Messages state={state} />
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Setting Up…" : "Start Free Trial"}
      </Button>
      <p className="text-center text-[0.8125rem] text-text-muted">
        We may call or text to help you get set up.
      </p>
      <p className="text-center text-text-muted">
        Already using Sundeck Pro?{" "}
        <Link href="/sign-in" className="inline-flex min-h-11 items-center text-link underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}

export function SetupForm({
  suggested,
  services,
  heardFrom = null,
  heardFromOther = null,
}: {
  suggested: string;
  services: Services;
  /** The answer given at sign-up, if any (owner, 2026-10-24). */
  heardFrom?: string | null;
  heardFromOther?: string | null;
}) {
  const [state, action, pending] = useActionState(orOffline(createCompany), {});
  return (
    <form action={action} className="space-y-4">
      <TimezoneInput />
      <FieldGroup labelWidth="8.25rem">
        <GroupedField
          label="Company name"
          name="company"
          {...COMPANY}
          defaultValue={state.values?.company ?? suggested}
          error={state.fields?.company}
        />
      </FieldGroup>
      <ServicesChoice initial={services} />
      <HeardFromField
        initial={state.values?.heard_from ?? heardFrom}
        initialOther={state.values?.heard_from_other ?? heardFromOther}
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
  const [state, action, pending] = useActionState(orOffline(acceptInvite), {});
  if (state.message) return <Banner tone="success">{state.message}</Banner>;

  if (signedInAs) {
    return (
      <form action={action} className="space-y-4">
        <input type="hidden" name="token" value={token} />
        <p>
          Signed in as <strong>{signedInAs}</strong>.
        </p>
        {signedInAs.toLowerCase() !== email.toLowerCase() ? (
          // The database refuses another email, so there's nothing to press here.
          <Banner tone="warning">
            This invite is for {email}. Sign out and sign in with that email to accept it.
          </Banner>
        ) : (
          <>
            <Messages state={state} />
            <Button type="submit" disabled={pending} className="w-full">
              {pending ? "Joining…" : "Accept Invite"}
            </Button>
          </>
        )}
      </form>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="mode" value={mode} />
      <input type="hidden" name="email" value={email} />
      <FieldGroup labelWidth={mode === "sign-up" ? "9.5rem" : "6rem"}>
        {/* Shown (and offered to password managers as the account name), not posted. */}
        <GroupedField
          label="Email"
          name="email-shown"
          type="email"
          autoComplete="username"
          value={email}
          readOnly
          disabled
        />
        {mode === "sign-up" ? (
          <GroupedField
            label="Your name"
            name="name"
            {...NAME}
            defaultValue={state.values?.name}
            error={state.fields?.name}
          />
        ) : null}
        <GroupedField
          label={mode === "sign-up" ? "Choose a password" : "Password"}
          name="password"
          {...PASSWORD}
          autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
          hint={mode === "sign-up" ? "At least 10 characters." : undefined}
          error={state.fields?.password}
        />
      </FieldGroup>
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
