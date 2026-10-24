"use client";

import { useActionState, useRef, useState } from "react";
import { CHARGE_CHEMICALS_TEXT } from "@leakbook/core";
import { saveChargeChemicals } from "@/app/actions/settings";
import { orOffline } from "@/lib/offline";

/**
 * Settings › Price Book › Charge for Chemicals (owner, 2026-10-24): a switch that saves when
 * flipped, as iOS settings do, with what on and off mean under it.
 */
export function ChargeChemicalsSwitch({ initial }: { initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [state, action, pending] = useActionState(orOffline(saveChargeChemicals), {});
  const form = useRef<HTMLFormElement>(null);
  return (
    <form ref={form} action={action} data-testid="charge-chemicals">
      <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 px-4 py-1.5">
        <span className="font-medium">{CHARGE_CHEMICALS_TEXT.label}</span>
        <input
          type="checkbox"
          role="switch"
          name="charge_chemicals"
          className="ios-switch"
          checked={on}
          disabled={pending}
          onChange={(e) => {
            setOn(e.target.checked);
            // After React commits the change, so the form posts the new value.
            setTimeout(() => form.current?.requestSubmit(), 0);
          }}
        />
      </label>
      {state.error ? (
        <p role="alert" className="px-4 pb-2 text-[0.9375rem] text-status-fail">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
