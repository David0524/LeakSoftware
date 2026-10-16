import type { Metadata } from "next";
import { ConversationList, LineNotice } from "@/components/inbox";
import { AutoRefresh } from "@/components/messages";
import { ButtonLink, PageHeader } from "@/components/ui";
import { getOffice } from "@/lib/auth";
import { getLine, listConversations } from "@/lib/messages";
import { formatPhone } from "@leakbook/core";

export const metadata: Metadata = { title: "Messages · Tidemark" };

/** The shop's shared inbox: texts and calls with customers on the company number. */
export default async function MessagesPage() {
  const office = await getOffice();
  const [line, conversations] = await Promise.all([getLine(office), listConversations(office)]);
  const active = line?.status === "active";
  return (
    <>
      <PageHeader
        title="Messages"
        subtitle={active ? `Your company number: ${formatPhone(line.number)}` : undefined}
        actions={active ? <ButtonLink href="/messages/new">New Message</ButtonLink> : undefined}
      />
      <div className="grid max-w-5xl gap-6 md:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4">
          <LineNotice line={line} isOwner={office.isOwner} />
          <ConversationList conversations={conversations} timeZone={office.company.timezone} />
        </div>
        <p className="self-start rounded-2xl bg-text/[0.04] p-6 text-center text-text-muted max-md:hidden">
          Pick a conversation to read it and reply.
        </p>
      </div>
      <AutoRefresh seconds={20} />
    </>
  );
}
