"use server";

import { redirect } from "next/navigation";
import { getOffice } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { deleteAccount } from "@/server/account";
import type { FormState } from "./auth";

/** More › Delete My Account. Deleted accounts are signed out and sent to the home page. */
export async function deleteMyAccount(_: FormState, form: FormData): Promise<FormState> {
  await getOffice();
  if (
    String(form.get("confirm") ?? "")
      .trim()
      .toUpperCase() !== "DELETE"
  )
    return { error: "Type DELETE to confirm." };
  const db = await createClient();
  let result;
  try {
    result = await deleteAccount(db);
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  if (result.status === "requested") return { message: result.message };
  await db.auth.signOut();
  redirect("/?account=deleted");
}
