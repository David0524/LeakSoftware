"use client";

import { useActionState, useState } from "react";
import { formatCents, type PriceList } from "@leakbook/core";
import type { AdminState } from "@/app/actions/admin";
import {
  applyShopCode,
  cancelShop,
  giveFreeMonths,
  pauseShop,
  refundCharge,
  savePrices,
  setShopPrice,
  setShopServices,
} from "@/app/actions/admin-billing";
import { Segmented } from "@/components/segmented";
import { Sheet } from "@/components/sheet";
import { Button, Field, Notice, TextArea } from "@/components/ui";

// Admin › the shop: its billing, fully in staff's hands (owner, 2026-11-24: "full control over
// pricing, deals, etc."). Each opens a sheet that asks for a reason, kept in the Activity Log.

function Result({ state }: { state: AdminState }) {
  if (state.error) return <Notice tone="error">{state.error}</Notice>;
  if (state.message) return <Notice tone="success">{state.message}</Notice>;
  return null;
}

function Reason({ placeholder }: { placeholder?: string }) {
  return (
    <TextArea
      label="Reason"
      name="reason"
      required
      minLength={3}
      maxLength={500}
      placeholder={placeholder}
    />
  );
}

/** A pill that opens a sheet holding one action's form. */
function SheetAction({
  label,
  title = label,
  kind = "secondary",
  action,
  children,
  submit,
  submitKind = "primary",
}: {
  label: string;
  title?: string;
  kind?: "primary" | "secondary" | "danger";
  action: (state: AdminState, form: FormData) => Promise<AdminState>;
  children: React.ReactNode;
  submit: string;
  submitKind?: "primary" | "danger";
}) {
  const [open, setOpen] = useState(false);
  const [state, act, pending] = useActionState(action, {});
  return (
    <>
      <Button type="button" kind={kind} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <Sheet open={open} onClose={() => setOpen(false)} title={title}>
        <form action={act} className="space-y-4">
          {children}
          <Result state={state} />
          <Button type="submit" kind={submitKind} disabled={pending} className="w-full">
            {pending ? "Saving…" : submit}
          </Button>
        </form>
      </Sheet>
    </>
  );
}

// The table cells look like the site's fields (ui.tsx).
const CELL =
  "block w-full min-h-11 rounded-[10px] border border-control-border bg-surface px-3 py-2 text-text " +
  "focus:outline-3 focus:outline-offset-1 focus:outline-focus";

const Explain = ({ children }: { children: React.ReactNode }) => (
  <p className="text-[0.9375rem] text-text-muted">{children}</p>
);

/** Leak Detection, Pool Maintenance or Both, as the owner's Settings › Company › Services. */
export function ChangePackage({ companyId, services }: { companyId: string; services: string }) {
  const [value, setValue] = useState<"leak" | "pool" | "both">(
    services === "leak" || services === "pool" ? services : "both",
  );
  return (
    <SheetAction label="Change Package" action={setShopServices} submit="Change Package">
      <input type="hidden" name="company_id" value={companyId} />
      <Explain>
        A package taken on brings its checklists, tests and price book; nothing is removed. The
        price follows at once, prorated on the next bill.
      </Explain>
      <Segmented
        label="Package"
        name="services"
        value={value}
        onChange={setValue}
        options={[
          { value: "leak", label: "Leak Detection" },
          { value: "pool", label: "Pool Maintenance" },
          { value: "both", label: "Both" },
        ]}
      />
      <Reason placeholder="Owner asked on the phone to add maintenance (Nov 24)" />
    </SheetAction>
  );
}

/** The shop's own price: standard, a fixed monthly price, or a percent off, until a date. */
export function SetPrice({
  companyId,
  standardCents,
  current,
}: {
  companyId: string;
  standardCents: number;
  current: {
    kind: "fixed" | "percent" | null;
    cents: number | null;
    percent: number | null;
    until: string | null;
  };
}) {
  const [kind, setKind] = useState<"standard" | "fixed" | "percent">(current.kind ?? "standard");
  return (
    <SheetAction
      label="Set Price"
      title="Price for This Shop"
      action={setShopPrice}
      submit="Save Price"
    >
      <input type="hidden" name="company_id" value={companyId} />
      <Explain>
        Its standard price is {formatCents(standardCents)} a month (its package and team on its
        price list). Its own price goes to Stripe now; after the last day, the standard price comes
        back by itself.
      </Explain>
      <Segmented
        label="Price"
        name="kind"
        value={kind}
        onChange={setKind}
        options={[
          { value: "standard", label: "Standard" },
          { value: "fixed", label: "Fixed Price" },
          { value: "percent", label: "Percent Off" },
        ]}
      />
      {kind === "fixed" ? (
        <Field
          label="Monthly price"
          name="amount"
          inputMode="decimal"
          required
          defaultValue={current.cents !== null ? (current.cents / 100).toFixed(2) : ""}
          placeholder="99.00"
        />
      ) : null}
      {kind === "percent" ? (
        <Field
          label="Percent off"
          name="percent"
          inputMode="numeric"
          required
          defaultValue={current.percent ?? ""}
          placeholder="20"
        />
      ) : null}
      {kind !== "standard" ? (
        <Field
          label="Last day"
          name="until"
          type="date"
          defaultValue={current.until ?? ""}
          hint="Optional. Leave it empty to keep this price for good."
        />
      ) : null}
      <Reason placeholder="Pilot shop: $99 through March" />
    </SheetAction>
  );
}

