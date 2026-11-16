import type { ChapterDef } from "../types";
import {
  Gallery,
  Legend,
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
  Browser,
} from "../kit";

export const pinning: ChapterDef = {
  id: "pinning",
  title: "Pinning it",
  subtitle: "the pool diagram, findings and photos",
  moment: "Wednesday · 10:50 a.m.",
  lede: "You know where the leak is. Now the homeowner, the repair tech and anyone who reads the report later need to know too: a drawing of her pool, a numbered pin on the spot, a finding that says how bad it is, and photos with an arrow on the crack.",
  learn: [
    "Draw the pool once: a shape, the spa, and landmarks like the skimmer and main drain",
    "Record a finding with a severity, a status and a pin",
    "Mark up the diagram and the photos",
    "Take photos, video and voice notes and attach them to the right spot",
  ],
  Body: () => (
    <>
      <Scene time="Wednesday, 10:50 a.m.">
        <p>
          Dana kneels at the skimmer with a dye syringe. She lets a thin thread of red out along the
          seam, an inch from the throat. It hangs for a second, then bends and slides into the
          hairline. She does it twice more. Same spot, same pull.
        </p>
        <p>
          She adds a dye test (<em>Dye drawn in (leak)</em>, at the skimmer throat), dries her hands
          on her shorts, and opens the <Ui>Findings</Ui> tab. Maria is watching from the patio. In
          ten minutes she’ll be looking at this screen too.
        </p>
      </Scene>

      <Section kicker="The drawing" title="Maria’s pool, drawn once">
        <Meta who={["Owner", "Admin", "Tech"]} where={["Website", "iPhone", "Android"]} />
        <p>
          At the top of Findings is the <Ui>Pool Diagram</Ui>. The shape belongs to the pool, not
          the job, so it’s drawn once per address. It shows the same way on Findings, in the pin
          picker, in Mark Up, and on the report, and the repair job next week opens with it already
          there.
        </p>
        <Spread
          figure={
            <Phone
              src="10-pool-shape"
              alt="The Pool Shape sheet: ten tiles in two rows, Rectangle, Oval, Kidney, L-shape, Roman, Grecian, Draw, Clear, Landmarks and Figure 8, with Figure 8 chosen; switches for Mirror (flip left to right) and Has a spa; a drawing of a figure-8 pool with a square spa; and Save Pool Shape."
              caption="Pool Shape: ten tiles, two switches, and the drawing they make."
            />
          }
        >
          <Steps>
            <Step
              title={
                <>
                  Tap <Ui>Edit Pool Shape</Ui> under the diagram.
                </>
              }
            >
              The <Ui>Pool Shape</Ui> sheet opens. If the shape was picked at New Job, it’s already
              drawn.
            </Step>
            <Step title="Tap the shape that matches.">
              <Ui>Rectangle</Ui>, <Ui>Oval</Ui>, <Ui>Kidney</Ui>, <Ui>L-shape</Ui>, <Ui>Roman</Ui>,{" "}
              <Ui>Grecian</Ui> or <Ui>Figure 8</Ui>. Tap the chosen tile again to clear it.
            </Step>
            <Step title="Face it the right way.">
              Turn on <Ui>Mirror (flip left to right)</Ui> if the deep end or the spa is on the
              other side. Draw it the way you see it from the house, and keep doing it that way.
            </Step>
            <Step
              title={
                <>
                  Turn on <Ui>Has a spa</Ui>, then place it.
                </>
              }
            >
              Drag the spa where it sits. Tap it to make it round or square. Pinch, or drag a
              corner, to size it.
            </Step>
            <Step
              title={
                <>
                  Tap <Ui>Save Pool Shape</Ui>.
                </>
              }
            />
          </Steps>
        </Spread>

        <Sub>A pool that isn’t on the menu</Sub>
        <p>
          Freeform pools are common in the valley. Tap <Ui>Draw</Ui>, choose <Ui>Line</Ui>,{" "}
          <Ui>Circle</Ui> or <Ui>Freeform</Ui>, and drag on the drawing. You can draw on top of a
          shape, a step bump on a Roman, say, or tap <Ui>Clear</Ui> and start from nothing. Lines
          snap straight when they’re close to level or plumb. <Ui>Undo</Ui> takes back the last
          stroke.
        </p>
        <Watch title="Clear means clear">
          The <Ui>Clear</Ui> tile asks first: “Clear the pool diagram?” It removes the shape, the
          spa, the drawing and the landmarks. Pins and markup stay where they are.
        </Watch>
      </Section>

      <Section kicker="Where things are" title="Landmarks: the skimmer, the drains, the pad">
        <p>
          A pin means more when the reader can see what it’s next to. Tap <Ui>Landmarks</Ui> and
          eleven small pictures appear:
        </p>
        <Table
          head={["Around the pool", "In the pool"]}
          rows={[
            ["Tree, Rock, Waterfall, Steps", "Skimmer, Main Drain, Light"],
            ["Equipment, House", "Return, Suction Line"],
          ]}
        />
        <Gallery caption="Left: pick a landmark, then tap the drawing where it goes. Right: a placed landmark, selected, with its handle and its X.">
          <Phone
            src="10-pool-shape-landmarks"
            size="sm"
            alt="Pool Shape with Landmarks chosen: chips for Tree, Rock, Waterfall, Steps, Equipment, House, Skimmer, Main Drain, Light, Return and Suction Line above the drawing, which shows a tree, a waterfall and the equipment pad around a figure-8 pool."
            caption="Eleven landmarks."
          />
          <Phone
            src="10-pool-shape-landmark-selected"
            size="sm"
            alt="Pool Shape with the waterfall landmark selected: a dashed box around it and a resize handle at its corner."
            caption="Selected: move, size, turn."
          />
          <Phone
            src="10-pool-shape-draw"
            size="sm"
            alt="Pool Shape with Draw chosen: Line, Circle and Freeform tools, Undo, the hint Drag on the drawing, and a freeform outline."
            caption="Draw your own outline."
          />
        </Gallery>
        <Steps>
          <Step title="Pick a landmark.">
            The sheet says “Tap the drawing to put the skimmer there.”
          </Step>
          <Step title="Tap the drawing where it is." />
          <Step title="Tap it again to select it, and adjust.">
            Drag to move it. Pinch, or drag the corner handle, to size it. Tap the selected one to
            turn it a quarter turn (skimmer, return, suction line, steps, waterfall) or to flip it
            (tree, rock, equipment, house, main drain, light). The <Ui>X</Ui> at its corner removes
            it.
          </Step>
        </Steps>
        <Tip title="Draw the plumbing you tested">
          Put a <Ui>Skimmer</Ui>, the <Ui>Main Drain</Ui> and each <Ui>Return</Ui> where they really
          are, and a <Ui>Suction Line</Ui> toward the pad. When the report says the skimmer line
          dropped 8 PSI, the reader can see which line that is.
        </Tip>
      </Section>

      <Section kicker="The finding" title="Naming the leak">
        <Spread
          flip
          figure={
            <Phone
              src="14-finding-editor"
              alt="The Edit Finding sheet: What reads Skimmer seam leak; Severity Major; Item Skimmer seam; Where Skimmer throat; Status segmented Open, Quoted, Repaired, Monitor with Open chosen; Pin on the diagram with a red pin at the top left of a figure-8 pool; Pin placed and Clear Pin; Notes; Photos and Notes tiles; Delete Finding; and Save Finding."
              caption="One finding: what, how bad, which item, exactly where, and a pin."
            />
          }
        >
          <p>
            A checklist item says <em>leaking</em>. A finding says what’s wrong, how serious it is,
            and where to dig. It’s what the quote is built from, and what the homeowner reads first.
          </p>
          <Steps>
            <Step
              title={
                <>
                  Tap <Ui>Add Finding</Ui>.
                </>
              }
            >
              On a phone it’s in the bar at the bottom of Findings. On an item’s screen, the finding
              is tied to the item for you.
            </Step>
            <Step
              title={
                <>
                  Write <Ui>What</Ui>.
                </>
              }
            >
              Short and specific: “Skimmer seam leak,” “Return 3 line break.”
            </Step>
            <Step
              title={
                <>
                  Choose the <Ui>Severity</Ui>.
                </>
              }
            />
            <Step
              title={
                <>
                  Check the <Ui>Item (optional)</Ui> and type <Ui>Where (optional)</Ui>.
                </>
              }
            >
              “Skimmer throat.” “Two feet left of the skimmer.”
            </Step>
            <Step
              title={
                <>
                  Leave <Ui>Status</Ui> on <Ui>Open</Ui>.
                </>
              }
            >
              Change it to <Ui>Quoted</Ui>, <Ui>Repaired</Ui> or <Ui>Monitor</Ui> as the work moves
              on.
            </Step>
            <Step
              title={
                <>
                  Under <Ui>Pin on the diagram (optional)</Ui>, tap where the leak is.
                </>
              }
            >
              The sheet says <Ui>Pin placed.</Ui> Tap elsewhere to move it, or <Ui>Clear Pin</Ui>.
            </Step>
            <Step
              title={
                <>
                  Tap <Ui>Add Finding</Ui>.
                </>
              }
            />
          </Steps>
        </Spread>

        <Sub>Severity</Sub>
        <Table
          head={["Severity", "Use it for", "In the report draft"]}
          rows={[
            ["Minor", "Worth knowing; no water lost to speak of.", "Listed"],
            ["Moderate", "Losing water; fix it soon.", "Listed"],
            ["Major", "The leak that explains the loss.", "Must be mentioned"],
            [
              "Critical",
              "Fix before anything else: structure, safety, a line under the house.",
              "Must be mentioned",
            ],
          ]}
        />
        <p>
          Each severity has its own color, and the finding’s numbered dot and its pin use it. If a
          report draft leaves out a Major or Critical finding, Wrap-Up lists it under “Check these
          before sending.” The names, colors and which ones must be mentioned are yours to change in{" "}
          <Ui>Settings</Ui> › <Ui>Severities</Ui>; the “Use it for” column above is a suggestion,
          not a rule in the app.
        </p>
        <Note title="Pins stay put">
          A pin is saved as a spot on the drawing, not a pixel on a screen. Redraw the outline next
          year and the pin is still at the skimmer throat. And until a pool has a shape, the finding
          sheet asks for one first, so a pin is never dropped on a blank box.
        </Note>
      </Section>

      <Section kicker="The showpiece" title="What Maria sees on Findings">
        <Spread
          figure={
            <Phone
              src="10-findings-markup"
              alt="The Findings tab of job #1042: the Pool Diagram shows a figure-8 pool with a spa, a tree, a waterfall and the equipment pad; a red pin numbered 1 at the top left is circled in red, and a yellow arrow labeled Leak points to it. Below: Edit Pool Shape and Edit Markup; a Tests card, Pressure test, Skimmer seam, Dropped 8 PSI in 15 min, Fail."
              caption="Pin 1, circled, with an arrow and a label. The test that proved it sits right below."
              marks={[
                { x: 45, y: 40, n: 1 },
                { x: 92, y: 73, n: 2 },
                { x: 30, y: 81.5, n: 3 },
              ]}
            />
          }
        >
          <p>
            Dana turns the phone around. Everything she found is on one screen, in the order she’d
            explain it:
          </p>
          <Legend
            items={[
              <>
                <strong>The diagram.</strong> Her pool, her spa, the tree by the corner, and a red{" "}
                <strong>1</strong> at the skimmer.
              </>,
              <>
                <Ui>Edit Pool Shape</Ui> and <Ui>Mark Up</Ui> (it reads <Ui>Edit Markup</Ui> once
                there’s some).
              </>,
              <>
                <strong>Tests</strong>, then <strong>Findings</strong> below:{" "}
                <em>Skimmer seam leak · Major · Skimmer seam · Open · Pinned on the diagram</em>.
              </>,
            ]}
          />
          <Sub>Marking up the diagram</Sub>
          <p>
            <Ui>Mark Up</Ui> opens <Ui>Mark Up Diagram</Ui>. Pick a <Ui>Tool</Ui> (<Ui>Pen</Ui>,{" "}
            <Ui>Arrow</Ui>, <Ui>Circle</Ui>, <Ui>Text</Ui>) and a color (red, yellow or white), then
            draw. For a label, type it in <Ui>Label</Ui> and tap where it goes. <Ui>Undo</Ui>,{" "}
            <Ui>Clear All</Ui>, <Ui>Save</Ui>. The markup prints on the report’s diagram, pins and
            all.
          </p>
        </Spread>
        <Phone
          src="10-diagram-markup-editor"
          size="sm"
          alt="The Mark Up Diagram screen on a dark background: the figure-8 pool with pin 1 circled in red and a yellow arrow labeled Leak; below, Tool set to Pen with Arrow, Circle and Text, red, yellow and white colors, Undo and Clear All."
          caption="Mark Up Diagram: a red circle around the pin, a yellow arrow, a label."
        />
        <p>
          On a computer the same Findings tab puts the diagram on the left and the Tests and
          Findings beside it.
        </p>
        <Browser
          src="leak-findings"
          url="sundeckpro.com/jobs/5983?tab=findings"
          alt="A leak job’s Findings tab on a computer: the Pool Diagram with the skimmers, the house and the equipment pad, Edit Pool Shape and Mark Up buttons, a Tests card reading No tests recorded with Add Test, and a Findings card with 1 Skimmer seam leak, Moderate, Skimmer seam, Repaired, Seam at the skimmer throat, and Add Finding."
          caption="Findings on the website: the diagram, Tests, and the numbered finding with its severity and status."
        />
      </Section>

      <Scene time="11:05 a.m.">
        <p>
          Jake has the camera. He shoots the seam with the dye still hanging in the water, then a
          wide one of the skimmer from the deck, then twenty seconds of video with the dye pulling
          in. It’s what Maria will forward to her husband tonight.
        </p>
      </Scene>

      <Section kicker="Evidence" title="Photos, video and voice notes">
        <Spread
          figure={
            <Phone
              src="19-photos"
              alt="The Photos and Recordings tab of job #1042: Attach to, set to Whole job; tiles for Add Photo, Library, Add Video and Voice Note; and a photo card, Photo · Skimmer seam, captioned Seam at the skimmer throat, 8:29 PM · location recorded, with a red circle, a yellow arrow and the label Crack drawn on it, and an Edit Markup button."
              caption="Photos and Recordings. The card says what the photo is attached to and when it was taken."
            />
          }
        >
          <Steps>
            <Step
              title={
                <>
                  Open <Ui>Photos</Ui> and set <Ui>Attach to</Ui>.
                </>
              }
            >
              <Ui>Whole job</Ui>, or a finding or checklist item. Photos taken from an item’s screen
              or the finding sheet attach there by themselves.
            </Step>
            <Step
              title={
                <>
                  Tap <Ui>Add Photo</Ui>, <Ui>Library</Ui>, <Ui>Add Video</Ui> or{" "}
                  <Ui>Voice Note</Ui>.
                </>
              }
            >
              Videos run up to 60 seconds; voice notes up to five minutes.
            </Step>
          </Steps>
          <p>
            Each photo keeps the time it was taken and, if the phone allows, where. With no signal
            it says <em>Waiting to upload (saved on this phone)</em> and goes up by itself later; a
            dropped upload picks up where it stopped.
          </p>
          <Tip title="Talk instead of typing">
            Hands wet, gloves on? Tap <Ui>Voice Note</Ui> and say what you see: “dye pulls at the
            left side of the throat, about an inch down.” The recording stays with the job, next to
            the photos.
          </Tip>
        </Spread>

        <Browser
          src="leak-photos"
          url="sundeckpro.com/jobs/5983?tab=photos"
          alt="A leak job’s Photos tab on a computer: Photos and Recordings, an Attach to menu set to Whole job, buttons Add Photo, Library, Add Video and Voice Note, and the line No photos or recordings yet."
          caption="Photos on the website: choose what the photo is for in Attach to, then add it."
        />
        <Sub>Marking up a photo</Sub>
        <Gallery caption="Left: Mark Up on a photo, with Pen, Arrow, Circle and Text. Right: the saved photo, its caption, its time, and its upload status.">
          <Phone
            src="15-markup-pen"
            size="sm"
            alt="The Mark Up screen on a photo of a skimmer: a red oval around the skimmer opening, a yellow arrow labeled Crack, and a red freehand line. Tool set to Pen, red, yellow and white colors, Undo, Clear All, and Caption reading Seam at the skimmer throat."
            caption="Circle it, point at it, name it."
          />
          <Phone
            src="15-media"
            size="sm"
            alt="The photo viewer: the marked-up skimmer photo, the caption Seam at the skimmer throat, 8:28 PM · location recorded · Waiting to upload (saved on this phone), and Edit Markup and Delete buttons."
            caption="Saved on the phone, waiting for signal."
          />
        </Gallery>
        <p>
          Tap <Ui>Edit Markup</Ui> on a photo. The same four tools as the diagram: <Ui>Pen</Ui> to
          draw freehand, <Ui>Arrow</Ui> to point (tap to place, or drag), <Ui>Circle</Ui> around the
          crack, <Ui>Text</Ui> for a label like “Crack.” Add a <Ui>Caption (optional)</Ui> and tap{" "}
          <Ui>Save</Ui>. The report shows the photo with the markup drawn on it.
        </p>
        <Watch title="The original never changes">
          Markup sits on top of the photo; it isn’t burned in. The file you took is stored once,
          with its time, its place and a fingerprint, and can’t be overwritten. Deleting a photo in
          the app hides it, with <Ui>Undo</Ui> for five seconds; the stored original stays.
        </Watch>
      </Section>

      <UseIt
        items={[
          {
            who: "The homeowner",
            text: "A numbered pin on her own pool, and a photo with an arrow on the crack. She doesn’t need to know what a skimmer throat is to see where the water goes.",
          },
          {
            who: "The repair",
            text: "The diagram belongs to the pool, so the repair job next week opens with it. The pin and photos are on the leak job, one tap away on Maria’s customer page.",
          },
          {
            who: "Monitor, not fix",
            text: "A hairline in the shell that isn’t losing water today: a Minor finding with status Monitor. Next year’s job at the address starts from this diagram.",
          },
        ]}
      />

      <FromTheField title="One pin per finding">
        Two leaks are two findings with two pins, 1 and 2, even if they’re a foot apart. When you
        build the quote, <Ui>Add From Findings</Ui> suggests prices under each finding, so each leak
        gets its own line and the homeowner sees what each one costs.
      </FromTheField>

      <WhyItMatters>
        “Somewhere at the skimmer” sends a repair crew digging. A pin on a drawing of the real pool,
        a severity, a photo with the crack circled and a time stamp on every shot send them to one
        spot. The same record is the quote’s starting point and, a year from now, the answer to “are
        you sure it was the skimmer?”
      </WhyItMatters>
      <PullQuote>Don’t tell her where the leak is. Show her.</PullQuote>
    </>
  ),
};
