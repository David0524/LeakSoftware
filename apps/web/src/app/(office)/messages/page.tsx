import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { userAgent } from "next/server";
import { ConversationList, LineNotice, PeopleSwitch } from "@/components/inbox";
import { AutoRefresh } from "@/components/messages";
import { ButtonLink, PageHeader } from "@/components/ui";
import { getOffice } from "@/lib/auth";
import { getLine, listConversations, unreadCount } from "@/lib/messages";
import { formatPhone } from "@leakbook/core";
import { Suspense } from "react";
import { ScreenTip } from "@/components/screen-tip";

export const metadata: Metadata = { title: "Messages · Tidemark" };

/** The shop's shared inbox: texts and calls with customers on the company number. */
export default async function MessagesPage({ searchParams }: PageProps<"/messages">) {
  const office = await getOffice();
  const [line, conversations, unread] = await Promise.all([
    getLine(office),
    listConversations(office),
    unreadCount(office),
  ]);
  const active = line?.status === "active";
  // On a computer or tablet the latest conversation opens beside the list, as on a Mac (owner,
  // 2026-10-16); phones show the list.
  // ?list=1 (Back from a conversation) always shows the list, e.g. in a narrow window.
  const { list } = await searchParams;
  const { device } = userAgent({ headers: await headers() });
  if (!list && device.type !== "mobile" && conversations[0]) {
    redirect(`/messages/${conversations[0].id}`);
  }
  return (
    <>
      <PageHeader
        title="Messages"
        subtitle={active ? `Your company number: ${formatPhone(line.number)}` : undefined}
        actions={active ? <ButtonLink href="/messages/new">New Message</ButtonLink> : undefined}
      />
      <PeopleSwitch current="messages" unread={unread} />
      <Suspense fallback={null}>
        <ScreenTip screen="messages" />
      </Suspense>
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
