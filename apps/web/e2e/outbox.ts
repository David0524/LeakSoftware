import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

/** Where the app started by Playwright writes emails (EMAIL_OUTBOX_DIR). */
export const OUTBOX = resolve(__dirname, ".outbox");

export interface OutboxEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
  attachments: { filename: string; bytes: number }[];
}

/** The newest email sent to `to`, if any. */
export async function lastEmailTo(to: string): Promise<OutboxEmail | null> {
  const names = (await readdir(OUTBOX).catch(() => [] as string[])).sort().reverse();
  for (const name of names) {
    const email = JSON.parse(await readFile(join(OUTBOX, name), "utf8")) as OutboxEmail;
    if (email.to === to) return email;
  }
  return null;
}
