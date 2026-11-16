import type { ChapterDef } from "../types";
import type { Edition } from "../kit";

type Entry = {
  term: string;
  meaning: string;
  /** "both" shows for either shop; otherwise only for that shop. */
  for: Edition | "both";
};

const TERMS: Entry[] = [
  // Both shops
  {
    term: "Checklist",
    meaning:
      "The list of items a tech works through on a visit or an inspection. The shop edits its own list under Settings › Checklist Components.",
    for: "both",
  },
  {
    term: "Customer link",
    meaning:
      "A private link to a report, quote, invoice or receipt. The customer opens it with no app and no password.",
    for: "both",
  },
  {
    term: "Deposit",
    meaning:
      "Money paid up front to accept a quote, as a percentage or a fixed amount. Set under Settings › Payments and Deposits.",
    for: "both",
  },
  {
    term: "Do Later",
    meaning:
      "Moves a stop to after every stop still to do. For five seconds the button reads Moved, with Undo.",
    for: "both",
  },
  {
    term: "Live Activity",
    meaning:
      "Your current stop on the iPhone Lock Screen and Dynamic Island during the workday. On Android it is an ongoing notification.",
    for: "both",
  },
  {
    term: "Needs a Time",
    meaning:
      "The owner’s and admin’s holding area for jobs with no time, or with no tech yet. Drag a job from it onto a day.",
    for: "both",
  },
  {
    term: "Optimize",
    meaning:
      "Reorders one day’s route to cut driving. A banner reports the driving saved, with Undo.",
    for: "both",
  },
  {
    term: "Optimize Week",
    meaning:
      "Optimizes the whole week, for everyone or for chosen techs. Owners and admins. Older guides call it Plan Week.",
    for: "both",
  },
  {
    term: "Price book",
    meaning:
      "The shop’s list of services, chemicals and repairs, with prices. Quotes, repair menus and charges take their prices from it.",
    for: "both",
  },
  {
    term: "Quote",
    meaning:
      "A written price for work, sent to the customer to accept online. Accepting can take the deposit.",
    for: "both",
  },
  {
    term: "Repair",
    meaning:
      "A job for a fix rather than an inspection, such as a pump motor or a skimmer throat. In a leak shop a repair job is made from an accepted quote.",
    for: "both",
  },
  {
    term: "Reorder",
    meaning:
      "On Today, rearranges the whole day. Drag each stop by its ≡ handle, then tap Done. Each move saves at once.",
    for: "both",
  },
  {
    term: "Stop",
    meaning: "One customer on a tech’s day, in route order.",
    for: "both",
  },
  {
    term: "Stripe",
    meaning:
      "The payment service that takes card and bank payments. The money goes to the shop’s own Stripe account.",
    for: "both",
  },
  {
    term: "Sync bar",
    meaning:
      "The strip under a screen’s title on the phone. It says whether your changes have reached the office.",
    for: "both",
  },
  {
    term: "Today",
    meaning:
      "The tech’s day: the route in stop order, with the card for the stop you’re on. Owners and admins can see any tech’s day.",
    for: "both",
  },
  {
    term: "Today card",
    meaning:
      "The blue card at the top of Today. It shows one stop at a time: Up next, On the way, At the pool, or Done.",
    for: "both",
  },
  {
    term: "Whose Day",
    meaning:
      "The pills under Today’s title: Me, then each tech. Owners and admins tap one to see that tech’s day.",
    for: "both",
  },

  // Pool care
  {
    term: "Alkalinity",
    meaning: "The water’s buffer against pH swings, in ppm. Range 80 to 120; aim 100.",
    for: "pool",
  },
  {
    term: "Backwash",
    meaning:
      "Flushing a sand or DE filter by reversing the water flow, which sends the debris to waste.",
    for: "pool",
  },
  {
    term: "Calcium",
    meaning: "Calcium in the water, in ppm. Range 200 to 400; aim 300.",
    for: "pool",
  },
  {
    term: "Charges",
    meaning:
      "Parts and services added on a visit: a skimmer basket, a filter clean from the price book, or a custom line. Each one becomes its own invoice line.",
    for: "pool",
  },
  {
    term: "CYA",
    meaning:
      "Cyanuric acid, the stabilizer that protects chlorine from the sun. The app shows it as Stabilizer (CYA). Range 30 to 80; aim 40.",
    for: "pool",
  },
  {
    term: "Filter clean",
    meaning:
      "Cleaning the pool filter, as a Regular Cleaning on a schedule: every 3 months by default. Replace filter is its own cleaning, every 12 months by default.",
    for: "pool",
  },
  {
    term: "Free chlorine",
    meaning:
      "The chlorine working in the water, in ppm. Its aim is about 7.5% of the stabilizer, and never under 2 ppm.",
    for: "pool",
  },
  {
    term: "LSI",
    meaning:
      "The Langelier Saturation Index, the water balance shown on the Chemicals card. From −0.3 to +0.3 is Balanced; below that is Corrosive; above that is Scale forming.",
    for: "pool",
  },
  {
    term: "Maintenance plan",
    meaning:
      "A customer’s repeating service: the day, the time, the tech and the price per month. Visits are made from the plan some weeks ahead.",
    for: "pool",
  },
  {
    term: "Monthly invoice",
    meaning:
      "One invoice per customer each month, drafted on its invoice day, then sent by you or sent automatically.",
    for: "pool",
  },
  {
    term: "Muriatic acid",
    meaning:
      "The acid that lowers pH and alkalinity. The What to Add list gives the dose. Acid goes into water, never water into acid.",
    for: "pool",
  },
  {
    term: "pH",
    meaning: "How acid or base the water is. Range 7.4 to 7.6; aim 7.5.",
    for: "pool",
  },
  {
    term: "Regular cleanings",
    meaning:
      "Filter, salt cell and filter replacement on a fixed schedule. Each one lands on the first visit on or after its due date.",
    for: "pool",
  },
  {
    term: "Salt cell",
    meaning:
      "The cell that makes chlorine from the salt in a salt-water pool. It is cleaned as a Regular Cleaning: Clean salt cell.",
    for: "pool",
  },
  {
    term: "Visit",
    meaning: "A maintenance stop at one pool, with its checklist, readings, charges and photos.",
    for: "pool",
  },
  {
    term: "Visit report",
    meaning:
      "What the customer gets about a visit: readings, chemicals added, what was done, and photos. Sent after each visit, once a month, or not at all.",
    for: "pool",
  },

  // Leak detection
  {
    term: "Bond beam",
    meaning:
      "The concrete beam around the top of the pool wall. Its checklist covers the pool, the spa, the autofill, the fittings, and the tile and grout.",
    for: "leak",
  },
  {
    term: "Dropped",
    meaning:
      "A pressure test that lost pressure, such as “Dropped 8 PSI in 15 min.” That is a Fail.",
    for: "leak",
  },
  {
    term: "Dye test",
    meaning:
      "Dye released at a suspect spot. The results are No draw, Dye drawn in (leak), or Inconclusive.",
    for: "leak",
  },
  {
    term: "Excluded",
    meaning:
      "A checklist item marked N/A because it could not be checked. It needs a reason from the Exclusion Reasons list, and the report shows why.",
    for: "leak",
  },
  {
    term: "Findings",
    meaning:
      "Problems you record with a severity, a note and a pin on the pool diagram. Findings feed the quote and the report.",
    for: "leak",
  },
  {
    term: "Held",
    meaning: "A pressure test that held, such as “Held at 20 PSI in 15 min.” That passes.",
    for: "leak",
  },
  {
    term: "Landmark",
    meaning:
      "A drawing, such as a skimmer, return, main drain or light, placed on the pool diagram.",
    for: "leak",
  },
  {
    term: "Main drain",
    meaning: "The drain on the pool floor. It is checked on the Plumbing Static Test.",
    for: "leak",
  },
  {
    term: "Pool diagram",
    meaning:
      "The pool outline where findings are pinned and marked up. Edit Pool Shape changes it.",
    for: "leak",
  },
  {
    term: "Pressure test",
    meaning:
      "The line is sealed and its pressure is read at the start and at the end. It passes only with no drop over at least 15 minutes. A drop is a Fail.",
    for: "leak",
  },
  {
    term: "Return",
    meaning:
      "A fitting that returns filtered water to the pool. Returns can be added more than once.",
    for: "leak",
  },
  {
    term: "Sample job",
    meaning:
      "A finished example job with your own name and logo, to try the report. It is never counted in your numbers.",
    for: "leak",
  },
  {
    term: "Severity",
    meaning:
      "Minor, Moderate, Major or Critical. It sets a finding’s pin color, and Major and Critical always appear in the report summary.",
    for: "leak",
  },
  {
    term: "Skimmer seam",
    meaning:
      "The joint where the skimmer meets the pool shell. A common leak spot, and an item on the Plumbing Static Test.",
    for: "leak",
  },
  {
    term: "Suction line",
    meaning:
      "The pipe that carries water from the pool to the pump. It is also a landmark, and the side suctions are on the Plumbing Static Test.",
    for: "leak",
  },
  {
    term: "Wrap-Up",
    meaning:
      "The last tab of a leak detection or repair job: its finish list, from the report and the customer’s signature to the quote and the invoice. Maintenance visits have none; they’re billed monthly.",
    for: "both",
  },
];

export const glossary: ChapterDef = {
  id: "glossary",
  title: "Glossary",
  subtitle: "the words in the app and on the job",
  lede: "The words you’ll see on the screens and hear on the truck, in one place.",
  Body: ({ edition }) => {
    const shown = TERMS.filter((t) => t.for === "both" || t.for === edition).sort((a, b) =>
      a.term.localeCompare(b.term),
    );
    return (
      <dl className="m-glossary">
        {shown.map((t) => (
          <div key={t.term}>
            <dt>{t.term}</dt>
            <dd>{t.meaning}</dd>
          </div>
        ))}
      </dl>
    );
  },
};
