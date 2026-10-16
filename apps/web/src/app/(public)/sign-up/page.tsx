import type { Metadata } from "next";
import { Suspense } from "react";
import { parseServices } from "@leakbook/core";
import { AuthCard } from "@/components/auth-card";
import { TrialForm } from "@/components/auth-forms";

export const metadata: Metadata = { title: "Start Free Trial · Tidemark" };

export default function SignUpPage({ searchParams }: PageProps<"/sign-up">) {
  return (
    <AuthCard
      title="Start Your Free Trial"
      intro="30 days free. You’ll be the owner of your shop’s account and can invite your techs next."
    >
      <Suspense fallback={<TrialForm />}>
        <TrialBody searchParams={searchParams} />
      </Suspense>
    </AuthCard>
  );
}

/** The home page's package (?package=pool or leak) picks the shop's services to start with. */
async function TrialBody({ searchParams }: Pick<PageProps<"/sign-up">, "searchParams">) {
  const { package: pkg } = await searchParams;
  return <TrialForm services={parseServices(pkg) ?? "pool"} />;
}
