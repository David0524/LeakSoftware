"use client";

import { useState } from "react";
import { ON_MY_WAY_LABELS, type OnMyWayVia } from "@leakbook/core";
import { saveOnMyWay } from "@/app/actions/settings";
import { Segmented } from "./segmented";
import { SettingsForm } from "./settings-forms";

const NOTE: Record<OnMyWayVia, string> = {
  messages:
    "Sent from the company number and kept in Messages, so the whole team sees it and the customer’s reply.",
  phone: "Opens the tech’s own Messages app with the text ready to send.",
};

/** Settings › Phone and Texting: where On My Way texts go out from (owner, 2026-10-16). */
export function OnMyWayForm({ via }: { via: OnMyWayVia }) {
  const [value, setValue] = useState<OnMyWayVia>(via);
  return (
    <SettingsForm action={saveOnMyWay}>
      <Segmented
        label="Send from"
        name="on_my_way"
        value={value}
        onChange={setValue}
        options={(["messages", "phone"] as const).map((v) => ({
          value: v,
          label: ON_MY_WAY_LABELS[v],
        }))}
      />
      <p className="px-4 text-[0.9375rem] text-text-muted sm:px-0">{NOTE[value]}</p>
    </SettingsForm>
  );
}
