import type { ChapterDef } from "../types";
import {
  Browser,
  Flow,
  FromTheField,
  Meta,
  Note,
  Phone,
  PullQuote,
  Scene,
  Section,
  Spread,
  Step,
  Steps,
  Table,
  Tip,
  Ui,
  UseIt,
  Watch,
  WhyItMatters,
} from "../kit";

export const visitReports: ChapterDef = {
  id: "visit-reports",
  title: "The report on the doorstep",
  subtitle: "visit reports and what the customer sees",
  moment: "Monday · 2:01 p.m.",
  lede: "The customer wasn’t home. The report tells them what happened anyway: the water test, what went in the pool, what was done, and a photo of the result, from the shop, with your logo on it.",
  learn: [
    "What the customer gets after a visit",
    "Each Visit, Monthly or Off, and what each sends",
    "Send a visit report by hand, or again",
    "Read the visit report bar",
  ],
  Body: () => (
    <>
      <Scene time="Monday, 2:01 p.m.">
        <p>
          Daniel Reyes is in a meeting downtown when his phone buzzes. An email from Canyon State:
          <em>Maintenance Visit Report</em>.
        </p>
        <p>
          He opens it under the table. A photo of his pool, bluer than it looked on Saturday. One
          line: “Free chlorine was low and pH was high; we added liquid chlorine and muriatic acid
          to bring them back in range.” Under that, the readings, the ⅓ gallon of acid, the filter
          cleaned, “Serviced by Priya.” He puts the phone back in his pocket. He doesn’t have to
          wonder whether anyone came.
        </p>
        <p>
          Canyon State sends a report after each visit, automatically. Priya did nothing to send it
          but tap Complete and Send.
        </p>
      </Scene>

      <Section kicker="What they see" title="The visit report">
        <Meta who={["Customer"]} where={["Website"]} />
        <p>
          A visit report is a private web page. The customer taps the link in an email or a text and
          it opens in their phone’s browser: no app, no password. It always shows in light colors
          with your logo and name at the top, and has a PDF link for anyone who wants to save or
          print it.
        </p>
        <Table
          head={["Part", "What it shows"]}
          rows={[
            [
              "The top",
              "Maintenance Visit Report and the date, a one-line summary (“Your pool is balanced and clean.”), the finished-pool photo, and “Serviced by Priya.”",
            ],
            ["Property, Prepared for, Technician", "Whose pool, and who did the work."],
            [
              "Water Test",
              "Each reading with its result, the level aimed for, and an In range, Low or High pill, then the water balance line.",
            ],
            [
              "Added Chemicals",
              "What went in and why (“To lower pH”). Prices only if the shop charges for chemicals; “Supplied by you” for the customer’s own.",
            ],
            ["What We Did", "Only the checklist items marked Done, including any cleanings."],
            ["Notes", "The tech’s note for the customer."],
            ["Photos", "The visit’s photos."],
          ]}
        />
        <Note title="Only what was done">
          A skipped item, or one left unanswered, never appears on the report. The customer reads
          “Brushed walls, steps, and tile,” not a list of boxes with some empty. If the filter
          cleaning was skipped this week, it simply isn’t there, and it stays due for next week.
        </Note>
        <p>
          A sent report never changes. It’s a snapshot of the visit as it was when it went out. If
          you fix something afterward and send it again, the customer gets a new version, and the
          old link still shows what it showed.
        </p>
      </Section>

      <Section kicker="After the visit" title="How did we do?">
        <p>
          Under a sent visit report, the customer sees <Ui>How did we do?</Ui> with a thumbs up and
          a thumbs down. It’s on the web page only; the PDF doesn’t carry it. It shows while{" "}
          <Ui>Ask How We Did First</Ui> is on (Settings › Company and Branding › Reminders and
          Reviews, on to start).
        </p>
        <Table
          head={["They tap", "What happens"]}
          rows={[
            [
              <Ui key="up">Thumbs up</Ui>,
              "“Thank you! We’re glad you’re happy.” Then Leave a Google Review, if your shop has a review link.",
            ],
            [
              <Ui key="down">Thumbs down</Ui>,
              "A box, What went wrong?, and Send. What they type goes to you privately as a complaint, and the page says “Thank you for telling us.” They aren’t asked for a review while the complaint is open.",
            ],
          ]}
        />
        <p>
          Complaints appear in Customer Feedback in the office (see Office). Each one also sends
          owners and admins a Customer complaint notification, once.
        </p>
      </Section>

      <Section kicker="The owner’s choice" title="Each visit, once a month, or not at all">
        <p>
          When reports go out is set once for the whole shop, in{" "}
          <strong>Settings › Report Templates</strong> (Chapter 4 covers the setting). Here is what
          each choice means on the route.
        </p>
        <Table
          head={["Send Visit Reports", "What the customer gets", "What the tech does"]}
          rows={[
            [
              "Each Visit, Send Automatically on",
              "A report minutes after every visit, by email or text.",
              "Nothing extra. Complete Job asks “Ready to send the visit report?” and Complete and Send sends it.",
            ],
            [
              "Each Visit, Send Automatically off",
              "A report after each visit, when the tech sends it.",
              "Taps Send Visit Report on the done visit.",
            ],
            [
              "Monthly",
              "One service report for the month, in the same email or text as the monthly invoice.",
              "Nothing. Can still send one visit’s report by hand.",
            ],
            ["Off", "No visit reports.", "Nothing."],
          ]}
        />
        <UseIt
          items={[
            {
              who: "Each Visit, automatic",
              text: "Customers who travel, rentals, and anyone who’s ever asked “did you come this week?” Every visit shows up as proof the same afternoon.",
            },
            {
              who: "Monthly",
              text: "Customers who want one email a month. The month’s readings and photos arrive with the bill, which answers “what am I paying for?” before they ask.",
            },
            {
              who: "By hand",
              text: "Shops that want a person to decide. Send one after a green-to-clean, a repair, or a visit worth showing.",
            },
          ]}
        />
      </Section>

      <Section kicker="On the visit" title="The visit report bar">
        <Spread
          figure={
            <Phone
              src="47-visit-report-bar"
              alt="A done maintenance visit: Job #1043, Done, Reopen Visit, the Details tab with the customer, pool and On Site fields, Quotes with No quote yet and Start Quote, and a bar at the bottom reading Ready to send with a Send Visit Report button."
              caption="A done visit in a shop that sends by hand: the bar at the bottom says Ready to send."
            />
          }
        >
          <p>
            On the phones, a maintenance visit has a bar along the bottom that says where its report
            stands. On a computer the same line sits on the visit page. One line of words, one
            button:
          </p>
          <ul>
            <li>
              “Sends by itself when you finish” before the visit is done, in shops that send
              automatically.
            </li>
            <li>
              “Ready to send” with <Ui>Send Visit Report</Ui> once it’s done, in shops that send by
              hand.
            </li>
            <li>
              “Not sent yet” with <Ui>Send Visit Report</Ui> when an automatic send couldn’t go, for
              example with no signal.
            </li>
            <li>
              “Needs a photo to send” with <Ui>Add Photo</Ui> when the shop has Require a Photo on
              and the visit has none.
            </li>
            <li>“Goes with the monthly invoice” in Monthly shops.</li>
            <li>
              “Visit report sent · 2:14 PM” with <Ui>View Report</Ui> once it has gone.
            </li>
          </ul>
        </Spread>
        <Browser
          src="visit-details"
          url="sundeckpro.com/jobs/5861"
          alt="A done maintenance visit on a computer: the Details tab with Customer, Pool, Assigned To, On Site and Timeline, Reopen Visit, and a bar reading Ready to send with Send Visit Report."
          caption="The same bar on the website: a done visit, Ready to send."
        />
      </Section>

      <Section kicker="By hand" title="Send a visit report">
        <Steps>
          <Step
            title={
              <>
                On a done visit, tap <Ui>Send Visit Report</Ui>.
              </>
            }
          >
            The customer’s email is already filled in. Change it if they asked you to send it
            somewhere else.
          </Step>
          <Step
            title={
              <>
                Tap <Ui>Send by Email</Ui> or <Ui>Send by Text</Ui>.
              </>
            }
          >
            Text goes from the shop’s number when you have one. Without one, the button reads{" "}
            <Ui>Get Link to Text</Ui> and gives you the link to send yourself.
          </Step>
          <Step title="Check the line under the buttons.">
            It says when it was sent, and each version sent is listed with a <Ui>View</Ui> link.
          </Step>
        </Steps>
        <Tip title="Send it again, safely">
          After a send the button becomes <Ui>Send Again by Email</Ui>. A second tap within a couple
          of minutes to the same address is treated as the same send, so a customer never gets the
          report twice because the signal stuttered.
        </Tip>
        <Watch title="Sending needs a signal">
          The visit itself is saved offline, but the report goes out by email or text, which needs
          the internet. In an automatic shop, a visit completed in a dead zone shows “Not sent yet”
          until you can send it.
        </Watch>
      </Section>

      <FromTheField title="Thursday, 4:20 p.m.">
        A property manager calls the shop: the tenant at one of her rentals swears the pool hasn’t
        been serviced in weeks. Dana opens that morning’s visit, taps <Ui>View Report</Ui>, and
        sends the link to the manager while she’s still on the phone: today’s readings, the photo,
        “Serviced by Tony.” The call ends there.
      </FromTheField>

      <Section kicker="Once a month" title="The monthly service report">
        <p>
          In a Monthly shop, the visits pile up quietly all month. When the month’s invoice is sent,
          the customer gets one email or text with two links: the invoice, and the{" "}
          <strong>October Service Report</strong>.
        </p>
        <Flow
          stages={[
            { title: "Each visit", text: "Recorded as usual. Nothing goes out." },
            { title: "Invoice day", text: "The month’s invoice is drafted from the visits." },
            { title: "Send", text: "Invoice and service report go out together." },
            { title: "Frozen", text: "The report is fixed as of that send." },
          ]}
        />
        <p>
          The service report opens with a line like “Your water was in range at 3 of 4 tests,” a
          photo, and tiles for the month: visits, chemicals, photos. Then{" "}
          <strong>Chemicals This Month</strong>, a <Ui>View October Invoice</Ui> button, and every
          visit, newest first: the day, the tech, the readings as pills, what was added, what was
          done, notes and photos. Long months fold behind <Ui>Show 2 More Visits</Ui>. The invoice
          page links back to the report.
        </p>
        <Note title="No invoice this month?">
          A customer with visits but no invoice that month (a paused plan, a prepaid season) still
          gets the service report, by itself, on the 1st.
        </Note>
      </Section>

      <PullQuote>
        The invoice says what they owe. The report beside it says what they got.
      </PullQuote>

      <WhyItMatters>
        Most weekly customers never see their tech. Without a report, the only sign of the work is a
        bill once a month and the water looking fine, until it doesn’t. With one, every visit leaves
        proof: the readings, the acid that went in, the filter that got cleaned, and a photo.
        Questions about a bill get answered with a link instead of a phone call, and the customer
        who reads “Clean filter, Nov 4” on the invoice has already seen the photo of it.
      </WhyItMatters>
    </>
  ),
};
