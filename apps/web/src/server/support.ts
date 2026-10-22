import "server-only";
import { cache } from "react";
import { adminClient } from "./admin";
import { isStaff } from "./leads";

// The office side of a support session (Admin portal, owner 2026-10-22): staff open a shop's
// own office to help, View Only or Can Make Changes. The database decides what they can see
// and change (20261022000700_admin_portal.sql); this adds the shop to their office and the
// banner, and lets the proxy refuse the website's own changes in View Only.

export interface OpenSupport {
  id: string;
  companyId: string;
  companyName: string;
  timezone: string;
  access: "view" | "edit";
  endsAt: string;
}

interface Who {
  id: string;
  email: string | null;
  aal: string;
}

/**
 * The staff person's open support session, if any. Only for staff whose session passed
 * two-step, as the database requires.
 */
export const openSupport = cache(async (user: Who): Promise<OpenSupport | null> => {
  if (!isStaff({ ...user, user_metadata: {} }) || user.aal !== "aal2") return null;
  const db = adminClient();
  if (!db) return null;
  const { data } = await db
    .from("support_session")
    .select("id, access, ends_at, company:company_ref (id, name, timezone)")
    .eq("staff_user_id", user.id)
    .is("ended_at", null)
    .gt("ends_at", new Date().toISOString())
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const row = data as unknown as {
    id: string;
    access: "view" | "edit";
    ends_at: string;
    company: { id: string; name: string; timezone: string } | null;
  } | null;
  if (!row?.company) return null;
  return {
    id: row.id,
    companyId: row.company.id,
    companyName: row.company.name,
    timezone: row.company.timezone,
    access: row.access,
    endsAt: row.ends_at,
  };
});

/**
 * For the proxy: whether this request changes something in a shop the person sees only
 * through a View Only session. Staff who are members of the shop keep their own rights.
 */
export async function viewOnlyIn(user: Who, companyId: string | undefined): Promise<boolean> {
  const support = await openSupport(user);
  if (!support || support.access !== "view") return false;
  if (companyId && companyId !== support.companyId) return false;
  const db = adminClient();
  if (!db) return true;
  const { count } = await db
    .from("membership")
    .select("id", { count: "exact", head: true })
    .eq("company_id", support.companyId)
    .eq("user_id", user.id)
    .eq("status", "active")
    .is("deleted_at", null);
  return !count;
}
