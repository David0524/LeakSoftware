import type { Metadata } from "next";
import { TermsBody } from "@/components/site-pages/terms";

export const metadata: Metadata = {
  title: "Terms of Service · Sundeck Pro",
  alternates: { canonical: "/terms" },
};

export default function InAppTermsPage() {
  return <TermsBody inApp />;
}
