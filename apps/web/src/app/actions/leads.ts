"use server";

import { revalidatePath } from "next/cache";
import { getUser } from "@/lib/auth";
import { adminClient } from "@/server/admin";
import { isStaff, saveLead } from "@/server/leads";

/**
 * The sign-up form, as it's filled in: once the email is valid, what's been typed is kept so
 * Tidemark can follow up with people who don't finish (the form says so).
 */
export async function captureLead(fields: {
  email: string;
  name?: string;
  company?: string;
  phone?: string;
  services?: string;
}): Promise<void> {
  if (typeof fields?.email !== "string") return;
  await saveLead({
    email: fields.email,
    name: String(fields.name ?? ""),
    company: String(fields.company ?? ""),
    phone: String(fields.phone ?? ""),
    services: String(fields.services ?? ""),
  });
}

async function staffOnly() {
  const user = await getUser();
  if (!isStaff(user) || user?.aal !== "aal2") throw new Error("Staff only.");
  const admin = adminClient();
  if (!admin) throw new Error("The server key is missing.");
  return admin;
}

/** Staff: notes from the call, and when they called. */
export async function saveLeadNotes(form: FormData): Promise<void> {
  const admin = await staffOnly();
  const id = String(form.get("id") ?? "");
  const notes = String(form.get("notes") ?? "").slice(0, 2000);
  const called = form.get("called") === "1";
  await admin
    .from("signup_lead")
    .update({
      notes: notes || null,
      ...(called ? { contacted_at: new Date().toISOString() } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  revalidatePath("/admin/leads");
}
