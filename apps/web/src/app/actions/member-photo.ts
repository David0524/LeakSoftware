"use server";

import { revalidatePath } from "next/cache";
import { memberPhotoPath, uploadRefusal, uploadRefusalMessage } from "@leakbook/core";
import { getOffice } from "@/lib/auth";
import { friendlyDbError } from "@/lib/limits";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "./auth";

/**
 * A member's photo (2026-11-26): owners and admins for anyone, everyone for themselves (the
 * database checks both). The browser sends it already cropped square (TechPhotoPicker); `remove`
 * clears it. Saved under a new name each time so sent reports keep theirs.
 */
export async function saveMemberPhoto(_: FormState, form: FormData): Promise<FormState> {
  const office = await getOffice();
  const supabase = await createClient();
  const memberId = String(form.get("member") ?? "");
  const { data: member } = await supabase
    .from("membership")
    .select("id, user_id")
    .eq("id", memberId)
    .eq("company_id", office.company.id)
    .maybeSingle();
  if (!member) return { error: "Couldn’t find this person." };
  let path: string | null = null;
  if (form.get("remove") !== "1") {
    const photo = form.get("photo");
    if (!(photo instanceof File) || photo.size === 0) return { error: "Choose a photo." };
    if (!["image/jpeg", "image/png"].includes(photo.type))
      return { error: "Use a JPEG or PNG photo." };
    if (photo.size > 2 * 1024 * 1024) return { error: "Use a photo under 2 MB." };
    path = memberPhotoPath(office.company.id, member.user_id as string, Date.now());
    const { error } = await supabase.storage
      .from("company-assets")
      .upload(path, photo, { contentType: "image/jpeg", upsert: false });
    if (error) {
      const refusal = uploadRefusal(null, error.message);
      return {
        error: refusal ? uploadRefusalMessage(refusal, "logo") : friendlyDbError(error.message),
      };
    }
  }
  const { error } = await supabase.rpc("set_member_photo", { target_member: member.id, path });
  if (error) return { error: friendlyDbError(error.message) };
  revalidatePath("/", "layout");
  return { message: "Saved." };
}
