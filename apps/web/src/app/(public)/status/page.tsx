import type { Metadata } from "next";
import { sharePreview } from "@/lib/share-preview";
import { StatusBody } from "@/components/site-pages/status";

export const metadata: Metadata = {
  title: "System Status · Sundeck Pro",
  ...sharePreview("System Status · Sundeck Pro", "Is Sundeck Pro working right now?"),
};

export default function StatusPage() {
  return <StatusBody />;
}
