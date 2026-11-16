import type { ReactNode } from "react";
import { LightOnly } from "@/components/light-only";

// A page for the shop's customers, or one the shop shows a customer: always light, whatever
// Appearance the office chose in this browser (owner, 2026-10-26: customer pages in dark mode).
// The document's own colors (the shop's brand band, status tiles, borders) are the light ones, so
// it reads as it does on the customer's phone and prints.
export default function CustomerLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <LightOnly />
      {children}
    </>
  );
}
