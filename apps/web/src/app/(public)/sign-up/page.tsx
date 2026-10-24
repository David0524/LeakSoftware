import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { heardFromLink, parseServices } from "@leakbook/core";
import { AuthCard } from "@/components/auth-card";
import { TrialForm } from "@/components/auth-forms";
import { getUser } from "@/lib/auth";
import { sharePreview } from "@/lib/share-preview";

export const metadata: Metadata = {
  title: "Start Free Trial · Sundeck Pro",
  ...sharePreview(
    "Start your 30-day free trial",
    "Set up your pool shop in minutes, then invite your techs. One app for routes, reports, quotes and payments.",
  ),
};

export default function SignUpPage({ searchParams }: PageProps<"/sign-up">) {
  return (
    <AuthCard
      title="Start Your Free Trial"
      intro="30 days free. You’ll set up your shop next, then invite your techs."
    >
      <Suspense fallback={<TrialForm />}>
        <TrialBody searchParams={searchParams} />
      </Suspense>
    </AuthCard>
  );
}

/**
 * The home page's package (?package=pool or leak) picks the shop's services to start with. A
 * link's ?from=<option> (or ?ref=, as on the laminate card: ?from=card) picks the answer to
 * "How did you hear about us?" (owner, 2026-10-24).
 */
async function TrialBody({ searchParams }: Pick<PageProps<"/sign-up">, "searchParams">) {
  const { package: pkg, from, ref } = await searchParams;
  // Already signed up (Back from setup, or the link again): on to their shop, which picks up
  // setup where it was, rather than the form a second time (owner, 2026-10-22).
  if (await getUser()) redirect("/home");
  return (
    <TrialForm services={parseServices(pkg) ?? "pool"} heardFrom={heardFromLink({ from, ref })} />
  );
}
