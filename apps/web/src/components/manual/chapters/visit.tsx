import type { ChapterDef } from "../types";
import {
  Browser,
  BigFigure,
  Flow,
  FromTheField,
  Gallery,
  Meta,
  Note,
  Path,
  Phone,
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

export const visit: ChapterDef = {
  id: "visit",
  title: "At the pool",
  moment: "Monday · 1:30 p.m.",
  lede: "A maintenance visit, start to finish, in the order a tech does it: the water test, what to add, the checklist, the photo, anything to bill, and Complete Job. Everything typed here becomes the customer’s report and the month’s invoice.",
  learn: [
    "Test the water and read What to Add",
    "Record the chemicals you added, with or without prices",
    "Work the checklist and the regular cleanings",
    "Take the photo, add a charge, start a quote",
    "Complete the visit, and reopen it if you need to",
  ],
  Body: () => (
    <>
      <Scene time="Monday, 1:30 p.m.">
        <p>
          The Reyes pool is Priya’s eighth of the day. She lets herself in through the side gate,
          sets the test kit on the coping, and pulls the skimmer lid with her other hand. Leaves,
          one lizard, a pool float that has seen better summers.
        </p>
        <p>
          On her phone, the visit is already open on its Checklist tab. Under{" "}
          <em>Regular cleanings</em>, two lines say <em>Today</em>: the filter, and the salt cell.
          She didn’t have to remember. The plan did.
        </p>
      </Scene>

      <Section kicker="The page" title="Three tabs, one visit">
        <Meta who={["Tech", "Owner", "Admin"]} where={["iPhone", "Android", "Website"]} />
        <p>
          A maintenance visit has three tabs: <Ui>Details</Ui>, <Ui>Checklist</Ui> and{" "}
          <Ui>Photos</Ui>. There’s no Wrap-Up and no invoice on the visit itself. Visits are billed
          once a month, from what was done, so a visit only has to record the work.
        </p>
        <p>
          <strong>Details</strong> holds the customer, the pool’s address with a pin for directions,
          the access notes, the tech, the gallons and a notes box for the office, and{" "}
          <strong>Quotes</strong> at the end. <strong>Checklist</strong> is where the visit happens:
          the Chemicals card, the regular cleanings, any charges, and the service checklist.{" "}
          <strong>Photos</strong> holds the pictures.
        </p>
        <Flow
          stages={[
            { title: "Arrive", text: "Start Job. The visit is In progress." },
            { title: "Test", text: "Readings in. What to Add says what and how much." },
            { title: "Treat", text: "Mark what you added, as suggested or changed." },
            { title: "Service", text: "The checklist and any cleanings due." },
            { title: "Prove", text: "A photo of the finished pool." },
            { title: "Finish", text: "Complete Job. The report and the invoice follow." },
          ]}
        />
        <Note title="Start isn’t required">
          <Ui>Start Job</Ui> (or <Ui>Start</Ui> on Today’s card) stamps the time you arrived and
          tells the office you’re there. A visit can also be completed straight from Scheduled, if
          you forgot to tap it.
        </Note>
      </Section>

      <Section kicker="Step 1" title="Test the water">
        <Spread
          figure={
            <Phone
              src="47-checklist-chemical"
              alt="The Chemicals card opened on a visit: Add today’s readings, a Gallons field, and rows for Free chlorine, pH, Alkalinity, Calcium, Stabilizer and Salt, each with a Reading box and an Aim For box, then Add Chemical, the chlorine and acid choices, and Notes."
              caption="Before the test: one row per reading, each with Reading and Aim For."
            />
          }
        >
          <p>
            The <strong>Chemicals</strong> card sits at the top of the Checklist tab. Closed, it
            reads “Add today’s readings.” Open it and you get one row per reading: Free Chlorine,
            pH, Alkalinity, Calcium, Stabilizer (CYA) and Salt. <strong>Gallons</strong> is already
            filled in from the pool’s details.
          </p>
          <Steps>
            <Step title="Run your test, then type each reading in the Reading box.">
              Each box shows last visit’s number in gray (“Last 7.6”), so a sudden jump stands out
              before you’ve finished typing.
            </Step>
            <Step title="Read the word under each name.">
              <Ui>Low</Ui>, <Ui>In range</Ui> or <Ui>High</Ui>, or “Not tested” for a reading you
              skipped.
            </Step>
            <Step title="Check the water balance line.">
              It works out the saturation index from all the readings: “+0.3 · Balanced,” or
              “Corrosive” below −0.3 and “Scale forming” above +0.3.
            </Step>
          </Steps>
          <p>
            There’s no Save button. Readings save about a second after you stop typing, with no
            signal needed.
          </p>
        </Spread>

        <Sub>What Aim For means</Sub>
        <p>
          Aim For is the level you’re steering toward. Until you type your own it shows the
          recommended level in gray. Type a different target for this pool (a customer with a vinyl
          liner, a salt pool that likes it lower) and the suggestions follow your number.{" "}
          <Ui>Use Recommended</Ui> clears it.
        </p>
        <Table
          head={["Reading", "In range", "Aim for"]}
          rows={[
            ["Free chlorine", "About 7.5% of stabilizer, at least 2 (3 to 6 with CYA at 40)", "4"],
            ["pH", "7.4 to 7.6", "7.5"],
            ["Alkalinity", "80 to 120 ppm", "100"],
            ["Calcium", "200 to 400 ppm", "300"],
            ["Stabilizer (CYA)", "30 to 80 ppm", "40"],
            ["Salt", "2,700 to 3,400 ppm", "3,200"],
          ]}
        />
      </Section>

      <Section kicker="Step 2" title="What to add">
        <Spread
          flip
          figure={
            <Phone
              src="30-checklist-chemical-open"
              alt="The Chemicals card with readings filled in: Free chlorine 1.5, Low, Suggested 1/3 gal liquid chlorine; pH 7.9, High, Suggested 1/3 gal muriatic acid; then Mark All Added and Add Chemical, and the chlorine and acid choices."
              caption="Low chlorine and high pH: a numbered suggestion under each, in the order to add them."
            />
          }
        >
          <p>
            As soon as a reading is off, a suggestion appears under it, with a number for the order
            to add things: “Suggested ⅓ gal muriatic acid.” The order is always alkalinity, pH,
            calcium, stabilizer, salt, then chlorine, the way a careful tech already does it. When
            everything is in range, the card says “Balanced. Nothing to add.”
          </p>
          <p>
            Amounts come in the units you pour: gallons and quarts, cups, pounds, bags. Acid
            suggestions carry the safety line: “Acid to water, never water to acid.”
          </p>
          <p>
            Under <Ui>Suggestions Use</Ui>, pick what’s on the truck: liquid chlorine at 12.5% or
            10%, or cal-hypo; muriatic acid at full or half strength, or dry acid. The amounts
            change to match.
          </p>
        </Spread>
        <Watch title="A starting point, not a recipe">
          The doses are standard chart amounts per 10,000 gallons, scaled to the pool. Add in
          portions and retest, especially with acid. The calculator doesn’t know about the rain last
          night or the kids’ party on Saturday. You do.
        </Watch>
        <Tip title="The calculator works away from a visit, too">
          <Path items={["More", "Chemicals"]} /> opens the same calculator on its own, for a
          customer who calls with a strip reading, or a pool you’re quoting. On a customer’s page,
          the <Ui>Chemical</Ui> row opens that pool’s readings and log, where <Ui>Save Readings</Ui>{" "}
          adds a test to the pool’s history.
        </Tip>
        <Browser
          src="chemicals"
          url="sundeckpro.com/chemicals"
          alt="The Chemical page for one pool on a computer: Pool Gallons, a Readings table for Free Chlorine, pH, Alkalinity, Calcium, Stabilizer (CYA) and Salt, Chlorine and Acid choices, Save Readings, and What to Add."
          caption="The same calculator on its own, opened for one pool: Save Readings adds the test to that pool’s log."
        />
      </Section>

      <Section kicker="Step 3" title="Mark what you added">
        <p>
          Under each suggestion is a circle and “Not added yet.” What you mark here is what the
          customer will read on the report, and, if your shop charges for chemicals, what the
          invoice will bill.
        </p>
        <Steps>
          <Step title="Added exactly what it said? Tap the circle.">
            It turns into a green check: “Added.” Or tap <Ui>Mark All Added</Ui> to mark every open
            suggestion at once.
          </Step>
          <Step title="Added a different amount? Tap the words instead.">
            The <Ui>Added Chemical</Ui> sheet opens. Change the <Ui>Amount</Ui> with − and + (a
            quarter gallon at a time for liquids, half a pound for powders), add a note if it needs
            one.
          </Step>
          <Step
            title={
              <>
                Added something that wasn’t suggested? Use <Ui>Also Added</Ui>.
              </>
            }
          >
            Tap <Ui>Add Chemical</Ui>, pick from <Ui>Usual for This Pool</Ui> (what this pool got
            before) or <Ui>Other Chemicals</Ui>, set the amount, and <Ui>Add</Ui>. Tabs in the
            floater, a bottle of clarifier, a bag of salt.
          </Step>
        </Steps>
        <Gallery caption="Left: changing an amount, with Customer Supplied. Right: adding something that wasn’t suggested.">
          <Phone
            src="48-added-chemical-sheet"
            size="sm"
            alt="The Added Chemical sheet: Liquid chlorine at $8.00 a gallon, Amount 0.5 gal with minus and plus buttons, a Customer Supplied switch, a Note field, the line 1/2 gal × $8.00 = $4.00, on the monthly invoice, and Remove Chemical."
          />
          <Phone
            src="48-add-chemical-sheet"
            size="sm"
            alt="The Add Chemical sheet: a search field and a list of chemicals with prices, from Liquid chlorine $8.00/gal to Algaecide $15.00/qt, with Cancel and Add."
          />
        </Gallery>
        <Note title="Customer Supplied">
          Some customers keep their own jug of chlorine by the equipment. Turn on{" "}
          <Ui>Customer Supplied</Ui> and the chemical is still recorded and still on the report,
          marked “Supplied by you,” but it’s never billed.
        </Note>
      </Section>

      <Section kicker="Prices, or not" title="Charge for Chemicals">
        <Spread
          figure={
            <Phone
              src="47-chemicals"
              alt="A visit’s Chemicals card after treatment: 3 added, Liquid chlorine and Muriatic acid ticked Added, Stabilizer Low with a suggestion of 1 1/2 lb not yet added, Also added: 3 tabs Chlorine tabs, Water balance +0.3 · Balanced, Chemicals today $15.25, Billed on Sam’s November invoice."
              caption="With Charge for Chemicals on: each chemical’s price, the day’s total, and where it will be billed."
            />
          }
        >
          <p>
            Whether techs see prices depends on one switch the owner sets in the price book:{" "}
            <Ui>Charge for Chemicals</Ui> (Chapter 4).
          </p>
          <p>
            <strong>On:</strong> each added chemical shows its price, and the card ends with{" "}
            <strong>Chemicals today $15.25</strong> and “Billed on Sam’s November invoice.” At the
            end of the month the invoice gets one line per chemical (“Liquid chlorine, October · 2¾
            gal × $8.00”), at the price book’s prices.
          </p>
          <p>
            <strong>Off:</strong> chemicals are recorded and shown on the report without prices, and
            nothing is billed.
          </p>
          <p>
            Prices come from the price book, never from the phone. A tech can’t type a price, and a
            chemical added with no signal is priced correctly when it syncs.
          </p>
        </Spread>
      </Section>

      <FromTheField title="1:42 p.m., at the Reyes pool">
        Free chlorine 1.5, pH 7.9. Two suggestions: ⅓ gallon of liquid chlorine, ⅓ gallon of acid,
        acid first. Priya pours the acid in front of the return, waits, pours the chlorine, and taps{" "}
        <Ui>Mark All Added</Ui>. Then she drops two tabs in the floater and adds them under Also
        Added. Six taps, and the customer’s report already knows what went in the water.
      </FromTheField>

      <Section kicker="Step 4" title="The checklist and the cleanings">
        <Spread
          flip
          figure={
            <Phone
              src="30-checklist-cleanings"
              full
              alt="A maintenance visit’s Checklist tab: the Chemicals card closed, Regular Cleanings with Clean filter Today, Replace filter In 6 weeks · Filter 7 months old, and Clean salt cell Today; Charges with Add Charge; then the Checklist with Skim surface, Clean filter and Clean salt cell, each with check, exclamation and skip buttons, and Mark 3 Remaining Done."
              caption="Cleanings that are due join the checklist on their own. Each item has three answers."
            />
          }
        >
          <p>
            The <strong>Checklist</strong> lists the shop’s service items: skim the surface; brush
            walls, steps and tile; vacuum; empty skimmer and pump baskets; check filter pressure;
            test and balance water; check the equipment for leaks, noise or drips. Each has three
            round buttons:
          </p>
          <Table
            head={["Answer", "Means", "What follows"]}
            rows={[
              ["✓ Done", "Done this visit.", "Listed under What We Did on the report"],
              [
                "! Needs Attention",
                "Something to look at, or for the office to know.",
                "Counted on the Checklist tab’s badge",
              ],
              ["Skipped", "Not done this visit.", "Left off the report; a cleaning stays due"],
            ]}
          />
          <p>
            Tap the chosen button again to clear it. <Ui>Mark 3 Remaining Done</Ui> answers
            everything left in one tap. On the iPhone you can also swipe an item right for Done.
          </p>
        </Spread>
        <Browser
          src="visit-checklist"
          url="sundeckpro.com/jobs/5861?tab=checklist"
          alt="A maintenance visit’s Checklist tab on a computer: Add Charge, then Checklist, 7 to do, with the Service items, each with a Done, Needs Attention and Skipped control."
          caption="On a computer the three answers are spelled out on each item."
        />

        <Sub>Regular cleanings</Sub>
        <p>
          Filters and salt cells don’t need cleaning every week, so they live on the plan as{" "}
          <strong>Regular Cleanings</strong>: a filter every three months, a salt cell every six.
          When one comes due it lands on the first visit on or after its date, shows on Today’s card
          a week ahead, and appears on the visit with <em>Today</em> or <em>Overdue</em>. Mark it
          Done and the next one is set one interval from today. Skip it and it stays due for next
          week. If the plan gives the cleaning a price, it goes on the month’s invoice as its own
          line (“Clean filter, Nov 4”).
        </p>
        <Note title="Where cleanings are set up">
          A plan’s regular cleanings, how often and at what price, are set on the website, on the
          customer’s maintenance plan. The phones show them on the visit and on Today.
        </Note>
        <Tip title="One-off items">
          Pick from <Ui>Add an item</Ui> to add one of the shop’s items to this visit, or choose{" "}
          <Ui>Type a New Item</Ui> for something only this pool needs today (“Clear the palm fronds
          from the spillway”). <Ui>Edit</Ui> removes items; a removal can be undone for five
          seconds.
        </Tip>
      </Section>

      <Section kicker="Step 5" title="The photo">
        <Spread
          figure={
            <Phone
              src="47-visit-photo-needed"
              alt="A maintenance visit with a warning: Take a photo of the pool before finishing this job, a Take Photo button, and Complete Job."
              caption="When the shop requires a pool photo, Complete Job says so and offers Take Photo."
            />
          }
        >
          <p>
            On the <Ui>Photos</Ui> tab, <Ui>Add Photo</Ui> takes a picture or adds one from the
            library. Take one of the whole pool as you leave: blue water, clean tile, the cover of
            the report. The last photo of the pool becomes the picture at the top of the customer’s
            report.
          </p>
          <p>
            Take close-ups too: the cracked lid, the weeping union, the algae in the deep-end
            corner. A photo is proof for the customer and a note for whoever comes next week.
            Original photos are kept as taken and can’t be altered.
          </p>
          <p>Two settings can make a photo a must:</p>
          <ul>
            <li>
              <Ui>Take a pool photo first</Ui> (Settings › Team) holds Complete Job until there’s a
              photo of the pool.
            </li>
            <li>
              <Ui>Require a Photo</Ui> (Settings › Report Templates) holds the visit report until
              there’s a photo; the visit itself can still be completed.
            </li>
          </ul>
        </Spread>
      </Section>

      <Section kicker="Step 6" title="Notes, for two different readers">
        <p>A visit has two notes boxes, and they go to different people.</p>
        <UseIt
          title="Which box?"
          items={[
            {
              who: "Chemicals card › Notes",
              text: "“Anything the customer should know.” It goes on the report: “Pump is louder than last week. We’ll keep an eye on it.” Last visit’s note shows underneath.",
            },
            {
              who: "Details › Job notes",
              text: "“Anything the office should know.” It stays inside the shop: “Gate latch is broken, propped with a brick.”",
            },
            {
              who: "Access notes",
              text: "On the pool, not the visit: gate code, dog, where to park. They show on Today’s card every week.",
            },
          ]}
        />
      </Section>

      <Section kicker="Step 7" title="Anything to bill: Add Charge">
        <p>
          Replaced a skimmer basket? Swapped the pressure gauge? Bill it from the pool, before you
          forget. The <strong>Charges</strong> group sits on the Checklist tab, after Regular
          Cleanings.
        </p>
        <Steps>
          <Step
            title={
              <>
                Tap <Ui>Add Charge</Ui>.
              </>
            }
          />
          <Step
            title={
              <>
                Choose <Ui>Price Book</Ui> and search for the item.
              </>
            }
          >
            “Replace skimmer basket.” The price comes from the price book.
          </Step>
          <Step
            title={
              <>
                Or choose <Ui>Custom</Ui>.
              </>
            }
          >
            Type a <Ui>Description</Ui> and <Ui>Price ($)</Ui>, and set <Ui>Taxable</Ui>.
          </Step>
          <Step title="Set the Quantity and add it.">
            The row shows “1 × $35.00,” and the footer says where it will be billed: “Billed on
            Daniel’s November invoice.”
          </Step>
        </Steps>
        <p>
          Each charge becomes its own line on the monthly invoice (“Replace skimmer basket, Oct
          14”). Any tech can add one, with or without signal. Once the invoice it’s on has been
          sent, the charge is locked; a charge added after that goes on next month’s.
        </p>
      </Section>

      <Section kicker="Bigger than a basket" title="Quotes for repairs you find">
        <p>
          Some things aren’t a charge, they’re a job: a pump motor screaming, a filter tank with a
          hairline crack. At the end of the visit’s <Ui>Details</Ui>, under <Ui>Quotes</Ui>, tap{" "}
          <Ui>Start Quote</Ui> and price the repair while you’re standing next to it. Chapter 9
          follows one of these from the noise to the paid invoice.
        </p>
      </Section>

      <Section kicker="Step 8" title="Complete Job">
        <p>
          <Ui>Complete Job</Ui> is in the visit’s header, at the end of the Checklist, and on
          Today’s card as <Ui>Mark Complete</Ui>. When every item has an answer, the line above it
          says “Everything’s checked. Mark it complete.”
        </p>
        <Steps>
          <Step
            title={
              <>
                Tap <Ui>Complete Job</Ui>.
              </>
            }
          >
            If the shop requires the checklist or a pool photo first, it tells you what’s missing.
          </Step>
          <Step title="If visit reports go out automatically, confirm.">
            The app asks “Ready to send the visit report?” and names the customer it goes to. Tap{" "}
            <Ui>Complete and Send</Ui>.
          </Step>
          <Step title="Drive on.">
            The visit is Done, and it counts toward the customer’s month. On Today, the card has
            already moved to the next stop.
          </Step>
        </Steps>
        <Watch title="Reopen Visit">
          Forgot a reading? A done visit shows <Ui>Reopen Visit</Ui> in its header and on its stop
          in Today. It puts the visit back In progress so you can fix it. Once the month’s invoice
          has been sent, that visit’s charges and chemicals are locked: they’ve been billed.
        </Watch>
      </Section>

      <BigFigure
        value="1"
        label="record of each visit, typed once at the pool, read by the customer’s report, the month’s invoice, and next week’s tech"
      />

      <Scene time="Monday, 1:58 p.m.">
        <p>
          Twenty-eight minutes after the gate. Priya marks the last item, takes the photo from the
          deep end with the waterfall in frame, and taps Complete Job in the truck with the AC
          running. By the time she’s buckled in, the visit report is in Mr. Reyes’s inbox and Dana
          can see stop eight is done.
        </p>
      </Scene>

      <WhyItMatters
        figures={[
          { value: "6", label: "readings, each checked against its range" },
          { value: "0", label: "prices typed by a tech" },
          { value: "1", label: "invoice line per chemical, per month" },
        ]}
      >
        A paper route sheet records that someone was there. A visit in Sundeck Pro records what the
        water was, what went in it, what was cleaned, what it looked like when you left, and what to
        bill. The customer gets proof of the work, the office gets an invoice that builds itself,
        and the next tech gets last week’s readings in gray, right where they’ll type this week’s.
      </WhyItMatters>
    </>
  ),
};
