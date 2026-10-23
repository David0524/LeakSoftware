// The launch film's narration (docs/plans/launch-video.md, section 8): one entry per voice file
// (01.mp3 … 43.mp3), the chapter it opens or belongs to, and the short key line that stays on
// screen as a caption for muted viewing (section 4's captions).

export type ChapterId =
  | "open"
  | "turn"
  | "dispatch"
  | "road"
  | "leak"
  | "prove"
  | "close"
  | "pool"
  | "upsell"
  | "paid"
  | "command"
  | "return"
  | "backyard"
  | "vision"
  | "end";

export interface Chapter {
  id: ChapterId;
  /** The chapter card's number ("01"), or none for the open, the turn and the end. */
  number?: string;
  /** The chapter card's title, all caps on screen. */
  title?: string;
}

export const chapters: Chapter[] = [
  { id: "open" },
  { id: "turn" },
  { id: "dispatch", number: "01", title: "Dispatch" },
  { id: "road", number: "02", title: "On the road" },
  { id: "leak", number: "03", title: "Find the leak" },
  { id: "prove", number: "04", title: "Prove it" },
  { id: "close", number: "05", title: "Close it on the spot" },
  { id: "pool", number: "06", title: "Every pool, every week" },
  { id: "upsell", number: "07", title: "Spot the upsell" },
  { id: "paid", number: "08", title: "Get paid" },
  { id: "command", number: "09", title: "The command center" },
  { id: "return", number: "10", title: "Keep them coming back" },
  { id: "backyard", number: "11", title: "Built for the backyard" },
  { id: "vision", number: "12", title: "The vision" },
  { id: "end" },
];

export interface Line {
  /** 1 to 43: the voice file's number. */
  n: number;
  chapter: ChapterId;
  text: string;
}

