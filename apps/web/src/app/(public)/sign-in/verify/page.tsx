import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { safePath } from "@leakbook/core";
import { signOut } from "@/app/actions/auth";
import { AuthCard, FormSkeleton } from "@/components/auth-card";
import { VerifyCodeForm } from "@/components/two-step";
import { getUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Enter Your Code · Tidemark" };

/** Two-step sign-in (owner, 2026-10-16): the authenticator code after the password. */
export default function VerifyPage({ searchParams }: PageProps<"/sign-in/verify">) {
  return (
    <AuthCard
      title="Enter Your Code"
      intro="Open your authenticator app and enter the 6-digit code for Tidemark."
    >
      <Suspense fallback={<FormSkeleton />}>
        <VerifyBody searchParams={searchParams} />
      </Suspense>
    </AuthCard>
  );
}

async function VerifyBody({ searchParams }: Pick<PageProps<"/sign-in/verify">, "searchParams">) {
  const user = await getUser();
  if (!user) redirect("/sign-in");
  const next = safePath((await searchParams).next);
  if (user.aal === "aal2") redirect(next);
  return (
    <>
      <VerifyCodeForm next={next} />
      <form action={signOut} className="mt-4">
        <button type="submit" className="mx-auto block min-h-11 px-3 text-link">
          Use a Different Account
        </button>
      </form>
      <p className="mt-4 text-center text-[0.9375rem] text-text-muted">
        Lost your phone? Email support from your account’s address and we’ll help you back in.
      </p>
    </>
  );
}
