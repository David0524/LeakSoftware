/**
 * Hybrid logical clock (BUILD_PLAN 4.2). Format: "{unix_ms:13}-{counter:4}-{deviceId}".
 * Strings sort in time order with plain string comparison (same as Postgres collate "C").
 * The clock never runs behind the highest HLC it has seen, so a phone whose clock is slow
 * still orders its edits after the server data it has already received.
 */

export interface HlcState {
  ms: number;
  counter: number;
}

const HLC_RE = /^(\d{13})-(\d{4})-([A-Za-z0-9]+)$/;
const MAX_COUNTER = 9999;

export function formatHlc(ms: number, counter: number, deviceId: string): string {
  return `${String(ms).padStart(13, "0")}-${String(counter).padStart(4, "0")}-${deviceId}`;
}

export function parseHlc(hlc: string): { ms: number; counter: number; deviceId: string } {
  const m = HLC_RE.exec(hlc);
  if (!m) throw new Error(`Invalid HLC: ${hlc}`);
  return { ms: Number(m[1]), counter: Number(m[2]), deviceId: m[3]! };
}

export function compareHlc(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function isValidDeviceId(id: string): boolean {
  return /^[A-Za-z0-9]{1,64}$/.test(id);
}

export class HybridClock {
  private ms: number;
  private counter: number;

  constructor(
    readonly deviceId: string,
    state: HlcState = { ms: 0, counter: 0 },
    private readonly now: () => number = Date.now,
  ) {
    if (!isValidDeviceId(deviceId)) throw new Error(`Invalid device id: ${deviceId}`);
    this.ms = state.ms;
    this.counter = state.counter;
  }

  /** Next timestamp for a local write. */
  tick(): string {
    const wall = this.now();
    if (wall > this.ms) {
      this.ms = wall;
      this.counter = 0;
    } else if (this.counter < MAX_COUNTER) {
      this.counter += 1;
    } else {
      // Counter exhausted within one millisecond: borrow the next millisecond.
      this.ms += 1;
      this.counter = 0;
    }
    return formatHlc(this.ms, this.counter, this.deviceId);
  }

  /** Advance past a timestamp seen from the server or another device. */
  receive(remote: string): void {
    const r = parseHlc(remote);
    if (r.ms > this.ms || (r.ms === this.ms && r.counter > this.counter)) {
      this.ms = r.ms;
      this.counter = r.counter;
    }
  }

  get state(): HlcState {
    return { ms: this.ms, counter: this.counter };
  }
}
