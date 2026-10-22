/**
 * The sample job (owner, 2026-10-22: "First win within about 60 seconds: pre-fill one sample job
 * for the day (marked as a sample), open it to a finished report with their own logo, then
 * prompt 'Send yourself this report'"; docs/design/2026-10-22-first-win.md).
 *
 * The database makes it when a leak detection shop is created (job.sample, set by the server
 * only). These are its words, so the website and both apps say the same thing.
 */

/** The pill on its tile, its row, and its page. */
export const SAMPLE_PILL = "Sample";

export const SAMPLE_TEXT = {
  /** The card at the top of the sample's page. */
  title: "Sample Job",
  body: "This is a finished report with your shop's name, the way your customers get it. The customer and pool are made up, and the sample never counts toward your jobs or money.",
  /** Under the body when the shop has no logo yet. */
  addLogo: "Add your logo in Settings and it shows on this report.",
  addLogoLink: "Add Your Logo",
  send: "Send Yourself This Report",
  sending: "Sending…",
  view: "View Report",
  delete: "Delete Sample",
  deleteTitle: "Delete the sample job?",
  deleteMessage: "Its report and made-up customer go too. It won't come back.",
  deleted: "Sample deleted.",
  /** The report's own banner, on screen and in the PDF. */
  reportBanner:
    "Sample report. The customer, pool, and findings are made up to show what your customers receive.",
} as const;

/** After Send Yourself This Report: where it went. */
export function sampleSentText(email: string): string {
  return `Sent to ${email}. Open it the way your customers will.`;
}

/** Whether a job (a row from any platform) is the shop's sample. */
export function isSample(job: { sample?: boolean | null } | null | undefined): boolean {
  return job?.sample === true;
}

/** Jobs without the sample, for anything that counts them. */
export function withoutSample<T extends { sample?: boolean | null }>(jobs: T[]): T[] {
  return jobs.filter((j) => !isSample(j));
}
