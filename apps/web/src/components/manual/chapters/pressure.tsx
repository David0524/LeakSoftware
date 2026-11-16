import type { ChapterDef } from "../types";
import {
  BigFigure,
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
  FromTheField,
  Browser,
} from "../kit";

export const pressure: ChapterDef = {
  id: "pressure",
  title: "Under pressure",
  subtitle: "tests and exclusions",
  moment: "Wednesday · 10:05 a.m.",
  lede: "Seeing a crack isn’t proof that it leaks. A line that held or dropped, a bucket that lost more than the pool, dye that pulled in: those are. Each test you record is a line of evidence with numbers on it, and every one goes in the report.",
  learn: [
    "Add a pressure, dye, bucket or listening test",
    "Read the live line: held, dropped, rose",
    "Decide the result: Pass, Fail or Unclear",
    "Leave an item out with a reason, and why that’s recorded",
  ],
  Body: () => (
    <>
      <Scene time="Wednesday, 10:05 a.m.">
        <p>
          Jake plugs the skimmer line at the pad and threads the test rig into the skimmer port. He
          brings it up to 20 PSI, closes the valve, and sets a timer for fifteen minutes. Dana uses
          the time to look over the spa.
        </p>
        <p>
          At 10:21 the needle reads 12. Jake doesn’t write it on his hand. He opens the Skimmer seam
          item on his phone and taps <Ui>Add Test</Ui>.
        </p>
      </Scene>

      <Section kicker="The test" title="Recording a pressure test">
        <Meta who={["Owner", "Admin", "Tech"]} where={["Website", "iPhone", "Android"]} />
        <p>
          Tests live on the job’s <Ui>Findings</Ui> tab, under <Ui>Tests</Ui>. You can add one three
          ways: <Ui>Add Test</Ui> on an item’s screen (it’s tied to that item for you),{" "}
          <Ui>Add Test</Ui> on the Findings tab, or the <Ui>Add Test</Ui> button in the bar at the
          bottom of a phone’s screen while you’re on Findings.
        </p>
        <Gallery caption="Left: a new pressure test before any numbers. Right: Jake’s test on the skimmer seam, with the live line and the result.">
          <Phone
            src="13-test-editor-new"
            size="sm"
            alt="The Add Test sheet: Test set to Pressure test, Item set to Whole job, empty fields for Line, Start pressure (PSI), End pressure (PSI) and Duration (min), Result reading Not decided, a Notes box, and an Add Test button."
            caption="Add Test, empty."
          />
          <Phone
            src="13-test-editor"
            size="sm"
            alt="The Edit Pressure test sheet: Item Skimmer seam, Line Skimmer, start 20 PSI, end 12 PSI, 15 minutes, the live line Dropped 8 PSI in 15 min, Result Fail, and Save Test."
            caption="Dropped 8 PSI in 15 min. Fail."
          />
        </Gallery>
        <Steps>
          <Step
            title={
              <>
                Pick the <Ui>Test</Ui>: <Ui>Pressure test</Ui>.
              </>
            }
          />
          <Step
            title={
              <>
                Pick the <Ui>Item (optional)</Ui>.
              </>
            }
          >
            <Ui>Whole job</Ui>, or the checklist item the test is about. From an item’s screen it’s
            already filled in.
          </Step>
          <Step title="Type what you measured.">
            <Ui>Line</Ui> (which line you put on the gauge), <Ui>Start pressure (PSI)</Ui>,{" "}
            <Ui>End pressure (PSI)</Ui>, <Ui>Duration (min)</Ui>.
          </Step>
          <Step title="Read the live line.">
            As you type, a line under the numbers says what they mean: “Held at 20 PSI in 15 min,”
            “Dropped 8 PSI in 15 min,” or “Rose 2 PSI.”
          </Step>
          <Step
            title={
              <>
                Set the <Ui>Result</Ui>.
              </>
            }
          >
            When the numbers decide it, the menu offers it first:{" "}
            <Ui>Use the calculation (Fail)</Ui>. Otherwise it reads <Ui>Not decided</Ui> until you
            choose.
          </Step>
          <Step
            title={
              <>
                Add <Ui>Notes (optional)</Ui> and tap <Ui>Add Test</Ui>.
              </>
            }
          />
        </Steps>
      </Section>

      <BigFigure
        value="20 → 12 PSI"
        label="Skimmer line, 15 minutes. Dropped 8 PSI: a fail, with the numbers to show for it."
      />

      <Section kicker="Pass, Fail, Unclear" title="The app suggests. The tech decides.">
        <p>
          The app does the arithmetic and offers a result. It never sets one behind your back. You
          know things the gauge doesn’t, like a plug that slipped or a sun-heated line, and the
          result on the report is the one you chose.
        </p>
        <Table
          head={["What the numbers show", "What the app suggests"]}
          rows={[
            ["No drop, held for 15 minutes or more", <Ui key="p">Pass</Ui>],
            ["Any drop", <Ui key="f">Fail</Ui>],
            ["Pressure rose", <Ui key="u1">Unclear</Ui>],
            ["Held, but for less than 15 minutes", <Ui key="u2">Unclear</Ui>],
          ]}
        />
        <Note title="Your thresholds">
          Fifteen minutes and no drop at all are where a new shop starts. Both are settings of the
          test type, in <Path items={["Settings", "Test Types"]} />, if your shop runs longer holds.
        </Note>
        <Watch title="Don’t stop the clock early">
          A line that held for ten minutes isn’t a pass; it’s <Ui>Unclear</Ui>, and the report will
          say so. If you call a test early, write why in Notes.
        </Watch>
      </Section>

      <Section kicker="The rest of the kit" title="Four kinds of test">
        <Table
          head={["Test", "What you enter", "What it tells you"]}
          rows={[
            [
              <Ui key="p">Pressure test</Ui>,
              "Line, start and end PSI, minutes.",
              "Held at, dropped, or rose.",
            ],
            [
              <Ui key="d">Dye test</Ui>,
              "Location; result No draw, Dye drawn in (leak) or Inconclusive; notes.",
              "Where water is leaving the shell.",
            ],
            [
              <Ui key="b">Bucket / evaporation test</Ui>,
              "Pool level start and end, bucket level start and end (inches), hours.",
              "“No loss beyond evaporation over 24 h,” or how much was lost beyond it, per day.",
            ],
            [
              <Ui key="l">Listening / electronic detection</Ui>,
              "Location; result Nothing detected, Leak sound detected or Inconclusive; notes.",
              "What the hydrophone or ground mic heard, and where.",
            ],
          ]}
        />
        <p>
          The bucket test does its own sums too: it suggests <Ui>Fail</Ui> when the pool lost more
          than a quarter inch per 24 hours beyond what the bucket lost. Like the pressure hold, that
          number is a setting.
        </p>
        <Spread
          figure={
            <Phone
              src="17-review-tests"
              alt="The Review and Sign screen for the Leak Detection Report: Maria Alvarez, 1423 Palm Ct, Mesa. Below the findings and what was checked, a Tests we ran list shows a Pressure test marked Fail and another marked Recorded."
              caption="On the report, every test gets its own line and outcome. Recorded means no result was chosen."
            />
          }
        >
          <Sub>Each test is a line of evidence</Sub>
          <p>
            On the job, each test is a row: its name, the item and the time, the live line, and a{" "}
            <Ui>Pass</Ui>, <Ui>Fail</Ui> or <Ui>Unclear</Ui> pill. On the report, the{" "}
            <strong>Tests we ran</strong> table lists every one, with where it was run and its
            outcome. A test with no result chosen shows as <Ui>Recorded</Ui>.
          </p>
          <p>
            Passing tests go in too. The lines that held are the reason you can tell Maria the
            plumbing is fine and only the skimmer needs work. They’re also the hours you spent in
            her yard, written down.
          </p>
          <Tip title="Test it, then test it again">
            Run a second test after a repair or a re-plug and add it as its own test. The report
            shows both, in order, so the before and after sit side by side.
          </Tip>
        </Spread>
      </Section>

      <Scene time="10:30 a.m.">
        <p>
          The return lines and the main drain line hold at 20 PSI for fifteen minutes each. Jake
          adds each one; three pills turn green.
        </p>
        <p>
          The cleaner line is another story. Its port was capped years ago under a planter the
          homeowner just had redone, and she’d rather it not be dug up today. Dana can’t check it,
          and she says so.
        </p>
      </Scene>

      <Section kicker="What you didn’t check" title="Excluded, with a reason">
        <Meta where={["iPhone", "Android"]} />
        <p>
          <Ui>N/A</Ui> means an item was left out of this inspection. It isn’t a pass and it isn’t a
          problem. On the report it carries a neutral gray <Ui>N/A</Ui> badge, it isn’t counted in{" "}
          <Ui>Items Pass</Ui>, and it’s listed with everything else under What we checked.
        </p>
        <Steps>
          <Step
            title={
              <>
                Tap <Ui>–</Ui> on the item, or choose <Ui>N/A</Ui> on its screen.
              </>
            }
          />
          <Step
            title={
              <>
                On the item’s screen, open <Ui>Why it was left out (optional)</Ui>.
              </>
            }
          />
          <Step title="Pick the reason.">
            A new shop starts with <em>No diver on site</em>, <em>Area not accessible</em>,{" "}
            <em>Customer declined</em>, <em>Equipment off or not working</em> and{" "}
            <em>Not part of this job</em>. You change the list in{" "}
            <Path items={["Settings", "Exclusion Reasons"]} />.
          </Step>
        </Steps>
        <p>
          Dana marks Cleaner lines <Ui>N/A</Ui>, reason <em>Customer declined</em>. When she writes
          the report, the draft includes a line for every item with a stated reason:{" "}
          <em>Not inspected: Cleaner lines (Customer declined).</em>
        </p>
        <Watch title="A reason is optional. Give one anyway.">
          N/A without a reason is allowed, and the item still shows as N/A. But only items with a
          reason are named in the “Not inspected” line. An exclusion with a reason reads as a
          decision; one without reads like something you forgot.
        </Watch>
        <Note title="On the website">
          The website shows the saved reason under the item. Picking the reason is done on the
          item’s screen in the iPhone and Android apps.
        </Note>
        <Browser
          src="settings-exclusions"
          url="sundeckpro.com/settings/exclusions"
          alt="The website’s Exclusion Reasons page: No diver on site, Area not accessible, Customer declined, Equipment off or not working and Not part of this job, and an Add Reason button."
          caption="Exclusion Reasons: the list techs pick from. Add Reason makes your own."
        />
      </Section>

      <UseIt
        items={[
          {
            who: "No diver today",
            text: "The main drain is twelve feet down. N/A, No diver on site, and the report tells the homeowner exactly what a second visit would add.",
          },
          {
            who: "Equipment off",
            text: "The pump is dead, so the return lines can’t run under flow. N/A, Equipment off or not working, and you’re not on the hook for what you couldn’t see.",
          },
          {
            who: "Insurance work",
            text: "An adjuster reads a report differently. A list of pressure holds, each with numbers, and every gap with its reason, answers their questions before they ask.",
          },
        ]}
      />

      <FromTheField title="Write the numbers as you read them">
        Enter the test at the gauge, not in the truck an hour later. The test row stamps the time,
        so the report shows the tests in the order you ran them, each one when it happened.
      </FromTheField>

      <WhyItMatters>
        A homeowner can argue with an opinion. She can’t argue with 20 PSI that fell to 12 in
        fifteen minutes. Every test is recorded the same way, with its numbers and its result, and
        every item you left out says why. When Maria shows the report to her husband, or a second
        company, or an insurer, it explains itself.
      </WhyItMatters>
    </>
  ),
};
