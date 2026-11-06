import type { Metadata } from "next";
import { Landing } from "@/components/landing/landing";
import { sharePreview } from "@/lib/share-preview";
import { StructuredData } from "@/components/landing/structured-data";

// The public home page: what Sundeck Pro does, shown with small working demos of the app, and
// the packages' prices (owner, 2026-10-15). Pool Maintenance shows first; Leak Detection is
// one switch away, and each shows only what applies to it.

export const metadata: Metadata = {
  // The search result's headline names what the product is (owner, 2026-11-06: SEO); the link
  // preview keeps the slogan.
  title: { absolute: "Sundeck Pro: Pool Service and Leak Detection Software" },
  alternates: { canonical: "/" },
  // Safari on iPhone offers the App Store app in a banner at the top of the home page.
  itunes: { appId: "6824555420" },
  ...sharePreview(
    "Find it. Fix it. Get paid.",
    "One app for the whole pool shop: routes, checklists, reports, quotes and payments, on iPhone, Android and the web.",
  ),
};

export default function Home() {
  return (
    <main>
      <Landing />
      <StructuredData />
    </main>
  );
}
