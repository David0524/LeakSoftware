"use client";

import { useState } from "react";
import {
  HEARD_FROM_NONE,
  HEARD_FROM_OPTIONS,
  HEARD_FROM_OTHER_MAX,
  HEARD_FROM_OTHER_PLACEHOLDER,
  HEARD_FROM_QUESTION,
  parseHeardFrom,
} from "@leakbook/core";
import { FieldGroup, GroupedField, GroupedSelect } from "./ui";

/**
 * "How did you hear about us?" on sign-up (owner, 2026-10-24): optional, one choice from the
 * list (a select, the house Choice for long lists), and "Other" opens a short text field.
 * Posts `heard_from` and `heard_from_other`. Same wording and order as the apps.
 */
export function HeardFromField({
  initial,
  initialOther,
}: {
  initial?: string | null;
  initialOther?: string | null;
}) {
  const [value, setValue] = useState<string>(parseHeardFrom(initial) ?? "");
  return (
    <FieldGroup labelWidth="8.25rem" className="sm:space-y-2">
      <GroupedSelect
        label={HEARD_FROM_QUESTION}
        name="heard_from"
        stacked
        value={value}
        onChange={(e) => setValue(e.target.value)}
        options={[
          { value: "", label: HEARD_FROM_NONE },
          ...HEARD_FROM_OPTIONS.map((o) => ({ value: o.key, label: o.label })),
        ]}
      />
      {value === "other" ? (
        <GroupedField
          label="Where you heard about us"
          labelHidden
          name="heard_from_other"
          placeholder={HEARD_FROM_OTHER_PLACEHOLDER}
          maxLength={HEARD_FROM_OTHER_MAX}
          autoComplete="off"
          defaultValue={initialOther ?? ""}
        />
      ) : null}
    </FieldGroup>
  );
}
