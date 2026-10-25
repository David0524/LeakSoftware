"use client";

import { useActionState, useRef, useState } from "react";
import { REPORT_PHOTO_TEXT } from "@leakbook/core";
import { saveReportPhoto } from "@/app/actions/settings";
import { orOffline } from "@/lib/offline";

/**
 * Settings › Report Templates › Visit reports › Require a Photo (owner, 2026-10-25: "require
 * photo to send report"): a switch that saves when flipped, as iOS settings do, with what it
 * means for the shop's visit reports under it.
 */
export function ReportPhotoSwitch({ initial, hint }: { initial: boolean; hint: string }) {
  const [on, setOn] = useState(initial);
  const [state, action, pending] = useActionState(orOffline(saveReportPhoto), {});
  const form = useRef<HTMLFormElement>(null);
  return (
    <form ref={form} action={action} data-testid="report-photo-setting" className="px-4 sm:px-0">
      <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3">
        <span className="font-medium">{REPORT_PHOTO_TEXT.label}</span>
        <input
          type="checkbox"
          role="switch"
          name="require_report_photo"
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
      <p className="text-[0.9375rem] text-text-muted">{hint}</p>
      {state.error ? (
        <p role="alert" className="pt-1 text-[0.9375rem] text-status-fail">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
