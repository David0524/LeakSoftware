import { useMemo } from "react";
import { formatPhone } from "@leakbook/core";
import { getServices } from "../lib/services";
import { useRows } from "./hooks";
import { call } from "./reports";

// Company texting and calls on the phone (owner, 2026-10-16). Conversations, texts, and calls
// sync down like any other rows, so the inbox reads offline; sending and calling go through
// the Tidemark server (it talks to Twilio), so they need a signal.

export interface PhoneLineRow {
  id: string;
  number: string;
  status: "pending" | "active" | "released";
  pictures: boolean;
  deleted_at: string | null;
}

export interface ConversationRow {
  id: string;
  phone: string;
  customer_id: string | null;
  last_at: string;
  last_preview: string | null;
  unread: boolean;
  opted_out: boolean;
}

interface TextRow {
  id: string;
  conversation_id: string;
  created_at: string;
  direction: "in" | "out";
  body: string | null;
  media: { path: string; type: string }[];
  status: string;
  sent_by: string | null;
  error: string | null;
}

interface CallRow {
  id: string;
  conversation_id: string | null;
  created_at: string;
  direction: "in" | "out";
  status: string;
  duration_seconds: number | null;
  user_id: string | null;
  recording_sid: string | null;
  transcript: string | null;
}

export type ThreadItem = ({ kind: "text" } & TextRow) | ({ kind: "call" } & CallRow);

/** The shop's working (or pending) company number. */
export function useLine(companyId: string): PhoneLineRow | null {
  const lines = useRows<PhoneLineRow>("phone_line", companyId);
  return lines.find((l) => l.status !== "released") ?? null;
}

/** Conversations, newest first, each named for its customer when there is one. */
export function useConversations(companyId: string) {
  const conversations = useRows<ConversationRow>("conversation", companyId);
  const customers = useRows<{ id: string; name: string }>("customer", companyId);
  return useMemo(() => {
    const names = new Map(customers.map((c) => [c.id, c.name]));
    return conversations
      .map((c) => ({
        ...c,
        name: (c.customer_id && names.get(c.customer_id)) || formatPhone(c.phone),
      }))
      .sort((a, b) => b.last_at.localeCompare(a.last_at));
  }, [conversations, customers]);
}

/** One conversation's texts and calls, oldest first. */
export function useThread(companyId: string, conversationId: string): ThreadItem[] {
  const texts = useRows<TextRow>("text_message", companyId);
  const calls = useRows<CallRow>("call_log", companyId);
  return useMemo(
    () =>
      [
        ...texts
          .filter((t) => t.conversation_id === conversationId)
          .map((t) => ({ kind: "text" as const, ...t })),
        ...calls
          .filter((c) => c.conversation_id === conversationId)
          .map((c) => ({ kind: "call" as const, ...c })),
      ].sort((a, b) => a.created_at.localeCompare(b.created_at)),
    [texts, calls, conversationId],
  );
}

/** Opening a conversation marks it read for the whole team. */
export function markRead(companyId: string, conversation: ConversationRow) {
  if (conversation.unread) setUnread(companyId, conversation.id, false);
}

/** Unread or read for the whole team (owner, 2026-10-16: unread is shared). */
export function setUnread(companyId: string, conversationId: string, unread: boolean) {
  getServices().sync.write("conversation", conversationId, companyId, { unread });
}

/** Text from the company number. The text syncs back down with its delivery status. */
export async function sendCompanyText(input: {
  conversationId?: string;
  customerId?: string;
  body: string;
  picture?: { companyId: string; uri: string; type: string };
  jobId?: string;
}) {
  const { sync } = getServices();
  const pictures = input.picture
    ? [
        {
          path: await sync.uploadTextPicture(
            input.picture.companyId,
            input.picture.uri,
            input.picture.type,
          ),
          type: input.picture.type,
        },
      ]
    : [];
  const sent = await call<{ id: string; conversationId: string }>("/api/texts", {
    conversationId: input.conversationId,
    customerId: input.customerId,
    body: input.body,
    pictures,
    jobId: input.jobId ?? null,
  });
  await sync.syncNow();
  return sent;
}

/** Ring my phone, then connect me to the customer from the company number. */
export function callFromCompany(conversationId: string) {
  return call<{ calling: string; demo: boolean }>("/api/calls", { conversationId });
}
