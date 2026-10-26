// What a customer's report and invoice open with (owner, 2026-10-26: "the customer report as the
// peak moment"): one plain line saying how it went, the finished-pool photo, and who did the
// work ("Serviced by Jake"). Everything here is worked out from the sent snapshot (or the
// invoice) when the page is drawn: no AI, nothing stored, so a sent report never changes. The
// phones show these reports in a browser, so there is no Swift copy. No I/O.

import { formatCents } from "./money";
import { dateFormat } from "./intl";
import { READING_LABELS, waterTestRows, type ReadingKey } from "./chemistry";
import type { ReportAddition } from "./chemical-additions";
import { inspectionReport, leaksNoted, snapshotTally, type ReportSnapshot } from "./report";

type Goals = Partial<Record<ReadingKey, number | null>> | null;

/** The part of a maintenance visit's snapshot the summary reads. */
export interface VisitSummaryInput {
  chemicals?: ({ goals?: Goals } & Partial<Record<ReadingKey, number | null>>)[] | null;
  added?: Pick<ReportAddition, "name" | "reading_key">[] | null;
  components: { status: "pending" | "inspected" | "excluded" }[];
}

/** "pH", "pH and alkalinity", "pH, alkalinity, and calcium". */
function list(items: string[]): string {
  if (items.length <= 1) return items.join("");
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}