/** Apply a promo code to a shop that already signed up. */
export function ApplyCode({ companyId }: { companyId: string }) {
  return (
    <SheetAction label="Apply Code" action={applyShopCode} submit="Apply Code">
      <input type="hidden" name="company_id" value={companyId} />
      <Explain>
        Any promo code from Codes, even after the shop subscribed, replacing a code it used. On a
        trial, free months lengthen the trial; once Stripe bills the shop, they’re a credit and a
        percent off goes on the subscription.
      </Explain>
      <Field
        label="Code"
        name="code"
        required
        autoCapitalize="characters"
        autoComplete="off"
        spellCheck={false}
        placeholder="MEETUP"
      />
      <Reason />
    </SheetAction>
  );
}

/** Free months: a longer trial, or a Stripe credit once Stripe bills the shop. */
export function FreeMonths({ companyId, subscribed }: { companyId: string; subscribed: boolean }) {
  const [months, setMonths] = useState<"1" | "2" | "3" | "6" | "12">("1");
  // One credit per sheet: a second tap of Give is the same credit.
  const [nonce] = useState(() => crypto.randomUUID());
  return (
    <SheetAction label="Give Free Months" action={giveFreeMonths} submit="Give Free Months">
      <input type="hidden" name="company_id" value={companyId} />
      <input type="hidden" name="subscribed" value={subscribed ? "1" : "0"} />
      <input type="hidden" name="nonce" value={nonce} />
      <Explain>
        {subscribed
          ? "Stripe bills this shop: the months are a credit at its current price, which its next bills use up."
          : "The trial runs that much longer, from today if it already ended. No card until then."}
      </Explain>
      <Segmented
        label="Months"
        name="months"
        value={months}
        onChange={setMonths}
        options={[
          { value: "1", label: "1" },
          { value: "2", label: "2" },
          { value: "3", label: "3" },
          { value: "6", label: "6" },
          { value: "12", label: "12" },
        ]}
      />
      <Reason placeholder="Sorry for the texting outage (Nov 20)" />
    </SheetAction>
  );
}

/** Pause Billing (the shop keeps working, its bills are voided) or Resume Billing. */
export function PauseBilling({ companyId, paused }: { companyId: string; paused: boolean }) {
  return (
    <SheetAction
      label={paused ? "Resume Billing" : "Pause Billing"}
      action={pauseShop}
      submit={paused ? "Resume Billing" : "Pause Billing"}
    >
      <input type="hidden" name="company_id" value={companyId} />
      <input type="hidden" name="pause" value={paused ? "0" : "1"} />
      <Explain>
        {paused
          ? "Stripe bills the shop again from its next bill."
          : "The shop keeps working and Stripe voids its bills until the date, or until you resume."}
      </Explain>
      {paused ? null : <Field label="Resume on" name="until" type="date" hint="Optional." />}
      <Reason />
    </SheetAction>
  );
}

/** Cancel now, at the period's end, or keep a subscription set to end. */
export function CancelSubscription({ companyId, ending }: { companyId: string; ending: boolean }) {
  const [when, setWhen] = useState<"period_end" | "now">("period_end");
  if (ending)
    return (
      <SheetAction label="Keep Subscription" action={cancelShop} submit="Keep Subscription">
        <input type="hidden" name="company_id" value={companyId} />
        <input type="hidden" name="when" value="keep" />
        <Explain>The subscription carries on instead of ending.</Explain>
        <Reason />
      </SheetAction>
    );
  return (
    <SheetAction
      label="Cancel Subscription"
      kind="danger"
      action={cancelShop}
      submit="Cancel Subscription"
      submitKind="danger"
    >
      <input type="hidden" name="company_id" value={companyId} />
      <Explain>
        At the period’s end, the shop keeps working until the time it paid for. Now, it is read-only
        at once (its records stay). Refund its last charge separately if it should be.
      </Explain>
      <Segmented
        label="When"
        name="when"
        value={when}
        onChange={setWhen}
        options={[
          { value: "period_end", label: "At Period End" },
          { value: "now", label: "Now" },
        ]}
      />
      <Reason />
    </SheetAction>
  );
}

