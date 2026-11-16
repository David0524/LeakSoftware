// WANT (website shots, once the catalog exists): settings-components — /settings/components (Pool
// Visits); settings-price-book — /settings/price-book; settings-reports — /settings/reports;
// settings-payments-monthly — the Monthly invoices group of /settings/payments.
import type { ChapterDef } from "../types";
import {
  Gallery,
  Meta,
  Note,
  Path,
  Phone,
  PullQuote,
  Scene,
  Section,
  Spread,
  Step,
  Steps,
  Sub,
  Table,
  Tip,
  Ui,
  UseIt,
  Watch,
  WhyItMatters,
} from "../kit";

export const serviceMenu: ChapterDef = {
  id: "service-menu",
  title: "Your service menu",
  moment: "Sunday · 11:20 p.m.",
  lede: "What a tech checks, what gets added to the water, what it costs, and when the customer hears about it. Dana sets all four before the first visit, so nobody has to decide at the pool.",
  learn: [
    "Edit the checklist your techs walk through",
    "Set up the price book, chemicals first",
    "Choose when visit reports go out, and what they need",
    "Know where the monthly invoice settings live",
  ],
  Body: () => (
    <>
      <Scene time="Sunday, 11:20 p.m.">
        <p>
          Priya texts a question from her couch: does the sheet say to check the pump basket or the
          skimmer basket first? Dana has answered it a dozen times. It was never written anywhere
          except in her head.
        </p>
        <p>
          She puts the phone down and opens <Ui>Settings</Ui>. Tonight she writes it down once, in a
          place every phone will read it from.
        </p>
      </Scene>

      <Section kicker="The checklist" title="The list every visit starts from">
        <Meta who={["Owner", "Admin"]} where={["Website", "iPhone", "Android"]} />
        <Spread
          figure={
            <Phone
              src="49-settings-components"
              alt="The Checklist Components settings page with segmented lists and rows for items such as Equipment area and Backwash, each with Applies to and order controls."
              caption="Checklist Components. The shop’s own list, not a built-in one."
            />
          }
        >
          <p>
            Open <Path items={["Settings", "Checklist Components"]} />. For a pool care shop, the
            list is <Ui>Pool Visits</Ui>. A banner reminds you that changes apply to <em>new</em>{" "}
            visits only; visits already on the schedule keep the list they were made with.
          </p>
          <p>
            Each item has a <Ui>Name</Ui>, whether it <Ui>Applies to</Ui> a pool, a spa, or both, an{" "}
            <Ui>Order</Ui> and a switch for <Ui>On new visits</Ui>. Items are grouped as{" "}
            <Ui>Every visit</Ui> and <Ui>On a schedule</Ui>.
          </p>
        </Spread>
        <p>
          The starting list covers the basics: skim the surface, brush walls, steps and tile,
          vacuum, empty the skimmer and pump baskets, check filter pressure, test and balance the
          water, and look for equipment leaks, noise or drips. Dana reorders it so the baskets come
          before the vacuum, and adds one of her own.
        </p>
        <Sub>Things you do every few months</Sub>
        <p>
          Switch on <Ui>On a schedule</Ui> and an item becomes a regular cleaning: “Done every few
          months, like a filter cleaning.” You choose how often per plan, on the website, in the
          plan’s <Ui>Regular Cleanings</Ui>. For a shop-wide default, use{" "}
          <Path items={["Settings", "Scheduling and Routes", "Regular cleanings"]} />, where each
          type takes <Ui>Monthly</Ui>, <Ui>2 Months</Ui>, <Ui>3 Months</Ui>, <Ui>6 Months</Ui> or{" "}
          <Ui>Yearly</Ui>.
        </p>
        <Tip title="One-offs stay on the visit">
          A tech who needs an item for just one pool can <Ui>Add an item</Ui> on the visit. It reads
          “This item is only on this job” and never touches the shop’s list.
        </Tip>
      </Section>

      <Section kicker="The water" title="Chemicals and what to add">
        <p>
          The chemical calculator is built into every visit and needs no setup to start. Techs enter
          six readings: free chlorine, pH, alkalinity, calcium, stabilizer (CYA) and salt. Each
          shows <Ui>Low</Ui>, <Ui>In range</Ui> or <Ui>High</Ui> against an <Ui>Aim For</Ui> level,
          and every reading that’s off gets a numbered suggestion in the order to add it. Alkalinity
          goes first, then pH, calcium, stabilizer, salt and, last, chlorine.
        </p>
        <p>
          What Dana does decide is what her trucks carry, which is the price book’s{" "}
          <Ui>Chemicals</Ui> group, next. The calculator suggests from the product the tech picks
          under <Ui>Suggestions Use</Ui>: liquid chlorine at 12.5% or 10%, cal-hypo at 65% or 73%,
          muriatic acid at 31.45% or 14.5%, or dry acid.
        </p>
        <Note title="Doses are a starting point">
          The suggestions use standard per-10,000-gallon doses. They tell a tech where to start, add
          in portions, and retest. They work with no signal.
        </Note>
      </Section>

      <Section kicker="The price book" title="Prices, written once">
        <Meta who={["Owner", "Admin"]} where={["Website", "iPhone", "Android"]} />
        <p>
          <Path items={["Settings", "Price Book"]} /> is one list that feeds quotes, the repair
          menu, a visit’s <Ui>Add Charge</Ui> and chemical billing. It is grouped by category with{" "}
          <Ui>Chemicals</Ui> first, other categories after, and items without a category last under
          Other items. A tech never types a price; they pick an item.
        </p>
        <Steps>
          <Step title="Add Item">
            <p>
              Type a <Ui>Name</Ui> and <Ui>Price ($)</Ui>. Set a <Ui>Unit</Ui> (each by default, or
              gal, lb) and a <Ui>Category</Ui>, picking one of yours or <Ui>Other</Ui>.
            </p>
          </Step>
          <Step title="Say where it shows">
            <p>
              <Ui>Taxable</Ui> is on for new items. <Ui>Show when booking a repair</Ui> puts it on
              the repair menu. <Ui>Available on quotes</Ui> off hides it. A <Ui>Description</Ui>
              prints on quotes.
            </p>
          </Step>
          <Step title="Save Item">
            <p>
              <Ui>Remove Item</Ui> asks “Remove this item from the price book?” before it goes.
            </p>
          </Step>
        </Steps>
        <Spread
          flip
          figure={
            <Phone
              src="48-price-book-charge"
              alt="The Price Book with the Chemicals group open: a Charge for Chemicals switch turned on, and rows for liquid chlorine, muriatic acid, stabilizer and others with prices per unit."
              caption="Chemicals first. The switch at the top decides whether customers are billed for them."
            />
          }
        >
          <p>
            <Ui>Charge for Chemicals</Ui> is off at the start. Off, chemicals still go on the visit
            report, without prices. On, they go on the monthly invoice at the book’s prices, one
            line per chemical per month, such as “Liquid chlorine, October · 2¾ gal × $8.00”.
          </p>
          <p>
            A chemical the customer supplies is marked <Ui>Customer Supplied</Ui> on the visit and
            is never billed. Techs only see prices when the shop is charging for chemicals.
          </p>
        </Spread>
        <Watch title="Charging starts the month you switch it on">
          Chemicals are billed from the month <Ui>Charge for Chemicals</Ui> is turned on. Visits
          before that stay without prices.
        </Watch>
        <UseIt
          title="What goes in the book"
          items={[
            {
              who: "Service",
              text: "Filter clean, cartridge. Filter clean, DE. Salt cell clean. Green pool cleanup. Extra service visit.",
            },
            {
              who: "Chemicals",
              text: "Liquid chlorine, muriatic acid, stabilizer, salt, phosphate remover, by the unit you buy them in.",
            },
            {
              who: "Repair",
              text: "A skimmer basket, a pump lid O-ring, a pump motor: the things a tech swaps on site, ready to pick.",
            },
          ]}
        />
        <p>
          Sales tax is set on <Path items={["Settings", "Payments and Deposits"]} />, and applies to
          the items marked taxable.
        </p>
      </Section>

      <Scene time="12:05 a.m.">
        <p>
          One setting left. Dana has watched a customer text “did anyone even come?” twice this
          year. She decides what proof goes out, and when.
        </p>
      </Scene>

      <Section kicker="Proof of work" title="When the customer hears about it">
        <Meta who={["Owner", "Admin"]} where={["Website", "iPhone", "Android"]} />
        <p>
          <Path items={["Settings", "Report Templates"]} />, under <Ui>Visit reports</Ui>, holds one
          choice that shapes the whole month: <Ui>Send Visit Reports</Ui>.
        </p>
        <Table
          head={["Setting", "What the customer gets", "Good for"]}
          rows={[
            [
              "Each Visit",
              "A report after every visit. With Send Automatically on, it goes the moment the tech completes the visit, by email or text. Off, the tech sends it.",
              "Shops that want the customer to see it today.",
            ],
            [
              "Monthly",
              "One report a month, with every visit’s readings, chemicals added, work done and photos, sent with the monthly invoice in one email or text with both links. A customer with no invoice that month gets it on the 1st.",
              "Shops that bill monthly and don’t want weekly mail.",
            ],
            ["Off", "No visit reports.", "Shops that handle it another way."],
          ]}
        />
        <Gallery caption="Left: Each Visit, with Send Automatically. Right: Monthly, with its two lines of explanation.">
          <Phone
            src="68-settings-reports"
            alt="Report Templates with Send Visit Reports set to Each Visit, a Send Automatically switch off, a Require a Photo switch off and an Add Saved Report button."
            caption="Each Visit"
          />
          <Phone
            src="48-report-timing-monthly"
            alt="Report Templates with Send Visit Reports set to Monthly: One report a month, Sent with the monthly invoice, and a Require a Photo switch."
            caption="Monthly"
          />
        </Gallery>
        <p>
          <Ui>Require a Photo</Ui> is a switch under all of these. On, a visit’s report can’t go out
          until it has a photo; automatic sends wait and go once one is added. The monthly report is
          never held up by it. Dana turns it on. A report with a photo of the pool answers “did
          anyone even come?” without a word.
        </p>
        <Note title="Even in Monthly, a tech can send one">
          A tech can still send a single visit’s report by hand. The visit shows “Goes with the
          monthly invoice” until they do.
        </Note>
      </Section>

      <Section kicker="Month’s end" title="Invoice settings, set once">
        <p>
          Two choices for monthly invoices sit on the website’s{" "}
          <Path items={["Settings", "Payments and Deposits"]} /> page, under{" "}
          <Ui>Monthly invoices</Ui>. <Ui>Invoice Day</Ui> is the day (1st to 28th, 1st to begin
          with) the month’s draft is made, and <Ui>Send Automatically</Ui> sends it by itself on
          that day, by email or by text from your shop’s number. It starts off, so drafts wait for
          you. A plan can use its own day. The full story, with Dana’s first invoices, is in Chapter
          11, Billing day.
        </p>
      </Section>

      <PullQuote>Write it down once. Every phone reads the same page.</PullQuote>

      <WhyItMatters title="Why decide this before the first visit">
        When the checklist, the prices and the report timing are set, a visit is the same no matter
        which tech does it, and the customer’s report and invoice follow from what the tech
        recorded. Nobody on the route has to remember what to check, what to charge or what to send.
      </WhyItMatters>
    </>
  ),
};
