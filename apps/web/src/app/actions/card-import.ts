"use server";

import { revalidatePath } from "next/cache";
import { CARD_IMPORT_TEXT, friendlyError } from "@leakbook/core";
import { getOffice } from "@/lib/auth";
import { Refusal } from "@/server/failures";
import { CARD_IMPORT_MAX, importCards, type CardImportPick } from "@/server/card-import";
import { PaymentsNotConfigured } from "@/server/stripe";

// Settings › Payments and Deposits › Import Saved Cards (core card-import.ts). Owners and
// admins, as autopay's other changes are.

export interface CardImportState {
  error?: string;
  message?: string;
  /** Copied customers that didn't import, with why. */
  failed?: { stripe_customer_id: string; message: string }[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Turn On Autopay: `picks` is JSON, [{stripe_customer_id, customer_id}]. */
export async function importCardsAction(
  _: CardImportState,
  form: FormData,
): Promise<CardImportState> {
  const office = await getOffice();
  if (!office.isManager) return { error: "Only owners and admins can change autopay." };
  let picks: CardImportPick[];
  try {
    const raw = JSON.parse(String(form.get("picks") ?? "[]")) as unknown;
    if (!Array.isArray(raw)) throw new Error();
    picks = raw
      .filter(
        (p): p is CardImportPick =>
          typeof p?.stripe_customer_id === "string" &&
          /^cus_[A-Za-z0-9]+$/.test(p.stripe_customer_id) &&
          typeof p?.customer_id === "string" &&
          UUID.test(p.customer_id),
      )
      .slice(0, CARD_IMPORT_MAX);
  } catch {
    return { error: "Choose who to import." };
  }
  if (picks.length === 0) return { error: "Choose who to import." };
  try {
    const r = await importCards(office.company.id, office.company.timezone, picks);
    revalidatePath("/settings/payments/import-cards");
    revalidatePath("/customers");
    return {
      message: r.imported ? CARD_IMPORT_TEXT.result(r.imported) : undefined,
      error: r.failed.length
        ? r.failed.length === 1
          ? "1 card didn’t import. It’s still listed below."
          : `${r.failed.length} cards didn’t import. They’re still listed below.`
        : undefined,
      failed: r.failed,
    };
  } catch (e) {
    if (e instanceof Refusal || e instanceof PaymentsNotConfigured) return { error: e.message };
    console.error("card import failed", e);
    return { error: friendlyError(e) };
  }
}
