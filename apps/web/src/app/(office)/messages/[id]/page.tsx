import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatPhone } from "@leakbook/core";
import { ConversationList, Thread, conversationName } from "@/components/inbox";
import { AutoRefresh, CallButton, Composer, MarkRead, ScrollToEnd } from "@/components/messages";
import { Notice, PageHeader } from "@/components/ui";
import { getOffice } from "@/lib/auth";
import { getTeam } from "@/lib/data";
import { getLine, getThread, listConversations } from "@/lib/messages";

export const metadata: Metadata = { title: "Messages · Tidemark" };

export default async function ConversationPage({ params }: PageProps<"/messages/[id]">) {
  const { id } = await params;
  const office = await getOffice();
  const [thread, line, conversations, team] = await Promise.all([
    getThread(office, id),
    getLine(office),
    listConversations(office),
    getTeam(office),
  ]);
  if (!thread) notFound();
  const { conversation: c, items } = thread;
  const name = conversationName(c);
  const names = new Map(team.map((t) => [t.user_id, t.name]));
  const active = line?.status === "active";

  return (
    <>
      <PageHeader
        title={name}
        back={{ href: "/messages", label: "Messages" }}
        subtitle={
          <>
            {c.customer ? `${formatPhone(c.phone)} · ` : null}
            {c.customer_id ? (
              <Link href={`/customers/${c.customer_id}`} className="text-link underline">
                Customer Details
              </Link>
            ) : (
              "Not a customer yet"
            )}
          </>
        }
        actions={active ? <CallButton conversationId={c.id} name={name} /> : undefined}
      />
      <div className="grid max-w-5xl gap-6 md:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <div className="min-w-0 max-md:hidden">
          <ConversationList
            conversations={conversations}
            current={c.id}
            timeZone={office.company.timezone}
          />
        </div>
        <section aria-label={`Conversation with ${name}`} className="min-w-0 space-y-4">
          <Thread items={items} names={names} timeZone={office.company.timezone} />
          <ScrollToEnd count={items.length} />
          <div className="sticky bottom-24 rounded-3xl bg-bg/90 py-2 backdrop-blur sm:bottom-2">
            {c.opted_out ? (
              <Notice tone="warning">
                {name} replied STOP, so texts to them are off. They can text START to turn them back
                on.
              </Notice>
            ) : active ? (
              <Composer conversationId={c.id} pictures={line.pictures} />
            ) : (
              <Notice tone="info">Texting is off until the company number is working.</Notice>
            )}
          </div>
        </section>
      </div>
      <MarkRead conversationId={c.id} unread={c.unread} />
      <AutoRefresh />
    </>
  );
}
