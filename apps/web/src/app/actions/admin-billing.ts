"use server";

import { revalidatePath, updateTag } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import {
  formatCents,
  parseDollars,
  priceListProblem,
  priceListToJson,
  PRICE_MAX_CENTS,
  priceListFromJson,
  servicesLabel,
  type Plan,
  type PlanId,
  type PriceList,
} from "@leakbook/core";
import { friendlyDbError } from "@/lib/limits";
import { PRICES_TAG } from "@/server/billing";
import {
  applyCouponToShop,
  creditFreeMonths,
  pushShopPrice,
  refundShopCharge,
  setShopCancel,
  setShopPause,
} from "@/server/billing-admin";
import { logStaffAction, requireStaff } from "@/server/staff";
import { staffActionError } from "@/server/staff-error";
import type { AdminState } from "./admin";

// The Admin portal's billing controls (owner, 2026-11-24: "full control over pricing, deals,
// etc. also switching account settings from leak detection, maintenance, both"; "how would we
// reverse a charge?"). Each checks staff and two-step, asks for a reason, and writes the staff
// log. Replaces "refunds and plan changes stay in the Stripe dashboard" (2026-10-22).

async function guarded(where: string, run: () => Promise<AdminState>): Promise<AdminState> {
  try {
    return await run();
  } catch (e) {
    unstable_rethrow(e);
    return { error: staffActionError(e, where) };
  }
}

/** The database's own sentences (22023) stay; anything raw is replaced. */
function refused(error: { message: string; code?: string }, where: string): AdminState {
  if (error.code === "22023") return { error: error.message };
  console.error(`[admin] ${where}:`, error.message);
  return { error: friendlyDbError(error.message) };
}

const text = (form: FormData, key: string, max = 500) =>
  String(form.get(key) ?? "")
    .trim()
    .slice(0, max);

const shopPath = (id: string) => `/k4cs4uxrntb27z/shops/${id}`;

async function shop(db: Awaited<ReturnType<typeof requireStaff>>["db"], id: string) {
  const { data } = await db
    .from("company")
    .select("name")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  return (data?.name as string | undefined) ?? null;
}

/** Starts an action on one shop: staff, the shop, and a reason of 3 letters or more. */
async function begin(form: FormData, ask: string) {
  const { staff, db } = await requireStaff();
  const companyId = text(form, "company_id", 40);
  const reason = text(form, "reason");
  const name = await shop(db, companyId);
  const problem = !name ? "That shop no longer exists." : reason.length < 3 ? ask : null;
  return { staff, db, companyId, reason, name, problem };
}

// ---------------------------------------------------------------------------
// Package
// ---------------------------------------------------------------------------

export async function setShopServices(_: AdminState, form: FormData): Promise<AdminState> {
  return guarded("setShopServices", async () => {
    const b = await begin(form, "Say why the package is changing.");
    if (b.problem) return { error: b.problem };
    const services = text(form, "services", 10);
    const { data, error } = await b.db.rpc("admin_set_services", {
      target_company: b.companyId,
      services,
    });
    if (error) return refused(error, "set services");
    const stripeNote = await pushShopPrice(b.companyId);
    await logStaffAction(b.staff, "services_change", {
      companyId: b.companyId,
      companyName: b.name,
      reason: b.reason,
      details: { from: data, to: services },
    });
    revalidatePath(shopPath(b.companyId));
    return stripeNote
      ? { error: stripeNote }
      : { message: `Package changed to ${servicesLabel(services)}. Its price follows.` };
  });
}

// ---------------------------------------------------------------------------
// The shop's own price
// ---------------------------------------------------------------------------

export async function setShopPrice(_: AdminState, form: FormData): Promise<AdminState> {
  return guarded("setShopPrice", async () => {
    const b = await begin(form, "Say why this shop has its own price.");
    if (b.problem) return { error: b.problem };
    const kind = text(form, "kind", 10);
    const until = text(form, "until", 10) || null;
    let cents: number | null = null;
    let percent: number | null = null;
    if (kind === "fixed") {
      cents = parseDollars(text(form, "amount", 20));
      if (cents === null || cents < 0 || cents > PRICE_MAX_CENTS)
        return { error: "Enter a monthly price, like 99 or 99.50." };
    } else if (kind === "percent") {
      percent = Number(text(form, "percent", 5));
      if (!Number.isInteger(percent) || percent < 1 || percent > 100)
        return { error: "Percent off is 1 to 100." };
    } else if (kind !== "standard") {
      return { error: "Choose Standard, Fixed Price or Percent Off." };
    }
    const { error } = await b.db.rpc("admin_set_custom_price", {
      target_company: b.companyId,
      kind: kind === "standard" ? null : kind,
      cents,
      percent,
      until: kind === "standard" ? null : until,
      note: b.reason,
    });
    if (error) return refused(error, "set price");
    const stripeNote = await pushShopPrice(b.companyId);
    await logStaffAction(b.staff, "price_change", {
      companyId: b.companyId,
      companyName: b.name,
      reason: b.reason,
      details: { kind, cents, percent, until },
    });
    revalidatePath(shopPath(b.companyId));
    if (stripeNote) return { error: stripeNote };
    return {
      message:
        kind === "standard"
          ? "Back on the standard price."
          : kind === "fixed"
            ? `${formatCents(cents!)} a month${until ? ` through ${until}` : ""}.`
            : `${percent}% off${until ? ` through ${until}` : ""}.`,
    };
  });
}

