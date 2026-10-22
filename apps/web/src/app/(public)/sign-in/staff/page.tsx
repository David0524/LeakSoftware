import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthCard, FormSkeleton } from "@/components/auth-card";
import { Banner } from "@/components/doc-ui";
import { Button, buttonClass } from "@/components/ui";
import { getUser } from "@/lib/auth";
import { isStaff, staffListSet } from "@/server/leads";

export const metadata: Metadata = { title: "Admin Sign In · Sundeck Pro" };

/**
 * Where the Admin portal sends a signed-in account that isn't staff (owner, 2026-10-22: "The
 * admin page immediately redirects to the normal user dashboard"): who is signed in, and a
 * way to switch to the staff account, instead of landing in that account's shop.
 */
export default function StaffSignInPage() {
  return (
    <AuthCard title="Admin Sign In">
      <Suspense fallback={<FormSkeleton />}>
        <StaffSignInBody />
      </Suspense>
    </AuthCard>
  );
}

async function StaffSignInBody() {
  const user = await getUser();
  if (!user) redirect("/sign-in?next=/admin");
  if (isStaff(user)) redirect("/admin");
  return (
    <div className="space-y-4">
      <p>
        You’re signed in as <strong>{user.email}</strong>, which isn’t a Sundeck Pro staff account.
        Sign out, then sign in with your staff email.
      </p>
      {staffListSet() ? null : (
        <Banner tone="warning">
          No staff emails are set on this server yet (SUNDECK_STAFF_EMAILS), so no account can open
          the Admin portal.
        </Banner>
      )}
      <form action="/auth/sign-out" method="post">
        <input type="hidden" name="next" value="/sign-in?next=/admin" />
        <Button type="submit" className="w-full">
          Sign Out and Switch
        </Button>
      </form>
      <Link href="/home" className={buttonClass("secondary", "w-full")}>
        Back to My Shop
      </Link>
    </div>
  );
}
