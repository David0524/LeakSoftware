import {
  NOTIFICATION_KINDS,
  SHOP_KINDS,
  jobNotification,
  accessLine,
  liveStopContent,
  liveStopRuns,
  notificationOn,
  paymentNotification,
  quoteNotification,
  reportNotification,
  textNotification,
  type LiveStopInput,
  type NotificationKind,
} from "@leakbook/core";
import { rule, type ModuleCases } from "../case";

const base: LiveStopInput = {
  phase: "driving",
  customer: "Smith",
  address: "123 Palm Ln",
  stop: 3,
  stops: 7,
  eta: "9:42 AM",
  checklistDone: 4,
  checklistTotal: 9,
  next: { customer: "Jones", time: "10:30 AM" },
};

const stops: LiveStopInput[] = (["ahead", "driving", "on_site", "done"] as const).flatMap(
  (phase) => [
    { ...base, phase },
    { ...base, phase, eta: null },
    { ...base, phase, eta: "" },
    { ...base, phase, eta: "12:05 pm" },
    { ...base, phase, eta: "14:05" },
    { ...base, phase, address: null },
    { ...base, phase, address: "" },
    { ...base, phase, next: null },
    { ...base, phase, next: { customer: "Lee", time: null } },
    { ...base, phase, next: { customer: "Lee", time: "" } },
    { ...base, phase, checklistDone: 0, checklistTotal: 0 },
    { ...base, phase, stop: 1, stops: 1 },
    { ...base, phase, stop: 7, stops: 7, next: null },
    { ...base, phase, stop: 9, stops: 7 },
    { ...base, phase, stop: 0, stops: 0 },
    { ...base, phase, scheduled: "9:00 AM" },
    { ...base, phase, scheduled: "" },
    { ...base, phase, scheduled: "1:15 pm" },
    {
      ...base,
      phase,
      access: "Gate 4821",
      cleanings: [
        { name: "Clean salt cell", kind: "salt_cell" as const, days: 14, weeks: 2 },
        { name: "Clean filter", kind: "filter" as const, days: -2, weeks: 0 },
        { name: "Replace filter", kind: "filter_replace" as const, days: 0, weeks: 0 },
      ],
    },
    {
      ...base,
      phase,
      cleanings: [{ name: "Clean filter", kind: "filter" as const, days: 1, weeks: 0 }],
    },
    { ...base, phase, cleanings: [] },
  ],
);

// notifications.ts: the push texts and the Live Activity.
export const notifications: ModuleCases = {
  NOTIFICATION_KINDS: rule(() => NOTIFICATION_KINDS, [[]]),
  SHOP_KINDS: rule(() => SHOP_KINDS, [[]]),
  notificationOn: rule(
    (prefs: unknown, kind: NotificationKind) => notificationOn(prefs, kind),
    [
      null,
      {},
      { text: false },
      { text: true, job: false },
      { payment: "false" },
      { quote: 0 },
      "x",
      [false],
    ].flatMap((p) => NOTIFICATION_KINDS.map((k) => [p, k.key] as [unknown, NotificationKind])),
  ),
  textNotification: rule(
    (from: string, body: string) => textNotification(from, body),
    [
      ["Dana Smith", "  Gate is\nopen "],
      ["+16025550100", ""],
      ["+16025550100", "   \n\t "],
      ["A", "x".repeat(300)],
      ["A", "x".repeat(180)],
      ["A", "x".repeat(181)],
      ["A", "a  b\t\tc\r\nd"],
    ],
  ),
  jobNotification: rule(
    (moved: boolean, customer: string, address: string | null, when: string | null) =>
      jobNotification({ moved, customer, address, when }),
    [
      [false, "Smith", "123 Palm Ln", "Tue 9:30 AM"],
      [true, "Smith", null, null],
      [true, "Smith", "123 Palm Ln", "Wed 8:00 AM"],
      [false, "Smith", "", ""],
      [false, "", "123 Palm Ln", null],
    ],
  ),
  quoteNotification: rule(
    (customer: string, cents: number) => quoteNotification(customer, cents),
    [
      ["Smith", 125000],
      ["Smith", 0],
      ["Lee", 99],
      ["Lee", 123456789],
    ],
  ),
  paymentNotification: rule(
    (customer: string, cents: number, what: string) => paymentNotification(customer, cents, what),
    [
      ["Smith", 65730, "invoice 1042"],
      ["Lee", 5, "deposit"],
      ["Lee", 100000, "invoice 7"],
    ],
  ),
  reportNotification: rule((customer: string) => reportNotification(customer), [["Smith"], [""]]),
  liveStopContent: rule(
    (s: LiveStopInput) => liveStopContent(s),
    stops.map((s) => [s]),
  ),
  liveStopRuns: rule(
    (settings: unknown, date: string, nowMin: number, stopsLeft: number) =>
      liveStopRuns({ settings, date, nowMin, stopsLeft }),
    [
      [{}, "2026-10-19", 0, 3],
      [{}, "2026-10-19", 9 * 60, 3],
      [{}, "2026-10-18", 9 * 60, 3],
      [{ routing: { day_start: "07:30", work_days: [1, 2, 3, 4, 5] } }, "2026-10-19", 449, 3],
      [{ routing: { day_start: "07:30", work_days: [1, 2, 3, 4, 5] } }, "2026-10-19", 450, 3],
      [{ routing: { day_start: "07:30", work_days: [1, 2, 3, 4, 5] } }, "2026-10-19", 900, 0],
      [{ routing: { day_start: "07:30", work_days: [0, 6] } }, "2026-10-18", 600, 1],
      [{ routing: { day_start: "bad" } }, "2026-10-19", 600, 1],
    ],
  ),
  accessLine: rule(
    (notes: string | null) => accessLine(notes),
    [
      [null],
      [""],
      ["  Right gate.  Has dogs. "],
      ["x".repeat(89)],
      ["x".repeat(90)],
      ["x".repeat(91)],
    ],
  ),
};
