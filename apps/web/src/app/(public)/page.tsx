import type { Metadata } from "next";
import { Landing } from "@/components/landing/landing";
import { sharePreview } from "@/lib/share-preview";

// The public home page: what Sundeck Pro does, shown with small working demos of the app, and
// the packages' prices (owner, 2026-10-15). Pool Maintenance shows first; Leak Detection is
// one switch away, and each shows only what applies to it.

export const metadata: Metadata = sharePreview(
  "Find it. Fix it. Get paid.",
  "One app for the whole pool shop: routes, checklists, reports, quotes and payments, on iPhone, Android and the web.",
);

export default function Home() {
  return (
    <main>
      <Landing />
    </main>
  );
}
