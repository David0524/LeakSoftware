import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { userAgent } from "next/server";
import { getOffice } from "@/lib/auth";

/**
 * Where signing in and the logo land (owner, 2026-10-16: a business owner wants the Dashboard
 * as the main page on desktop). Owners at a computer or tablet land on the Dashboard; phones
 * and techs land on Today, the day in the field.
 */
export default async function HomePage() {
  const office = await getOffice();
  const { device } = userAgent({ headers: await headers() });
  redirect(office.isOwner && device.type !== "mobile" ? "/dashboard" : "/today");
}
