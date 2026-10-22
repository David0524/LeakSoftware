import { useEffect, useRef, useState } from "react";
import { MASS_EMAIL_OFFLINE, type MassEmailAudience, type MassEmailCount } from "@leakbook/core";
import { API_URL } from "../lib/config";
import { getServices } from "../lib/services";
import { ReportServerError, call } from "./reports";

// Email Customers (owner, 2026-10-22: "send mass email (with some filtering)"): everything goes
// through the website's /api/mass-email with the person's sign-in, as on the iPhone.

export interface MassEmailHistoryRow {
  id: string;
  subject: string;
  status: string;
  recipient_count: number;
  sent_count: number;
  failed_count: number;
  created_at: string;
}

export interface MassEmailSetup {
  shop: { name: string; address: string | null };
  shows: { value: string; label: string }[];
  cities: string[];
  left: number;
  configured: boolean;
  history: MassEmailHistoryRow[];
}

const NO_CONNECTION = "No connection. Try again when you have signal.";

/** The server's message, with "no connection" said as sending needs one. */
export function massEmailError(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e);
  return message === NO_CONNECTION ? MASS_EMAIL_OFFLINE : message;
}

async function get<T>(path: string): Promise<T> {
  if (!API_URL) throw new ReportServerError("This app isn’t connected to the Sundeck Pro server.");
  const token = await getServices().sync.accessToken();
  if (!token) throw new ReportServerError("Sign in again to continue.");
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { headers: { authorization: `Bearer ${token}` } });
  } catch {
    throw new ReportServerError(NO_CONNECTION);
  }
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok)
    throw new ReportServerError(data.error ?? `The server said ${res.status}.`, res.status);
  return data;
}

export const loadMassEmail = (companyId: string) =>
  get<MassEmailSetup>(`/api/mass-email?company_id=${encodeURIComponent(companyId)}`);

export const countMassEmail = (companyId: string, audience: MassEmailAudience) =>
  call<MassEmailCount>("/api/mass-email/count", { company_id: companyId, audience });

export const testMassEmail = (companyId: string, subject: string, body: string) =>
  call<{ message: string }>("/api/mass-email/test", { company_id: companyId, subject, body });

export const sendMassEmail = (
  companyId: string,
  input: { subject: string; body: string; audience: MassEmailAudience; expected: number },
) =>
  call<{ message: string; sent: number; failed: number }>("/api/mass-email/send", {
    company_id: companyId,
    ...input,
  });

/** The live count for a filter; only the newest answer shows ("Counting…" until it comes). */
export function useMassEmailCount(companyId: string, audience: MassEmailAudience) {
  const key = `${companyId}|${audience.show}|${audience.city ?? ""}|${audience.days ?? ""}`;
  const [answer, setAnswer] = useState<{
    key: string;
    count: MassEmailCount | null;
    error: string | null;
  } | null>(null);
  const latest = useRef(key);
  const { show, city, days } = audience;
  useEffect(() => {
    latest.current = key;
    countMassEmail(companyId, { show, city, days })
      .then((count) => {
        if (latest.current === key) setAnswer({ key, count, error: null });
      })
      .catch((e: unknown) => {
        if (latest.current === key) setAnswer({ key, count: null, error: massEmailError(e) });
      });
  }, [key, companyId, show, city, days]);
  const counting = answer?.key !== key;
  return {
    // The last count stays while the next is asked, so the number doesn't flicker away.
    count: answer?.count ?? null,
    counting,
    error: counting ? null : (answer?.error ?? null),
  };
}
