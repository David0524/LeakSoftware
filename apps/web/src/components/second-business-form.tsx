"use client";

import { useState } from "react";
import { BUSINESS_WORK_LABELS, SECOND_BUSINESS_TEXT, type BusinessWork } from "@leakbook/core";
import { Segmented } from "./segmented";

/**
 * The second business's Use For (2026-11-26): the line of work its name is for. Saved with the
 * Company page's one Save; posts as `second_for`.
 */
export function SecondBusinessWork({ initial }: { initial: BusinessWork }) {
  const [value, setValue] = useState<BusinessWork>(initial);
  return (
    <Segmented
      label={SECOND_BUSINESS_TEXT.useFor}
      name="second_for"
      value={value}
      onChange={setValue}
      options={(["leak", "pool"] as const).map((w) => ({
        value: w,
        label: BUSINESS_WORK_LABELS[w],
      }))}
    />
  );
}
