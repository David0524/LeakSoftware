import "server-only";
import { cache } from "react";
import { toE164 } from "@leakbook/core";
import type { Office } from "./auth";
import { createClient } from "./supabase/server";

// Company texting reads for the website (owner, 2026-10-16), as the signed-in person (RLS).

export interface Line {
  id: string;
  number: string;
  source: "new" | "existing";
  status: "pending" | "active";
  pictures: boolean;
  ring_user_ids: string[];
  voicemail_greeting: string | null;
}

export interface ConversationRow {
  id: string;
  phone: string;
  customer_id: string | null;
  customer: { name: string } | null;
  last_at: string;
  last_preview: string | null;
  unread: boolean;
  opted_out: boolean;
}

export type ThreadItem =
  | {
      kind: "text";
      id: string;
      at: string;
      direction: "in" | "out";
      body: string | null;
      pictures: { url: string; type: string }[];
      status: string;
      sentBy: string | null;
      error: string | null;
    }
  | {
      kind: "call";
      id: string;
      at: string;
      direction: "in" | "out";
      status: string;
      seconds: number | null;
      userId: string | null;
      voicemail: boolean;
      transcript: string | null;
    };

export const getLine = cache(async (office: Office): Promise<Line | null> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("phone_line")
    .select("id, number, source, status, pictures, ring_user_ids, voicemail_greeting")
    .eq("company_id", office.company.id)
    .neq("status", "released")
    .is("deleted_at", null)
    .maybeSingle();
  return (data as Line | null) ?? null;
});

export const listConversations = cache(async (office: Office): Promise<ConversationRow[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("conversation")
    .select(
      "id, phone, customer_id, last_at, last_preview, unread, opted_out, customer:customer!conversation_customer_id_company_id_fkey(name)",
    )
    .eq("company_id", office.company.id)
    .is("deleted_at", null)
    .order("last_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as ConversationRow[];
});

export async function getThread(office: Office, conversationId: string) {
  const supabase = await createClient();
  const [{ data: conv, error }, { data: texts }, { data: calls }] = await Promise.all([
    supabase
      .from("conversation")
      .select(
        "id, phone, customer_id, last_at, last_preview, unread, opted_out, customer:customer!conversation_customer_id_company_id_fkey(name)",
      )
      .eq("id", conversationId)
      .eq("company_id", office.company.id)
      .maybeSingle(),
    supabase
      .from("text_message")
      .select("id, created_at, direction, body, media, status, sent_by, error")
      .eq("conversation_id", conversationId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("call_log")
      .select(
        "id, created_at, direction, status, duration_seconds, user_id, recording_sid, transcript",
      )
      .eq("conversation_id", conversationId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);
  if (error) throw new Error(error.message);
  if (!conv) return null;

  // Pictures are private: signed links for an hour.
  const paths = (texts ?? []).flatMap((t) => (t.media as { path: string }[]).map((m) => m.path));
  const signed = new Map<string, string>();
  if (paths.length) {
    const { data } = await supabase.storage.from("texts").createSignedUrls(paths, 3600);
    for (const s of data ?? []) if (s.path && s.signedUrl) signed.set(s.path, s.signedUrl);
  }

  const items: ThreadItem[] = [
    ...(texts ?? []).map((t): ThreadItem => ({
      kind: "text",
      id: t.id as string,
      at: t.created_at as string,
      direction: t.direction as "in" | "out",
      body: t.body as string | null,
      pictures: (t.media as { path: string; type: string }[]).flatMap((m) =>
        signed.has(m.path) ? [{ url: signed.get(m.path)!, type: m.type }] : [],
      ),
      status: t.status as string,
      sentBy: t.sent_by as string | null,
      error: t.error as string | null,
    })),
    ...(calls ?? []).map((c): ThreadItem => ({
      kind: "call",
      id: c.id as string,
      at: c.created_at as string,
      direction: c.direction as "in" | "out",
      status: c.status as string,
      seconds: c.duration_seconds as number | null,
      userId: c.user_id as string | null,
      voicemail: Boolean(c.recording_sid),
      transcript: c.transcript as string | null,
    })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  return { conversation: conv as unknown as ConversationRow, items };
}

/** Conversations waiting on the team (the Customers tab's badge). */
export const unreadCount = cache(async (office: Office): Promise<number> => {
  const supabase = await createClient();
  const { count } = await supabase
    .from("conversation")
    .select("id", { count: "exact", head: true })
    .eq("company_id", office.company.id)
    .eq("unread", true)
    .is("deleted_at", null);
  return count ?? 0;
});

/**
 * The shop's conversation with a customer (the job page's Messages group): theirs, or one
 * from their number that isn't linked to a customer yet. The latest `last` items.
 */
export async function getCustomerThread(
  office: Office,
  customer: { id: string; phone?: string | null },
  last = 4,
) {
  const supabase = await createClient();
  const phone = toE164(customer.phone);
  const { data } = await supabase
    .from("conversation")
    .select("id")
    .eq("company_id", office.company.id)
    .is("deleted_at", null)
    .or(
      phone
        ? `customer_id.eq.${customer.id},and(customer_id.is.null,phone.eq.${phone})`
        : `customer_id.eq.${customer.id}`,
    )
    .order("last_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const thread = await getThread(office, data.id as string);
  if (!thread) return null;
  return { ...thread, items: thread.items.slice(-last), total: thread.items.length };
}

/** The signed-in person's own mobile number (calls ring it). */
export async function myPhone(office: Office): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profile")
    .select("phone")
    .eq("id", office.user.id)
    .maybeSingle();
  return (data?.phone as string | null) ?? null;
}
