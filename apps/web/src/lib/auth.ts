import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "./supabase/server";

export type Role = "owner" | "tech";

export interface CompanySummary {
  id: string;
  name: string;
  role: Role;
}

export interface Office {
  user: { id: string; email: string; name: string | null };
  company: CompanySummary & { timezone: string };
  companies: CompanySummary[];
  isOwner: boolean;
}

export const ACTIVE_COMPANY_COOKIE = "lb_company";

export interface SignedInUser {
  id: string;
  email: string | null;
  user_metadata: Record<string, unknown>;
}

/**
 * The signed-in user from the session token, whose signature is checked here against the
 * project's public signing keys (not just decoded). This avoids a call to the auth server on
 * every page, which was a large part of each page's load time.
 */
export const getUser = cache(async (): Promise<SignedInUser | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const c = data?.claims;
  if (error || !c?.sub) return null;
  return {
    id: c.sub,
    email: typeof c.email === "string" ? c.email : null,
    user_metadata: (c.user_metadata as Record<string, unknown> | undefined) ?? {},
  };
});

/**
 * The signed-in user and the company they are working in. Sends signed-out visitors to
 * sign-in and people without a company to setup. Every office page and action starts here.
 */
export const getOffice = cache(async (): Promise<Office> => {
  const user = await getUser();
  if (!user) redirect("/sign-in");
  const supabase = await createClient();
  const [{ data: memberships }, { data: profile }] = await Promise.all([
    supabase
      .from("membership")
      .select("role, company:company_id (id, name, timezone)")
      .eq("user_id", user.id)
      .eq("status", "active")
      .is("deleted_at", null),
    supabase.from("profile").select("full_name").eq("id", user.id).maybeSingle(),
  ]);
  const rows = (memberships ?? []) as unknown as {
    role: Role;
    company: { id: string; name: string; timezone: string } | null;
  }[];
  const companies = rows
    .filter((m) => m.company)
    .map((m) => ({ ...m.company!, role: m.role }))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (companies.length === 0) redirect("/setup");

  const wanted = (await cookies()).get(ACTIVE_COMPANY_COOKIE)?.value;
  const company = companies.find((c) => c.id === wanted) ?? companies[0]!;
  return {
    user: { id: user.id, email: user.email ?? "", name: profile?.full_name ?? null },
    company,
    companies: companies.map(({ id, name, role }) => ({ id, name, role })),
    isOwner: company.role === "owner",
  };
});

/** For owner-only actions. Pages show a message instead (see settings/layout.tsx). */
export async function requireOwner(): Promise<Office> {
  const office = await getOffice();
  if (!office.isOwner) throw new Error("Only owners can change settings.");
  return office;
}
