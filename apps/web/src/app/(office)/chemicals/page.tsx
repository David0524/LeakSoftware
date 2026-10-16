import type { Metadata } from "next";
import { ChemCalculator } from "@/components/chem-calculator";
import { PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Chemical Calculator · Tidemark" };

/** Pool care: how much of each chemical to add, from the pool's size and today's readings. */
export default function ChemicalsPage() {
  return (
    <>
      <PageHeader
        title="Chemical Calculator"
        subtitle="Enter the pool’s size and your test readings. Tidemark works out what to add, in order."
      />
      <ChemCalculator />
    </>
  );
}
