"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import {
  MIN_INK,
  inkLength,
  signatureStatement,
  type SignaturePurpose,
  type SignatureStroke,
} from "@leakbook/core";
import { finishSignOff } from "@/app/actions/sign-off";
import { SignaturePad, uploadSignature } from "./media-work";
import { Segmented } from "./segmented";
import { Button, Field, Notice, buttonClass } from "./ui";

/**
 * The bottom of the report on the review screen: the statement in plain words, the
 * customer's name filled in, a large box, and Sign. Customer Not Here finishes it unsigned
 * (apple-design: one task, the primary action in reach, a way out).
 */
export function SignOff({
  reportId,
  jobId,
  purposes,
  signer,
  shop,
  address,
  blocked,
  back,
}: {
  reportId: string;
  jobId: string;
  purposes: { value: SignaturePurpose; label: string }[];
  signer: string;
  shop: string;
  address: string | null;
  /** Why the report can't be finished yet, if it can't. */
  blocked: string | null;
  back: string;
}) {
  const router = useRouter();
  const [purpose, setPurpose] = useState<SignaturePurpose | "">(purposes[0]?.value ?? "");
  const [name, setName] = useState(signer);
  const [role, setRole] = useState("");
  const [strokes, setStrokes] = useState<SignatureStroke[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"sign" | "away" | null>(null);

  if (blocked)
    return (
      <div className="space-y-3 border-t border-border pt-6">
        <Notice tone="warning">{blocked}</Notice>
        <Link href={back} className={buttonClass("secondary")}>
          Back to Job
        </Link>
      </div>
    );

  async function finish(customerAway: boolean) {
    setError(null);
    if (!customerAway && purposes.length) {
      if (!purpose) return setError("Choose what this signature is for.");
      if (!name.trim()) return setError("Enter your name.");
      if (inkLength(strokes) < MIN_INK) return setError("Sign in the box with your finger.");
    }
    setBusy(customerAway ? "away" : "sign");
    try {
      if (!customerAway && purpose) {
        await uploadSignature({ jobId, purpose, strokes, name, role });
      }
      const done = await finishSignOff({ reportId, jobId, customerAway });
      if (!done.ok) throw new Error(done.error);
      router.replace(`/jobs/${jobId}#wrap-up`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(null);
    }
  }

  // Shops that turned signatures off finish here without one.
  if (purposes.length === 0)
    return (
      <div className="space-y-3 border-t border-border pt-6">
        <h2 id="sign-title" className="font-display text-2xl font-bold">
          Finish Report
        </h2>
        {error ? <Notice tone="error">{error}</Notice> : null}
        <Button type="button" disabled={busy !== null} onClick={() => finish(false)}>
          {busy ? "Finishing…" : "Finish Report"}
        </Button>
      </div>
    );

  return (
    <div className="space-y-4 border-t-2 border-text pt-6">
      <div>
        <p className="text-[0.9375rem] font-semibold text-text-muted">
          {purposes.find((p) => p.value === purpose)?.label ?? "Signature"}
        </p>
        <h2 id="sign-title" className="font-display text-3xl font-extrabold">
          Please Sign
        </h2>
      </div>
      {purposes.length > 1 ? (
        <Segmented
          label="Signing for"
          name="purpose"
          value={purpose}
          onChange={setPurpose}
          options={purposes}
        />
      ) : null}
      <p className="text-[1.1875rem] leading-relaxed">
        {purpose ? signatureStatement(purpose, shop, address) : ""}
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Your name"
          name="signer_name"
          value={name}
          autoComplete="name"
          onChange={(e) => setName(e.target.value)}
        />
        <Field
          label="Role (optional)"
          name="signer_role"
          value={role}
          placeholder="Homeowner, property manager…"
          onChange={(e) => setRole(e.target.value)}
        />
      </div>
      <SignaturePad strokes={strokes} onChange={setStrokes} />
      {error ? (
        <p role="alert" className="text-status-fail">
          {error}
        </p>
      ) : null}
      <Button
        type="button"
        disabled={busy !== null}
        onClick={() => finish(false)}
        className="flex w-full"
      >
        {busy === "sign" ? "Saving…" : "Sign"}
      </Button>
      <div className="border-t border-border pt-4">
        <p className="text-[0.9375rem] text-text-muted">
          For the tech: nobody here to sign? Finish the report without a signature. It will say the
          customer wasn’t present.
        </p>
        <Button
          type="button"
          kind="quiet"
          disabled={busy !== null}
          onClick={() => finish(true)}
          className="mt-2"
        >
          {busy === "away" ? "Finishing…" : "Customer Not Here"}
        </Button>
      </div>
    </div>
  );
}
