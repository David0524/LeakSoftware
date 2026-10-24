import type { Metadata } from "next";
import { SecurityBody } from "@/components/site-pages/security";

export const metadata: Metadata = {
  title: "Security · Sundeck Pro",
  alternates: { canonical: "/security" },
};

export default function InAppSecurityPage() {
  return <SecurityBody inApp />;
}
