import type { Metadata } from "next";
import { sharePreview } from "@/lib/share-preview";
import { TextingTermsBody } from "@/components/site-pages/texting-terms";

export const metadata: Metadata = {
  alternates: { canonical: "/texting-terms" },
  title: "Texting Terms · Sundeck Pro",
  ...sharePreview(
    "Texting Terms · Sundeck Pro",
    "What you agree to when a pool company texts you through Sundeck Pro, and how to stop.",
  ),
};

export default function TextingTermsPage() {
  return <TextingTermsBody />;
}
