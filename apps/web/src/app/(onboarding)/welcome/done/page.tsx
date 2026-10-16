import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { companyServices, onboardingPackage } from "@leakbook/core";
import { ButtonLink, Row } from "@/components/ui";
import { getOffice } from "@/lib/auth";
import { getAccess, getCompany } from "@/lib/data";
import { confirmCheckout } from "@/server/billing";

export const metadata: Metadata = { title: "You’re All Set · Tidemark" };

/** Back from Checkout (or the end of onboarding without billing): the next few things to do. */
export default function DonePage({ searchParams }: PageProps<"/welcome/done">) {
  return (
    <Suspense fallback={<div className="flex-1" aria-label="Loading" />}>
      <DoneBody searchParams={searchParams} />
    </Suspense>
  );
}

async function DoneBody({
  searchParams,
}: {
  searchParams: PageProps<"/welcome/done">["searchParams"];
}) {
  const office = await getOffice();
  if (!office.isOwner) redirect("/home");
  const { session_id } = await searchParams;
  if (typeof session_id === "string" && session_id) {
    try {
      await confirmCheckout(session_id, office.company.id);
    } catch {
      // The webhook links it in a moment; the page below says so if it hasn't yet.
    }
  }
  const [access, company] = await Promise.all([getAccess(office), getCompany(office)]);
  if (access?.needs_card) redirect("/welcome?step=card");
  const pkg = onboardingPackage(companyServices(company.settings));
  const steps =
    pkg === "leak"
      ? [
          {
            href: "/settings/team",
            label: "Invite your techs",
            detail: "They sign in on the Tidemark app.",
          },
          {
            href: "/settings/payments",
            label: "Set up customer payments",
            detail: "Deposits and invoices go to your own Stripe account.",
          },
          {
            href: "/jobs/new",
            label: "Book your first job",
            detail: "Inspect it on the phone, report on site.",
          },
        ]
      : [
          {
            href: "/settings/team",
            label: "Invite your techs",
            detail: "They sign in on the Tidemark app.",
          },
          {
            href: "/customers",
            label: "Add your customers and their pools",
            detail: "Then give each one a visit plan.",
          },
          {
            href: "/settings/payments",
            label: "Set up customer payments",
            detail: "Monthly invoices are paid to your own Stripe account.",
          },
        ];
  return (
    <div className="mx-auto w-full max-w-md flex-1 px-4 pt-12 pb-8">
      {/* eslint-disable-next-line @next/next/no-img-element -- static SVG */}
      <img src="/tidemark-mark.svg" alt="" width={48} height={70} className="mx-auto mb-4" />
      <h1 className="text-center font-display text-[2.125rem] leading-tight font-extrabold">
        You’re All Set
      </h1>
      <p className="mt-2 text-center text-text-muted">
        {access?.onboarded === false
          ? "Your card is in. Your shop finishes setting up in a moment."
          : `${company.name} is ready. Here’s where to start.`}
      </p>
      <ul className="grouped mt-8" data-testid="next-steps">
        {steps.map((s) => (
          <Row key={s.href} href={s.href} label={s.label} detail={s.detail} />
        ))}
      </ul>
      <ButtonLink href="/home" className="mt-8 w-full">
        Start Using Tidemark
      </ButtonLink>
    </div>
  );
}
