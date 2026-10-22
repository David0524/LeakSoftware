import { API_URL } from "../lib/config";
import { getServices } from "../lib/services";
import { ReportServerError, call } from "./reports";

// The sample job (owner, 2026-10-22; docs/design/2026-10-22-first-win.md), through the
// website's /api/jobs/<id>/sample, as the iPhone app and the website do it.

export interface SampleSent {
  /** Emailed to `to`; false when the server can't send email (then open `link`). */
  emailed: boolean;
  to: string;
  link: string;
  message: string;
}

/** Send Yourself This Report: to the signed-in person's own email, never anyone else's. */
export function sendSampleToSelf(jobId: string): Promise<SampleSent> {
  return call<SampleSent>(`/api/jobs/${jobId}/sample`, {});
}

/** Delete Sample: gone for good. The deletion syncs down to this phone. */
export async function deleteSample(jobId: string): Promise<void> {
  if (!API_URL) throw new ReportServerError("This app isn’t connected to the Sundeck Pro server.");
  const { sync } = getServices();
  const token = await sync.accessToken();
  if (!token) throw new ReportServerError("Sign in again to continue.");
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/jobs/${jobId}/sample`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}` },
    });
  } catch {
    throw new ReportServerError("No connection. Try again when you have signal.");
  }
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ReportServerError(data.error ?? `The server said ${res.status}.`, res.status);
  }
  await sync.syncNow();
}
