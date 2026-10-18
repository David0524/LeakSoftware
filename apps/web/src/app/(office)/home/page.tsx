import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { userAgent } from "next/server";
import { getOffice } from "@/lib/auth";
import { getAccess } from "@/lib/data";
import { onboardingAvailable } from "@/server/billing";

/**
 * Where signing in and the logo land (owner, 2026-10-16: a business owner wants the Dashboard
 * as the main page on desktop). Owners at a computer or tablet land on the Dashboard; phones
 * and techs land on Today, the day in the field.
 */
export default async function HomePage() {
  const office = await getOffice();
  // A new shop's owner finishes onboarding first (owner, 2026-10-16).
  if (office.isOwner && onboardingAvailable() && (await getAccess(office))?.onboarded === false)
    redirect("/welcome");
  const { device } = userAgent({ headers: await headers() });
  redirect(office.isManager && device.type !== "mobile" ? "/dashboard" : "/today");
}
