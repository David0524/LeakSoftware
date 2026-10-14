"use client";

import { payInvoice } from "@/app/actions/invoices";
import { PayForm } from "./pay-form";

export function PayInvoiceForm({
  token,
  amount,
  demo,
}: {
  token: string;
  amount: string;
  demo?: boolean;
}) {
  return <PayForm token={token} label={`Pay ${amount}`} action={payInvoice} demo={demo} />;
}
