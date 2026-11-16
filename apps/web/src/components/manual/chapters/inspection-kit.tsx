import type { ChapterDef } from "../types";
import {
  FromTheField,
  Meta,
  Note,
  Path,
  Phone,
  Scene,
  Section,
  Spread,
  Sub,
  Table,
  Tip,
  Ui,
  UseIt,
  Watch,
  WhyItMatters,
  Browser,
} from "../kit";

export const inspectionKit: ChapterDef = {
  id: "inspection-kit",
  title: "Your inspection kit",
  subtitle: "checklist components, tests, severities and the price book",
  moment: "Sunday · 9:40 p.m.",
  lede: "Before the first detection, Dana teaches Sundeck Pro how Canyon State works: the items on the checklist, the tests in the truck, how bad “bad” is, and what the shop charges to fix it.",
  learn: [
    "Edit the checklist components and where each is checked",
    "Set what counts as a pass or fail on a test",
    "Name your severities and your reasons for leaving something out",
    "Save report wording, then set the price book, deposit and tax",
  ],
  Body: () => (
    <>
      <Scene time="Sunday, 9:40 p.m.">
        <p>
          Dana has done this inspection a thousand times, and every time she’s done it from memory:
          skimmer, returns, main drain, light niche, then the equipment pad. Tomorrow Jake rides
          along, and soon he’ll run detections of his own. She wants him to walk the same path she
          does.
        </p>
        <p>
          She opens Settings. Under <Ui>Checklists and reports</Ui> is the whole kit, five pages she
          can change without calling anyone. Everything on them is the shop’s own.
        </p>
      </Scene>

      <Spread
        flip
        figure={
          <Phone
            src="05-settings"
            alt="The Settings index: Your shop, Money, and Checklists and reports, each a list of pages."
            caption="Settings. The kit is the last group."
          />
        }
      >
        <p>
          Every page in <Ui>Checklists and reports</Ui> is a list of rows the shop owns:{" "}
          <Ui>Checklist Components</Ui>, <Ui>Test Types</Ui>, <Ui>Severities</Ui>,{" "}
          <Ui>Exclusion Reasons</Ui> and <Ui>Report Templates</Ui>. Prices are under <Ui>Money</Ui>.
          Owners and admins can open all of it, on the website and in the apps.
        </p>
      </Spread>

      <Section kicker="The checklist" title="Components: what gets looked at">
        <Meta who={["Owner", "Admin"]} where={["Website", "iPhone", "Android"]} />
        <Spread
          figure={
            <Phone
              src="49-settings-components"
              alt="Checklist Components with tabs for Pool Visits, Leak Inspections and Pool Inspections, and rows such as Skimmer seam and Returns with their inspection methods."
              caption="Checklist Components. A segmented control switches between lists."
            />
          }
        >
          <p>
            <Path items={["Settings", "Checklist Components"]} /> holds <Ui>Leak Inspections</Ui>,
            the list a detection job is built from. A note on the page says changes apply to new
            jobs only, so a job in progress never changes under a tech.
          </p>
          <p>
            Each component has a <Ui>Name</Ui>, a <Ui>Section</Ui> (Visual, Plumbing, Bond beam or
            Other), what it <Ui>Applies to</Ui>, a <Ui>Starting count</Ui>, an <Ui>Order</Ui>, and
            its <Ui>Inspection methods</Ui>, a comma list such as “Pressure test, Dye test, Visual”.{" "}
            <Ui>Techs can add more than one</Ui> is for items that repeat, like returns or skimmers.
          </p>
        </Spread>
        <p>
          The starting list is the one Dana already walks: skimmer, returns, main drain, light,
          shell, steps and benches, spa and equipment pad. She adds one she’s always wanted: a
          component for the autofill line. If a component isn’t needed, turn it off; its row shows
          “Off”.
        </p>
        <Note title="Built from the pool">
          A job’s list is made when the job is made, from the pool itself. Spa items only appear if
          the pool has a spa, and vinyl items only for vinyl or when the type is unknown.
        </Note>
      </Section>

      <Section kicker="The tests" title="Test types: what a pass looks like">
        <Meta who={["Owner", "Admin"]} where={["Website", "iPhone", "Android"]} />
        <p>
          <Path items={["Settings", "Test Types"]} /> lists the tests a tech can record. Four come
          with the shop: <Ui>Pressure test</Ui>, <Ui>Dye test</Ui>,{" "}
          <Ui>Bucket / evaporation test</Ui> and <Ui>Listening / electronic detection</Ui>.
        </p>
        <Spread
          flip
          figure={
            <Phone
              src="13-test-editor"
              alt="The Edit Pressure test sheet: item Skimmer seam, line Skimmer, start 20 PSI, end 12 PSI, 15 minutes, a calculated line reading Dropped 8 PSI in 15 min, and the result Fail."
              caption="What the tech sees: the numbers go in, and the calculation says what it means."
            />
          }
        >
          <p>
            Two of them have calculators, and the calculator’s numbers belong to the shop. For the
            pressure test, <Ui>Largest drop that still passes (PSI)</Ui> starts at 0, meaning the
            line must hold steady, and <Ui>Shortest test that counts (minutes)</Ui> is where shorter
            tests become unclear. The bucket test has <Ui>Fail above this loss per day (inches)</Ui>
            .
          </p>
          <p>
            The tech still decides. The calculation is a suggestion that waits in the{" "}
            <Ui>Result</Ui> menu, as <Ui>Use the calculation</Ui>.
          </p>
        </Spread>
        <p>
          A test type is a list of <Ui>Fields</Ui> (one per line; add a unit in parentheses for a
          measurement, a colon for notes, or choices separated by slashes, and end with an asterisk
          if it’s required), the <Ui>Outcomes offered</Ui> (Pass, Fail, Unclear) and a switch,{" "}
          <Ui>Techs can record this test</Ui>. <Ui>Add Test Type</Ui> makes a new one, such as a
          hydrostatic check you run.
        </p>
        <Browser
          src="settings-tests"
          url="sundeckpro.com/settings/tests"
          alt="The website’s Test Types page: Pressure test and Bucket / evaporation test, each marked Calculates the result, then Dye test and Listening / electronic detection, and an Add Test Type button."
          caption="Test Types: the four tests that come with the shop. Two of them calculate the result."
        />
        <Tip title="Held and dropped come from the numbers">
          There’s no setting called “held”. A test row reads “Held at 20 PSI in 15 min” when nothing
          dropped and “Dropped 8 PSI in 15 min” when something did, from the readings alone.
        </Tip>
      </Section>

      <Section kicker="Naming the bad" title="Severities and exclusion reasons">
        <Sub>Severities</Sub>
        <p>
          <Path items={["Settings", "Severities"]} /> starts with four: <Ui>Minor</Ui>,{" "}
          <Ui>Moderate</Ui>, <Ui>Major</Ui> and <Ui>Critical</Ui>. Each has a <Ui>Pin color</Ui>, a
          switch for <Ui>Must appear in the report summary</Ui> (Major and Critical always do) and a
          switch for whether techs can pick it. The colors are the ones a homeowner sees on the pool
          diagram.
        </p>
        <Browser
          src="settings-severities"
          url="sundeckpro.com/settings/severities"
          alt="The website’s Severities page: Minor, Moderate, Major and Critical, each with its pin color, the last three marked Always in the report summary, and an Add Severity button."
          caption="Severities: the four that start the list, each with the color of its pin."
        />
        <Sub>Exclusion reasons</Sub>
        <p>
          When a component isn’t checked, the report should say why.{" "}
          <Path items={["Settings", "Exclusion Reasons"]} /> offers: <em>No diver on site</em>,{" "}
          <em>Area not accessible</em>, <em>Customer declined</em>,{" "}
          <em>Equipment off or not working</em> and <em>Not part of this job</em>. Add your own,
          such as “Equipment locked”, with <Ui>Add Reason</Ui>.
        </p>
        <FromTheField title="Why the reasons matter later">
          A homeowner calls in March: “You checked my pool, and the leak is still there.” The report
          says the main drain wasn’t inspected because the customer declined a diver. That one line,
          on a report that was sent and can’t be changed, settles it.
        </FromTheField>
      </Section>

      <Section kicker="Your wording" title="Report templates">
        <Meta who={["Owner", "Admin"]} where={["Website", "iPhone", "Android"]} />
        <p>
          <Path items={["Settings", "Report Templates"]} /> has a <Ui>Homeowner report</Ui> row with
          a switch, <Ui>Techs can send this report</Ui>, and a group called <Ui>Saved reports</Ui>.
          The homeowner report is in plain words: what was found, what it means, and what to do
          next.
        </p>
        <Spread
          figure={
            <Phone
              src="69-saved-report-new"
              alt="The Add Saved Report sheet: Name, Summary, What we found, What happens next, each with the hint to leave empty to keep the draft’s own text."
              caption="A saved report: your own wording, section by section."
            />
          }
        >
          <p>
            <Ui>Add Saved Report</Ui> makes wording you can reuse. Give it a <Ui>Name</Ui>, like “No
            leak found”, and text for <Ui>Summary</Ui>, <Ui>What we found</Ui> and{" "}
            <Ui>What happens next</Ui>. Sections you leave empty keep the draft’s own text.
          </p>
          <p>
            On a report draft, <Ui>Use Saved Report</Ui> puts your wording in word for word.
          </p>
        </Spread>
        <Note title="Not AI">
          <Ui>Write Draft</Ui> fills a plain draft from the checklist, the tests and the findings.
          Saved reports are text you wrote, pasted in by a tech. The tech reads and edits the report
          before it goes.
        </Note>
      </Section>

      <Scene time="10:15 p.m.">
        <p>
          The last page is the one with the numbers on it. Dana pulls up the invoices from March and
          April and types prices into the shop’s own list, one at a time.
        </p>
      </Scene>

      <Section kicker="The money" title="Price book, deposits and tax">
        <Meta who={["Owner", "Admin"]} where={["Website", "iPhone", "Android"]} />
        <p>
          <Path items={["Settings", "Price Book"]} /> for a leak detection shop is “Detection fees
          and repairs for quotes”. The same list fills the quote’s <Ui>Add From Findings</Ui>{" "}
          suggestions and the repair menu, so nobody types a price twice. An item has a{" "}
          <Ui>Name</Ui>, <Ui>Price ($)</Ui>, <Ui>Unit</Ui>, <Ui>Category</Ui>, a{" "}
          <Ui>Suggest for</Ui> (any finding, or one checklist component) and a <Ui>Description</Ui>{" "}
          that shows on quotes.
        </p>
        <Browser
          src="settings-price-book"
          url="sundeckpro.com/settings/price-book"
          alt="The website’s Price Book: a Charge for Chemicals switch, then groups for Detection (Leak detection - pool $375.00, Leak detection - pool and spa $450.00), Service, Inspection and Repair, with a price on each row and an Add Item button."
          caption="The Price Book, grouped by category: Detection first, then Repair items for quotes."
        />
        <Table
          head={["Item", "Starting price", "Why it’s there"]}
          rows={[
            ["Leak detection - pool", "$375.00", "The detection fee."],
            ["Leak detection - pool and spa", "$450.00", "The same, with a spa."],
            [
              "Repair underground pressure line (per break)",
              "$1,250.00",
              "A repair suggested from a finding.",
            ],
            ["Skimmer throat repair", "$225.00", "Suggested for a skimmer finding."],
          ]}
        />
        <p>
          These are starting values; change every one. Dana’s fee for a pool with a spa is $649.{" "}
          <Ui>Suggest for</Ui> is what lets a finding offer its own repair: a skimmer finding
          suggests the skimmer repair as a pill, and a tap puts it on the quote.
        </p>
        <Sub>Deposits and tax</Sub>
        <p>
          On <Path items={["Settings", "Payments and Deposits"]} />, under{" "}
          <Ui>Deposits, tax, and discounts</Ui>, you set a <Ui>Deposit on accepted quotes</Ui> as a{" "}
          <Ui>Percentage of the quote</Ui> or a <Ui>Fixed amount</Ui>, with a{" "}
          <Ui>Minimum deposit ($)</Ui>, a <Ui>Sales tax rate (%)</Ui> that applies to taxable items,
          and the <Ui>Largest discount a tech can give (%)</Ui>. With no deposit set, there’s none.
        </p>
        <Watch title="Connect Stripe to take payments online">
          Deposits and invoices are paid through your own Stripe account, connected on that same
          page by the owner. Until then, customers can still accept a quote, but they can’t pay
          online.
        </Watch>
        <UseIt
          title="Dana’s choices"
          items={[
            {
              who: "A deposit on every repair",
              text: "Half the quote, 50%, so the customer who accepts has put money behind the job before anyone orders parts.",
            },
            {
              who: "A discount ceiling for techs",
              text: "Jake can take a little off on site. A discount over the limit you set is refused.",
            },
          ]}
        />
      </Section>

      <WhyItMatters title="Why it’s worth an evening">
        Two techs given the same list produce the same report. A test that dropped is a fail because
        the shop said so, not because one tech felt it was. And a finding has a price waiting before
        the homeowner’s even closed the report.
      </WhyItMatters>
    </>
  ),
};
