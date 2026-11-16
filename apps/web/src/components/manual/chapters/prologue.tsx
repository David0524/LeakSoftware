import type { ChapterDef } from "../types";
import {
  Browser,
  Flow,
  Note,
  Phone,
  PullQuote,
  Scene,
  Section,
  Spread,
  Table,
  Tip,
  Ui,
  Watch,
  WhyItMatters,
  FromTheField,
  UseIt,
} from "../kit";

export const prologue: ChapterDef = {
  id: "prologue",
  title: "Meet the shop",
  moment: { pool: "Phoenix · the first of the month", leak: "Phoenix · a Tuesday in July" },
  lede: {
    pool: "This manual follows one pool service shop through a month of real work. You’ll meet the people, see the screens they use, and learn each part of Sundeck Pro at the moment the shop needs it.",
    leak: "This manual follows one leak from the homeowner’s first call to the paid repair. You’ll meet the people, see the screens they use, and learn each part of Sundeck Pro at the moment the shop needs it.",
  },
  learn: [
    "Who’s who in the story",
    "The three places Sundeck Pro lives",
    "How to read this manual",
  ],
  Body: ({ edition }) => (
    <>
      {edition === "pool" ? (
        <Scene time="Before the month begins">
          <p>
            Canyon State runs three service trucks out of Phoenix. Luis, Priya and Tony each have a
            route of about fifty pools, ten a day, the same day every week. Dana owns the shop,
            answers the phone, and does the books after dinner.
          </p>
          <p>
            Until now the routes lived in a spreadsheet, the readings on paper, and the bills in a
            program that didn’t know who’d been to which pool. This month, everything goes through
            one place.
          </p>
        </Scene>
      ) : (
        <Scene time="Tuesday, 4:10 p.m.">
          <p>
            A homeowner in Mesa has been topping off her pool every other day. The water bill says
            it isn’t evaporation. She finds Canyon State online and calls.
          </p>
          <p>
            Dana owns the shop and runs most detections herself, with Jake as her second tech.
            Between them they do two or three detections a day across the valley, and every one ends
            the same way: a homeowner who wants to know exactly where the water is going, and what
            it will cost to stop it.
          </p>
        </Scene>
      )}

      <Section kicker="The cast" title="Who you’ll follow">
        <Table
          head={["Person", "Role in the story", "What they use"]}
          rows={
            edition === "pool"
              ? [
                  [
                    "Dana",
                    "Owner. Sets the shop up, plans the week, sends the bills.",
                    "Website on a computer, iPhone",
                  ],
                  ["Priya", "Service tech, Tuesday through Friday route.", "iPhone"],
                  ["Luis and Tony", "Service techs on their own routes.", "iPhone and Android"],
                  [
                    "The customers",
                    "Homeowners on a weekly plan.",
                    "Links in their email and texts",
                  ],
                ]
              : [
                  [
                    "Dana",
                    "Owner and lead tech. Takes the call, runs the inspection, sends the report.",
                    "iPhone, website on a computer",
                  ],
                  ["Jake", "Second tech on detections; runs the repair.", "iPhone"],
                  [
                    "Maria Alvarez",
                    "The homeowner losing an inch a day.",
                    "Links in her email and texts",
                  ],
                ]
          }
        />
        <p>
          The screens in this manual come from Canyon State’s own account, so the names, streets and
          numbers you see are theirs. Yours will show your shop, your logo and your colors.
        </p>
      </Section>

      <Section kicker="The big picture" title="One shop, three places">
        <p>
          Sundeck Pro is a single system you reach in three ways. Everything you do in one shows up
          in the others, usually within a few seconds.
        </p>
        <Flow
          stages={[
            {
              title: "The office",
              text: "sundeckpro.com on any computer: the schedule, customers, money and settings.",
            },
            {
              title: "The field",
              text: "The iPhone and Android apps: the day’s route and the work at each pool.",
            },
            {
              title: "The customer",
              text: "Private links to reports, quotes and invoices, with your logo on them.",
            },
          ]}
        />
        <Spread
          figure={
            <Phone
              src="30-today"
              alt="The iPhone app's Today screen: the next stop in a blue card, then the day's stops in order."
              caption="The field: Today on the iPhone."
            />
          }
        >
          <p>
            <strong>The website</strong> is where the office works: planning, customers, invoices
            and settings. It works on a phone too, laid out like the app, so an owner on the road
            has the whole office in a pocket.
          </p>
          <p>
            <strong>The apps</strong> are built for the field. They open on <Ui>Today</Ui>, the
            route in order, and keep everything on the phone first, so a backyard with no signal
            never stops the work.
          </p>
          <p>
            <strong>The customer pages</strong> need no app and no password. A homeowner taps the
            link in a text or an email and sees{" "}
            {edition === "pool"
              ? "what was done at their pool, and what they owe."
              : "the report, the quote, and a button to pay."}
          </p>
        </Spread>
        <Browser
          src="dashboard"
          url="sundeckpro.com/dashboard"
          alt="The website's Dashboard: tiles for customers, plans, money collected and owed, and charts."
          caption="The office: the Dashboard on the website."
        />
      </Section>

      <Section kicker="No signal, no problem" title="It works where the pools are">
        <p>
          Equipment pads, side yards and basements are where signal goes to die. The apps save every
          tap to the phone first, in an encrypted database, and send it to the office when the phone
          is back in range. The bar under each screen’s title tells you where things stand:{" "}
          <Ui>Offline · working from this phone</Ui>, then <Ui>All changes saved to the office</Ui>.
        </p>
        <Note title="What waits for a signal">
          A few things need the internet by nature: sending texts and emails, card payments, looking
          up a brand-new address, and the very first download after you sign in. Everything else,
          from checklists to photos to signatures, works with no bars at all.
        </Note>
      </Section>

      <Section kicker="Before you start" title="How to read this manual">
        <p>
          Read it front to back once, the way the story runs. After that, use the contents to jump
          to the moment you need. Along the way you’ll see a few kinds of notes:
        </p>
        <Tip title="Tips">A faster way, or a habit that pays off.</Tip>
        <Note title="Good to know">Rules and details worth knowing before you need them.</Note>
        <Watch title="Watch out">
          Something that can’t be taken back, or that trips people up.
        </Watch>
        <FromTheField title="From the field">How a working shop puts it to use.</FromTheField>
        <UseIt
          items={[
            { who: "Put it to work", text: "Ideas for what a feature is good for." },
            { who: "Why it matters", text: "What it changes for the shop: time, money, trust." },
            {
              who: "Buttons",
              text: (
                <>
                  Names in <Ui>bold</Ui> are exactly what you’ll tap.
                </>
              ),
            },
          ]}
        />
        <WhyItMatters title="The idea behind it all">
          {edition === "pool"
            ? "Every visit is written down once, at the pool, by the person who did it. The schedule, the customer’s report and the month’s invoice are all built from that one record, so nobody types anything twice."
            : "Every inspection is written down once, on the deck, by the person who did it. The report, the quote, the repair and the invoice are all built from that one record, so nobody types anything twice, and nothing a homeowner was told can quietly change later."}
        </WhyItMatters>
        <PullQuote>
          {edition === "pool"
            ? "Do the work once. Let the paperwork follow."
            : "Find it. Prove it. Fix it. Get paid."}
        </PullQuote>
      </Section>
    </>
  ),
};
