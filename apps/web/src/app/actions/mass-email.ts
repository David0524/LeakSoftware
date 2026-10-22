"use server";

import { massEmailAudience, type MassEmailCount } from "@leakbook/core";
import { getOffice } from "@/lib/auth";
import { siteOrigin } from "@/lib/origin";
import { createClient } from "@/lib/supabase/server";
import {
  massEmailCount,
  massEmailHistory,
  sendMassEmail,
  sendMassEmailTest,
  type MassEmailHistoryRow,
  type MassEmailResult,
} from "@/server/mass-email";

// Email Customers on the website (owner, 2026-10-22); the apps call /api/mass-email.

export interface MassEmailState {
  error?: string;
  fields?: Record<string, string>;
  message?: string;
  /** After a real send: the history with the new row. */
  history?: MassEmailHistoryRow[];
  /** Sent: the form clears. */
  sent?: boolean;
}

const ONLY_MANAGERS = "Only owners and admins can email customers.";

function state(r: MassEmailResult): MassEmailState {
  return r.ok ? { message: r.message } : { error: r.error, fields: r.fields };
}

/** The live count for the To group. */
export async function countMassEmail(audience: unknown): Promise<MassEmailCount | null> {
  const office = await getOffice();
  if (!office.isManager) return null;
  return massEmailCount(await createClient(), office.company.id, massEmailAudience(audience));
}

/** Send Test to Me. */
export async function testMassEmail(input: {
  subject: string;
  body: string;
}): Promise<MassEmailState> {
  const office = await getOffice();
  if (!office.isManager) return { error: ONLY_MANAGERS };
  return state(
    await sendMassEmailTest(
      await createClient(),
      office.company.id,
      { email: office.user.email, name: office.user.name },
      input,
      await siteOrigin(),
    ),
  );
}

/** Send, after the alert: `expected` is the count it named. */
export async function sendMassEmailAction(input: {
  subject: string;
  body: string;
  audience: unknown;
  expected: number;
}): Promise<MassEmailState> {
  const office = await getOffice();
  if (!office.isManager) return { error: ONLY_MANAGERS };
  const db = await createClient();
  const r = await sendMassEmail(
    db,
    office.company.id,
    {
      subject: String(input.subject ?? ""),
      body: String(input.body ?? ""),
      audience: massEmailAudience(input.audience),
      expected: Number(input.expected),
    },
    await siteOrigin(),
  );
  return r.ok
    ? { ...state(r), sent: true, history: await massEmailHistory(db, office.company.id) }
    : state(r);
}