// ---------------------------------------------------------------------------
// Codes and free months
// ---------------------------------------------------------------------------

export async function applyShopCode(_: AdminState, form: FormData): Promise<AdminState> {
  return guarded("applyShopCode", async () => {
    const b = await begin(form, "Say why this shop gets the code.");
    if (b.problem) return { error: b.problem };
    const { data, error } = await b.db.rpc("admin_apply_promo", {
      target_company: b.companyId,
      code: text(form, "code", 40),
    });
    if (error) return refused(error, "apply code");
    const offer = data as {
      code: string;
      free_months: number;
      percent_off: number | null;
      percent_months: number | null;
      subscribed: boolean;
    };
    const done: string[] = [];
    if (offer.subscribed) {
      // Stripe bills it: free months as a credit, the percent off as a coupon.
      if (offer.free_months > 0) {
        const cents = await creditFreeMonths(
          b.companyId,
          offer.free_months,
          `Code ${offer.code}: ${offer.free_months} free month${offer.free_months === 1 ? "" : "s"}`,
          `staff_code_${b.companyId}_${offer.code}`,
        );
        done.push(`${formatCents(cents)} credit`);
      }
      if (offer.percent_off) {
        await applyCouponToShop(b.companyId, offer.percent_off, offer.percent_months);
        done.push(`${offer.percent_off}% off`);
      }
    } else {
      if (offer.free_months > 0) done.push(`trial to ${offer.free_months} months`);
      if (offer.percent_off) done.push(`${offer.percent_off}% off once subscribed`);
    }
    await logStaffAction(b.staff, "code_apply", {
      companyId: b.companyId,
      companyName: b.name,
      reason: b.reason,
      details: { code: offer.code, subscribed: offer.subscribed },
    });
    revalidatePath(shopPath(b.companyId));
    return { message: `Code ${offer.code} applied: ${done.join(", ")}.` };
  });
}

export async function giveFreeMonths(_: AdminState, form: FormData): Promise<AdminState> {
  return guarded("giveFreeMonths", async () => {
    const b = await begin(form, "Say why this shop gets free months.");
    if (b.problem) return { error: b.problem };
    const months = Number(text(form, "months", 3));
    if (!Number.isInteger(months) || months < 1 || months > 12)
      return { error: "Give 1 to 12 months." };
    const subscribed = text(form, "subscribed") === "1";
    let message: string;
    if (subscribed) {
      // One credit per request: the form's own key stops a double tap crediting twice.
      const cents = await creditFreeMonths(
        b.companyId,
        months,
        `${months} free month${months === 1 ? "" : "s"} from Sundeck Pro`,
        `staff_months_${b.companyId}_${text(form, "nonce", 40)}`,
      );
      message = `${formatCents(cents)} credit added. The next bills use it up.`;
    } else {
      const { data, error } = await b.db.rpc("admin_trial_months", {
        target_company: b.companyId,
        months,
      });
      if (error) return refused(error, "trial months");
      message = `Trial runs to ${new Date(data as string).toLocaleDateString("en-US", { dateStyle: "medium" })}.`;
    }
    await logStaffAction(b.staff, "free_months", {
      companyId: b.companyId,
      companyName: b.name,
      reason: b.reason,
      details: { months, subscribed },
    });
    revalidatePath(shopPath(b.companyId));
    return { message };
  });
}

// ---------------------------------------------------------------------------
// Charges, cancel, pause
// ---------------------------------------------------------------------------

export async function refundCharge(_: AdminState, form: FormData): Promise<AdminState> {
  return guarded("refundCharge", async () => {
    const b = await begin(form, "Say why you’re refunding.");
    if (b.problem) return { error: b.problem };
    const part = text(form, "part") === "1";
    const amount = part ? parseDollars(text(form, "amount", 20)) : null;
    if (part && (amount === null || amount <= 0)) return { error: "Enter an amount, like 25.00." };
    const charge = text(form, "charge", 60);
    const message = await refundShopCharge(b.companyId, charge, amount);
    await logStaffAction(b.staff, "refund", {
      companyId: b.companyId,
      companyName: b.name,
      reason: b.reason,
      details: { charge, amount_cents: amount },
    });
    revalidatePath(shopPath(b.companyId));
    return { message };
  });
}

