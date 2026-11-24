import type { Metadata } from "next";
import { CARD_IMPORT_TEXT, autopaySettings } from "@leakbook/core";
import { CardImportView } from "@/components/card-import-view";
import { Banner } from "@/components/doc-ui";
import { PageHeader } from "@/components/ui";
import { getOffice } from "@/lib/auth";
import { getCompany } from "@/lib/data";
import { cardImportPreview, type CardImportPreview } from "@/server/card-import";
import { Refusal } from "@/server/failures";
import { PaymentsNotConfigured } from "@/server/stripe";

export const metadata: Metadata = { title: "Import Saved Cards · Sundeck Pro" };

// Reading every copied customer's cards from Stripe can take a while for a big shop.
export const maxDuration = 120;

export default async function ImportCardsPage() {
  const office = await getOffice();
  const company = await getCompany(office);
  let preview: CardImportPreview | null = null;
  let problem: string | null = null;
  try {
    preview = await cardImportPreview(office.company.id, office.company.timezone);
  } catch (e) {
    if (e instanceof Refusal || e instanceof PaymentsNotConfigured) problem = e.message;
    else {
      console.error("card import preview failed", e);
      problem = "Couldn’t read your customers from Stripe. Please try again in a moment.";
    }
  }
  return (
    <>
      <PageHeader
        back={{ href: "/settings/payments", label: "Payments" }}
        title={CARD_IMPORT_TEXT.title}
      />
      {problem || !preview ? (
        <div className="max-w-2xl">
          <Banner tone="warning">{problem}</Banner>
        </div>
      ) : (
        <CardImportView
          account={preview.account}
          plan={preview.plan}
          customers={preview.customers}
          autopayOn={autopaySettings(company.settings).on}
        />
      )}
    </>
  );
}
