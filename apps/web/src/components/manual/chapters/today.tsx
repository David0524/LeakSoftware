import type { ChapterDef } from "../types";
import {
  FromTheField,
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
  Table,
  Tip,
  Ui,
  UseIt,
  Watch,
  WhyItMatters,
} from "../kit";

// WANT: today-desktop — sundeckpro.com/today on a computer (card, Team list, Today's Map)

export const today: ChapterDef = {
  id: "today",
  title: { pool: "The route in your pocket", leak: "On the road" },
  moment: { pool: "Monday · 6:52 a.m.", leak: "Wednesday · 7:15 a.m." },
  lede: {
    pool: "Today is the first screen a tech sees and the one they’ll use most: one card for the stop you’re on, one main button for this moment, and the rest of the route underneath.",
    leak: "Today is the first screen a tech sees: one card for the stop you’re on, one main button for this moment, and the rest of the day underneath. From the card, the job opens straight into the inspection.",
  },
  learn: {
    pool: [
      "Read the Today card and the route under it",
      "Send On My Way, then Start",
      "Finish a stop with Mark Complete, or undo it",
      "Move a stop with Do Later, or the whole day with Reorder",
      "Use the Lock Screen and work with no signal",
    ],
    leak: [
      "Read the Today card and the day under it",
      "Send On My Way, then Start",
      "Open the inspection from the card",
      "Mark a stop complete, or Mark Not Complete",
      "Use the Lock Screen and work with no signal",
    ],
  },
  Body: ({ edition }) => {
    const pool = edition === "pool";
    return (
      <>
        {pool ? (
          <Scene time="Monday, 6:52 a.m.">
            <p>
              Priya’s coffee is still too hot to drink. The truck is loaded: two jugs of liquid
              chlorine, a jug of acid, test kit, poles, the brush with the bent handle she refuses
              to replace. Before she starts the engine she opens Sundeck Pro.
            </p>
            <p>
              The screen says <em>Today</em>, then the date, then one blue card: <em>Up next</em>,
              the first customer’s name, “12 min drive,” the gate code. Under it, the rest of her
              route in order, ten pools, ending with the drive back to the shop.
            </p>
            <p>Nobody had to text her the list. Dana built it on Sunday night.</p>
          </Scene>
        ) : (
          <Scene time="Wednesday, 7:15 a.m.">
            <p>
              Dana has two detections and a pressure test on a spa line today. The truck already has
              the hydrophone, the dye, the pressure rig and a wetsuit in a milk crate. She opens the
              app at the kitchen counter.
            </p>
            <p>
              One blue card: <em>Up next</em>, Maria Alvarez, “Leak detection · 22 min drive,” the
              address in Mesa, the gate code, and <em>Then:</em> the next customer. Below it, the
              day’s three stops in route order, and how long the drive home will be.
            </p>
          </Scene>
        )}

        <Section kicker="The screen" title="One card, one stop">
          <Meta who={["Tech", "Owner", "Admin"]} where={["iPhone", "Android", "Website"]} />
          <Spread
            figure={
              <Phone
                src="30-today-cleanings"
                alt="Today on the iPhone: a blue card reading Up next, Grace Holloway, Leak detection · 12 min drive, the address, Then: Riley Rivera, a white Start button, round Message, Call and Directions buttons, and Do Later. Below, three numbered stops with drive chips and a gate code."
                caption="The card is always about one stop. Under it, the day in route order, with drive times and access notes."
              />
            }
          >
            <p>
              Today opens on a card for the stop you’re on. Its top line says where you are in the
              day: <Ui>Up next</Ui>, <Ui>On the way</Ui>, <Ui>At the pool</Ui>, or <Ui>Done</Ui>.
              The customer’s name is the big title (tap it to open the job). Under that: the kind of
              job and the drive, the address, access notes with a key, and <strong>Then:</strong>{" "}
              the next customer.
            </p>
            {pool ? (
              <p>
                On a maintenance stop the card also shows the cleanings that are due, a filter or a
                salt cell, with how soon: <em>Overdue</em>, <em>Today</em>, <em>3 days</em>. You
                know before you open the gate that today is a filter day.
              </p>
            ) : null}
            <p>
              The figure at the top right counts the day (“1 of 3, Stop”). Once you’re on site it
              counts the checklist instead (“4 of 9, Checklist”). The thin bar along the bottom has
              one segment per stop.
            </p>
            <p>
              The rest of the day sits under the card: each stop’s number, its time, the customer, a
              car chip with the drive in minutes, and the access notes. The last line is the drive
              home: “35 min back to the shop.”
            </p>
          </Spread>
          <Tip title="Peek ahead without losing your place">
            Swipe the card left to see the next stop, right for the one before, or tap a segment of
            the progress bar. A <Ui>Back to Now</Ui> button brings you back. Handy for reading the
            next gate code while you’re still at this pool.
          </Tip>
        </Section>

        <Section kicker="Leaving" title="On My Way, then Start">
          <p>
            Before you pull out, let the customer know you’re coming. On the card, <Ui>Message</Ui>{" "}
            opens a text that’s already written: the On My Way message with an arrival time worked
            out from the drive. Change it if you like, then send.
          </p>
          <Steps>
            <Step
              title={
                <>
                  Tap the round <Ui>Message</Ui> button on the card.
                </>
              }
            >
              The text is filled in with your arrival estimate. Edit it or send it as it is.
            </Step>
            <Step title="Drive.">
              The card changes to <Ui>On the way</Ui>, and the office sees “On the way, arriving
              9:42” beside your stop. Use <Ui>Directions</Ui> to open your maps app.
            </Step>
            <Step
              title={
                <>
                  Tap <Ui>Start</Ui> as you step out of the truck.
                </>
              }
            >
              The job moves to In progress at once and the card swaps its main button for{" "}
              <Ui>Open Checklist</Ui>. On the job page the same button is called <Ui>Start Job</Ui>.
            </Step>
            <Step
              title={
                <>
                  Tap <Ui>Open Checklist</Ui>.
                </>
              }
            >
              {pool
                ? "The visit opens on its checklist and chemicals. The next chapter walks through it."
                : "The job opens into the inspection checklist, section by section. The chapters that follow walk through it."}
            </Step>
          </Steps>
          <Note title="Where the text comes from">
            If your shop has a company number (Settings › Phone and Texting), On My Way goes out
            from the shop’s number and lands in the shared Messages inbox, so a reply reaches the
            office too. Without one, the app opens your phone’s own Messages with the text filled
            in. On My Way is a courtesy, never a gate: you can always tap <Ui>Start</Ui> without it.
          </Note>
        </Section>

        {pool ? (
          <FromTheField title="10:40 a.m., three pools in">
            Priya’s third stop has the dog. She knew before she got there: the key line on the card
            said “Gate code 4417. Dog in the side yard.” She sent On My Way from the curb of the
            last house, and the homeowner had the dog inside by the time she pulled up.
          </FromTheField>
        ) : (
          <FromTheField title="9:05 a.m., in the Alvarez driveway">
            Dana sent On My Way from the last light before the freeway. Maria Alvarez texted back
            “gate’s open, I’m at work,” and the reply landed in the shop’s Messages, where Jake saw
            it too. Dana tapped <Ui>Start</Ui> on the way to the backyard and was on the checklist
            before she reached the equipment pad.
          </FromTheField>
        )}

        <Section
          kicker="Finishing"
          title={pool ? "Mark Complete, and on to the next" : "Done for today"}
        >
          {pool ? (
            <>
              <p>
                At the pool the card shows two buttons side by side: <Ui>Open Checklist</Ui> and{" "}
                <Ui>Mark Complete</Ui>. When every checklist item has an answer, the card says
                “Everything’s checked. Mark it complete.” and <Ui>Mark Complete</Ui> becomes the
                filled main button. On a maintenance stop it completes the visit, exactly like{" "}
                <Ui>Complete Job</Ui> on the visit itself, so you can finish from Today without
                opening anything.
              </p>
              <p>
                The stop’s segment fills, a check flashes, and the card slides on to the next stop.
                A banner at the top says “Sam Sample done” with <Ui>Undo</Ui>. If you’re past the
                banner, open the finished stop and tap <Ui>Reopen Visit</Ui>.
              </p>
              <Watch title="Your shop’s rules come along">
                If the owner turned on <Ui>Finish the checklist first</Ui> or{" "}
                <Ui>Take a pool photo first</Ui> (Settings › Team), Mark Complete tells you what’s
                missing and offers the way to fix it, like <Ui>Take Photo</Ui>. And if visit reports
                go out automatically, it asks before it sends one.
              </Watch>
            </>
          ) : (
            <>
              <p>
                At the pool the card shows <Ui>Open Checklist</Ui> and <Ui>Mark Complete</Ui>. A
                repair stop has no checklist, so it shows Mark Complete alone.
              </p>
              <p>
                On a leak or repair job, <Ui>Mark Complete</Ui> means “this stop is done for the
                day.” It doesn’t close the job: the report, quote and invoice still follow from the
                job’s Wrap-Up, tonight or tomorrow. The segment fills, the card slides to the next
                stop, and a banner says “Maria Alvarez done” with <Ui>Undo</Ui>. Later, open the
                stop and tap <Ui>Mark Not Complete</Ui> to put it back.
              </p>
              <Note title="Why the job stays open">
                A detection isn’t finished when you leave the yard. It’s finished when the homeowner
                has the report and the invoice is paid. Mark Complete moves your day along; the
                job’s own status keeps track of everything after.
              </Note>
            </>
          )}
        </Section>

        <Section kicker="When the day changes" title="Do Later and Reorder">
          <Spread
            flip
            figure={
              <Phone
                src="30-today-reorder"
                alt="Today in Reorder mode: three stops, each with its time, customer and drive, and a drag handle on the right. Done replaces Reorder at the top."
                caption="Reorder: drag by the handle. Drive times update as you go."
              />
            }
          >
            <p>
              <strong>Do Later</strong> is for the one stop that can’t happen now: the gate is
              locked, the homeowner isn’t home, the crew next door has the street blocked. Tap{" "}
              <Ui>Do Later</Ui> on the card and that stop moves to the end of the day. For five
              seconds the button reads “Moved” with <Ui>Undo</Ui>.
            </p>
            <p>
              <strong>Reorder</strong> is for the whole day. Tap <Ui>Reorder</Ui> at the top right,
              drag stops by their handle, then <Ui>Done</Ui>. Each move saves as you make it.
            </p>
            <p>
              Some stops stay put, and say why with a lock: one you’ve started, one the office
              locked to a time, one that needs two techs.
            </p>
          </Spread>
          <UseIt
            items={
              pool
                ? [
                    {
                      who: "Locked gate",
                      text: "The Hendersons’ side gate is padlocked. Do Later, carry on, and come back after lunch when they’re home.",
                    },
                    {
                      who: "Customer request",
                      text: "A homeowner texts that the landscapers are there until noon. Reorder her pool to the afternoon from the truck.",
                    },
                    {
                      who: "Traffic",
                      text: "The 101 is a parking lot. Swap two stops so you work the east side first.",
                    },
                  ]
                : [
                    {
                      who: "Waiting on water",
                      text: "The pool needs to be topped off before a dye test. Do Later, run the spa line test across town, come back.",
                    },
                    {
                      who: "Homeowner running late",
                      text: "Reorder so the stop with the dog and the locked gate is last, when the owner is home.",
                    },
                    {
                      who: "A long test",
                      text: "A pressure test needs to sit. Start the next stop in the meantime: techs can take stops out of order.",
                    },
                  ]
            }
          />
        </Section>

        <Section kicker="Without unlocking" title="Your stop on the Lock Screen">
          <p>
            On the iPhone, the day shows up as a Live Activity on the Lock Screen and in the Dynamic
            Island. It starts by itself when you open the app during the workday and follows the
            same stop as the card: <em>Up next</em>, <em>On the way</em>,{" "}
            <em>At {pool ? "the customer" : "the job"}</em> with the checklist count, then{" "}
            <em>done</em> and the next stop. It shows the address, <strong>Then:</strong>, the gate
            code{pool ? ", and cleanings due" : ""}. It works with no signal and shows no clocks or
            timers.
          </p>
          <Gallery caption="Left: the Lock Screen through one stop, from Up next to the last stop of the day. Right: the same stop in the Dynamic Island.">
            <Phone
              src="66-live-activity-lock"
              size="sm"
              alt="Five Live Activity cards on a Lock Screen: Up next: Grace Holloway, 3 of 7; On the way, with a side gate code and cleanings Overdue and 2 weeks; At Grace Holloway, 4 of 9 Checklist; Grace Holloway done, Next stop; and That was the last stop today."
            />
            <Phone
              src="66-live-activity-island"
              size="sm"
              alt="Live Activity states in the Dynamic Island: compact pills reading 3/7, 4/9 and a check, and an expanded view with Open Job and Call."
            />
          </Gallery>
          <p>
            On Android the same information is an ongoing notification with <Ui>Open Job</Ui> and{" "}
            <Ui>Call</Ui>. To turn it off: <strong>More › Notifications › Live Activity</strong>.
            There’s also a <Ui>Start of the day</Ui> alert at the shop’s start time (“5 stops today
            · First: …”) that opens the first stop with one tap.
          </p>
        </Section>

        <PullQuote>
          {pool
            ? "Gate code, next stop, filter due. All at a red light, without unlocking the phone."
            : "Address, gate code, next stop. All at a red light, without unlocking the phone."}
        </PullQuote>

        <Section kicker="No bars" title="When the signal drops">
          <p>
            {pool
              ? "Equipment pads behind block walls are dead zones. It doesn’t matter: Start, the checklist, readings, chemicals, photos, Mark Complete, Do Later and Reorder all save to the phone first."
              : "Side yards and equipment rooms lose signal all the time. It doesn’t matter: Start, the checklist, tests, findings, photos, Mark Complete, Do Later and Reorder all save to the phone first."}{" "}
            The bar under the title says <Ui>Offline · working from this phone</Ui>, and when the
            phone finds a signal again it sends everything to the office on its own. A Start or a
            Mark Complete usually reaches the office within seconds of the signal coming back.
          </p>
          <Table
            head={["Works with no signal", "Waits for a signal"]}
            rows={[
              ["Today: Start, Mark Complete, Do Later, Reorder", "Sending texts and emails"],
              [
                pool ? "Checklist, readings, chemicals, charges" : "Checklist, tests, findings",
                "Card payments",
              ],
              ["Photos and videos (they upload later)", "Looking up a brand-new address"],
              ["The Live Activity and the start-of-day alert", "The Dashboard and Activity"],
            ]}
          />
          <Tip title="Text it when you’re back in range">
            On My Way is a text, so it needs a signal. If you’re in a dead spot, send it from the
            curb before you pull out.
          </Tip>
        </Section>

        <Section kicker="The office side" title="Watching the day without calling">
          <p>
            Owners and admins see the same Today with pills under the title: <Ui>Me</Ui>, then each
            tech with their color dot. Tap a name to see that tech’s card and stops, live. You can
            call, text, or get directions from there; Start and On My Way stay with the tech. On a
            computer, Today adds a Team list (“4 of 11 stops”, “Last done: Jones at 10:42 AM”) and a
            map of the day’s stops.
          </p>
          {pool ? (
            <Scene time="Monday, 11:15 a.m.">
              <p>
                A customer calls the shop: is anyone coming today? Dana taps Priya’s name. The
                customer is stop seven; Priya is on five. “She’ll be there in about an hour,” Dana
                says, and hangs up without calling Priya at all.
              </p>
            </Scene>
          ) : (
            <Scene time="Wednesday, 11:40 a.m.">
              <p>
                Jake is at the shop with a callback. He taps Dana’s name on Today: she’s on stop
                two, the spa line, In progress. He books the callback for tomorrow instead of
                calling her mid-test.
              </p>
            </Scene>
          )}
        </Section>

        <Section kicker="Day done" title="The last card">
          <Spread
            figure={
              <Phone
                src="30-today-next-day"
                alt="Today with no stops left: Nothing on your route today, and a card for Tomorrow with 3 stops, first at 8:00 AM, the customers’ names, and a See Tomorrow button."
                caption="A day with no stops points to the next one."
              />
            }
          >
            <p>
              When the last stop is done, the card says “All {pool ? "10" : "3"} stops done” with a
              check, and a line underneath counts the day:
            </p>
            <p>
              <strong>
                {pool
                  ? "Today: 10 pools · 6 reports sent · 1 quote accepted"
                  : "Today: 3 pools · 2 reports sent · 1 quote accepted"}
              </strong>
            </p>
            <p>
              Only the parts that aren’t zero show. On a day with no stops, Today says “Nothing on
              your route today.” and offers the next working day: “Tomorrow · 3 stops · first at
              8:00 AM,” with <Ui>See Tomorrow</Ui>.
            </p>
          </Spread>
        </Section>

        <WhyItMatters
          figures={[
            { value: "1", label: "main button for each moment" },
            { value: "5 s", label: "to undo a Mark Complete or a Do Later" },
            { value: "0", label: "bars of signal needed to work the route" },
          ]}
        >
          {pool
            ? "A route tech’s day is ten short stops. Every minute spent hunting through screens, calling the office for a gate code, or waiting for a page to load is multiplied by ten. Today puts the next thing to tap where the thumb already is, and the office sees each stop finish without anyone picking up a phone."
            : "A detection day is a few long stops in places with no signal. Today keeps the address, the gate code and the next customer on one card, opens straight into the inspection, and tells the office where you are without a call, so the phone in your pocket is a tool, not an interruption."}
        </WhyItMatters>
      </>
    );
  },
};
