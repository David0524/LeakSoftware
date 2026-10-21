import { DOWNLOAD_KINDS, downloadCount, downloadProgress } from "@leakbook/core";
import { rule, type ModuleCases } from "../case";

// download.ts: the first download's progress (owner, 2026-10-20).
export const download: ModuleCases = {
  DOWNLOAD_KINDS: rule(() => DOWNLOAD_KINDS, [[]]),
  downloadProgress: rule(
    (pulled: Record<string, number>, totals: Record<string, number> | null) =>
      downloadProgress(pulled, totals),
    [
      [{ job: 40 }, null],
      [{}, {}],
      [{ customer: 5 }, { customer: 5 }],
      [
        { company: 1, customer: 300, property: 120, job: 900, job_component: 50, media: 10 },
        {
          company: 1,
          membership: 3,
          customer: 312,
          property: 120,
          job: 1000,
          job_component: 40,
          media: 0,
        },
      ],
      [
        { message: 7, invoice: 2, quote: 9, call_log: -3, unknown_table: 4 },
        { message: 10, invoice: 2, quote: 3, call_log: 1, unknown_table: 4, report: 6 },
      ],
      [{ customer: 1 }, { customer: 3 }],
      [{ customer: 2 }, { customer: 3 }],
    ],
  ),
  downloadCount: rule(
    (done: number, total: number) => downloadCount({ done, total }),
    [
      [0, 0],
      [312, 1240],
      [1234567, 2345678],
    ],
  ),
};
