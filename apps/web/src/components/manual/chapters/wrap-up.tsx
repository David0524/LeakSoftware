import type { ChapterDef } from "../types";
import {
  Browser,
  FromTheField,
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
  Gallery,
} from "../kit";

export const wrapUp: ChapterDef = {
  id: "wrap-up",
  title: "Wrap-Up",
  moment: "Wednesday · 11:20 a.m.",
  lede: "The leak is found. Before Dana leaves the driveway, the job becomes a report Maria has read and signed, a quote for the fix, and an invoice for the detection. One tab holds all of it, in order.",
  learn: [
    "Read the finish list and know what’s left",
    "Write the report from what you recorded",
    "Have the homeowner read and sign it",
    "Turn findings into a quote, with a deposit",
    "Invoice the detection and send it all",
    "Why a sent report never changes",
  ],
  Body: () => (
    <>
      <Scene time="Wednesday, 11:20 a.m.">
        <p>
          The skimmer line dropped 8 PSI in 15 minutes. Dana has the seam pinned on the diagram, two
          photos of the throat with a red circle on the crack, and a finding marked Major.
        </p>
        <p>
          Maria is on the patio with a glass of iced tea she hasn’t touched. She’s been watching the
          water line for three weeks. What she wants now is simple: what’s wrong, what it costs, and
          when it stops.
        </p>
        <p>
          Dana taps <Ui>Wrap-Up</Ui>.
        </p>
      </Scene>

      <Section kicker="The finish list" title="One list, in the order you finish">
        <Meta who={["Owner", "Admin", "Tech"]} where={["iPhone", "Android", "Website"]} />
        <Spread
          figure={
            <Phone
              src="16-report"
              alt="The Wrap-Up tab on Maria Alvarez’s job: “Maria Alvarez · 1 of 3 done”, rows for Report (green check, Draft ready · 1 finding, 1 test), Customer signs (blue 2, Not yet) and Invoice (gray 3, Not started), and a + New Quote link."
              caption="Green is done, blue is next, gray is later. The list says what’s left before you have to think about it."
            />
          }
        >
          <p>
            <Ui>Wrap-Up</Ui> is the last of the job’s five tabs. It’s one short list with a row per
            step: <Ui>Report</Ui>, a row for each <Ui>Quote</Ui>, <Ui>Customer signs</Ui>, and{" "}
            <Ui>Invoice</Ui>. Above it, a line like “Maria Alvarez · 1 of 3 done” counts what’s
            finished. “All done” means you can drive away.
          </p>
          <p>
            Each row has a round marker: a green check for done, a blue number for the next step, a
            gray ring for later. Under the title, the row’s state in plain words, and for quotes and
            invoices the amount.
          </p>
          <p>
            Tap a row and its editor opens in a sheet. On a computer it opens in a panel beside the
            list, so the list stays in view. Close the sheet and the list has already caught up.
          </p>
        </Spread>
        <Sub>The wrap-up bar</Sub>
        <p>
          On a phone, a bar sits above the tab bar with one filled blue button: the next step.
          Before there’s a report it reads <Ui>Write the Draft</Ui>; then{" "}
          <Ui>Review with Customer</Ui>, <Ui>Send Quote</Ui>, or <Ui>Send Invoice</Ui>, whichever
          comes next. When everything is done, the button goes away. You can finish a whole job by
          pressing the blue button until there isn’t one.
        </p>
        <Browser
          src="leak-wrapup"
          url="sundeckpro.com/jobs"
          alt="A leak detection job’s Wrap-Up on a computer: “Ruth Duran · 2 of 3 done”, Report Sent · version 1, Customer signs Not signed: customer not present, Invoice Not started, a + New Quote link and a Send Invoice button; on the right, the Invoice panel with “Bills the detection fee of $375.00. You can add lines before sending.” and Create Invoice."
          caption="On a computer the list stays on the left and the step you open sits beside it. Here the next step is the invoice."
        />
      </Section>

      <Section kicker="Step 1" title="The report writes itself from the deck">
        <Spread
          flip
          figure={
            <Phone
              src="20-wrap-up-report"
              alt="The Report sheet: an intro line about Write Draft, the Homeowner report card with a Write the Draft Again button, a Report Text row that folds open, and “Draft version 1.”"
              caption="The draft is built from the checklist, the tests and the findings. Read it, change what you like, send."
            />
          }
        >
          <Steps>
            <Step
              title={
                <>
                  Tap <Ui>Write the Draft</Ui>
                </>
              }
            >
              Or open the <Ui>Report</Ui> row and tap <Ui>Write Draft</Ui>. A few seconds later the
              report is there.
            </Step>
            <Step
              title={
                <>
                  Open <Ui>Report Text</Ui> and read it
                </>
              }
            >
              Three sections: <Ui>Summary</Ui>, <Ui>What we found</Ui> and{" "}
              <Ui>What happens next</Ui>. Each one is yours to edit, and saves as you type.
            </Step>
            <Step title="Fix anything it flags">
              Under “Check these before sending:” the report lists what doesn’t add up, such as a
              Major or Critical finding the text never mentions.
            </Step>
          </Steps>
          <p>
            The draft doesn’t guess. Every sentence comes from something recorded on the job: “We
            found one leak, at the skimmer seam. The other items we checked are not leaking.” The
            checklist, every test with its numbers, the findings with their pins, and the photos
            with their markup are added to the report on their own. The text is the part you talk
            through.
          </p>
        </Spread>
        <Tip title="Your own words, saved">
          If you write the same “No leak found” report every week, save it once as a saved report
          (Chapter 2). On a draft, <Ui>Use Saved Report</Ui> drops it in word for word.
        </Tip>
        <Watch title="Writing it again starts over">
          <Ui>Write the Draft Again</Ui> replaces the text, your edits included. The app asks first.
          If you’ve only added a test, edit the sentence instead.
        </Watch>
      </Section>

      <Section kicker="Step 2" title="What’s missing">
        <p>
          Before anyone signs, Sundeck Pro checks the job the way a careful lead tech would. Dana
          taps <Ui>Review with Customer</Ui>, and the phone tells her she isn’t ready: “13 checklist
          items are still to do. Finish the checklist, then come back to sign.”
        </p>
        <Gallery caption="Left: the report as Maria will read it. Right: what stops the signature until the checklist is done.">
          <Phone
            src="17-review"
            alt="Review and Sign: the Leak Detection Report for Maria Alvarez at 1423 Palm Ct, Mesa, with What We Found, Findings (1. Skimmer seam leak, Major), Next Steps, What we checked (10 not leaking, 1 attention, 1 leaking, 13 still to do), and Tests we ran (Pressure test, Skimmer seam, Dropped 8 PSI in 15 min, Fail). Below, an amber note that 13 checklist items are still to do and a Go to Checklist button."
            full
          />
          <Phone
            src="20-wrap-up-sign"
            alt="The Customer Signs sheet: “Hand the phone to the customer to read and sign. Signing locks this version.”, a Review with Customer button, and Signatures: None yet."
          />
        </Gallery>
        <p>
          <Ui>Go to Checklist</Ui> takes her straight there. The rest of the plumbing section held,
          so under it she taps <Ui>Mark N Remaining Not Leaking</Ui> (the button counts them for
          her), and the Autofill EQ line, buried under the deck, gets <Ui>N/A</Ui> with the reason
          “Area not accessible.” Thirty seconds, and the report now says what was checked and what
          wasn’t, and why.
        </p>
        <Note title="Why the app insists">
          A report that leaves items blank can’t tell anyone later whether they were checked. That’s
          why a leak detection report can’t be signed with items still to do. (A pool inspection
          can: its form is long, and some questions don’t apply.)
        </Note>
      </Section>

      <Section kicker="Step 3" title="Hand her the phone">
        <Meta who={["Customer"]} where={["iPhone", "Android", "Website"]} />
        <p>
          The second time, <Ui>Review with Customer</Ui> opens <Ui>Review and Sign</Ui>. At the top:
          “Please read your report. Sign at the bottom to confirm the visit.” Then the report
          itself, exactly as Maria will get it.
        </p>
        <Steps>
          <Step title="Give her the phone">
            Let her scroll. The pin on the diagram, the circled crack in the photo and the 8 PSI
            drop usually answer the questions before she asks them.
          </Step>
          <Step
            title={
              <>
                Under <Ui>Please Sign</Ui>, she types her name
              </>
            }
          >
            The statement above it reads like “I confirm Canyon State inspected the pool at 1423
            Palm Ct today and explained what they found.” <Ui>Role (optional)</Ui> is for a property
            manager or a renter.
          </Step>
          <Step
            title={
              <>
                She signs in the box, then taps <Ui>Sign</Ui>
              </>
            }
          >
            A finger is enough; on a computer, a mouse. The row now reads “Signed by Maria Alvarez,”
            and that version of the report is finished.
          </Step>
        </Steps>
        <Tip title="Nobody home">
          If the homeowner isn’t there, tap <Ui>Customer Not Here</Ui>. The report finishes without
          a signature and says so: “Not signed: customer not present.”
        </Tip>
        <Note title="Shops that don’t take signatures">
          If signatures are turned off for your shop, the page ends with a <Ui>Finish Report</Ui>{" "}
          button instead of a signature box, and the report is finished just the same.
        </Note>
      </Section>

      <FromTheField title="Read it with them">
        Dana reads the first two lines aloud and points at the pin. Homeowners who have seen the
        crack in the photo and the number on the test rarely argue with the quote that follows. The
        signature takes ten seconds; the conversation before it is where the repair is sold.
      </FromTheField>

      <Section kicker="Step 4" title="The quote, built from what she found">
        <Spread
          figure={
            <Phone
              src="20-wrap-up-quote"
              alt="The Quote sheet: Quote · Draft $600.00. Add From Findings lists Skimmer seam leak with a checked pill “Reseal skimmer throat · $450.00”. Lines: Reseal skimmer throat, 1 at $450.00, and Dive fee, 1 at $150.00, each with Remove. Below: Add from the price book, Custom line, Price, Add Line, Discount, totals, Send Quote and Customer Signs Now."
              caption="The finding suggests its own repair. One tap adds it at your price book price."
              full
            />
          }
        >
          <Steps>
            <Step
              title={
                <>
                  Tap <Ui>+ New Quote</Ui> under the list
                </>
              }
            >
              The <Ui>Quote</Ui> sheet opens on a draft.
            </Step>
            <Step
              title={
                <>
                  Under <Ui>Add From Findings</Ui>, tap the suggestion
                </>
              }
            >
              Each open finding shows the price book items that fit it. For the skimmer seam:
              “Reseal skimmer throat · $450.00.” Tap it and it’s a line, with a check on the pill.
            </Step>
            <Step title="Add anything else">
              <Ui>Add from the price book</Ui> for your standard items, or a <Ui>Custom line</Ui>{" "}
              with a <Ui>Price ($)</Ui> and <Ui>Add Line</Ui>. Dana adds her $150 dive fee.
            </Step>
            <Step
              title={
                <>
                  Check the totals and tap <Ui>Send Quote</Ui>
                </>
              }
            >
              Subtotal, discount, tax, total and the deposit, all worked out by your shop’s rules.
              Sending locks the prices and gives you a link for the customer.
            </Step>
          </Steps>
        </Spread>
        <Table
          head={["Setting", "Where", "What it does to the quote"]}
          rows={[
            [
              "Price book",
              <Path key="pb" items={["Settings", "Price Book"]} />,
              "Prices the suggestions and the menu. Change a price there, not on every quote.",
            ],
            [
              "Deposit",
              <Path key="dep" items={["Settings", "Payments and Deposits"]} />,
              "A percentage or a fixed amount, with a minimum. Canyon State asks 50%. New shops start with none.",
            ],
            [
              "Tax",
              <Path key="tax" items={["Settings", "Payments and Deposits"]} />,
              "Sales tax on taxable price book items, after any discount.",
            ],
            [
              "Tech discounts",
              <Path key="disc" items={["Settings", "Payments and Deposits"]} />,
              "The largest discount a tech can give. A bigger one is refused.",
            ],
          ]}
        />
        <UseIt
          items={[
            {
              who: "She says yes on the spot",
              text: (
                <>
                  On the iPhone and Android apps, <Ui>Customer Signs Now</Ui> lets the homeowner
                  accept the quote by signing on your phone, with or without signal.
                </>
              ),
            },
            {
              who: "Two ways to fix it",
              text: (
                <>
                  <Ui>+ New Quote</Ui> again for a second option: patch now, or rebuild the skimmer.
                  Each quote gets its own row and its own link.
                </>
              ),
            },
            {
              who: "Nothing found",
              text: "Skip the quote. The list counts only the steps the job has, so a dry pool is done after the report and the invoice.",
            },
          ]}
        />
      </Section>

      <Section kicker="Step 5" title="Invoice the detection">
        <Spread
          flip
          figure={
            <Phone
              src="20-wrap-up-invoice"
              alt="The Invoice sheet for draft #1025: a Leak detection line at $649.00, Add a Line, Discount, Due date with “Empty: due on receipt.”, Note to the customer, Customer email, Send by Email, Send Without Email, and Delete Draft."
              caption="The detection fee is already on it. Add a line if the job grew."
            />
          }
        >
          <p>
            The detection is its own sale, paid whether or not Maria books the repair. Open the{" "}
            <Ui>Invoice</Ui> row and tap <Ui>Create Invoice</Ui>: it “Bills the detection fee of
            $649.00. You can add lines before sending.”
          </p>
          <p>
            Leave <Ui>Due date</Ui> empty for due on receipt, add a <Ui>Note to the customer</Ui> if
            you like, and tap <Ui>Send by Email</Ui>. Sending locks the invoice.
          </p>
          <Note title="Who sends invoices">
            Owners and admins send, change and void invoices. Techs can record a payment on one, and
            finish everything else on the list.
          </Note>
        </Spread>
      </Section>

      <Section kicker="Step 6" title="Send">
        <p>
          The report is finished the moment Maria signs. Its row now says “Version 1 is finished ·
          Send it to the customer, or download the PDF.”
        </p>
        <Steps>
          <Step
            title={
              <>
                Open the <Ui>Report</Ui> row
              </>
            }
          >
            The <Ui>Customer email</Ui> is already filled in from her record.
          </Step>
          <Step
            title={
              <>
                Tap <Ui>Send by Email</Ui>
              </>
            }
          >
            She gets a short email from your shop with a link to the report and the PDF attached.
            Other emails on her record are copied.
          </Step>
          <Step
            title={
              <>
                Or tap <Ui>Send by Text</Ui>
              </>
            }
          >
            You get the message and the link, ready to paste into a text: “your leak detection
            report” and the link, under your shop’s name.
          </Step>
          <Step title="Send the quote’s link the same way">
            After <Ui>Send Quote</Ui>, the sheet shows the <Ui>Customer link</Ui>. Copy it into a
            text, or send it from <Ui>Messages</Ui> on your company number.
          </Step>
        </Steps>
        <Note title="What needs a signal">
          The checklist, tests, photos and the customer’s signature all work in a dead backyard.
          Writing the draft and sending need a connection. If the deck has no bars, sign on the deck
          and send from the truck.
        </Note>
        <Sub>The states, in words</Sub>
        <p>
          Every row says where it stands, so a glance at the list, or at the job from the office,
          answers “did that go out?”
        </p>
        <Table
          head={["Row", "What it can say"]}
          rows={[
            ["Report", "“Not written yet”, “Draft ready · 1 finding, 1 test”, “Sent · version 2”"],
            [
              "Quote",
              "“Draft · not sent”, “Sent · waiting”, “Accepted”, “Accepted · deposit paid”, “Declined”, “Expired”",
            ],
            [
              "Customer signs",
              "“Not yet”, “Signed by Maria Alvarez”, “Not signed: customer not present”, “Sent without a signature”",
            ],
            [
              "Invoice",
              "“Not started”, “Draft · not sent”, “Sent · $649.00 due”, “Partly paid · $375.00 due”, “Paid”",
            ],
          ]}
        />
        <p>
          The job’s own status moves on its own as well: <Ui>Report sent</Ui>, <Ui>Quote sent</Ui>,{" "}
          <Ui>Quote accepted</Ui>, <Ui>Invoiced</Ui>, <Ui>Paid</Ui>. Nobody has to remember to
          change it.
        </p>
      </Section>

      <Scene time="11:45 a.m.">
        <p>
          Two and a half hours after the gate code, Dana backs out of the driveway. Maria has a
          signed report in her inbox, a quote in her texts and a bill for the detection. The job on
          Dana’s screen reads “All done.”
        </p>
      </Scene>

      <Section kicker="Locked on purpose" title="A sent report never changes">
        <p>
          Once a version is sent, nobody can edit it: not Dana, not an admin, not Sundeck Pro. The
          database refuses. If something needs fixing, you change the job and send again. That
          becomes version 2, and the old link shows “This report was updated” with a way to the new
          one. Version 1 stays exactly as Maria saw it.
        </p>
        <p>
          The same goes for what the report is made of. It’s built from a snapshot of the job at the
          moment it was sent: the checklist, the tests, the findings, the photos, the signature,
          even your logo and terms. Change your price book or your branding next year, and Maria’s
          report still shows what it showed. Original photos are kept untouched; the red circle is
          drawn on top, never into the picture. Each photo carries the time it was taken, where (if
          the phone allowed it) and a fingerprint of the file.
        </p>
        <PullQuote>What you sent is what you can show. Word for word, years later.</PullQuote>
        <WhyItMatters
          figures={[
            { value: "1", label: "version the customer signed, kept as signed" },
            { value: "0", label: "ways to edit a sent report" },
          ]}
        >
          Leaks come back, and memories change. Two summers from now a homeowner may say nobody
          mentioned the cleaner line. You open version 1: the cleaner lines marked N/A, “Customer
          declined,” her signature under it, the date, and photos with their time stamps. You don’t
          have to argue that the report wasn’t edited afterward, because it can’t have been. That’s
          the difference between a shop’s word and a shop’s record.
        </WhyItMatters>
      </Section>
    </>
  ),
};
