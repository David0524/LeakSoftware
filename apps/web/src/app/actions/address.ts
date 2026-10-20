"use server";

import type { AddressSuggestion } from "@leakbook/core";
import { getOffice } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { shopLocation } from "@/server/address-suggest";
import { suggestAddresses } from "@/server/routing";

/** Real addresses for what's typed in an address field, nearest the shop first (2026-10-20). */
export async function suggestAddress(q: string): Promise<AddressSuggestion[]> {
  const office = await getOffice();
  const db = await createClient();
  return suggestAddresses(db, office.company.id, q, await shopLocation(db, office.company.id));
}
