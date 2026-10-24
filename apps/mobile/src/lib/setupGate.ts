import type { SupabaseClient } from "@supabase/supabase-js";
import { isConnectionError, mustFinishSetup, type CompanyAccess } from "@leakbook/core";
import type { KeyValue } from "./database";

/**
 * A new shop's owner finishes setup (the card for the trial) on the website before working in
 * the app (owner, 2026-10-24). The answer comes from public.company_access and is kept on the
 * phone per company, so the app opens the same way offline. Same key as the iPhone app
 * (KVKey.setupNeeded). Unknown (never checked) lets the person in: the database still refuses
 * changes to a shop that needs its card.
 */
export const SETUP_NEEDED_KEY = "access:setup_needed";

/** Companies last seen needing setup by this person. */
export function readSetupNeeded(kv: KeyValue): string[] {
  try {
    const raw = kv.get(SETUP_NEEDED_KEY);
    const ids: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function writeSetupNeeded(kv: KeyValue, ids: string[]): void {
  if (ids.length) kv.set(SETUP_NEEDED_KEY, JSON.stringify(ids));
  else kv.remove(SETUP_NEEDED_KEY);
}

export type SetupCheck = "done" | "needed" | "offline" | "failed";

/**
 * Asks the server whether this person must finish the company's setup, and remembers the
 * answer. Only owners are asked (only they are held, as on the website).
 */
export async function checkSetup(
  supabase: Pick<SupabaseClient, "rpc">,
  kv: KeyValue,
  companyId: string,
  role: string | null | undefined,
): Promise<SetupCheck> {
  const others = readSetupNeeded(kv).filter((id) => id !== companyId);
  if (role !== "owner") {
    writeSetupNeeded(kv, others);
    return "done";
  }
  let access: CompanyAccess | null = null;
  try {
    const { data, error } = await supabase.rpc("company_access", { target_company: companyId });
    if (error) return isConnectionError(error.message) ? "offline" : "failed";
    access = data as CompanyAccess;
  } catch (e) {
    return isConnectionError(e instanceof Error ? e.message : String(e)) ? "offline" : "failed";
  }
  const needed = mustFinishSetup(access, role);
  writeSetupNeeded(kv, needed ? [...others, companyId] : others);
  return needed ? "needed" : "done";
}
