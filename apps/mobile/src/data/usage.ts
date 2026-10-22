import { SESSION_GAP_MS, uuidv7, type UsageEventInput } from "@leakbook/core";
import { API_URL } from "../lib/config";

// Usage for the Admin portal (owner, 2026-10-22: screen time and how people use the app, per
// person). The screen open and for how long, only while the app is in front, plus errors people
// hit. Sent to the website's /api/usage every minute and when the app goes to the background;
// kept for the next try when there's no signal. Same rules as the website and the iPhone app
// (packages/core usage.ts).

export interface UsageSink {
  send(body: string, token: string): Promise<boolean>;
}

export class UsageRecorder {
  private queue: UsageEventInput[] = [];
  private screen: string | null = null;
  private since: number | null = null;
  private sessionId = uuidv7();
  private lastActive = 0;

  constructor(
    private readonly platform: "ios" | "android",
    private readonly version: string,
    private readonly now: () => number = Date.now,
  ) {}

  private session(at: number): string {
    if (at - this.lastActive > SESSION_GAP_MS) this.sessionId = uuidv7(at);
    this.lastActive = at;
    return this.sessionId;
  }

  private close(at: number) {
    if (this.screen && this.since !== null && at - this.since >= 500)
      this.queue.push({
        kind: "screen",
        screen: this.screen,
        ms: at - this.since,
        at: new Date(at).toISOString(),
        session: this.session(at),
      });
    this.since = null;
  }

  /** The screen changed (a route path). */
  screenChanged(path: string, foreground = true) {
    const at = this.now();
    if (path === this.screen) return;
    this.close(at);
    this.screen = path;
    if (foreground) {
      this.since = at;
      this.session(at);
    }
  }

  /** The app went to the background or came back. */
  foreground(active: boolean) {
    const at = this.now();
    if (active) {
      if (this.screen && this.since === null) this.since = at;
      this.session(at);
    } else this.close(at);
  }

  /** An error someone hit on the current screen. */
  error(detail: string) {
    const at = this.now();
    this.queue.push({
      kind: "error",
      screen: this.screen ?? "/",
      detail: detail.slice(0, 200),
      at: new Date(at).toISOString(),
      session: this.session(at),
    });
  }

  /** What's queued, for the server; kept when it couldn't be sent. */
  async flush(sink: UsageSink, token: string | null, companyId: string | null) {
    if (this.queue.length === 0 || !token) return;
    const batch = this.queue.slice(0, 200);
    const body = JSON.stringify({
      platform: this.platform,
      version: this.version,
      company_id: companyId,
      events: batch,
    });
    if (await sink.send(body, token)) this.queue = this.queue.slice(batch.length);
    // Kept, but not forever: a phone offline for days keeps its most recent 1,000.
    else if (this.queue.length > 1000) this.queue = this.queue.slice(-1000);
  }

  /** Waiting to send (tests). */
  get pending(): readonly UsageEventInput[] {
    return this.queue;
  }
}

/** POST /api/usage with the person's sign-in; false when it didn't get there. */
export const webSink: UsageSink = {
  async send(body, token) {
    if (!API_URL) return true;
    try {
      const res = await fetch(`${API_URL}/api/usage`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body,
      });
      return res.ok || (res.status >= 400 && res.status < 500 && res.status !== 401);
    } catch {
      return false;
    }
  },
};
