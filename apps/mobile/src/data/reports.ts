import { useMemo } from "react";
import type { FinalSection, NarrativeProblem } from "@leakbook/core";
import { API_URL } from "../lib/config";
import { noteError } from "../lib/usage-errors";
import { getServices } from "../lib/services";
import { useJobRows } from "./hooks";

import { friendlyError } from "@leakbook/core";
export interface ReportRecord {
  id: string;
  job_id: string;
  template_key: "homeowner" | "partner" | "maintenance" | "maintenance_month";
  version: number;
  status: "draft" | "sent" | "superseded";
  final_sections: FinalSection[] | null;
  ai_draft: { problems?: NarrativeProblem[] } | null;
  model: string | null;
  sent_at: string | null;
}

export interface SignatureRecord {
  id: string;
  job_id: string;
  /** The report version it was finished with; null until then. */
  report_id: string | null;
  purpose: string;
  signer_name: string;
  signer_role: string | null;
  image_path: string | null;
  signed_at: string;
}

interface ShareLinkRecord {
  token: string;
  report_id: string | null;
  revoked_at: string | null;
}

/** A job's reports, newest version first, with each one's customer link token. */
export function useJobReports(companyId: string, jobId: string) {
  const reports = useJobRows<ReportRecord>("report", companyId, jobId);
  const links = useJobRows<ShareLinkRecord>("share_link", companyId, jobId);
  return useMemo(() => {
    const tokenOf = new Map(
      links.filter((l) => !l.revoked_at && l.report_id).map((l) => [l.report_id, l.token]),
    );
    return reports
      .filter((r) => r.job_id === jobId)
      .sort((a, b) => b.version - a.version)
      .map((r) => ({ ...r, token: tokenOf.get(r.id) ?? null }));
  }, [reports, links, jobId]);
}

export function useJobSignatures(companyId: string, jobId: string) {
  const all = useJobRows<SignatureRecord>("signature", companyId, jobId);
  return useMemo(
    () =>
      all.filter((s) => s.job_id === jobId).sort((a, b) => a.signed_at.localeCompare(b.signed_at)),
    [all, jobId],
  );
}

/** Writing and sending reports happen on the Sundeck Pro server (AI, email, PDF). */
export const reportsOnline = Boolean(API_URL);

export class ReportServerError extends Error {
  constructor(
    message: string,
    /** The server's HTTP status, when it answered. */
    readonly status: number | null = null,
  ) {
    super(message);
  }
}

/** A photo, video or signature image of the job hasn't uploaded yet, so the report would miss it. */
export class UploadsPendingError extends ReportServerError {
  constructor() {
    super("The photos haven’t finished uploading yet. Try again in a moment.");
  }
}

/** Throws UploadsPendingError while a file of this report's job is still waiting to upload. */
function requireUploaded(reportId: string) {
  const { sync } = getServices();
  const jobId = sync.get("report", reportId)?.job_id;
  if (typeof jobId === "string" && sync.hasPendingUploads(jobId)) throw new UploadsPendingError();
}

/**
 * Whether a queued request should wait and try again (no connection, signed out, the server
 * busy or at fault) rather than be dropped as refused. Decided by the status when the server
 * answered, so a server fault with its own message isn't taken for a refusal.
 */
export function tryAgainLater(e: unknown): boolean {
  if (e instanceof ReportServerError && e.status !== null)
    return e.status === 401 || e.status === 408 || e.status === 429 || e.status >= 500;
  const message = e instanceof Error ? e.message : "";
  return /connection|Sign in|said 5/.test(message);
}

/** POST to the Sundeck Pro server as the signed-in user. */
export async function call<T>(path: string, body: unknown): Promise<T> {
  if (!API_URL) throw new ReportServerError("This app isn’t connected to the Sundeck Pro server.");
  const token = await getServices().sync.accessToken();
  if (!token) throw new ReportServerError("Sign in again to continue.");
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ReportServerError("No connection. Try again when you have signal.");
  }
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    noteError(data.error ?? `The server said ${res.status}.`);
    throw new ReportServerError(
      friendlyError(data.error ?? `The server said ${res.status}.`),
      res.status,
    );
  }
  return data;
}

/** Saves the job to the server, then has it write the draft; the report syncs down. */
export async function writeReportDraft(
  jobId: string,
  template: "homeowner" | "partner",
  onStep: (step: number) => void = () => {},
) {
  const { sync } = getServices();
  onStep(0);
  await sync.syncNow();
  onStep(1);
  const result = await call<{ reportId: string; problems: NarrativeProblem[] }>(
    `/api/jobs/${jobId}/reports`,
    { template },
  );
  onStep(2);
  await sync.syncNow();
  return result;
}

/** Sends a report. Edits must reach the server first, so the customer gets what was approved. */
export async function sendReportFromPhone(
  reportId: string,
  channel: "email" | "sms_device",
  to: string | null,
  onStep: (step: number) => void = () => {},
) {
  const { sync } = getServices();
  onStep(0);
  await sync.syncNow();
  if (sync.hasPendingWrites("report", reportId))
    throw new ReportServerError(
      "Your edits haven’t reached the server yet. Try again with signal.",
    );
  requireUploaded(reportId);
  onStep(1);
  const result = await call<{ link: string; message: string; emailed: boolean }>(
    `/api/reports/${reportId}/send`,
    { channel, to },
  );
  onStep(2);
  await sync.syncNow();
  return result;
}

/**
 * Finishes a report after the customer signed on this phone (or with Customer Not Here).
 * The signature and any edits must reach the server first, so the report carries them.
 */
export async function finishReportFromPhone(
  reportId: string,
  customerAway: boolean,
  onStep: (step: number) => void = () => {},
) {
  const { sync } = getServices();
  onStep(0);
  await sync.syncNow();
  if (sync.hasPendingWrites("report", reportId) || sync.hasPendingWrites("signature"))
    throw new ReportServerError(
      "The signature or your edits haven’t reached the server yet. Finish when you have signal.",
    );
  requireUploaded(reportId);
  onStep(1);
  const result = await call<{ token: string }>(`/api/reports/${reportId}/finish`, {
    customerAway,
  });
  onStep(2);
  await sync.syncNow();
  return result;
}

/** The steps each wait on the server shows (StepList), in order. */
export const REPORT_STEPS = {
  draft: ["Saving your work", "Writing the report", "Getting it ready"],
  send: ["Saving your work", "Sending the report", "Getting it ready"],
  finish: ["Saving your work", "Finishing the report", "Getting it ready"],
} as const;
