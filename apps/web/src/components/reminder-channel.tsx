"use client";

import { useState } from "react";
import { REMINDER_CHANNELS, REMINDER_CHANNEL_HINT, type ReminderChannel } from "@leakbook/core";
import { Segmented } from "./segmented";

/**
 * How reminders go: Email, Text, or Both (owner's competitor notes, 2026-11-16). Texts go from the
 * shop's company number. Saved with Settings › Company and Branding's one Save; posts as
 * `reminder_channel`.
 */
export function ReminderChannelChoice({ initial }: { initial: ReminderChannel }) {
  const [value, setValue] = useState<ReminderChannel>(initial);
  return (
    <div className="space-y-2 px-4 sm:px-0">
      <Segmented
        label="Send Reminders By"
        name="reminder_channel"
        value={value}
        onChange={setValue}
        options={REMINDER_CHANNELS}
      />
      <p className="text-[0.9375rem] text-text-muted">{REMINDER_CHANNEL_HINT}</p>
    </div>
  );
}
