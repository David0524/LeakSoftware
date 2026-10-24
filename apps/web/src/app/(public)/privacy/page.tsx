import type { Metadata } from "next";
import { sharePreview } from "@/lib/share-preview";
import { PrivacyBody } from "@/components/site-pages/privacy";

export const metadata: Metadata = {
  title: "Privacy Policy · Sundeck Pro",
  ...sharePreview(
    "Privacy Policy · Sundeck Pro",
    "What Sundeck Pro collects, why, and how shops and their customers stay in control.",
  ),
};

export default function PrivacyPage() {
  return <PrivacyBody />;
}
