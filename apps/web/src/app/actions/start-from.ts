"use server";

import { revalidatePath } from "next/cache";
import { START_FROM_COPY } from "@leakbook/core";
import { getOffice } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { saveMemberStartWith } from "@/server/member-start";
import type { FormState } from "./auth";

/**
 * Start My Day From (owner, 2026-10-21; docs/design/2026-10-21-start-from-home.md): More › My
 * Profile for your own, Team › a person's profile for owners and admins. Saved as the signed-in
 * person, so RLS allows only your own row or, for owners and admins, anyone's.
 */
export async function saveStartFrom(_: FormState, form: FormData): Promise<FormState> {
  const office = await getOffice();
  const r = await saveMemberStartWith(
    await createClient(),
    { companyId: office.company.id, actorId: office.user.id, manager: office.isManager },
    {
      userId: String(form.get("user") ?? "").trim(),
      startFrom: String(form.get("start_from") ?? ""),
      homeAddress: String(form.get("home_address") ?? ""),
    },
  );
  if (!r.saved) return { error: r.error, fields: r.fields };
  // Every route on the website starts from it.
  revalidatePath("/", "layout");
  return { message: r.saved.found === false ? `Saved. ${START_FROM_COPY.pending}` : "Saved." };
}