/** Refund a Sundeck Pro charge, all of what's left or part. */
export function RefundCharge({
  companyId,
  chargeId,
  leftCents,
}: {
  companyId: string;
  chargeId: string;
  leftCents: number;
}) {
  const [mode, setMode] = useState<"full" | "part">("full");
  return (
    <SheetAction
      label="Refund"
      title="Refund Charge"
      action={refundCharge}
      submit={mode === "full" ? `Refund ${formatCents(leftCents)}` : "Refund"}
      submitKind="danger"
    >
      <input type="hidden" name="company_id" value={companyId} />
      <input type="hidden" name="charge" value={chargeId} />
      <input type="hidden" name="part" value={mode === "part" ? "1" : "0"} />
      <Explain>
        The money goes back to the shop’s card in 5 to 10 business days. A refund can’t be undone,
        and doesn’t change the subscription.
      </Explain>
      <Segmented
        label="Refund"
        name="mode"
        value={mode}
        onChange={setMode}
        options={[
          { value: "full", label: "Refund Full" },
          { value: "part", label: "Refund Part" },
        ]}
      />
      {mode === "part" ? (
        <Field
          label="Amount"
          name="amount"
          inputMode="decimal"
          required
          placeholder="25.00"
          hint={`Up to ${formatCents(leftCents)}.`}
        />
      ) : null}
      <Reason placeholder="Charged twice by mistake" />
    </SheetAction>
  );
}

/**
 * Admin › Pricing's form: each package's tiers (name, people up to, monthly price; up to 6,
 * an empty row is dropped), the price per extra person, and the Both add-on.
 */
export function PriceListForm({ prices }: { prices: PriceList }) {
  const [state, act, pending] = useActionState(savePrices, {});
  const dollars = (c: number) => (c / 100).toFixed(2);
  const plans: { id: "maintenance" | "leak"; plan: PriceList["maintenance"] }[] = [
    { id: "maintenance", plan: prices.maintenance },
    { id: "leak", plan: prices.leak },
  ];
  return (
    <form action={act} className="space-y-6">
      {plans.map(({ id, plan }) => (
        <fieldset key={id} className="card space-y-3 p-5">
          <legend className="sr-only">{plan.name}</legend>
          <h2 className="font-display text-xl font-bold">{plan.name}</h2>
          <div className="grid grid-cols-[1fr_8rem_10rem] gap-x-3 gap-y-2 text-[0.9375rem]">
            <span className="text-text-muted">Tier</span>
            <span className="text-text-muted">People up to</span>
            <span className="text-text-muted">Monthly price ($)</span>
            {Array.from({ length: 6 }, (_, i) => {
              const t = plan.tiers[i];
              return (
                <div key={i} className="contents">
                  <input
                    aria-label={`${plan.name} tier ${i + 1} name`}
                    name={`${id}.${i}.name`}
                    defaultValue={t?.name ?? ""}
                    className={CELL}
                  />
                  <input
                    aria-label={`${plan.name} tier ${i + 1} people`}
                    name={`${id}.${i}.up_to`}
                    inputMode="numeric"
                    defaultValue={t?.upTo ?? ""}
                    className={`${CELL} tabular-nums`}
                  />
                  <input
                    aria-label={`${plan.name} tier ${i + 1} price`}
                    name={`${id}.${i}.price`}
                    inputMode="decimal"
                    defaultValue={t ? dollars(t.priceCents) : ""}
                    className={`${CELL} tabular-nums`}
                  />
                </div>
              );
            })}
          </div>
          <Field
            label="Each person past the largest tier ($ a month)"
            name={`${id}.extra`}
            inputMode="decimal"
            defaultValue={dollars(plan.perExtraCents)}
            className="max-w-sm"
          />
        </fieldset>
      ))}
      <div className="card space-y-3 p-5">
        <Field
          label="Both: leak detection add-on ($ a month, on top of Pool Maintenance)"
          name="both_addon"
          inputMode="decimal"
          defaultValue={dollars(prices.bothAddonCents)}
          className="max-w-sm"
        />
        <Reason placeholder="New prices for 2027" />
        <Result state={state} />
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save Prices"}
        </Button>
      </div>
    </form>
  );
}
