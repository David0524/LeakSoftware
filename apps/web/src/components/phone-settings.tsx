"use client";

import { useActionState } from "react";
import { formatPhone } from "@leakbook/core";
import { findNumbers, takeNumber, type NumberSearch } from "@/app/actions/texting";
import { Banner } from "./doc-ui";
import { SettingsForm } from "./settings-forms";
import { Button, Field } from "./ui";

/** Find a local number by area code, then take one (Sundeck Pro pays for it). */
export function NumberPicker() {
  const [state, search, pending] = useActionState(findNumbers, {} as NumberSearch);
  return (
    <div className="space-y-4">
      <form action={search} className="flex items-end gap-2">
        <Field
          label="Area code"
          name="area_code"
          inputMode="numeric"
          pattern="[2-9][0-9]{2}"
          maxLength={3}
          required
          defaultValue={state.values?.area_code}
          className="w-36"
        />
        <Button type="submit" kind="secondary" disabled={pending}>
          {pending ? "Searching…" : "Search"}
        </Button>
      </form>
      {state.error ? <Banner tone="error">{state.error}</Banner> : null}
      {state.numbers?.length ? (
        <ul className="grouped" aria-label="Numbers you can take">
          {state.numbers.map((n) => (
            <li key={n.number} className="px-4 py-2.5">
              <SettingsForm
                action={takeNumber}
                submit="Use This Number"
                inline
                className="flex flex-wrap items-center justify-between gap-3"
              >
                <input type="hidden" name="number" value={n.number} />
                <span>
                  <span className="block font-semibold">{formatPhone(n.number)}</span>
                  {n.locality ? (
                    <span className="block text-[0.9375rem] text-text-muted">
                      {[n.locality, n.region].filter(Boolean).join(", ")}
                    </span>
                  ) : null}
                </span>
              </SettingsForm>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
