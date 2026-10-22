"use server";

import { revalidatePath } from "next/cache";
import { seenTips, TIPS } from "@leakbook/core";
import { getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// Tips and Getting Started (owner, 2026-10-16) are remembered on the person's account, so
// a tip closed on the computer stays closed on the phone's browser too. The session is
// refreshed after each change: pages read the account from the session token.

async function saveWalkthrough(patch: Record<string, unknown>) {
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ data: patch });
  if (!error) await supabase.auth.refreshSession();
}

/** Closes a tip for good. */
export async function dismissTip(id: string) {
  const user = await getUser();
  if (!user || !TIPS.some((t) => t.id === id)) return;
  const seen = seenTips(user.user_metadata.tips_seen);
  if (seen.includes(id)) return;
  await saveWalkthrough({ tips_seen: [...seen, id] });
}

/** Owners: hides Getting Started before every step is done. */
export async function hideGettingStarted() {
  if (!(await getUser())) return;
  await saveWalkthrough({ getting_started_hidden: true });
  revalidatePath("/", "layout");
}

/** More › Show Tips Again: every tip, and Getting Started, come back. */
export async function showTipsAgain() {
  if (!(await getUser())) return;
  await saveWalkthrough({ tips_seen: [], getting_started_hidden: false });
  revalidatePath("/", "layout");
}