/** The chemical as a person says it: "Liquid chlorine 12.5%" is "liquid chlorine". */
function plainChemical(name: string): string {
  return name
    .replace(/\s*\(?\d+(\.\d+)?\s*%\)?/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * The one line a maintenance visit's report opens with, from its water test, what was added, and
 * the checklist:
 * - every reading in range and the checklist done: "Your pool is balanced and clean."
 * - in range, no finished checklist: "Your water is balanced."
 * - a reading out of range: it is named, with what was added for it ("pH was high; we added
 *   muriatic acid to bring it down."), or "needs attention" when nothing was added for it.
 * - no water test: "Your pool was serviced."
 */
export function visitSummary(s: VisitSummaryInput): string {
  const reading = s.chemicals?.[0];
  const rows = reading ? waterTestRows(reading, reading.goals) : [];
  const added = s.added ?? [];
  if (!rows.length) return "Your pool was serviced.";
  const out = rows.filter((r) => r.status !== "ok");
  if (!out.length) {
    const finished =
      s.components.some((c) => c.status === "inspected") &&
      !s.components.some((c) => c.status === "pending");
    return finished ? "Your pool is balanced and clean." : "Your water is balanced.";
  }
  const said = (r: (typeof out)[number], first: boolean) => {
    const label = READING_LABELS[r.key];
    return `${r.key === "ph" ? "pH" : first ? label : label.toLowerCase()} was ${r.statusLabel.toLowerCase()}`;
  };
  const sayAll = (rs: typeof out) => list(rs.map((r, i) => said(r, i === 0)));
  const addedFor = (key: ReadingKey) => added.filter((a) => a.reading_key === key);
  const treated = out.filter((r) => addedFor(r.key).length > 0);
  const untreated = out.filter((r) => addedFor(r.key).length === 0);
  const sentences: string[] = [];
  if (treated.length) {
    const chemicals = [
      ...new Set(treated.flatMap((r) => addedFor(r.key).map((a) => plainChemical(a.name)))),
    ].filter(Boolean);
    const bring =
      treated.length === 1
        ? `bring it ${treated[0]!.status === "high" ? "down" : "up"}`
        : "bring them back in range";
    sentences.push(
      `${sayAll(treated)}; we added ${chemicals.length ? list(chemicals) : "chemicals"} to ${bring}.`,
    );
  }
  if (untreated.length) {
    sentences.push(
      untreated.length === 1
        ? `${said(untreated[0]!, true)} and needs attention.`
        : `${sayAll(untreated)}; they need attention.`,
    );
  }
  return sentences.join(" ");
}

/**
 * The first name to print ("Jake") from a profile's name. A profile with no name falls back to its
 * email in the snapshot: that is never printed, so no first name then.
 */
export function techFirstName(name: string | null | undefined): string | null {
  const n = name?.trim();
  if (!n || n.includes("@")) return null;
  return n.split(/\s+/)[0] || null;
}

/** "Jake" or "Jake and Maria", from the job's techs; null when none has a printable name. */
export function techFirstNames(names: (string | null | undefined)[]): string | null {
  const first = [...new Set(names.map(techFirstName).filter((n): n is string => !!n))];
  return first.length ? list(first) : null;
}

/** "Serviced by Jake", "Inspected by Jake", "Repaired by Jake"; null without a name. */
export function reportByLine(
  jobType: string | null | undefined,
  names: (string | null | undefined)[],
): string | null {
  const who = techFirstNames(names);
  if (!who) return null;
  const verb =
    jobType === "maintenance" ? "Serviced" : jobType === "repair" ? "Repaired" : "Inspected";
  return `${verb} by ${who}`;
}

/** A snapshot photo, as the report keeps it. */
interface HeroPhotoCandidate {
  id: string;
  kind: string;
  captured_at: string | null;
  finding_id?: string | null;
  component_id?: string | null;
  test_id?: string | null;
}

/**
 * The finished-pool photo a report opens with: the visit's last photo, taken for the pool as a
 * whole (not one tied to a finding, a checklist item, or a test) when there is one, else the last
 * photo there is. `shown` says which photos the page can draw. Null without a photo.
 */
export function reportHeroPhoto<T extends HeroPhotoCandidate>(
  media: T[],
  shown: (m: T) => boolean = () => true,
): T | null {
  const photos = media.filter((m) => m.kind === "photo" && shown(m));
  const whole = photos.filter((m) => !m.finding_id && !m.component_id && !m.test_id);
  const pool = whole.length ? whole : photos;
  let best: T | null = null;
  let at = -Infinity;
  for (const m of pool) {
    const t = Date.parse(m.captured_at ?? "");
    const when = Number.isFinite(t) ? t : -Infinity;
    // Ties and photos without a time go to the later one in the list.
    if (best === null || when >= at) {
      best = m;
      at = when;
    }
  }
  return best;
}

/** How a leak detection, inspection, or repair report reads in one line, from its findings. */
export function leakSummary(s: ReportSnapshot): string {
  if (s.job.type === "repair") return "Your repair is complete.";
  if (s.job.type === "inspection") {
    const n = inspectionReport(s).needsAttention.length;
    if (n === 0) return "Nothing we inspected needs attention.";
    return n === 1 ? "1 item needs attention." : `${n} items need attention.`;
  }
  const leaks = leaksNoted(s);
  if (leaks.length) {
    const shown = leaks.slice(0, 2);
    const more = leaks.length - shown.length;
    const what = list(more > 0 ? [...shown, `${more} more`] : shown);
    return `We found ${leaks.length === 1 ? "a leak" : `${leaks.length} leaks`}: ${what}.`;
  }
  if (s.findings.length) {
    return s.findings.length === 1
      ? "We found 1 issue to fix."
      : `We found ${s.findings.length} issues to fix.`;
  }
  const tally = snapshotTally(s);
  return tally.pending > 0 || tally.notApplicable > 0
    ? "We found no leaks in what we inspected."
    : "We found no leaks.";
}

/** A month of visits in one line: how many tests were in range. */
export function monthSummary(visits: { chemicals?: VisitSummaryInput["chemicals"] }[]): string {
  const tested = visits.flatMap((v) => {
    const r = v.chemicals?.[0];
    const rows = r ? waterTestRows(r, r.goals) : [];
    return rows.length ? [rows] : [];
  });
  if (!tested.length) {
    return visits.length === 1
      ? "Your pool was serviced."
      : `Your pool was serviced ${visits.length} times.`;
  }
  const clean = tested.filter((rows) => rows.every((r) => r.status === "ok")).length;
  if (clean === tested.length)
    return tested.length === 1
      ? "Your water was balanced."
      : `Your water was balanced at every test (${tested.length}).`;
  return `Your water was in range at ${clean} of ${tested.length} ${tested.length === 1 ? "test" : "tests"}.`;
}

/** The part of an invoice the summary reads. */
export interface InvoiceSummaryInput {
  status: "sent" | "partially_paid" | "paid" | "void" | "draft";
  total_cents: number;
  balance_cents: number;
  due_date: string | null;
  /** When it was sent (an instant); a due date on or before it is "on receipt". */
  sent_at: string | null;
}

/**
 * The one line an invoice opens with: "$180.00 due on receipt.", "$180.00 due November 5.",
 * "$80.00 still due.", "Paid in full. Thank you!". Null for a canceled invoice (its page says so).
 */
export function invoiceSummary(i: InvoiceSummaryInput): string | null {
  if (i.status === "void") return null;
  if (i.status === "paid") return "Paid in full. Thank you!";
  if (i.status === "partially_paid") return `${formatCents(i.balance_cents)} still due.`;
  const due = i.due_date;
  if (!due || (i.sent_at && due <= i.sent_at.slice(0, 10)))
    return `${formatCents(i.balance_cents)} due on receipt.`;
  const day = dateFormat("en-US", { month: "long", day: "numeric", timeZone: "UTC" }).format(
    new Date(`${due}T12:00:00Z`),
  );
  return `${formatCents(i.balance_cents)} due ${day}.`;
}
