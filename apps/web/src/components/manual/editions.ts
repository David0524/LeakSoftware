import type { Edition } from "./kit";
import type { ChapterDef } from "./types";
import { prologue } from "./chapters/prologue";
import { dayOne } from "./chapters/day-one";
import { team } from "./chapters/team";
import { routeOver } from "./chapters/route-over";
import { serviceMenu } from "./chapters/service-menu";
import { inspectionKit } from "./chapters/inspection-kit";
import { weekAhead } from "./chapters/week-ahead";
import { today } from "./chapters/today";
import { visit } from "./chapters/visit";
import { visitReports } from "./chapters/visit-reports";
import { repairOnSite } from "./chapters/repair-on-site";
import { office } from "./chapters/office";
import { billingDay } from "./chapters/billing-day";
import { gettingPaid } from "./chapters/getting-paid";
import { lookingBack } from "./chapters/looking-back";
import { theCall } from "./chapters/the-call";
import { inspection } from "./chapters/inspection";
import { pressure } from "./chapters/pressure";
import { pinning } from "./chapters/pinning";
import { wrapUp } from "./chapters/wrap-up";
import { homeowner } from "./chapters/homeowner";
import { theFix } from "./chapters/the-fix";
import { settingsRef } from "./chapters/settings-ref";
import { faq } from "./chapters/faq";
import { glossary } from "./chapters/glossary";
import { cheatSheet } from "./chapters/cheat-sheet";

export type Part = {
  /** "Part I", or "" for the prologue and the back of the book. */
  label: string;
  title: string;
  intro?: string;
  /** Chapters are numbered 1, 2, 3… across parts; back-of-book ones are lettered. */
  numbering: "none" | "number" | "letter";
  chapters: ChapterDef[];
};

export type EditionInfo = {
  edition: Edition;
  slug: "pool-care" | "leak-detection";
  name: string;
  /** The story's title. */
  story: string;
  promise: string;
  pdf: string;
  parts: Part[];
};

const BACK: Part = {
  label: "",
  title: "Back of the book",
  numbering: "letter",
  chapters: [settingsRef, faq, glossary, cheatSheet],
};

export const EDITIONS: Record<Edition, EditionInfo> = {
  pool: {
    edition: "pool",
    slug: "pool-care",
    name: "Pool Care",
    story: "A month on the route",
    promise:
      "Follow one pool service shop through a month: setting up, running the routes, servicing the pools, and sending the bills. Every screen you’ll use, in the order you’ll use it.",
    pdf: "/manual/sundeck-pro-pool-care-manual.pdf",
    parts: [
      { label: "", title: "Prologue", numbering: "none", chapters: [prologue] },
      {
        label: "Part I",
        title: "Opening the doors",
        intro:
          "Before the first truck rolls: the shop, the customers you already have, the people who’ll do the work, and what you do at every pool.",
        numbering: "number",
        chapters: [dayOne, routeOver, team, serviceMenu],
      },
      {
        label: "Part II",
        title: "The week",
        intro:
          "A working week, from Sunday night’s look at the schedule to Friday’s last pool, and everything the office does in between.",
        numbering: "number",
        chapters: [weekAhead, today, visit, visitReports, repairOnSite, office],
      },
      {
        label: "Part III",
        title: "Month’s end",
        intro: "The month’s work becomes invoices, the invoices become money, and you look back.",
        numbering: "number",
        chapters: [billingDay, gettingPaid, lookingBack],
      },
      BACK,
    ],
  },
  leak: {
    edition: "leak",
    slug: "leak-detection",
    name: "Leak Detection",
    story: "From drip to paid",
    promise:
      "Follow one leak from the homeowner’s first call to the paid repair: booking it, testing it, pinning it, reporting it, and fixing it. Every screen you’ll use, in the order you’ll use it.",
    pdf: "/manual/sundeck-pro-leak-detection-manual.pdf",
    parts: [
      { label: "", title: "Prologue", numbering: "none", chapters: [prologue] },
      {
        label: "Part I",
        title: "Opening the doors",
        intro:
          "Before the first call: the shop, the way you inspect, and the people who’ll do the work.",
        numbering: "number",
        chapters: [dayOne, inspectionKit, team],
      },
      {
        label: "Part II",
        title: "One leak, start to finish",
        intro:
          "A homeowner is losing water. Follow the job from the phone call to the deck, the report, the repair, and the payment.",
        numbering: "number",
        chapters: [
          theCall,
          weekAhead,
          today,
          inspection,
          pressure,
          pinning,
          wrapUp,
          homeowner,
          theFix,
          gettingPaid,
        ],
      },
      {
        label: "Part III",
        title: "Running the shop",
        intro: "What the office does while the trucks are out, and how you see the whole business.",
        numbering: "number",
        chapters: [office, lookingBack],
      },
      BACK,
    ],
  },
};

export type NumberedChapter = { def: ChapterDef; number: string; part: Part };

/** Every chapter of an edition with its number ("1", "A", or "" for the prologue). */
export function chaptersOf(info: EditionInfo): NumberedChapter[] {
  const out: NumberedChapter[] = [];
  let n = 0;
  let letter = 0;
  for (const part of info.parts) {
    for (const def of part.chapters) {
      const number =
        part.numbering === "number"
          ? String(++n)
          : part.numbering === "letter"
            ? String.fromCharCode(65 + letter++)
            : "";
      out.push({ def, number, part });
    }
  }
  return out;
}
