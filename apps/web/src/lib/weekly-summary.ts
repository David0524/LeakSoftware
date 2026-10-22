import { formatCents } from "@leakbook/core";
import { tokens } from "@leakbook/tokens";

// The weekly summary email to owners (owner, 2026-10-22: "Owners get no weekly summary. A short
// email: jobs done, money in, quotes waiting."). The database has the numbers
// (weekly_summary_data, 20261022000200_feedback_loops.sql); this writes the words, plain and
// short, in Sundeck Pro's colors with the shop's logo or name on top.

export interface WeeklySummaryData {
  company: { id: string; name: string; logo_path: string | null; timezone: string };
  /** The Monday the week starts, "2026-10-12". */
  week_of: string;
  /** Jobs completed in the week, by job type. */
  jobs_done: Record<string, number>;
  collected_cents: number;
  owed_cents: number;
  owed_count: number;
  quotes_waiting: {
    count: number;
    total_cents: number;
    oldest: {
      customer_name: string | null;
      number: number | null;
      total_cents: number;
      sent_at: string | null;
    }[];
  };
  /** Jobs scheduled in the week the email arrives in. */
  scheduled_next: number;
}

export interface WeeklySummaryEmail {
  subject: string;
  text: string;
  html: string;
}

/** Each job type as words, one and many. */
const JOB_WORDS: Record<string, [string, string]> = {
  maintenance: ["service visit", "service visits"],
  repair: ["repair", "repairs"],
  detection: ["leak detection", "leak detections"],
  inspection: ["pool inspection", "pool inspections"],
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Oct 12" from "2026-10-12". */
function dayLabel(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  return `${MONTHS[(m ?? 1) - 1]} ${d}`;
}

/** "2026-10-18" six days after "2026-10-12". */
function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** "Oct 12 – 18", or "Sep 28 – Oct 4" across months. */
export function weekLabel(weekOf: string): string {
  const end = addDays(weekOf, 6);
  const start = dayLabel(weekOf);
  return weekOf.slice(5, 7) === end.slice(5, 7)
    ? `${start} – ${end.slice(8).replace(/^0/, "")}`
    : `${start} – ${dayLabel(end)}`;
}

/** The shop's local date for an instant. */
function localDay(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

/** The numbers, as the email shows them. */
export interface WeeklySummaryNumbers {
  jobsDone: number;
  /** "8 service visits, 3 leak detections, 1 repair", most first; empty with none. */
  jobsDetail: string;
  collected: string;
  owed: string;
  /** "on 3 invoices", or "" when nothing is owed. */
  owedDetail: string;
  quotesWaiting: number;
  quotesTotal: string;
  /** The oldest quotes waiting: "Rebecca Soto", "Quote #1042 · $1,250.00 · sent Oct 2, 20 days ago". */
  oldest: { customer: string; detail: string }[];
  /** "and 2 more", or null. */
  moreQuotes: string | null;
  scheduledNext: number;
  /** Nothing happened and nothing is waiting: no email. */
  empty: boolean;
}

export function weeklySummaryNumbers(d: WeeklySummaryData, now: Date): WeeklySummaryNumbers {
  const types = Object.entries(d.jobs_done ?? {})
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const jobsDone = types.reduce((s, [, n]) => s + n, 0);
  const jobsDetail = types
    .map(([t, n]) => {
      const [one, many] = JOB_WORDS[t] ?? ["job", "jobs"];
      return plural(n, one, many);
    })
    .join(", ");
  const today = localDay(now.toISOString(), d.company.timezone);
  const oldest = (d.quotes_waiting?.oldest ?? []).map((q) => {
    const sent = q.sent_at ? localDay(q.sent_at, d.company.timezone) : null;
    const days = sent
      ? Math.max(0, Math.round((Date.parse(today) - Date.parse(sent)) / 86_400_000))
      : null;
    const ago = days === null ? null : days === 0 ? "today" : `${plural(days, "day", "days")} ago`;
    return {
      customer: q.customer_name?.trim() || "A customer",
      detail: [
        q.number ? `Quote #${q.number}` : "Quote",
        formatCents(q.total_cents),
        sent ? `sent ${dayLabel(sent)}${ago ? `, ${ago}` : ""}` : null,
      ]
        .filter(Boolean)
        .join(" · "),
    };
  });
  const quotesWaiting = d.quotes_waiting?.count ?? 0;
  const more = quotesWaiting - oldest.length;
  return {
    jobsDone,
    jobsDetail,
    collected: formatCents(d.collected_cents),
    owed: formatCents(d.owed_cents),
    owedDetail: d.owed_cents > 0 ? `on ${plural(d.owed_count, "invoice", "invoices")}` : "",
    quotesWaiting,
    quotesTotal: formatCents(d.quotes_waiting?.total_cents ?? 0),
    oldest,
    moreQuotes: more > 0 ? `and ${more} more` : null,
    scheduledNext: d.scheduled_next,
    empty:
      jobsDone === 0 &&
      d.collected_cents === 0 &&
      d.owed_cents === 0 &&
      quotesWaiting === 0 &&
      d.scheduled_next === 0,
  };
}

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const c = tokens.color;
const ink = c.role.light.text;
const muted = c.role.light.textMuted;
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export interface WeeklySummaryInput {
  data: WeeklySummaryData;
  now: Date;
  /** Where the Dashboard is: the site's origin. */
  origin: string;
  /** The turn-off link's token (weekly_summary.token). */
  token: string;
  /** The shop's logo, as a URL an email can load, or null for the shop's name in text. */
  logoUrl: string | null;
  /** owner or admin: the footer says why they get it. */
  role: string;
}

/** The email: subject, plain text, and HTML. */
export function weeklySummaryEmail(input: WeeklySummaryInput): WeeklySummaryEmail {
  const { data, origin } = input;
  const n = weeklySummaryNumbers(data, input.now);
  const shop = data.company.name.trim() || "Your shop";
  const week = weekLabel(data.week_of);
  const dashboard = `${origin}/dashboard`;
  const off = `${origin}/weekly-summary/${input.token}`;
  const why = `You get this because you’re ${input.role === "owner" ? "an owner" : "an admin"} of ${shop}.`;
  const subject = `Last week at ${shop}: ${plural(n.jobsDone, "job", "jobs")} done, ${n.collected} collected`;

  const quoteLines = n.oldest.map((q) => `  ${q.customer} · ${q.detail}`);
  const text = [
    `${shop} · Weekly summary`,
    week,
    "",
    `Jobs done: ${n.jobsDone}${n.jobsDetail ? ` (${n.jobsDetail})` : ""}`,
    `Collected: ${n.collected}`,
    `Owed: ${n.owed}${n.owedDetail ? ` ${n.owedDetail}` : ""}`,
    `Quotes waiting: ${n.quotesWaiting}${n.quotesWaiting ? ` (${n.quotesTotal})` : ""}`,
    ...quoteLines,
    ...(n.moreQuotes ? [`  ${n.moreQuotes}`] : []),
    `This week: ${plural(n.scheduledNext, "job", "jobs")} scheduled`,
    "",
    `Open Dashboard: ${dashboard}`,
    "",
    why,
    `Turn off the weekly summary: ${off}`,
  ].join("\n");

  // The background is on the cell itself, so the two tiles of a row are the same height.
  const tile = (label: string, value: string, detail: string) =>
    `<td class="tile" width="50%" valign="top" style="background:${c.role.light.bg};border-radius:14px;padding:14px 16px">` +
    `<div style="font-size:15px;line-height:20px;color:${muted}">${escape(label)}</div>` +
    `<div style="font-size:26px;line-height:32px;font-weight:700;color:${ink}">${escape(value)}</div>` +
    `<div style="font-size:15px;line-height:20px;color:${muted}">${escape(detail) || "&nbsp;"}</div>` +
    `</td>`;

  const header = input.logoUrl
    ? `<img src="${escape(input.logoUrl)}" alt="${escape(shop)}" height="48" style="display:block;height:48px;max-width:220px;width:auto;border:0">`
    : `<div style="font-size:22px;line-height:28px;font-weight:700;color:${c.brand.navy}">${escape(shop)}</div>`;

  const quotes = n.oldest.length
    ? `<tr><td style="padding:18px 22px 0">` +
      `<div style="font-size:17px;line-height:22px;font-weight:600;color:${ink};padding-bottom:6px">Oldest quotes waiting</div>` +
      n.oldest
        .map(
          (q, i) =>
            `<div style="padding:8px 0;${i ? `border-top:1px solid ${c.role.light.border};` : ""}">` +
            `<div style="font-size:17px;line-height:22px;color:${ink}">${escape(q.customer)}</div>` +
            `<div style="font-size:15px;line-height:20px;color:${muted}">${escape(q.detail)}</div></div>`,
        )
        .join("") +
      (n.moreQuotes
        ? `<div style="font-size:15px;line-height:20px;color:${muted};padding-top:4px">${escape(n.moreQuotes)}</div>`
        : "") +
      `</td></tr>`
    : "";

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">
<title>${escape(subject)}</title>
<style>@media (max-width:480px){.tiles,.tiles tbody,.tiles tr{display:block!important}.tile{display:block!important;width:auto!important;margin:0 10px 10px}}</style></head>
<body style="margin:0;padding:0;background:${c.role.light.bg};font-family:${FONT};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden">${escape(`${week}: ${plural(n.jobsDone, "job", "jobs")} done, ${n.collected} collected, ${plural(n.quotesWaiting, "quote", "quotes")} waiting.`)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${c.role.light.bg}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${c.role.light.surface};border-radius:18px">
<tr><td style="padding:22px 22px 6px">${header}
<div style="font-size:28px;line-height:34px;font-weight:700;color:${ink};padding-top:14px">Weekly summary</div>
<div style="font-size:17px;line-height:22px;color:${muted}">${escape(week)}</div></td></tr>
<tr><td style="padding:6px 12px 0"><table class="tiles" role="presentation" width="100%" cellpadding="0" cellspacing="10" style="border-collapse:separate;border-spacing:10px">
<tr>${tile("Jobs done", String(n.jobsDone), n.jobsDetail)}${tile("Collected", n.collected, "last week")}</tr>
<tr>${tile("Owed", n.owed, n.owedDetail || "nothing open")}${tile("Quotes waiting", String(n.quotesWaiting), n.quotesWaiting ? n.quotesTotal : "")}</tr>
</table></td></tr>
${quotes}
<tr><td style="padding:18px 22px 0;font-size:17px;line-height:22px;color:${ink}">This week: <strong>${escape(plural(n.scheduledNext, "job", "jobs"))}</strong> scheduled.</td></tr>
<tr><td style="padding:22px 22px 24px"><a href="${escape(dashboard)}" style="display:block;background:${c.brand.water};color:${c.brand.paper};text-decoration:none;text-align:center;font-size:17px;line-height:22px;font-weight:600;padding:13px 20px;border-radius:999px">Open Dashboard</a></td></tr>
</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px"><tr><td style="padding:16px 22px;font-size:13px;line-height:18px;color:${muted};text-align:center">
${escape(why)} <a href="${escape(off)}" style="color:${muted};text-decoration:underline">Turn off the weekly summary</a>.<br>Sent by Sundeck Pro.
</td></tr></table>
</td></tr></table></body></html>`;
  return { subject, text, html };
}
