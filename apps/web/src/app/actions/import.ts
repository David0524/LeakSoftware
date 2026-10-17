"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { getOffice, getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/server/admin";
import {
  checkImportFor,
  cleanMapping,
  cleanRows,
  locateImported,
  runImportFor,
  type ImportSummary,
  type ImportTarget,
} from "@/server/import";
import { isStaff } from "@/server/leads";

// Import Customers (owner, 2026-10-16). Owners import into their own shop; Tidemark staff
// (TIDEMARK_STAFF_EMAILS, after two-step sign-in) import for a shop from /admin/import.

const width = (mapping: unknown) => Math.min(60, Array.isArray(mapping) ? mapping.length : 0);

async function target(companyId: string | null): Promise<ImportTarget> {
  if (companyId) {
    const user = await getUser();
    if (!isStaff(user) || user?.aal !== "aal2") throw new Error("Staff only.");
    const admin = adminClient();
    if (!admin) throw new Error("The server key is missing.");
    return { db: admin, companyId };
  }
  const office = await getOffice();
  if (!office.isOwner) throw new Error("Only owners can import customers.");
  return { db: await createClient(), companyId: office.company.id };
}

export async function checkImport(
  companyId: string | null,
  mapping: unknown,
  rows: unknown,
): Promise<{ summary?: ImportSummary; error?: string }> {
  try {
    const clean = cleanRows(rows);
    const t = await target(companyId);
    return {
      summary: await checkImportFor(t, clean, cleanMapping(mapping, width(mapping))),
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function runImport(
  companyId: string | null,
  mapping: unknown,
  rows: unknown,
): Promise<{
  done?: { customers: number; pools: number; plans: number; skipped: number };
  error?: string;
}> {
  try {
    const clean = cleanRows(rows);
    const t = await target(companyId);
    const done = await runImportFor(t, clean, cleanMapping(mapping, width(mapping)));
    after(() => locateImported(t).catch(() => undefined));
    for (const p of ["/customers", "/messages", "/schedule", "/today", "/jobs"]) revalidatePath(p);
    return { done };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return {
      error: /read-only/.test(message)
        ? "This shop is read-only until its Tidemark subscription is set up."
        : `The import didn’t go through, and nothing was added: ${message}`,
    };
  }
}
