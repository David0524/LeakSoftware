import {
  NOTIFICATION_KINDS,
  dayStartAlert,
  dayStartNotification,
  type DayStartDay,
  SHOP_KINDS,
  jobNotification,
  accessLine,
  liveStopContent,
  liveStopRuns,
  notificationOn,
  paymentNotification,
  quoteNotification,
  reportNotification,
  reportOpenedNotification,
  textNotification,
  weeklySummaryOn,
  WEEKLY_SUMMARY_PREF,
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
    { ...base, phase, doneStops: 4 },
    { ...base, phase, doneStops: 0, stop: 5 },
    { ...base, phase, doneStops: 9, stops: 7 },
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
  reportOpenedNotification: rule(
    (customer: string) => reportOpenedNotification(customer),
    [["Rebecca Soto"], [""]],
  ),
  WEEKLY_SUMMARY_PREF: rule(() => WEEKLY_SUMMARY_PREF, [[]]),
  weeklySummaryOn: rule(
    (prefs: unknown, role: string | null) => weeklySummaryOn(prefs, role),
    [null, {}, { weekly: true }, { weekly: false }, { weekly: "false" }, { text: false }].flatMap(
      (p) => ["owner", "admin", "tech", null].map((r) => [p, r] as [unknown, string | null]),
    ),
  ),
  liveStopContent: rule(
    (s: LiveStopInput) => liveStopContent(s),
    stops.map((s) => [s]),
  ),
  // The start of the day (owner, 2026-10-22): the first stop in one tap.
  dayStartNotification: rule(
    (stops: number, customer: string, address: string | null) =>
      dayStartNotification(stops, { customer, address }),
    [
      [5, "Smith", "123 Palm Ln"],
      [1, "Jones", null],
      [2, "Lee", ""],
    ],
  ),
  dayStartAlert: rule(
    (settings: unknown, timeZone: string, today: string, nowMin: number, days: DayStartDay[]) =>
      dayStartAlert({ settings, timeZone, today, nowMin, days }),
    (() => {
      const smith = { id: "j1", customer: "Smith", address: "123 Palm Ln" };
      const jones = { id: "j2", customer: "Jones", address: null };
      const days: DayStartDay[] = [
        { date: "2026-10-22", stops: [smith, jones] },
        { date: "2026-10-23", stops: [] },
        { date: "2026-10-24", stops: [jones] },
        { date: "2026-10-26", stops: [jones, smith] },
      ];
      const sat = { routing: { work_days: [1, 2, 3, 4, 5, 6], day_start: "07:30" } };
      return [
        [{}, "America/Phoenix", "2026-10-22", 6 * 60, days],
        [{}, "America/Phoenix", "2026-10-22", 8 * 60, days],
        [sat, "America/Phoenix", "2026-10-22", 9 * 60, days],
        [{}, "America/New_York", "2026-10-25", 0, days],
        [{}, "America/Phoenix", "2026-10-22", 0, []],
        [{}, "America/Phoenix", "2026-10-27", 0, days],
      ] as [unknown, string, string, number, DayStartDay[]][];
    })(),
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
