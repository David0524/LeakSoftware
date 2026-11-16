import { useMemo } from "react";
import type { SavedMethod } from "@leakbook/core";
import { API_URL } from "../lib/config";
import { getServices } from "../lib/services";
import { useRows } from "./hooks";
import { call } from "./reports";

// Autopay (docs/design/2026-11-16-autopay.md), as the website's components/autopay.tsx. The
// saved card's summary (customer_payment_method) and customer.autopay are server-written rows
// that sync down to owners' and admins' phones; changing them is the server's
// (/api/customers/{id}/autopay, /api/invoices/{id}/charge), and the change syncs back.

export interface SavedMethodRow extends SavedMethod {
  id: string;
  customer_id: string;
  deleted_at?: string | null;
}

/** The customer's saved card or bank account, or null (none, or not a manager's phone). */
export function useSavedMethod(companyId: string, customerId: string | null | undefined) {
  const rows = useRows<SavedMethodRow>("customer_payment_method", companyId);
  return useMemo(
    () => rows.find((r) => r.customer_id === customerId && !r.deleted_at) ?? null,
    [rows, customerId],
  );
}

export type AutopayAction = "turn_off" | "turn_on" | "remove" | "request";

/** One of the Autopay group's actions; Request Card on File by email, text, or a link. */
export async function autopayAction(
  customerId: string,
  action: AutopayAction,
  channel: "email" | "text" | "link" = "link",
): Promise<{ message: string; link?: string; text?: string }> {
  const r = await call<{ message: string; link?: string; text?: string }>(
    `/api/customers/${customerId}/autopay`,
    { action, channel },
  );
  void getServices().sync.syncNow();
  return r;
}

/**
 * Settings › Payments and Deposits: whether Affirm and Klarna are on in the shop's Stripe
 * account (the server asks Stripe), or null offline.
 */
export async function payOverTimeStatusLine(companyId: string): Promise<string | null> {
  if (!API_URL) return null;
  const token = await getServices().sync.accessToken();
  if (!token) return null;
  try {
    const res = await fetch(
      `${API_URL}/api/payments/status?company_id=${encodeURIComponent(companyId)}`,
      { headers: { authorization: `Bearer ${token}` } },
    );
    if (!res.ok) return null;
    return ((await res.json()) as { payOverTime?: string }).payOverTime ?? null;
  } catch {
    return null;
  }
}

/** Charge Card on File (owners and admins). A decline comes back as outcome "failed". */
export async function chargeCardOnFile(
  invoiceId: string,
): Promise<{ outcome: string; message: string }> {
  const r = await call<{ outcome: string; message: string }>(
    `/api/invoices/${invoiceId}/charge`,
    {},
  );
  void getServices().sync.syncNow();
  return r;
}
