import { Suspense } from "react";
import { NO_CONTACT_MESSAGE } from "@leakbook/core";
import { Notice } from "@/components/ui";
import { getOffice } from "@/lib/auth";

// Messages is for people with Text and Call Customers (owner, 2026-11-23; core contact.ts). The
// tab is gone without it; a saved link or notification shows this instead, and the database
// sends them no conversations anyway.

export default function MessagesLayout({ children }: LayoutProps<"/messages">) {
  return (
    <Suspense>
      <ContactOnly>{children}</ContactOnly>
    </Suspense>
  );
}

async function ContactOnly({ children }: { children: React.ReactNode }) {
  const office = await getOffice();
  if (office.canContact) return children;
  return (
    <div className="max-w-xl">
      <h1 className="mb-4 font-display text-3xl font-extrabold">Messages</h1>
      <Notice tone="warning">{NO_CONTACT_MESSAGE}</Notice>
    </div>
  );
}
