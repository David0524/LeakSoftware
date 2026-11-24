import type { Edition } from "./kit";

/**
 * The "How do I…?" index at the front of each manual (owner, 2026-11-16): plain tasks, each
 * linked to the section that shows it. `to` is a section's anchor (kit.tsx `sectionId`), or a
 * chapter id for a whole chapter.
 */
export type HowTo = { task: string; to: string; for?: Edition };
export type HowToGroup = { title: string; items: HowTo[] };

export const HOW_TO: HowToGroup[] = [
  {
    title: "Set up",
    items: [
      { task: "Start a free trial", to: "s-start-the-trial" },
      {
        task: "Put your logo and colors on reports and invoices",
        to: "s-make-it-look-like-canyon-state",
      },
      { task: "Get the app on your techs’ phones", to: "s-put-the-app-on-the-phones" },
      { task: "Invite a tech or office person", to: "s-an-email-with-a-link" },
      { task: "Choose what techs can see and do", to: "s-three-roles-three-jobs" },
      { task: "Turn someone off", to: "s-turn-off-dont-delete" },
      { task: "Choose your notifications", to: "s-notifications-each-persons-own" },
      {
        task: "Bring customers over from a spreadsheet",
        to: "s-import-from-a-spreadsheet",
        for: "pool",
      },
      { task: "Put a customer on a weekly plan", to: "s-a-day-how-often-how-much", for: "pool" },
      { task: "Edit the visit checklist", to: "s-the-list-every-visit-starts-from", for: "pool" },
      { task: "Set chemical prices and the price book", to: "s-prices-written-once", for: "pool" },
      {
        task: "Choose when visit reports go out",
        to: "s-when-the-customer-hears-about-it",
        for: "pool",
      },
      {
        task: "Edit the inspection checklist",
        to: "s-components-what-gets-looked-at",
        for: "leak",
      },
      {
        task: "Set what a passing test looks like",
        to: "s-test-types-what-a-pass-looks-like",
        for: "leak",
      },
      {
        task: "Set severities and exclusion reasons",
        to: "s-severities-and-exclusion-reasons",
        for: "leak",
      },
      { task: "Edit the reasons a visit can be skipped", to: "s-skip-visit", for: "pool" },
      { task: "Set prices, deposits and tax", to: "s-price-book-deposits-and-tax", for: "leak" },
      { task: "Send yourself a sample report", to: "s-send-yourself-a-report", for: "leak" },
    ],
  },
  {
    title: "Book and schedule",
    items: [
      {
        task: "Book a new leak detection",
        to: "s-new-job-while-shes-still-on-the-line",
        for: "leak",
      },
      {
        task: "Add a customer and their pool",
        to: "s-a-customer-and-a-pool-that-stays-on-file",
        for: "leak",
      },
      { task: "Add a customer and their pool", to: "s-customers-and-their-pools", for: "pool" },
      { task: "See the day, week or month", to: "s-day-week-month" },
      { task: "Give a job a time", to: "s-needs-a-time" },
      { task: "Move a stop to another time or day", to: "s-drag-it-and-know-what-it-keeps" },
      { task: "Put a route in the best order", to: "s-optimize" },
      { task: "Schedule customers who aren’t on a day yet", to: "s-customers-to-add", for: "pool" },
    ],
  },
  {
    title: "In the field",
    items: [
      { task: "See where you’re going next", to: "s-one-card-one-stop" },
      { task: "Text “on my way” and start a job", to: "s-on-my-way-then-start" },
      { task: "Mark a stop complete", to: "s-mark-complete-and-on-to-the-next", for: "pool" },
      { task: "Mark a stop done for today", to: "s-done-for-today", for: "leak" },
      { task: "Push a stop to later or reorder the day", to: "s-do-later-and-reorder" },
      { task: "Work with no signal", to: "s-when-the-signal-drops" },
      { task: "Enter readings and see what to add", to: "s-test-the-water", for: "pool" },
      { task: "Record the chemicals you added", to: "s-mark-what-you-added", for: "pool" },
      {
        task: "Do a filter or salt cell cleaning",
        to: "s-the-checklist-and-the-cleanings",
        for: "pool",
      },
      { task: "Take the visit photo", to: "s-the-photo", for: "pool" },
      {
        task: "Bill a part or extra work on a visit",
        to: "s-anything-to-bill-add-charge",
        for: "pool",
      },
      { task: "Finish a visit", to: "s-complete-job", for: "pool" },
      { task: "Skip a visit you can’t do", to: "s-skip-visit", for: "pool" },
      { task: "Report a problem for the office", to: "s-report-an-issue", for: "pool" },
      {
        task: "Report a problem you saw for the office",
        to: "s-something-else-you-saw",
        for: "leak",
      },
      {
        task: "Answer the inspection checklist",
        to: "s-a-checklist-built-for-this-pool",
        for: "leak",
      },
      { task: "Record a pressure test", to: "s-recording-a-pressure-test", for: "leak" },
      {
        task: "Mark something not inspected, with a reason",
        to: "s-excluded-with-a-reason",
        for: "leak",
      },
      { task: "Draw the pool and its landmarks", to: "s-marias-pool-drawn-once", for: "leak" },
      { task: "Add a finding and pin the leak", to: "s-naming-the-leak", for: "leak" },
      { task: "Mark up a photo", to: "s-photos-video-and-voice-notes", for: "leak" },
    ],
  },
  {
    title: "Reports, quotes and repairs",
    items: [
      { task: "Send a visit report", to: "s-send-a-visit-report", for: "pool" },
      { task: "See what the customer’s report shows", to: "s-the-visit-report", for: "pool" },
      { task: "Quote a repair you found on a visit", to: "s-start-a-quote", for: "pool" },
      {
        task: "Turn a reported issue into a quote",
        to: "s-an-issue-made-into-a-quote",
        for: "pool",
      },
      {
        task: "Ask customers how it went before a review",
        to: "s-how-did-we-do",
        for: "pool",
      },
      {
        task: "Write and review the report",
        to: "s-the-report-writes-itself-from-the-deck",
        for: "leak",
      },
      { task: "Get the homeowner’s signature", to: "s-hand-her-the-phone", for: "leak" },
      {
        task: "Quote the repair from your findings",
        to: "s-the-quote-built-from-what-she-found",
        for: "leak",
      },
      { task: "Send the report, quote and invoice", to: "s-send", for: "leak" },
      { task: "See what the homeowner sees", to: "homeowner", for: "leak" },
      {
        task: "Turn a reported issue into a quote or a job",
        to: "s-something-else-you-saw",
        for: "leak",
      },
      { task: "Schedule and finish the repair", to: "the-fix", for: "leak" },
    ],
  },
  {
    title: "Money",
    items: [
      { task: "Bill every customer for the month", to: "billing-day", for: "pool" },
      {
        task: "Let monthly invoices send themselves",
        to: "s-invoice-day-and-send-automatically",
        for: "pool",
      },
      { task: "Take card and bank payments", to: "s-payments-deposits-and-tax" },
      {
        task: "Charge monthly invoices automatically",
        to: "s-autopay-on-monthly-invoices",
        for: "pool",
      },
      { task: "Get a card or bank account on file", to: "s-cards-on-file" },
      { task: "Let customers pay over time", to: "s-the-invoice-page" },
      { task: "Send payment reminders by text", to: "s-the-invoices-list" },
      { task: "Record a cash or check payment", to: "s-record-payment" },
      { task: "Send a receipt", to: "s-send-receipt" },
      { task: "Void an invoice", to: "s-voiding-an-invoice" },
    ],
  },
  {
    title: "The office",
    items: [
      { task: "Text a customer from the shop’s number", to: "s-messages" },
      { task: "Find anything fast", to: "s-search-and-new-job-from-anywhere" },
      { task: "Email many customers at once", to: "s-email-customers" },
      { task: "See how the business is doing", to: "s-the-dashboard" },
      { task: "Read and close customer complaints", to: "s-customer-feedback" },
      {
        task: "See a pool’s chemistry over time",
        to: "s-trends-and-out-of-range",
        for: "pool",
      },
      { task: "Find a job or a report", to: "s-the-jobs-list" },
      { task: "Find a setting", to: "settings-ref" },
    ],
  },
];

export function howToFor(edition: Edition): HowToGroup[] {
  return HOW_TO.map((g) => ({
    ...g,
    items: g.items.filter((i) => !i.for || i.for === edition),
  })).filter((g) => g.items.length > 0);
}
