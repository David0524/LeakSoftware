import type { Metadata } from "next";
import { sharePreview } from "@/lib/share-preview";
import { TermsBody } from "@/components/site-pages/terms";

export const metadata: Metadata = {
  title: "Terms of Service · Sundeck Pro",
  ...sharePreview("Terms of Service · Sundeck Pro", "The terms for using Sundeck Pro."),
};

export default function TermsPage() {
  return <TermsBody />;
}
