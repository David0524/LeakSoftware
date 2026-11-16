// WANT: new-job — Jobs › New Job on the website, Leak selected (desktop)
// WANT: customer — a customer page on the website (Maria Alvarez), desktop
// WANT: messages-new — Messages › New Message on the website
import type { ChapterDef } from "../types";
import {
  Flow,
  Gallery,
  Meta,
  Note,
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
  FromTheField,
} from "../kit";

export const theCall: ChapterDef = {
  id: "the-call",
  title: "“We’re losing an inch a day”",
  moment: "Tuesday · 4:10 p.m.",
  lede: "A homeowner calls with a pool that won’t stay full. Before Dana hangs up, the customer, the pool and the job are in Sundeck Pro, and the tech who goes out will know everything the caller said.",
  learn: [
    "Find a customer, or add one while they’re still talking",
    "Record the pool once, so every later job starts with it",
    "Make a New Job for a leak detection or a pool inspection",
    "Text the customer from the shop’s number",
    "Follow a job from Unscheduled to Paid",
  ],
  Body: () => (
    <>
      <Scene time="Tuesday, 4:10 p.m.">
        <p>
          Dana is parked outside a supply house in Tempe when her phone rings with the shop’s number
          on the screen. A call to Canyon State rings the team’s phones at once, and she’s the first
          to pick up.
        </p>
        <p>
          “We’re losing an inch a day,” says the woman on the line. Her name is Maria Alvarez. She
          lives in Mesa, has a plaster pool with a spa, and has been running a hose into it every
          other day since June. The water bill finally made her call.
        </p>
        <p>
          Dana asks the questions she always asks. Does it lose more with the pump running? Has
          anything been dug up or replaced lately? Is there a gate code? Then she opens the app.
        </p>
      </Scene>

      <Section kicker="Before anything else" title="Is she already a customer?">
        <p>
          Start with a search. A homeowner who called two summers ago is still in your book, with
          her pool, her gate code, and every report you sent her. Typing her in again would split
          that history in two.
        </p>
        <p>
          On a phone, the search field sits at the top of <Ui>Jobs</Ui>. On a computer, it’s in the
          header, or press <Ui>Ctrl+K</Ui> (<Ui>⌘K</Ui> on a Mac). One search looks through
          customers, pool addresses, jobs, quotes and invoices at once. Two letters are enough to
          start, and the last four digits of a phone number find a caller faster than her name.
        </p>
        <Tip title="Search works in the truck">
          In the iPhone and Android apps, search runs on the phone’s own copy of your data, so it
          finds a customer even with no signal. The website needs a connection.
        </Tip>
        <p>Maria isn’t there. She’s new, so Dana adds her in the same place she makes the job.</p>
      </Section>

      <Section kicker="The job" title="New Job, while she’s still on the line">
        <Meta who={["Owner", "Admin", "Tech"]} where={["Website", "iPhone", "Android"]} />
        <Spread
          figure={
            <Phone
              src="08-new-job"
              alt="The New Job screen on the iPhone: Who is it for? New or Existing, then Name, Phone and Email; an address card; and a Visit card with Job set to Leak, When set to Scheduled, Date, Start, Hours and Tech."
              caption="New Job holds what a phone call needs. Everything else waits under More Details."
            />
          }
        >
          <p>
            New Job is built to be filled in during a call: the customer, the address, the kind of
            job and when. A job can be on the books in under a minute, and nothing on the page asks
            for something a caller wouldn’t know.
          </p>
          <Steps>
            <Step
              title={
                <>
                  Tap the round <Ui>+</Ui> at the top right (on the website, <Ui>New Job</Ui>).
                </>
              }
            />
            <Step
              title={
                <>
                  Under <Ui>Who is it for?</Ui>, choose <Ui>New</Ui>.
                </>
              }
            >
              Type the <Ui>Name</Ui>, <Ui>Phone</Ui> and <Ui>Email</Ui>. For someone already in your
              book, choose <Ui>Existing</Ui>, pick the <Ui>Customer</Ui>, then the <Ui>Pool</Ui>, or{" "}
              <Ui>Another address…</Ui> for a second property.
            </Step>
            <Step title="Fill in the address.">
              Start typing the <Ui>Street address</Ui> and pick the match; <Ui>City</Ui>,{" "}
              <Ui>State</Ui> and <Ui>ZIP</Ui> fill in.
            </Step>
            <Step
              title={
                <>
                  Under <Ui>Job</Ui>, choose <Ui>Leak</Ui>.
                </>
              }
            />
            <Step
              title={
                <>
                  Under <Ui>When</Ui>, choose <Ui>Scheduled</Ui> or <Ui>Not Yet</Ui>.
                </>
              }
            >
              Scheduled asks for <Ui>Date</Ui>, <Ui>Start</Ui>, <Ui>Hours</Ui> and <Ui>Tech</Ui>.
              Not Yet leaves the job unscheduled, to be put on the calendar later from the Schedule.
            </Step>
            <Step
              title={
                <>
                  Tap <Ui>Create Job</Ui>.
                </>
              }
            />
          </Steps>
        </Spread>

        <Sub>Leak or Inspection</Sub>
        <Table
          head={["Job", "What it is", "What the tech gets"]}
          rows={[
            [
              <Ui key="l">Leak</Ui>,
              "A leak detection: find where the water is going.",
              "The inspection checklist, tests, findings, the pool diagram, a homeowner report and a repair quote.",
            ],
            [
              <Ui key="i">Inspection</Ui>,
              "A pool inspection, for a sale or a new owner.",
              "The full inspection form as a checklist, and a Pool Inspection Report.",
            ],
            [
              <Ui key="r">Repair</Ui>,
              "The fix. Usually made for you when a quote is accepted.",
              "One or more repairs with prices, a repair report and an invoice.",
            ],
          ]}
        />
        <Note title="What your shop sees">
          The choices follow the services set in <Ui>Company and Branding</Ui>. A leak detection
          shop sees <Ui>Repair</Ui>, <Ui>Leak</Ui> and <Ui>Inspection</Ui>; <Ui>Service</Ui> appears
          only for shops that also do pool care.
        </Note>

        <Sub>More Details: what the tech will want to know</Sub>
        <p>
          Below the visit, one row reads <Ui>More Details</Ui>, with a gray line listing what’s
          inside. Tap it and it opens in place:
        </p>
        <Table
          head={["Field", "What to put there"]}
          rows={[
            [
              <Ui key="t">Pool type</Ui>,
              "Gunite or plaster, vinyl, fiberglass, or Not sure. It decides which checklist items the job starts with.",
            ],
            [
              <Ui key="s">Has a spa</Ui>,
              "Adds the spa items to the checklist and the spa to the diagram.",
            ],
            [<Ui key="g">Gallons (optional)</Ui>, "If the homeowner knows it."],
            [
              <Ui key="p">Pool shape (optional)</Ui>,
              "Pick it now and the diagram is ready when the tech opens Findings.",
            ],
            [
              <Ui key="a">Access notes (optional)</Ui>,
              "Gate codes, dogs, a side yard that floods. The tech sees this on the job.",
            ],
            [
              <Ui key="2">Second tech (optional)</Ui>,
              "A helper on the same job. Both see it on their day.",
            ],
            [
              <Ui key="f">Detection fee ($)</Ui>,
              "What you charge to find it. Shown on the report and billed on the invoice.",
            ],
            [<Ui key="w">What they said (optional)</Ui>, "The caller’s own words."],
            [
              <Ui key="n">Notes for the tech (optional)</Ui>,
              "What you want the tech to check first.",
            ],
          ]}
        />
        <p>
          If your shop has booking questions set up, they appear in a <Ui>From the Customer</Ui>{" "}
          section, so every call gets the same questions asked in the same order.
        </p>
        <Tip title="Write it the way they said it">
          “What they said” is worth the ten seconds. “Loses more with the pump off” or “started
          after the new deck went in” points the tech at the suction side or the deck before they’ve
          opened the gate.
        </Tip>
      </Section>

      <Scene time="4:14 p.m.">
        <p>
          Maria’s job takes Dana about as long as the call. Gunite, pool and spa, roughly 20,000
          gallons. Access notes: <em>Gate code 4417. Dog in the side yard.</em> Wednesday at 9:00,
          Dana as the tech, Jake as the second tech. In <Ui>What they said</Ui> she types “Inch a
          day, tops off every other day since June.”
        </p>
        <p>
          She taps <Ui>Create Job</Ui>. It becomes job #1042, and it’s on Jake’s phone before she’s
          pulled out of the parking lot.
        </p>
      </Scene>

      <Section kicker="The record" title="A customer, and a pool that stays on file">
        <p>
          Creating the job also created two records that outlast it: Maria, the customer, and her
          pool at 1423 Palm Ct. Every later job at that address starts from them.
        </p>
        <Gallery caption="Left: the customer page, with her pool and her jobs. Right: Pool Details, where the type, gallons, spa and access notes live.">
          <Phone
            src="45-customer"
            size="sm"
            alt="Maria Alvarez's customer page: Homeowner, round call, message and email buttons, a Contact card, a Pool card with the address and 'Gunite / plaster · Pool and spa · 20,000 gallons', and Leak detection and repairs listing Job #1042 In progress."
            caption="The customer page."
          />
          <Phone
            src="45-pool-details"
            size="sm"
            alt="The Pool Details form: street, unit, city, state, ZIP, Pool type Gunite / plaster, Gallons 20,000, a Has a spa switch, and Access notes reading Gate code 4417. Dog in the side yard."
            caption="Pool Details."
          />
        </Gallery>
        <p>
          The <strong>customer page</strong> has her name, the round <Ui>Call</Ui>, <Ui>Message</Ui>{" "}
          and <Ui>Email</Ui> buttons, her contact card, each of her pools, and her job history with
          each job’s status. The <strong>pool</strong> holds the type, the spa, the gallons and the
          access notes, and later the drawing of the pool itself. Draw Maria’s figure 8 once and
          it’s there for the repair, and for any call she makes in three years.
        </p>
        <Sub>Customer types</Sub>
        <p>
          Every customer has a <Ui>Type</Ui>, set under <Ui>Edit Contact Details</Ui>: Homeowner,
          Pool company, Builder, Insurer, Property manager or Other. The Customers list’s{" "}
          <Ui>Show</Ui> menu filters by type and counts each one.
        </p>
        <UseIt
          items={[
            {
              who: "Pool companies",
              text: "A service company sends you its customers’ leaks. Make the company the customer and add each pool under it, so your history with them is one page.",
            },
            {
              who: "Property managers",
              text: "Ten community pools, one contact. Each pool keeps its own diagram and reports; the manager gets them all.",
            },
            {
              who: "Insurers",
              text: "An adjuster wants proof of where the water went. Filter Show by Insurers to see every claim job you’ve done for them.",
            },
          ]}
        />
        <Note title="Who gets the paperwork">
          <Ui>Other emails (optional)</Ui>, on New Job or the contact card, adds people who get the
          reports too: a spouse, a landlord, the property manager’s office.
        </Note>
      </Section>

      <Section kicker="Keeping her posted" title="Texting from the shop’s number">
        <Spread
          flip
          figure={
            <Phone
              src="42-new-message"
              alt="The New Message screen: a To field for a mobile number, a Text message box with a camera button, and a Customers list below with Maria Alvarez at the top."
              caption="New Message: pick the customer, or type a number."
            />
          }
        >
          <p>
            Once your shop has a company number, texts and calls with customers live in{" "}
            <Ui>Messages</Ui>, one inbox the whole team shares. The customer sees the shop’s number,
            never a tech’s own phone, and when she writes back, whoever opens Messages next sees the
            whole thread.
          </p>
          <Steps>
            <Step
              title={
                <>
                  On the customer page, tap the round <Ui>Message</Ui> button.
                </>
              }
            >
              Or open <Ui>Messages</Ui> and tap <Ui>+</Ui> (on the website, <Ui>New Message</Ui>),
              then pick her from <Ui>Customers</Ui>.
            </Step>
            <Step title="Type the text and tap Send." />
          </Steps>
          <p>
            Dana sends Maria a line: Canyon State tomorrow at 9:00, she and Jake, about two hours,
            please keep the dog inside. Maria answers with a thumbs-up before Dana reaches the
            freeway.
          </p>
        </Spread>
        <Watch title="Texting needs two things">
          A working company number (set up in <Ui>Phone and Texting</Ui>), and a signal. Sending a
          text is one of the few things the apps can’t do offline.
        </Watch>
      </Section>

      <Section kicker="Where it goes from here" title="The job’s status, start to finish">
        <p>
          Every job carries one status, shown as a pill on the Jobs list, the job page, and the
          customer page. You move a job yourself only a few times: <Ui>Start Job</Ui>,{" "}
          <Ui>Reopen Job</Ui>, <Ui>Cancel Job</Ui>. The rest changes on its own when something real
          happens: a report goes out, a quote is accepted, a payment comes in.
        </p>
        <Flow
          stages={[
            { title: "Unscheduled", text: "Made with Not Yet. Waiting for a day and a tech." },
            { title: "Scheduled", text: "On the calendar and on the tech’s Today." },
            { title: "In progress", text: "The tech tapped Start Job at the pool." },
            { title: "Report sent", text: "The homeowner has the report." },
            { title: "Quote sent", text: "The repair price is in her hands." },
            { title: "Quote accepted", text: "She said yes; the repair job is made." },
            { title: "Invoiced · Paid", text: "The bill went out, and the balance reached zero." },
          ]}
        />
        <Spread
          figure={
            <Phone
              src="04-job"
              alt="Job #1042 for Maria Alvarez on the iPhone, Details tab: In progress, Leak detection; the customer card with call, message and email buttons; Customer Links; the pool address in Mesa with Access Notes, Gate code 4417, Dog in the side yard."
              caption="The job page’s Details: the status, the customer, the pool and the access notes."
            />
          }
        >
          <p>
            On the Jobs list, the status pills filter the list: <Ui>Open</Ui>, <Ui>Unscheduled</Ui>,{" "}
            <Ui>Scheduled</Ui>, <Ui>In Progress</Ui>, and <Ui>Waiting on Customer</Ui>, which
            gathers every job where the next move is the homeowner’s: report sent, quote sent, quote
            accepted, invoiced.
          </p>
          <p>
            That last pill is the one an owner checks at the end of the day. It is the list of
            people who owe you an answer or a payment.
          </p>
          <FromTheField title="Not ready to book?">
            When a caller wants to check with a spouse first, make the job with <Ui>Not Yet</Ui>. It
            waits under <Ui>Unscheduled</Ui> and in the Schedule’s <Ui>Needs a Time</Ui>, so it
            doesn’t live on a sticky note.
          </FromTheField>
        </Spread>
        <Tip title="A call never costs typing">
          If the phone rings again halfway through New Job, leave. Your typing is kept on that
          device; the next time you open New Job it says <Ui>Draft restored</Ui>, with{" "}
          <Ui>Discard Draft</Ui> if you’d rather start over.
        </Tip>
      </Section>

      <WhyItMatters>
        The homeowner says it once. What Maria told Dana on the phone, the gate code, the dog, the
        inch a day, is on Jake’s screen before he leaves the shop, so nobody calls her back to ask
        again. And because the pool is its own record, the next job at 1423 Palm Ct, the repair
        included, starts with everything this one learned.
      </WhyItMatters>
      <PullQuote>The tech should know the gate code before the homeowner has hung up.</PullQuote>
    </>
  ),
};
