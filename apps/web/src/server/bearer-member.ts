import "server-only";
import { isManagerRole } from "@leakbook/core";
import type { bearerSession } from "./bearer";

type Session = NonNullable<Awaited<ReturnType<typeof bearerSession>>>;

/** The signed-in person's role in the shop they name, or null when they aren't on its team. */
export async function memberRole(session: Session, companyId: unknown): Promise<string | null> {
  if (typeof companyId !== "string" || !companyId) return null;
  const { data } = await session.db
    .from("membership")
    .select("role")
    .eq("user_id", session.userId)
    .eq("company_id", companyId)
    .eq("status", "active")
    .is("deleted_at", null)
    .maybeSingle();
  return (data?.role as string | undefined) ?? null;
}

export const isManager = (role: string | null) => !!role && isManagerRole(role);
