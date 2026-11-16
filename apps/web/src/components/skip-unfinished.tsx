"use client";

import { useActionState, useRef, useState } from "react";
import { SKIP_UNFINISHED_HINT, SKIP_UNFINISHED_LABEL } from "@leakbook/core";
import { saveSkipUnfinished } from "@/app/actions/settings";
import { orOffline } from "@/lib/offline";

/**
 * Settings › Scheduling › Skip Unfinished Visits at Day's End (owner, 2026-11-16): a switch
 * that saves when flipped, as iOS settings do, with what it does under it. Off by default.
 */
export function SkipUnfinishedSwitch({ initial }: { initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [state, action, pending] = useActionState(orOffline(saveSkipUnfinished), {});
  const form = useRef<HTMLFormElement>(null);
  return (
    <div>
      <ul className="grouped">
        <li>
          <form ref={form} action={action} data-testid="skip-unfinished">
            <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 px-4 py-1.5">
              <span className="font-medium">{SKIP_UNFINISHED_LABEL}</span>
              <input
                type="checkbox"
                role="switch"
                name="skip_unfinished_visits"
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
        </li>
      </ul>
      <p className="mt-2 px-4 text-[0.8125rem] text-text-muted">{SKIP_UNFINISHED_HINT}</p>
    </div>
  );
}
