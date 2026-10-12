import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthCard, FormSkeleton } from "@/components/auth-card";
import { SignInForm } from "@/components/auth-forms";
import { getUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Sign In · LeakBook" };

export default function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  return (
    <AuthCard
      title="Sign In"
      intro={
        <>
          New to LeakBook?{" "}
          <Link href="/sign-up" className="text-link underline">
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
  const next = typeof params.next === "string" ? params.next : "/jobs";
  if (await getUser()) redirect(next.startsWith("/") ? next : "/jobs");
  return (
    <>
      {params.error ? (
        <p role="alert" className="mb-4 text-status-fail">
          That sign-in link has expired or was already used. Request a new one.
        </p>
      ) : null}
      <SignInForm next={next} />
    </>
  );
}
