import type { Metadata } from "next";
import { AuthCard } from "@/components/auth-card";
import { TrialForm } from "@/components/auth-forms";

export const metadata: Metadata = { title: "Start Free Trial · LeakBook" };

export default function SignUpPage() {
  return (
    <AuthCard
      title="Start Your Free Trial"
      intro="30 days free. You’ll be the owner of your shop’s account and can invite your techs next."
    >
      <TrialForm />
    </AuthCard>
  );
}
