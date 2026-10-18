import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthCard, FormSkeleton } from "@/components/auth-card";
import { InviteForm } from "@/components/auth-forms";
import { Banner } from "@/components/doc-ui";
import { getUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Join Your Team · Sundeck Pro" };

export default function InvitePage({ params }: PageProps<"/invite/[token]">) {
  return (
    <AuthCard title="Join Your Team">
      <Suspense fallback={<FormSkeleton />}>
        <InviteBody params={params} />
      </Suspense>
    </AuthCard>
  );
}

async function InviteBody({ params }: Pick<PageProps<"/invite/[token]">, "params">) {
  const { token } = await params;
  const supabase = await createClient();
  const [{ data }, user] = await Promise.all([
    supabase.rpc("invite_details", { invite_token: token }),
    getUser(),
  ]);
  const invite = (data as { company_name: string; email: string; role: string }[] | null)?.[0];
  if (!invite) {
    return (
      <Banner tone="warning">
        This invite link is no longer valid. It may have expired or been used. Ask your shop’s owner
        to send a new one.
      </Banner>
    );
  }
  return (
    <>
      <p className="mb-6 max-sm:px-2 max-sm:text-center">
        <strong>{invite.company_name}</strong> invited you to Sundeck Pro as{" "}
        {invite.role === "owner" ? "an owner" : invite.role === "admin" ? "an admin" : "a tech"}.
      </p>
      <InviteForm token={token} email={invite.email} signedInAs={user?.email ?? null} />
    </>
  );
}
