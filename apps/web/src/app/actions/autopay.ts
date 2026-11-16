"use server";

import { revalidatePath } from "next/cache";
import { friendlyError } from "@leakbook/core";
import { getOffice } from "@/lib/auth";
import { siteOrigin } from "@/lib/origin";
import { createClient } from "@/lib/supabase/server";
import {
  chargeCardOnFile,
  customerAutopayAction,
  type AutopayAction,
  type RequestChannel,
} from "@/server/autopay";
import { EmailNotConfigured } from "@/server/email";
import type { FormState } from "./auth";

// Autopay on the office's customer page and invoices (docs/design/2026-11-16-autopay.md). The
// apps call /api/customers/[id]/autopay and /api/invoices/[id]/charge, which run the same code.

const text = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const ONLY_MANAGERS = "Only owners and admins can change autopay.";
const ACTIONS: AutopayAction[] = ["turn_off", "turn_on", "remove", "request"];
const CHANNELS: RequestChannel[] = ["email", "text", "link"];

export interface AutopayState extends FormState {
  /** Request Card on File by link: the customer's link to copy. */
  link?: string;
}

/** Turn Off, Turn On, Remove Card, or Request Card on File (by email, text, or link). */
export async function autopayAction(_: AutopayState, form: FormData): Promise<AutopayState> {
  const office = await getOffice();
  if (!office.isManager) return { error: ONLY_MANAGERS };
  const customer = text(form, "customer");
  const action = ACTIONS.find((a) => a === text(form, "action"));
  if (!action) return { error: "Pick what to do." };
  try {
    const r = await customerAutopayAction(await createClient(), office.user.id, customer, action, {
      channel: CHANNELS.find((c) => c === text(form, "channel")) ?? "link",
      origin: await siteOrigin(),
    });
    revalidatePath(`/customers/${customer}`);
    return { message: r.message, link: r.link };
  } catch (e) {
    if (e instanceof EmailNotConfigured) return { error: e.message };
    return { error: friendlyError(e) };
  }
}

/** Charge Card on File, on an invoice (owners and admins, after the confirmation). */
export async function chargeCardAction(_: FormState, form: FormData): Promise<FormState> {
  const office = await getOffice();
  if (!office.isManager) return { error: "Only owners and admins can charge a saved card." };
  try {
    const r = await chargeCardOnFile(
      await createClient(),
      text(form, "invoice"),
      await siteOrigin(),
    );
    revalidatePath(`/jobs/${text(form, "job")}`);
    revalidatePath("/invoices");
    return r.outcome === "failed" ? { error: r.message } : { message: r.message };
  } catch (e) {
    return { error: friendlyError(e) };
  }
}
