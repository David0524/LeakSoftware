"use client";

import { payInvoice } from "@/app/actions/invoices";
import { PayForm } from "./pay-form";

export function PayInvoiceForm({
  token,
  amount,
  demo,
  cardFee,
}: {
  token: string;
  amount: string;
  demo?: boolean;
  cardFee?: { bankLabel: string; cardLabel: string; note: string } | null;
}) {
  return (
    <PayForm
      token={token}
      label={`Pay ${amount}`}
      action={payInvoice}
      demo={demo}
      cardFee={cardFee}
    />
  );
}
