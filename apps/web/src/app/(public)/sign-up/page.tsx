import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { heardFromLink, parseServices, trialTerms } from "@leakbook/core";
import { AuthCard } from "@/components/auth-card";
import { TrialForm } from "@/components/auth-forms";
import { getUser } from "@/lib/auth";
import { sharePreview } from "@/lib/share-preview";
import { signUpCodeOffer } from "@/server/sign-up-code";

export const metadata: Metadata = {
  alternates: { canonical: "/sign-up" },
  title: "Start Free Trial · Sundeck Pro",
  ...sharePreview(
    "Start your 30-day free trial",
    "Set up your pool shop in minutes, then invite your techs. One app for routes, reports, quotes and payments.",
  ),
};

const NEXT_STEPS = "You’ll set up your shop next, then invite your techs.";

export default function SignUpPage({ searchParams }: PageProps<"/sign-up">) {
  return (
    <AuthCard
      title="Start Your Free Trial"
      intro={
        <Suspense fallback={`30 days free. ${NEXT_STEPS}`}>
          <TrialIntro searchParams={searchParams} />
        </Suspense>
      }
    >
      <Suspense fallback={<TrialForm />}>
        <TrialBody searchParams={searchParams} />
      </Suspense>
    </AuthCard>
  );
}

/** A link's ?code= (owner, 2026-11-23: the meetup's card), when it gives something. */
async function linkOffer(searchParams: PageProps<"/sign-up">["searchParams"]) {
  const { code } = await searchParams;
  return signUpCodeOffer(typeof code === "string" ? code : (code?.[0] ?? null));
}

/** "30 days free.", or the trial a link's code or the mailer gives ("3 months free."). */
async function TrialIntro({ searchParams }: Pick<PageProps<"/sign-up">, "searchParams">) {
  const { from, ref } = await searchParams;
  const offer = await linkOffer(searchParams);
  const { heading } = trialTerms(heardFromLink({ from, ref }), offer);
  return `${heading.charAt(0).toUpperCase()}${heading.slice(1)}. ${NEXT_STEPS}`;
}

/**
 * The home page's package (?package=pool or leak) picks the shop's services to start with. A
 * link's ?from=<option> (or ?ref=, as on the laminate card: ?from=card) picks the answer to
 * "How did you hear about us?" (owner, 2026-10-24). A link's ?code= (any case) shows its offer
 * and is applied once the shop exists (owner, 2026-11-23; server/sign-up-code.ts).
 */
async function TrialBody({ searchParams }: Pick<PageProps<"/sign-up">, "searchParams">) {
  const { package: pkg, from, ref } = await searchParams;
  // Already signed up (Back from setup, or the link again): on to their shop, which picks up
  // setup where it was, rather than the form a second time (owner, 2026-10-22).
  if (await getUser()) redirect("/home");
  const offer = await linkOffer(searchParams);
  return (
    <TrialForm
      services={parseServices(pkg) ?? "pool"}
      heardFrom={heardFromLink({ from, ref })}
      offer={offer}
    />
  );
}
