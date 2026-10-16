import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthCard, FormSkeleton } from "@/components/auth-card";
import { SignInForm } from "@/components/auth-forms";
import { Banner } from "@/components/doc-ui";
import { getUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Sign In · Tidemark" };

export default function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  return (
    <AuthCard
      title="Sign In"
      intro={
        <>
          New to Tidemark?{" "}
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
  const next = typeof params.next === "string" ? params.next : "/home";
  if (await getUser()) redirect(next.startsWith("/") ? next : "/home");
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
