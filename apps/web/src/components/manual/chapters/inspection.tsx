import type { ChapterDef } from "../types";
import {
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

export const inspection: ChapterDef = {
  id: "inspection",
  title: "On the deck",
  subtitle: "the inspection checklist",
  moment: "Wednesday · 9:10 a.m.",
  lede: "A good detection starts with a walk-around: every fitting, every line, every seam, in the same order every time. The checklist keeps that order, takes one tap per item, and turns the walk into the part of the report that proves what you checked.",
  learn: [
    "Start the job and open the inspection checklist",
    "Answer an item with one tap: ✓, drop, ! or –",
    "Record where, how, and what you saw on an item",
    "Add an item the list doesn’t have, or remove one the pool doesn’t",
    "How the checklist becomes “What we checked” on the report",
  ],
  Body: () => (
    <>
      <Scene time="Wednesday, 9:10 a.m.">
        <p>
          The gate code works. The dog, a gray-muzzled lab, is inside behind the slider, as
          promised. Maria’s pool sits about four inches below the tile line, and the skimmer is
          gulping air between waves.
        </p>
        <p>
          Dana taps <Ui>Start Job</Ui> on the job page. The pill at the top turns to{" "}
          <Ui>In progress</Ui>, and back at the shop the job moves on the office’s screen a few
          seconds later. Jake heads for the equipment pad. Dana opens the <Ui>Checklist</Ui> tab.
        </p>
      </Scene>

      <Section kicker="The list" title="A checklist built for this pool">
        <Meta who={["Owner", "Admin", "Tech"]} where={["Website", "iPhone", "Android"]} />
        <p>
          Every leak job gets its checklist when the job is made, from your shop’s list of
          components and from the pool itself. Maria has a spa, so the spa jets, spa fill and spa
          bond beam are on it. Her pool is plaster, so the vinyl questions aren’t. Nobody had to
          think about it.
        </p>
        <p>The items come in sections that match the way a detection runs:</p>
        <Table
          head={["Section", "What’s in it"]}
          rows={[
            [
              "Visual Leak Inspection",
              "Equipment area, backwash, around the water feature, structural cracks, bond beam, and the vinyl questions on a vinyl pool.",
            ],
            [
              "Plumbing Static Test",
              "Returns, skimmer, skimmer seam, skimmer suction and ports, main drain, light niches and conduits, cleaner lines, side suctions, spa jets, spa fill, surge tank, scum gutters.",
            ],
            [
              "Bond Beam",
              "Pool, spa, autofill, around all fittings, the autofill EQ line, tile and grout.",
            ],
            ["Other", "Anything you type in that the list didn’t have."],
          ]}
        />
        <p>
          Each section folds. While it has items to do, it stays open; once it’s done it closes to a
          one-line summary, like <em>All clear</em> or <em>1 leaking · 1 attention</em>. The line
          under the <Ui>Checklist</Ui> title counts the whole job:{" "}
          <em>10 not leaking · 1 attention · 1 leaking · 13 to do</em>.
        </p>
        <Note title="Your list, not ours">
          These are the starting items. You change them for your shop in{" "}
          <Path items={["Settings", "Checklist Components"]} /> (Chapter 2), and the changes apply
          to new jobs. A job that’s already started keeps the list it began with.
        </Note>
      </Section>

      <Section kicker="One tap per item" title="✓, drop, !, –">
        <Spread
          figure={
            <Phone
              src="09-checklist"
              full
              alt="The Checklist tab of job #1042. Summary: 10 not leaking, 1 attention, 1 leaking, 13 to do. Visual Leak Inspection is folded with 1 attention. In Plumbing Static Test, Returns, Skimmer, Skimmer suction, Skimmer ports, Main drain and All light niches have green checks; Skimmer seam has a red drop and the note Seam at the skimmer throat. Below: Mark 8 Remaining Not Leaking, the Bond Beam section, and Add an item."
              caption="The whole list on one screen. Green checks so far, one red drop at the skimmer seam, and the rest still to do."
            />
          }
        >
          <p>
            On a phone, each item is one line: its name, four round buttons, and a <Ui>›</Ui>. One
            tap answers it. The button fills with its color, and the line under the name starts with
            the answer.
          </p>
          <Table
            head={["Button", "Means", "Color"]}
            rows={[
              ["✓", <Ui key="1">Not Leaking</Ui>, "Green"],
              ["Drop", <Ui key="2">Leaking</Ui>, "Red"],
              ["!", <Ui key="3">Attention</Ui>, "Amber"],
              ["–", <Ui key="4">N/A</Ui>, "Gray"],
            ]}
          />
          <p>
            Tap the chosen button again to put the item back to do. Touch and hold the line for a
            menu with every answer and <Ui>Not Done</Ui>. Swipe right to give the first answer.
          </p>
          <p>
            When you choose <Ui>Leaking</Ui> or <Ui>Attention</Ui>, a <Ui>Where</Ui> field opens
            under the item: “Where? Under the deck, at the throat…”. It saves by itself.
          </p>
          <Tip title="The name doesn’t open anything">
            Tapping an item’s name does nothing, on purpose: with wet hands it was too easy to open
            the wrong one. Use the <Ui>›</Ui> at the end of the line.
          </Tip>
        </Spread>
        <p>
          A few items are questions, not places. On a vinyl pool, “Any noticeable tears in vinyl?”
          is answered with the words <Ui>No</Ui>, <Ui>Yes</Ui>, <Ui>N/A</Ui>, and <Ui>No</Ui> is the
          good answer. Questions with a longer list of answers show a <Ui>Choose</Ui> pill that
          opens a menu.
        </p>
        <Sub>On a computer</Sub>
        <p>
          The website lays each item out with a full-width segmented control under its name:{" "}
          <Ui>Not Leaking | Leaking | Attention | N/A</Ui>. Choose again to clear. The row’s{" "}
          <Ui>⋯</Ui> button, or a right click, has the same menu as the phone.
        </p>
      </Section>

      <Section kicker="Clear the rest" title="Marking what’s left in one go">
        <p>
          At the bottom of each section with items to do there’s a link:{" "}
          <Ui>Mark 8 Remaining Not Leaking</Ui>. It’s for the end of a section, after you’ve looked
          at every item and found nothing more, not for skipping the walk.
        </p>
        <Watch title="Only mark what you checked">
          “Not leaking” goes in the report under the shop’s name. If a section has an item you
          didn’t get to, answer the ones you did one by one, and give the others an <Ui>N/A</Ui>{" "}
          with a reason (Chapter 8). That line is what protects you when a leak shows up next
          spring.
        </Watch>
      </Section>

      <Scene time="9:35 a.m.">
        <p>
          Jake has the equipment pad. The filter, the pump and the heater lines are dry, but there’s
          a white crust on a union by the pump, an old weep. He taps <Ui>!</Ui> on Equipment area
          and types “Calcium at the pump union, dry today” in Where.
        </p>
        <p>
          At the skimmer, Dana sees it with her own eyes: a hairline where the skimmer body meets
          the shell, right at the throat. She taps the red drop on <Ui>Skimmer seam</Ui>, types
          “Seam at the skimmer throat,” and opens the item.
        </p>
      </Scene>

      <Section kicker="One item, in full" title="The item screen">
        <Meta where={["iPhone", "Android"]} />
        <Spread
          flip
          figure={
            <Phone
              src="12-component"
              alt="The Skimmer seam item screen: Result set to Leaking; Where reads Seam at the skimmer throat; Method reads Not recorded; an empty Notes box; Save; then Photos and Notes tiles for Add Photo, Library, Add Video and Voice Note, and a marked-up photo thumbnail."
              caption="Skimmer seam, opened: the answer, where, how you found it, and everything attached to it."
            />
          }
        >
          <p>
            The <Ui>›</Ui> opens the item on its own screen. Everything about that one spot is here:
          </p>
          <Steps>
            <Step
              title={
                <>
                  <Ui>Result</Ui>: the same four answers as the list.
                </>
              }
            />
            <Step
              title={
                <>
                  <Ui>Where</Ui>: the exact spot, for Leaking and Attention.
                </>
              }
            />
            <Step
              title={
                <>
                  <Ui>Method</Ui>: how you know.
                </>
              }
            >
              Hydrophone, dye test, pressure test, visual, conduit check, or whatever your shop
              lists for that component. <Ui>Not recorded</Ui> until you pick.
            </Step>
            <Step
              title={
                <>
                  <Ui>Notes (optional)</Ui>: what you saw.
                </>
              }
            >
              It saves by itself a moment after you stop typing; <Ui>Save</Ui> is there if you want
              to be sure.
            </Step>
            <Step title="Photos, tests and findings for this item.">
              <Ui>Add Photo</Ui>, <Ui>Library</Ui>, <Ui>Add Video</Ui>, <Ui>Voice Note</Ui>, then{" "}
              <Ui>Add Test</Ui> and <Ui>Add Finding</Ui>. Anything added here is tied to the item
              without you choosing it.
            </Step>
          </Steps>
          <p>
            <Ui>Previous Item</Ui> and <Ui>Next Item</Ui> at the bottom walk the list without going
            back to it, the same order you’d walk the deck.
          </p>
        </Spread>
        <Note title="On the website">
          The website has no separate item screen. Where appears under the item on the checklist,
          and photos, tests and findings are added from their own tabs, with the item picked in the
          sheet.
        </Note>
        <Browser
          src="leak-checklist"
          url="sundeckpro.com/jobs/5983?tab=checklist"
          alt="A leak job’s Checklist tab on a computer: tabs for Details, Checklist, Findings, Photos and Wrap-Up; Checklist, 24 not leaking · 1 leaking, with groups Visual Leak Inspection, Plumbing Static Test (1 leaking), Bond Beam and Other; an Add an item menu and Type a New Item; and the Pool Diagram with Edit Pool Shape, Mark Up, Tests and Add Test."
          caption="The website’s Checklist tab: each group shows All clear or its leaking count. Open a group to answer its items. The pool diagram stays beside it."
        />
      </Section>

      <Section kicker="Pools are odd" title="Adding and removing items">
        <Spread
          figure={
            <Phone
              src="09-checklist-edit"
              size="sm"
              alt="The Checklist in edit mode: a red Remove button beside each item, Done at the top right, and the Add an item picker."
              caption="Edit shows a Remove button on every item."
            />
          }
        >
          <Sub>A second skimmer</Sub>
          <p>
            Some items can repeat: returns, skimmers, main drains, light niches. At the bottom of
            the checklist, <Ui>Add an item</Ui> lists them as “Another Skimmer” and so on, plus any
            item a pool like this could have that isn’t on the list. Choose one and tap <Ui>Add</Ui>
            .
          </p>
          <Sub>Something the list never thought of</Sub>
          <Steps>
            <Step
              title={
                <>
                  Open <Ui>Add an item</Ui> and choose <Ui>Type a New Item…</Ui>
                </>
              }
            >
              On the website it’s a <Ui>Type a New Item</Ui> link under Add an item.
            </Step>
            <Step
              title={
                <>
                  Type the <Ui>Item name</Ui>.
                </>
              }
            >
              Up to 80 characters: “Cracked deck drain,” “Fill line at the planter.”
            </Step>
            <Step
              title={
                <>
                  Tap <Ui>Add</Ui>.
                </>
              }
            >
              It goes in <Ui>Other</Ui> and is answered, reported and removed like any other item.
              It lives on this job only.
            </Step>
          </Steps>
          <Sub>Something the pool doesn’t have</Sub>
          <p>
            Tap <Ui>Edit</Ui> at the top right of the Checklist, then <Ui>Remove</Ui> beside the
            item; <Ui>Done</Ui> when you’re finished. A banner says <em>Item removed</em> with{" "}
            <Ui>Undo</Ui> for five seconds.
          </p>
        </Spread>
        <Tip title="Remove, or N/A?">
          Remove an item the pool simply doesn’t have: Maria has no surge tank and no scum gutters.
          Use <Ui>N/A</Ui> for something that exists but you couldn’t check, and say why. Removed
          items don’t appear on the report; N/A items do.
        </Tip>
      </Section>

      <Section kicker="Where it ends up" title="From walk-around to report">
        <p>
          Nothing on the checklist is typed twice. When Dana writes the report at Wrap-Up, the draft
          is built from what’s here:
        </p>
        <UseIt
          title="What the checklist becomes"
          items={[
            {
              who: "The summary tiles",
              text: (
                <>
                  <Ui>Items Pass</Ui>, <Ui>Need Attention</Ui> and <Ui>Leaking</Ui> at the top of
                  the report. Only Not Leaking counts as a pass.
                </>
              ),
            },
            {
              who: "What we checked",
              text: "Every item with its badge and its Where, so the homeowner sees the whole walk, not just the bad news.",
            },
            {
              who: "Leaks noted",
              text: "A short line naming every item marked Leaking.",
            },
            {
              who: "The first sentence",
              text: "A plain line the draft writes from the counts, like “We checked 24 of 26 items and did not find a leak.”",
            },
          ]}
        />
        <Watch title="Finish before the signature">
          A leak report can’t be signed with checklist items still to do. The sign-off screen says
          how many are left and offers <Ui>Go to Checklist</Ui>. Clear them before you hand the
          phone to the homeowner.
        </Watch>
        <FromTheField title="The same walk, every time">
          Shops that answer every item, every job, end up with reports that look alike from tech to
          tech: same order, same words. A homeowner comparing two companies sees one that checked
          twenty-six things and wrote them all down.
        </FromTheField>
      </Section>

      <WhyItMatters>
        A leak that turns up a year later starts a conversation: did you check that? With the
        checklist, the answer is on the report she signed: every item, what you found, where, and
        how you knew. A methodical walk-around stops being something you say you do and becomes
        something the homeowner can read.
      </WhyItMatters>
    </>
  ),
};
