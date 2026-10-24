import type { Metadata } from "next";
import { sharePreview } from "@/lib/share-preview";
import { SecurityBody } from "@/components/site-pages/security";

export const metadata: Metadata = {
  title: "Security · Sundeck Pro",
  ...sharePreview(
    "Security · Sundeck Pro",
    "How Sundeck Pro protects shops’ records and their customers’ information.",
  ),
  description: "How Sundeck Pro protects shops’ records and their customers’ information.",
};

export default function SecurityPage() {
  return <SecurityBody />;
}
