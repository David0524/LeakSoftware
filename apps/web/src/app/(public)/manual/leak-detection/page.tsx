import type { Metadata } from "next";
import { Manual } from "@/components/manual/manual";
import { sharePreview } from "@/lib/share-preview";

export const metadata: Metadata = {
  alternates: { canonical: "/manual/leak-detection" },
  title: "Leak Detection Manual · Sundeck Pro",
  ...sharePreview(
    "Leak Detection Manual · Sundeck Pro",
    "From drip to paid: how a leak detection shop books, tests, pins, reports and repairs a leak with Sundeck Pro.",
  ),
};

export default function LeakDetectionManualPage() {
  return <Manual edition="leak" />;
}
