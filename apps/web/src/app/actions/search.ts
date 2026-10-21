"use server";

import {
  normalizeSearch,
  searchShop,
  type SearchGroupKey,
  type SearchRecords,
  type SearchResults,
} from "@leakbook/core";
import { getOffice } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const GROUPS: SearchGroupKey[] = ["customers", "pools", "jobs", "quotes", "invoices"];

/**
 * One search across the shop (docs/plans/search-and-activity.md section 1): the database finds
 * what this person may open (search_candidates, through their row security), and the shared
 * rule in packages/core matches, ranks, groups, and caps it, as the phones do over their own
 * database. `group` is See All: every match in that group.
 */
export async function searchOffice(query: string, group?: SearchGroupKey): Promise<SearchResults> {
  const office = await getOffice();
  const q = String(query ?? "").slice(0, 100);
  const options = {
    now: new Date(),
    timeZone: office.company.timezone,
    ...(group && GROUPS.includes(group) ? { group, limit: Infinity } : {}),
  };
  const parsed = normalizeSearch(q);
  if (!parsed.ready || (parsed.words.length === 0 && !parsed.digits))
    return searchShop(q, {}, options);
  const { data, error } = await (
    await createClient()
  ).rpc("search_candidates", {
    target_company: office.company.id,
    words: parsed.words,
    digits: parsed.digits,
  });
  if (error) throw new Error(error.message);
  return searchShop(q, (data ?? {}) as SearchRecords, options);
}
