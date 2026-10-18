import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatPhone } from "@leakbook/core";
import { ConversationList, Thread, conversationName } from "@/components/inbox";
import { ScreenTip } from "@/components/screen-tip";
import {
  AutoRefresh,
  CallButton,
  Composer,
  MarkRead,
  MarkUnreadButton,
  ScrollToEnd,
} from "@/components/messages";
import { Notice, PageHeader } from "@/components/ui";
import { getOffice } from "@/lib/auth";
import { getTeam } from "@/lib/data";
import { getLine, getThread, listConversations } from "@/lib/messages";

export const metadata: Metadata = { title: "Messages · Sundeck Pro" };

/**
 * One conversation. Phones show it on its own, with the person's name in the navigation bar.
 * Wider screens show Messages as on a Mac (owner, 2026-10-16: the texts belong in the big open
 * space): the conversations on the left, this one filling the right, each scrolling on its own.
 */
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
  const details = (
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
  );
  const actions = (
    <div className="flex items-start gap-2">
      <MarkUnreadButton conversationId={c.id} />
      {active ? <CallButton conversationId={c.id} name={name} /> : null}
    </div>
  );

  return (
    <>
      <div className="md:hidden">
        <PageHeader
          title={name}
          back={{ href: "/messages?list=1", label: "Messages" }}
          subtitle={details}
          actions={actions}
        />
      </div>
      {/* Wider screens: the title heads the list, so the conversation runs from
          the top of the page to the bottom of the window (owner, 2026-10-16). */}
      <div className="grid gap-6 md:h-[calc(100dvh-11.5rem)] md:min-h-[28rem] md:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <div className="min-w-0 max-md:hidden md:flex md:min-h-0 md:flex-col">
          <PageHeader title="Messages" />
          <Suspense fallback={null}>
            <ScreenTip screen="messages" />
          </Suspense>
          <div className="md:min-h-0 md:flex-1 md:overflow-y-auto">
            <ConversationList
              conversations={conversations}
              current={c.id}
              timeZone={office.company.timezone}
            />
          </div>
        </div>
        <section
          aria-label={`Conversation with ${name}`}
          className="min-w-0 space-y-4 md:flex md:min-h-0 md:flex-col md:space-y-0 md:overflow-hidden md:rounded-3xl md:bg-surface"
        >
          <header className="flex flex-wrap items-start justify-between gap-3 border-b-[0.5px] border-separator px-5 py-3 max-md:hidden">
            <div className="min-w-0">
              <h2 className="font-display text-xl font-bold">{name}</h2>
              <p className="text-[0.9375rem] text-text-muted">{details}</p>
            </div>
            {actions}
          </header>
          <div className="md:min-h-0 md:flex-1 md:overflow-y-auto md:px-5 md:py-3">
            <Thread items={items} names={names} timeZone={office.company.timezone} />
            <ScrollToEnd count={items.length} />
          </div>
          <div className="sticky bottom-24 rounded-3xl bg-bg/90 py-2 backdrop-blur sm:bottom-2 md:static md:rounded-none md:border-t-[0.5px] md:border-separator md:bg-surface md:px-4 md:py-3 md:backdrop-blur-none">
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
      <MarkRead conversationId={c.id} unread={c.unread} lastAt={c.last_at} />
      <AutoRefresh />
    </>
  );
}