export async function cancelShop(_: AdminState, form: FormData): Promise<AdminState> {
  return guarded("cancelShop", async () => {
    const when = text(form, "when", 12);
    const b = await begin(
      form,
      when === "keep" ? "Say why the subscription carries on." : "Say why it’s canceled.",
    );
    if (b.problem) return { error: b.problem };
    if (!["now", "period_end", "keep"].includes(when)) return { error: "Choose when." };
    const message = await setShopCancel(b.companyId, when as "now" | "period_end" | "keep");
    await logStaffAction(b.staff, "cancel_change", {
      companyId: b.companyId,
      companyName: b.name,
      reason: b.reason,
      details: { when },
    });
    revalidatePath(shopPath(b.companyId));
    return { message };
  });
}

export async function pauseShop(_: AdminState, form: FormData): Promise<AdminState> {
  return guarded("pauseShop", async () => {
    const pause = text(form, "pause") === "1";
    const b = await begin(form, pause ? "Say why billing is paused." : "Say why billing resumes.");
    if (b.problem) return { error: b.problem };
    const until = text(form, "until", 10);
    const resumes = pause && until ? new Date(`${until}T12:00:00Z`) : null;
    if (resumes && (Number.isNaN(resumes.getTime()) || resumes.getTime() <= Date.now()))
      return { error: "Choose a date after today." };
    const message = await setShopPause(b.companyId, pause, resumes);
    await logStaffAction(b.staff, pause ? "pause_on" : "pause_off", {
      companyId: b.companyId,
      companyName: b.name,
      reason: b.reason,
      details: { until: until || null },
    });
    revalidatePath(shopPath(b.companyId));
    return { message };
  });
}

// ---------------------------------------------------------------------------
// Admin › Pricing
// ---------------------------------------------------------------------------

const PLAN_IDS: PlanId[] = ["maintenance", "leak"];

/** The price list from the Pricing form: per package, tier rows (name, up to, price). */
function pricesFromForm(form: FormData, current: PriceList): PriceList | string {
  const plan = (id: PlanId): Plan | string => {
    const tiers: Plan["tiers"] = [];
    for (let i = 0; i < 6; i++) {
      const name = text(form, `${id}.${i}.name`, 40);
      const upTo = text(form, `${id}.${i}.up_to`, 5);
      const price = text(form, `${id}.${i}.price`, 20);
      if (!name && !upTo && !price) continue;
      const cents = parseDollars(price);
      if (cents === null) return `Enter each ${current[id].name} price in dollars, like 149.`;
      tiers.push({ name, upTo: Number(upTo), priceCents: cents });
    }
    const extra = parseDollars(text(form, `${id}.extra`, 20));
    if (extra === null) return `Enter ${current[id].name}’s price per extra person.`;
    return { ...current[id], tiers, perExtraCents: extra };
  };
  const maintenance = plan("maintenance");
  if (typeof maintenance === "string") return maintenance;
  const leak = plan("leak");
  if (typeof leak === "string") return leak;
  const addon = parseDollars(text(form, "both_addon", 20));
  if (addon === null) return "Enter the Both add-on price.";
  return { maintenance, leak, bothAddonCents: addon };
}

export async function savePrices(_: AdminState, form: FormData): Promise<AdminState> {
  return guarded("savePrices", async () => {
    const { staff, db } = await requireStaff();
    const reason = text(form, "reason");
    if (reason.length < 3) return { error: "Say why the prices are changing." };
    const { data: now } = await db.rpc("current_prices");
    const current = priceListFromJson(now);
    const list = pricesFromForm(form, current);
    if (typeof list === "string") return { error: list };
    const problem = priceListProblem(list);
    if (problem) return { error: problem };
    const json = priceListToJson(list);
    if (JSON.stringify(json) === JSON.stringify(priceListToJson(current)))
      return { error: "Nothing changed." };
    const { data, error } = await db.rpc("admin_save_prices", {
      new_prices: json,
      note: reason,
      staff_email: staff.email,
    });
    if (error) return refused(error, "save prices");
    await logStaffAction(staff, "prices_change", {
      reason,
      details: { price_list: data, ...Object.fromEntries(PLAN_IDS.map((id) => [id, json[id]])) },
    });
    updateTag(PRICES_TAG);
    revalidatePath("/k4cs4uxrntb27z/pricing");
    revalidatePath("/");
    return {
      message: "Saved. New shops pay these prices; shops already subscribed keep theirs.",
    };
  });
}
