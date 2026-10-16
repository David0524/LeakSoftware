"use server";

import { revalidatePath } from "next/cache";
import { getOffice } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/** The shop's team: turn a customer link off now (owner, 2026-10-16). */
export async function turnOffLink(linkId: string, jobId: string): Promise<{ error?: string }> {
  await getOffice();
  const { error } = await (await createClient()).rpc("turn_off_share_link", { link_id: linkId });
  if (error) return { error: "Couldn’t turn the link off. Try again." };
  revalidatePath(`/jobs/${jobId}`);
  return {};
}
