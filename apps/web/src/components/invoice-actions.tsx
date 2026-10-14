"use client";

import { payInvoice } from "@/app/actions/invoices";
import { PayForm } from "./pay-form";

export function PayInvoiceForm({ token, amount }: { token: string; amount: string }) {
  return <PayForm token={token} label={`Pay ${amount}`} action={payInvoice} />;
}
