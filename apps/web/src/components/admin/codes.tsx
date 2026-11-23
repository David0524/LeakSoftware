"use client";

import { useActionState, useState } from "react";
import { normalizeCode, offerText, PROMO_MAX_FREE_MONTHS } from "@leakbook/core";
import { addPromoCode, setPromoCodeActive, type AdminState } from "@/app/actions/admin";
import { Segmented } from "@/components/segmented";
import { Sheet } from "@/components/sheet";
import { Button, Field, Notice } from "@/components/ui";

// Admin › Codes (owner, 2026-11-23): New Code and Turn Off / Turn On.

function Result({ state }: { state: AdminState }) {
  if (state.error) return <Notice tone="error">{state.error}</Notice>;
  if (state.message) return <Notice tone="success">{state.message}</Notice>;
  return null;
}

/**
 * New Code: the code, free months (the trial runs that many months from sign-up, like the
 * mailer's 3), and/or a percent off for some paid months or forever. A preview shows the offer
 * as shops will read it.
 */
export function NewPromoCode() {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(addPromoCode, {});
  const [code, setCode] = useState("");
  const [free, setFree] = useState("3");
  const [percent, setPercent] = useState("");
  const [lasts, setLasts] = useState<"months" | "forever">("months");
  const [months, setMonths] = useState("12");
  const freeMonths = Number(free) || 0;
  const percentOff = Number(percent) || null;
  const preview =
    freeMonths > 0 || percentOff
      ? offerText({
          freeMonths,
          percentOff,
          percentMonths: percentOff && lasts === "months" ? Number(months) || null : null,
        })
      : null;
  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        New Code
      </Button>
      <Sheet open={open} onClose={() => setOpen(false)} title="New Code">
        <form action={action} className="space-y-4">
          <Field
            label="Code"
            name="code"
            required
            value={code}
            onChange={(e) => setCode(normalizeCode(e.target.value).slice(0, 24))}
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            placeholder="MEETUP"
            hint="3 to 24 letters and numbers. Shops type it in any case."
          />
          <Field
            label="Free months"
            name="free_months"
            type="number"
            inputMode="numeric"
            min={0}
            max={PROMO_MAX_FREE_MONTHS}
            value={free}
            onChange={(e) => setFree(e.target.value)}
            hint="The free trial lasts this long from sign-up: 3 is 3 months free (instead of 30 days). 0 for none."
          />
          <Field
            label="Percent off"
            name="percent_off"
            type="number"
            inputMode="numeric"
            min={1}
            max={100}
            value={percent}
            onChange={(e) => setPercent(e.target.value)}
            hint="Off the monthly price once the trial ends. Leave empty for none."
          />
          {percentOff ? (
            <>
              <Segmented
                label="Percent off lasts"
                name="percent_for"
                value={lasts}
                onChange={setLasts}
                options={[
                  { value: "months", label: "Some Months" },
                  { value: "forever", label: "Forever" },
                ]}
              />
              {lasts === "months" ? (
                <Field
                  label="Paid months"
                  name="percent_months"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={36}
                  value={months}
                  onChange={(e) => setMonths(e.target.value)}
                />
              ) : null}
            </>
          ) : null}
          <Field
            label="Last day (optional)"
            name="ends_on"
            type="date"
            hint="The code stops working after this day."
          />
          <Field
            label="Most uses (optional)"
            name="max_uses"
            type="number"
            inputMode="numeric"
            min={1}
            hint="How many shops can use it. Empty for no limit."
          />
          <Field
            label="Note (optional)"
            name="note"
            maxLength={500}
            placeholder="December meetup"
          />
          {preview ? (
            <p className="rounded-xl bg-bg px-4 py-3 text-[0.9375rem]" data-testid="code-preview">
              Shops will see: <span className="font-semibold">{preview}</span>
            </p>
          ) : null}
          <Result state={state} />
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Saving…" : "Save Code"}
          </Button>
        </form>
      </Sheet>
    </>
  );
}

/** Turn Off / Turn On a promo code. */
export function PromoCodeToggle({ code, active }: { code: string; active: boolean }) {
  const [state, action, pending] = useActionState(setPromoCodeActive, {});
  return (
    <form action={action} className="flex items-center justify-end gap-2">
      <input type="hidden" name="code" value={code} />
      <input type="hidden" name="active" value={active ? "0" : "1"} />
      {state.error ? (
        <span className="text-[0.8125rem] text-status-fail">{state.error}</span>
      ) : null}
      <Button type="submit" kind="secondary" disabled={pending}>
        {active ? "Turn Off" : "Turn On"}
      </Button>
    </form>
  );
}
