// Leads (owner, 2026-10-16): everyone who started signing up, and how far they got, so
// Tidemark can call the ones who didn't pay. Rows come from public.lead_list().

export interface LeadRow {
  id: string;
  email: string;
  name: string | null;
  company_name: string | null;
  phone: string | null;
  services: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  contacted_at: string | null;
  user_id: string | null;
  email_confirmed_at: string | null;
  company_id: string | null;
  company: string | null;
  status: string | null;
  plan: string | null;
  access_code: string | null;
  trial_ends_at: string | null;
  onboarded_at: string | null;
  card_in: boolean | null;
  reached_payment: boolean | null;
  people: number | null;
  goal: string | null;
}

export type LeadStage = "form" | "no_shop" | "setup" | "payment" | "paid" | "code" | "canceled";

export const LEAD_STAGE_LABELS: Record<LeadStage, string> = {
  form: "Left the sign-up form",
  no_shop: "Account, no shop yet",
  setup: "Left during setup",
  payment: "Reached the payment page",
  paid: "Card in",
  code: "Demo code",
  canceled: "Canceled",
};

/** How far a lead got. Only "paid" and "code" are customers; the rest are worth a call. */
export function leadStage(l: LeadRow): LeadStage {
  if (!l.user_id) return "form";
  if (!l.company_id) return "no_shop";
  if (l.status === "canceled") return "canceled";
  if (l.card_in) return "paid";
  if (l.access_code || l.plan === "demo") return "code";
  return l.reached_payment ? "payment" : "setup";
}

export const leadPaid = (l: LeadRow) => {
  const s = leadStage(l);
  return s === "paid" || s === "code";
};

/** The call list as CSV (spreadsheet-safe: formulas can't run from a cell). */
export function leadsCsv(rows: LeadRow[]): string {
  const cell = (v: unknown) => {
    let s = v == null ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = [
    "Name",
    "Company",
    "Email",
    "Phone",
    "Package",
    "People",
    "Stage",
    "Signed up",
    "Called",
    "Notes",
  ];
  const lines = rows.map((l) =>
    [
      l.name,
      l.company ?? l.company_name,
      l.email,
      l.phone,
      l.services,
      l.people,
      LEAD_STAGE_LABELS[leadStage(l)],
      l.created_at.slice(0, 10),
      l.contacted_at ? l.contacted_at.slice(0, 10) : "",
      l.notes,
    ]
      .map(cell)
      .join(","),
  );
  return [head.join(","), ...lines].join("\n") + "\n";
}
