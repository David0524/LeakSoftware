/**
 * The first download on a phone (owner, 2026-10-20: "Downloading your company takes a long
 * time. Give a more interesting loading bar."): what's been downloaded against what's there
 * (public.sync_pull_count), as one fraction and a few kinds of things the shop recognizes.
 */

/** The kinds, in the order they're listed, and the tables each one counts. */
export const DOWNLOAD_KINDS: { key: string; label: string; tables: string[] }[] = [
  { key: "customers", label: "Customers", tables: ["customer"] },
  { key: "pools", label: "Pools", tables: ["property", "service_plan", "plan_cleaning"] },
  {
    key: "jobs",
    label: "Jobs",
    tables: [
      "job",
      "job_component",
      "checklist_item_result",
      "test_result",
      "finding",
      "chemical_reading",
      "signature",
    ],
  },
  { key: "photos", label: "Photos and Videos", tables: ["media"] },
  {
    key: "paperwork",
    label: "Reports, Quotes, and Invoices",
    tables: [
      "report",
      "quote",
      "quote_line_item",
      "invoice",
      "invoice_line_item",
      "payment",
      "share_link",
    ],
  },
  {
    key: "messages",
    label: "Messages",
    tables: ["message", "phone_line", "conversation", "text_message", "call_log"],
  },
];

/** Everything else (the shop, the team, checklists, the price book): "Settings". */
const SETTINGS = { key: "settings", label: "Settings" };

export interface DownloadKind {
  key: string;
  label: string;
  /** Rows of this kind downloaded so far, never more than `total`. */
  done: number;
  total: number;
  complete: boolean;
}

export interface DownloadProgress {
  /** 0..1, or null before the count is known (show the bar moving without a number). */
  fraction: number | null;
  /** "42%", or "" before the count is known. */
  percent: string;
  /** Only kinds the shop has, in DOWNLOAD_KINDS order, Settings first. */
  kinds: DownloadKind[];
  /** The kind being downloaded now, for the line under the bar: the first not yet complete. */
  current: DownloadKind | null;
  /** One sentence for VoiceOver and TalkBack: "Downloading your company, 42 percent." */
  spoken: string;
}

function kindOf(table: string): { key: string; label: string } {
  return DOWNLOAD_KINDS.find((k) => k.tables.includes(table)) ?? SETTINGS;
}

/**
 * Progress from rows downloaded per table and the totals per table (null until the count comes
 * back). A table's downloaded rows count up to its total only, so a row changed during the
 * download (sent twice) never pushes past 100%; the screen finishes when the download does.
 */
export function downloadProgress(
  pulled: Record<string, number>,
  totals: Record<string, number> | null,
): DownloadProgress {
  const kinds = new Map<string, DownloadKind>();
  const add = (table: string, done: number, total: number) => {
    const k = kindOf(table);
    const row = kinds.get(k.key) ?? { ...k, done: 0, total: 0, complete: false };
    row.done += done;
    row.total += total;
    kinds.set(k.key, row);
  };
  if (totals) {
    for (const [table, total] of Object.entries(totals)) {
      if (!(total > 0)) continue;
      add(table, Math.min(Math.max(pulled[table] ?? 0, 0), total), total);
    }
  }
  const order = [SETTINGS.key, ...DOWNLOAD_KINDS.map((k) => k.key)];
  const list = [...kinds.values()]
    .map((k) => ({ ...k, complete: k.done >= k.total }))
    .sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  const total = list.reduce((t, k) => t + k.total, 0);
  const done = list.reduce((t, k) => t + k.done, 0);
  const fraction = totals && total > 0 ? done / total : null;
  const percent = fraction == null ? "" : `${Math.floor(fraction * 100)}%`;
  return {
    fraction,
    percent,
    kinds: list,
    current: list.find((k) => !k.complete) ?? null,
    spoken:
      fraction == null
        ? "Downloading your company."
        : `Downloading your company, ${Math.floor(fraction * 100)} percent.`,
  };
}

/** "312 of 1,240" for a kind's row. */
export function downloadCount(k: Pick<DownloadKind, "done" | "total">): string {
  const n = (v: number) => v.toLocaleString("en-US");
  return `${n(k.done)} of ${n(k.total)}`;
}
