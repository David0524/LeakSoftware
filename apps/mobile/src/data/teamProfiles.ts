import { useMemo } from "react";
import type { JsonValue } from "@leakbook/sync";
import { getServices } from "../lib/services";
import type { TeamProfileValues } from "../lib/teamProfile";
import { useRows } from "./hooks";

// Team profiles (supabase/migrations/20261012006800): synced rows that only owners and admins
// read and write, so a tech's phone never has them. `user_id` links one to a team member;
// without it, someone who works for the shop without the app.

export interface TeamProfile extends TeamProfileValues {
  id: string;
  user_id: string | null;
  deleted_at?: string | null;
}

/** The shop's profiles, not deleted. */
export function useTeamProfiles(companyId: string): TeamProfile[] {
  const rows = useRows<TeamProfile>("team_profile", companyId);
  return useMemo(() => rows.filter((r) => !r.deleted_at), [rows]);
}

/** Saves a profile: the existing one, or a new one (for `userId`, or someone without the app). */
export function saveTeamProfile(
  companyId: string,
  values: TeamProfileValues,
  existing: { id: string } | { userId: string | null },
): void {
  const { sync } = getServices();
  const row = values as unknown as Record<string, JsonValue>;
  if ("id" in existing) sync.write("team_profile", existing.id, companyId, row);
  else
    sync.insert("team_profile", companyId, {
      ...row,
      ...(existing.userId ? { user_id: existing.userId } : {}),
    });
}

export function removeTeamProfile(companyId: string, id: string): void {
  getServices().sync.write("team_profile", id, companyId, {
    deleted_at: new Date().toISOString(),
  });
}
