import type { Metadata } from "next";
import { StatusBody } from "@/components/site-pages/status";

export const metadata: Metadata = {
  title: "System Status · Sundeck Pro",
  alternates: { canonical: "/status" },
};

export default function InAppStatusPage() {
  return <StatusBody />;
}
