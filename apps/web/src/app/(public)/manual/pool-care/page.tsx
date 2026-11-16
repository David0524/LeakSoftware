import type { Metadata } from "next";
import { Manual } from "@/components/manual/manual";
import { sharePreview } from "@/lib/share-preview";

export const metadata: Metadata = {
  alternates: { canonical: "/manual/pool-care" },
  title: "Pool Care Manual · Sundeck Pro",
  ...sharePreview(
    "Pool Care Manual · Sundeck Pro",
    "A month on the route: how a pool service shop sets up, runs its routes, services pools and bills with Sundeck Pro.",
  ),
};

export default function PoolCareManualPage() {
  return <Manual edition="pool" />;
}
