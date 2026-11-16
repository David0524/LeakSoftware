"use server";

import { redirect } from "next/navigation";
import { siteOrigin } from "@/lib/origin";
import {
  CheckoutRefused,
  PaymentsNotConfigured,
  cardSetupCheckout,
  type CheckoutStart,
} from "@/server/stripe";
import type { PayState } from "./auth";

/** The customer's Save Card or Bank Account on /card/<token> (no sign-in, only the link). */
export async function saveCard(_: PayState, form: FormData): Promise<PayState> {
  const token = String(form.get("token") ?? "").trim();
  let start: CheckoutStart;
  try {
    start = await cardSetupCheckout(token, await siteOrigin());
  } catch (e) {
    if (e instanceof CheckoutRefused || e instanceof PaymentsNotConfigured)
      return { error: e.message };
    return { error: "Couldn’t open the secure form. Please try again in a moment." };
  }
  if (start.kind === "embedded") return { checkout: start };
  redirect(start.url);
}
