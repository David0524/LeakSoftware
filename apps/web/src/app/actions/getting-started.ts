"use server";

import { revalidatePath } from "next/cache";
import { getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// Getting Started (owner, 2026-10-16) is remembered on the person's account, so hiding it on
// the computer hides it on the phone's browser too. The session is refreshed after the
// change: pages read the account from the session token.

/** Owners: hides Getting Started before every step is done. */
export async function hideGettingStarted() {
  if (!(await getUser())) return;
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ data: { getting_started_hidden: true } });
  if (!error) await supabase.auth.refreshSession();
  revalidatePath("/", "layout");
}
