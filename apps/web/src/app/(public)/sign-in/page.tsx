import type { Metadata } from "next";
import { safePath } from "@leakbook/core";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthCard, FormSkeleton } from "@/components/auth-card";
import { SignInForm } from "@/components/auth-forms";
import { Banner } from "@/components/doc-ui";
import { getUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Sign In · Sundeck Pro" };

export default function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  return (
    <AuthCard
      title="Sign In"
      intro={
        <>
          New to Sundeck Pro?{" "}
          <Link href="/sign-up" className="inline-flex min-h-11 items-center text-link underline">
            Start a free trial
          </Link>
          .
        </>
      }
    >
      <Suspense fallback={<FormSkeleton />}>
        <SignInBody searchParams={searchParams} />
      </Suspense>
    </AuthCard>
  );
}

async function SignInBody({ searchParams }: Pick<PageProps<"/sign-in">, "searchParams">) {
  const params = await searchParams;
  // Only same-site paths (security review 2026-10-16: "//evil.com" was let through).
  const next = safePath(params.next);
  if (await getUser()) redirect(next);
  return (
    <>
      {params.error ? (
        <div className="mb-4">
          <Banner tone="error">
            That sign-in link has expired or was already used. Request a new one.
          </Banner>
        </div>
      ) : null}
      <SignInForm next={next} />
    </>
  );
}