export const lines: Line[] = [
  {
    n: 1,
    chapter: "open",
    text: "It's five in the morning. You've already answered three texts... and you haven't left the driveway.",
  },
  {
    n: 2,
    chapter: "open",
    text: "All day, you're the one everybody calls. Where's the tech. Did you get my check. Can you come Thursday.",
  },
  {
    n: 3,
    chapter: "open",
    text: "And at ten at night... you're at the kitchen table, doing the invoices.",
  },
  {
    n: 4,
    chapter: "open",
    text: "You're great at the work. You built this company with your own hands.",
  },
  { n: 5, chapter: "open", text: "But the paperwork? The paperwork is running you." },
  { n: 6, chapter: "turn", text: "Not anymore." },
  { n: 7, chapter: "turn", text: "Sundeck Pro. Your whole shop. In your pocket. On every truck." },
  {
    n: 8,
    chapter: "dispatch",
    text: "Your morning starts here. Every tech, every job, the whole week, on one board.",
  },
  {
    n: 9,
    chapter: "dispatch",
    text: "New call comes in? Drop it on a day. Drag it to whoever's closest.",
  },
  {
    n: 10,
    chapter: "dispatch",
    text: "Then hit Optimize. Sundeck reworks every route... and shows you the drive time you just got back.",
  },
  {
    n: 11,
    chapter: "road",
    text: "Your techs open the app and the day's already laid out. Next stop. Gate code. The dog in the yard.",
  },
  { n: 12, chapter: "road", text: "One tap, and the customer gets a text: we're on the way." },
  {
    n: 13,
    chapter: "road",
    text: "It even sits on the lock screen. No digging through the phone with wet hands.",
  },
  {
    n: 14,
    chapter: "leak",
    text: "On a leak job, every test has its place. Pressure test on the return line... it dropped.",
  },
  {
    n: 15,
    chapter: "leak",
    text: "Dye at the light niche. Pin it on the pool. Snap the photo. Say what you see.",
  },
  {
    n: 16,
    chapter: "leak",
    text: "Nothing lives in somebody's head anymore. It's all on record.",
  },
  {
    n: 17,
    chapter: "prove",
    text: "Then the report builds itself. Your logo. Your findings. The photos that prove it.",
  },
  {
    n: 18,
    chapter: "prove",
    text: "The homeowner signs right there... and it's in their inbox before you're back in the truck.",
  },
  {
    n: 19,
    chapter: "prove",
    text: "That's the kind of report that makes a customer trust you. And tell their neighbors.",
  },
  {
    n: 20,
    chapter: "close",
    text: "Found the problem? Quote the repair right there. Straight from your price book.",
  },
  {
    n: 21,
    chapter: "close",
    text: "They tap accept on their own phone, put the deposit down... and you've got the job.",
  },
  { n: 22, chapter: "close", text: 'No callbacks. No "let me think about it." Done.' },
  {
    n: 23,
    chapter: "pool",
    text: "Running pool routes? Your weekly plans fill the board on their own.",
  },
  {
    n: 24,
    chapter: "pool",
    text: "Your guys see every stop in order. Readings go in, and Sundeck tells them exactly what to add.",
  },
  {
    n: 25,
    chapter: "pool",
    text: "Filter's due? It's already on the list. Before and after photos. Mark it complete...",
  },
  {
    n: 26,
    chapter: "pool",
    text: "And the homeowner gets the visit report automatically. They see the work, every single week.",
  },
  {
    n: 27,
    chapter: "upsell",
    text: "And when a tech hears a pump starting to go... that's not a note in a notebook anymore. That's a quote. And a sale.",
  },
  {
    n: 28,
    chapter: "paid",
    text: "Every plan bills itself at the end of the month. Customers pay by card.",
  },
  {
    n: 29,
    chapter: "paid",
    text: "Cash or check on site? Record it on the phone, and the receipt goes out on the spot.",
  },
  { n: 30, chapter: "paid", text: "Stop chasing money. Watch it come in." },
  {
    n: 31,
    chapter: "command",
    text: "And you? You see all of it. Every truck. Every job. Every dollar.",
  },
  {
    n: 32,
    chapter: "command",
    text: "What came in today. What's still owed. Who's on a plan. Who said yes.",
  },
  {
    n: 33,
    chapter: "command",
    text: "You don't have to call anybody to find out what's going on. You already know.",
  },
  {
    n: 34,
    chapter: "return",
    text: "Need more work in the slow season? Send an offer to every customer you've got, in one click.",
  },
  {
    n: 35,
    chapter: "return",
    text: "Reminders and review requests go out on their own. Customers come back... and they bring their friends.",
  },
  {
    n: 36,
    chapter: "backyard",
    text: "And it's built for where the work happens. No signal in the backyard? Doesn't matter. It catches up when you're back in range.",
  },
  {
    n: 37,
    chapter: "backyard",
    text: "Big buttons. One hand. Made for guys who work for a living.",
  },
  { n: 38, chapter: "vision", text: "Think about what you'd do with those hours back." },
  { n: 39, chapter: "vision", text: "Another truck. Another crew. A bigger name in town." },
  { n: 40, chapter: "vision", text: "Home for dinner. Saturdays at the lake." },
  {
    n: 41,
    chapter: "vision",
    text: "You didn't start this company to do paperwork. You started it to build something.",
  },
  { n: 42, chapter: "vision", text: "Sundeck Pro. Build the company you set out to build." },
  { n: 43, chapter: "end", text: "Start your free trial at sundeck pro dot com." },
];

/** The words a placeholder reads at (section "Narration" of the brief): about 2.4 a second. */
export const WORDS_PER_SECOND = 2.4;
/** Seconds of silence per "..." in a line (ElevenLabs reads it as a beat). */
export const ELLIPSIS_PAUSE = 0.5;
/** Seconds between two lines in a chapter, and before a new chapter (its card plays there). */
export const LINE_GAP = 0.6;
export const CHAPTER_GAP = 1.0;
/** The silence before "Not anymore." (the drop), and the hold after the last line. */
export const DROP_GAP = 1.2;
export const PRE_ROLL = 1.6;
/** Extra air after lines read quickly (owner's narration, 2026-10-23: 19, 29 and 33). */
export const EXTRA_AFTER: Record<number, number> = { 19: 0.5, 29: 0.5, 33: 0.5 };
export const TAIL = 1.5;

/** A line's length read at the placeholder pace. */
export function placeholderSeconds(text: string): number {
  const words = text
    .replace(/\.\.\./g, " ")
    .split(/\s+/)
    .filter(Boolean).length;
  const pauses = (text.match(/\.\.\./g) ?? []).length;
  return Math.max(1, words / WORDS_PER_SECOND + pauses * ELLIPSIS_PAUSE);
}
