"use client";

import { useActionState, useState } from "react";
import { flushSync } from "react-dom";
import { dateFormat } from "@leakbook/core";
import { sendVisitReportAction } from "@/app/actions/reports";
import { orOffline } from "@/lib/offline";
import { CopyLink } from "./settings-forms";
import { Button, Notice } from "./ui";

/**
 * Send Visit Report on a maintenance visit (owner, 2026-10-20: "have an option to send the
 * report to customers. Include manual send and auto send"): the visit's water test, checklist
 * and cleanings, and photos, frozen at a customer link. Sending again sends a new version.
 */
export function VisitReportPanel({
  jobId,
  auto,
  done,
  customerEmail,
  hasLine,
  emailReady,
  versions,
  timeZone,
}: {
  jobId: string;
  /** The shop sends them by itself when a visit is completed. */
  auto: boolean;
  done: boolean;
  customerEmail: string | null;
  /** The shop has a company number to text from. */
  hasLine: boolean;
  emailReady: boolean;
  versions: {
    id: string;
    version: number;
    current: boolean;
    sentAt: string | null;
    token: string | null;
  }[];
  timeZone: string;
}) {
  const [state, action, sending] = useActionState(orOffline(sendVisitReportAction), {});
  const [to, setTo] = useState(customerEmail ?? "");
  // Which button sent the form (set on click, so it doesn't depend on the submitter).
  const [channel, setChannel] = useState("email");
  const latest = versions.find((v) => v.current);
  const when = (iso: string | null) =>
    iso
      ? dateFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone }).format(
          new Date(iso),
        )
      : "";

  return (
    <div className="card space-y-4 p-5">
      <p className="text-[0.9375rem] text-text-muted">
        {latest
          ? `Sent ${when(latest.sentAt)}${latest.version > 1 ? ` · version ${latest.version}` : ""}.`
          : auto
            ? done
              ? "Sending to the customer now."
              : "Goes to the customer by itself when this visit is completed."
            : "The water test, the checklist and cleanings, and photos from this visit."}
      </p>
      {latest?.token ? (
        <a
          href={`/r/${latest.token}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-11 items-center font-semibold text-link"
        >
          View Visit Report
        </a>
      ) : null}

      <form action={action} className="space-y-3">
        <input type="hidden" name="job" value={jobId} />
        <input type="hidden" name="channel" value={channel} />
        <label className="block space-y-1">
          <span className="font-medium">Customer email</span>
          <input
            name="to"
            type="email"
            autoComplete="off"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="block min-h-11 w-full rounded-[10px] border border-control-border bg-surface px-3"
          />
        </label>
        <div className="flex flex-wrap gap-3">
          <Button
            type="submit"
            onClick={() => flushSync(() => setChannel("email"))}
            disabled={sending || !emailReady || !to.trim()}
          >
            {sending ? "Sending…" : latest ? "Send Again by Email" : "Send by Email"}
          </Button>
          <Button
            type="submit"
            onClick={() => flushSync(() => setChannel(hasLine ? "text" : "sms_device"))}
            kind="secondary"
            disabled={sending}
          >
            {hasLine ? "Send by Text" : "Get Link to Text"}
          </Button>
        </div>
      </form>
      {state.error ? <Notice tone="error">{state.error}</Notice> : null}
      {state.message ? <Notice tone="success">{state.message}</Notice> : null}
      {state.sms && state.link ? <CopyLink url={state.link} label="Visit report link" /> : null}

      {versions.length > 1 ? (
        <ul className="space-y-1 text-[0.9375rem] text-text-muted">
          {versions.map((v) => (
            <li key={v.id}>
              Version {v.version} · {when(v.sentAt)}
              {v.current ? " · latest" : ""}
              {v.token ? (
                <>
                  {" · "}
                  <a href={`/r/${v.token}`} target="_blank" rel="noreferrer" className="text-link">
                    View
                  </a>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
