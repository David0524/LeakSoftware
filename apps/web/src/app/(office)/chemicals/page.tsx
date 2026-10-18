import type { Metadata } from "next";
import { ChemCalculator } from "@/components/chem-calculator";
import { PageHeader } from "@/components/ui";
import { Suspense } from "react";
import { ScreenTip } from "@/components/screen-tip";

export const metadata: Metadata = { title: "Chemical Calculator · Tidemark" };

/**
 * Pool care: how much of each chemical to add, from the pool's size and today's readings. A
 * visit opens it with the pool's gallons (?gallons=).
 */
export default async function ChemicalsPage({ searchParams }: PageProps<"/chemicals">) {
  const { gallons } = await searchParams;
  const size = Number(gallons);
  return (
    <>
      <PageHeader title="Chemical Calculator" />
      <Suspense fallback={null}>
        <ScreenTip screen="chemicals" />
      </Suspense>
      <ChemCalculator
        initialGallons={Number.isFinite(size) && size > 0 ? Math.round(size) : null}
      />
    </>
  );
}
