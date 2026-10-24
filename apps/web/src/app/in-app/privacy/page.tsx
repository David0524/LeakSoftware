import type { Metadata } from "next";
import { PrivacyBody } from "@/components/site-pages/privacy";

export const metadata: Metadata = {
  title: "Privacy Policy · Sundeck Pro",
  alternates: { canonical: "/privacy" },
};

export default function InAppPrivacyPage() {
  return <PrivacyBody inApp />;
}
