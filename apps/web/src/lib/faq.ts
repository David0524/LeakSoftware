import { CONTACT_EMAIL, CONTACT_PHONE, SUPPORT_EMAIL } from "@/lib/site";

/**
 * The Sundeck Pro FAQ: one list that feeds the website's /faq page and the FAQ chapter of both
 * manuals. Every answer must be true of the product as built (fact sheets, DECISIONS.md, the
 * code). Plain strings, no JSX, curly quotes.
 */
export type FaqFor = "pool" | "leak" | "both";
export type FaqItem = { q: string; a: string; for: FaqFor };
export type FaqTopic = { id: string; title: string; items: FaqItem[] };

export const FAQ_TOPICS: FaqTopic[] = [
  {
    id: "getting-started",
    title: "Getting started",
    items: [
      {
        q: "How do I start?",
        a: "Go to the sign-up page, enter your name, company, email and mobile number, and choose what your shop does: Pool Care, Leak Detection, or Both. Press Start Free Trial, confirm your email, add a card, and your shop is ready for you to invite your techs.",
        for: "both",
      },
      {
        q: "Do I need a credit card to try it?",
        a: "Yes. A card starts the 30-day trial, and you aren’t charged until the trial ends. Cancel before then in Settings › Sundeck Pro Billing and you’ll never be charged.",
        for: "both",
      },
      {
        q: "What do I set up first?",
        a: "Invite your techs, set up customer payments, and add your customers. Pool care shops then give each pool a visit plan. Leak detection shops add their logo and book a first job. A Getting Started card on Today lists these steps and ticks them off by itself as you do them.",
        for: "both",
      },
      {
        q: "Is there a sample job so I can see what a report looks like?",
        a: "Leak detection shops get one: a finished sample job with a report that carries your own name and logo. Send Yourself This Report emails it to you and only you, and the sample is never counted in your numbers. You can delete it when you’re done. Pool care shops don’t get a sample visit.",
        for: "leak",
      },
      {
        q: "Can I change my mind about Pool Care, Leak Detection, or Both?",
        a: "Yes. Change it in Settings › Company and Branding › Services. The pages your shop sees and your monthly price change to match.",
        for: "both",
      },
    ],
  },
  {
    id: "pricing",
    title: "Plans and pricing",
    items: [
      {
        q: "What does Sundeck Pro cost?",
        a: "The price depends on your team size, not the number of pools. Pool Maintenance is $79 a month for up to 2 people, $149 for up to 6, and $249 for up to 12, then $15 for each extra person. Leak Detection is $49 for 1 person and $99 for up to 4, then $25 for each extra person.",
        for: "both",
      },
      {
        q: "Who counts as a person on the team?",
        a: "Owners, office staff, and techs each count as one. Someone you’ve turned off doesn’t count. You pick the team size you pay for, and it can’t go below your active people.",
        for: "both",
      },
      {
        q: "Is there a charge per pool or per customer?",
        a: "No. Pools and customers are unlimited on every plan. Adding a route never changes your price.",
        for: "both",
      },
      {
        q: "We do both pool care and leak detection. What do we pay?",
        a: "The Pool Maintenance price for your team size plus $49 a month for leak detection. A team of 3 pays $149 plus $49, which is $198 a month.",
        for: "both",
      },
      {
        q: "What happens after the 30-day trial?",
        a: "The card you added is charged the first month’s price, and then monthly. If you cancel before the trial ends, nothing is charged.",
        for: "both",
      },
      {
        q: "How do I cancel?",
        a: "The owner cancels on the website in Settings › Sundeck Pro Billing, any time. Service continues to the end of the paid month, and partial months aren’t refunded. A canceled shop becomes read-only, and nothing is deleted.",
        for: "both",
      },
      {
        q: "What if a payment fails?",
        a: "You get a banner and seven days to update the card. After that the shop is read-only until the card works: everyone can still see everything, but nothing new can be added. Your customers can still accept quotes and pay.",
        for: "both",
      },
    ],
  },
  {
    id: "field-app",
    title: "Phones and the field app",
    items: [
      {
        q: "Does it work with no cell signal?",
        a: "Yes. The field app saves everything on the phone first and sends it when the phone has signal again. Today, the schedule, checklists, readings, tests, findings, photos, notes and recording a payment all work with no signal.",
        for: "both",
      },
      {
        q: "What needs a signal?",
        a: "The first download after you sign in, which happens once. Also sending texts, emails and reports, card payments, the Dashboard and Activity, uploading a logo, and looking up new addresses on the map. The website needs a connection for everything.",
        for: "both",
      },
      {
        q: "What happens if a tech’s phone dies mid-visit?",
        a: "Work is saved on the phone as it’s entered, not when someone taps Save, so a dead battery doesn’t lose it. Charge the phone, open the app, and what was waiting is sent. Whatever had already synced is safe at the office.",
        for: "both",
      },
      {
        q: "Which phones does it run on?",
        a: "The iPhone app is on the App Store and needs iOS 18 or later. The Android app is on Google Play and looks and works the same way. Techs can also use the website in a phone’s browser, but it needs a connection and doesn’t work offline.",
        for: "both",
      },
      {
        q: "Can I plan routes and see drive times?",
        a: "Yes. Stops show drive times, and Optimize reorders a day’s route to cut driving, with an Undo. Optimize Week plans a whole week for the team. Jobs with a promised time, started jobs and two-tech jobs stay where they are.",
        for: "both",
      },
      {
        q: "How do customers know my tech is on the way?",
        a: "The Message button on the stop opens a text already filled in with an On My Way message and an arrival estimate. Sending it marks the job On the way, and the office sees it. In Settings › Scheduling you choose whether customers are told an exact time or a window of 1, 2 or 4 hours.",
        for: "both",
      },
      {
        q: "Does it work with big text and a screen reader?",
        a: "Yes. The phone layouts grow with the phone’s text size, buttons wrap to two rows instead of clipping, and VoiceOver and TalkBack read each stop and offer every swipe action as a menu item. Status is never shown by color alone. More › Appearance switches between Light and Dark.",
        for: "both",
      },
    ],
  },
  {
    id: "pool-care",
    title: "Pool care",
    items: [
      {
        q: "How do I put a customer on a weekly route?",
        a: "In New Job, choose Service and set Repeats to Weekly, Biweekly, Monthly or 2+ a Week, then press Start Plan. Fill in the first visit, the price per month and the tech, and visits are made as jobs a few weeks ahead on the schedule. Starting a plan needs a signal.",
        for: "pool",
      },
      {
        q: "Can I pause a customer’s plan without deleting it?",
        a: "Yes. Open the customer, tap the plan, and choose Pause. Upcoming visits leave the schedule, and Resume puts them back. End Plan removes upcoming visits and keeps the finished ones.",
        for: "pool",
      },
      {
        q: "How do filter and salt cell cleanings work?",
        a: "Set how often each cleaning repeats and when it’s next due. It lands on the first visit on or after the due date, shows on the tech’s Today card and checklist, and the next date moves forward when the tech does it. A skipped cleaning stays due for the next visit. You set these on the website.",
        for: "pool",
      },
      {
        q: "What does the chemical calculator do?",
        a: "The tech types the readings, and each low or high one gets a suggested dose, numbered in the order to add. It works with no signal. The doses are starting points: add in portions and retest.",
        for: "pool",
      },
      {
        q: "Can I charge customers for chemicals?",
        a: "Yes, and it’s off until you turn on Charge for Chemicals in Settings › Price Book. Then each chemical is one line on the month’s invoice, such as “Liquid chlorine, October,” at your price book price. Chemicals marked Customer Supplied are never billed.",
        for: "pool",
      },
      {
        q: "What does the customer get after a visit?",
        a: "A visit report with the water test and whether each reading is in range, the chemicals added, what was done, notes, and photos, under your logo. In Settings › Report Templates you choose Each Visit, Monthly, or Off. Monthly sends one report with the invoice.",
        for: "pool",
      },
      {
        q: "What happens when a tech can’t get into a yard?",
        a: "The tech taps Skip Visit and picks a reason, such as Locked Gate or Dog in Yard, and can add a note and a photo. The visit is marked Skipped: it isn’t done and isn’t billed, and it comes off the tech’s list. You’re told, and you can Reschedule it or Dismiss it once it’s handled. The tech can also send the customer a short text that names the reason. Settings › Scheduling can skip any visit from the last three days that was never started, at the end of the day.",
        for: "pool",
      },
      {
        q: "Can a tech bill a part or a repair on the spot?",
        a: "Yes. On a visit’s checklist, Add Charge picks an item from your price book or types a custom one, and it becomes its own line on the month’s invoice. A bigger repair can be quoted from the visit.",
        for: "pool",
      },
    ],
  },
  {
    id: "leak-detection",
    title: "Leak detection",
    items: [
      {
        q: "How does a leak detection job run from start to finish?",
        a: "Book it, then on site work through the checklist, record tests, mark findings on the pool diagram, and take photos. In Wrap-Up the tech writes the report draft, builds a quote from the findings, gets the customer’s signature, and later sends the invoice.",
        for: "leak",
      },
      {
        q: "Does it write the report for me?",
        a: "Write Draft fills in a plain report from what the tech recorded: the checklist, tests and findings. It isn’t AI. The tech reads and edits it before anything is sent.",
        for: "leak",
      },
      {
        q: "What tests can I record?",
        a: "Pressure, dye, bucket or evaporation, and listening or electronic detection. A pressure test passes only if the pressure holds for at least 15 minutes. The shop can change that limit and the bucket test’s limit in Settings › Test Types, and the tech makes the final call.",
        for: "leak",
      },
      {
        q: "How do I show the homeowner where the leak is?",
        a: "Drop a numbered pin on a drawing of their pool when you add a finding, in the color of its severity. The pool’s shape, spa and landmarks are saved with the pool, so the next job at that address reuses them. You can also mark up the diagram and circle or arrow a photo.",
        for: "leak",
      },
      {
        q: "What if I don’t check part of the pool?",
        a: "Mark it N/A and, in the app, say why it was left out, such as “No diver on site” or “Customer declined.” Excluded items are listed in the report and aren’t counted as passing. You edit the list of reasons in Settings › Exclusion Reasons.",
        for: "leak",
      },
      {
        q: "Does the customer have to sign?",
        a: "Review with Customer hands the phone to the homeowner to read the report and sign. Signing locks that version. If they aren’t there, the tech chooses Customer Not Here and the report says so. The checklist has to be finished before they can sign.",
        for: "leak",
      },
      {
        q: "Can the homeowner accept the repair quote and pay a deposit online?",
        a: "Yes. The quote link opens in any browser. They type their name to accept it, and if you set a deposit, they pay it right there by card or bank. Deposits start at none, so choose a percentage or fixed amount in Settings › Payments and Deposits.",
        for: "leak",
      },
    ],
  },
  {
    id: "customers",
    title: "Your customers",
    items: [
      {
        q: "Do my customers need an app or an account?",
        a: "No. Quotes, invoices and reports open in any browser from a text or email, with no sign-in. Customers accept, sign and pay right there.",
        for: "both",
      },
      {
        q: "Will my customers see my logo and colors?",
        a: "Yes. Reports, quotes and invoices carry your logo, or your company name if you haven’t added one, and your main color, set in Settings › Company and Branding. A report that’s already been sent keeps the logo and color it went out with.",
        for: "both",
      },
      {
        q: "How do I text my customers?",
        a: "Texting runs from a company number the whole team shares, set up in Settings › Phone and Texting. It’s included with Sundeck Pro. Replies and voicemails land in Messages for the team, and customers see the shop’s number, not a tech’s own phone.",
        for: "both",
      },
      {
        q: "Can I email all my customers at once?",
        a: "Yes. Email Customers on the Customers page sends one message to a group you choose by type, city or last job. Each email ends with your shop’s name, mailing address and an unsubscribe link, and you can send yourself a test first. Owners and admins only.",
        for: "both",
      },
      {
        q: "How does a customer stop getting texts and emails?",
        a: "Reminder and review emails have a stop link that works in one tap. Emails from Email Customers have an unsubscribe button. Replying STOP to a text turns texts off. Reports, quotes, invoices and receipts still go out.",
        for: "both",
      },
      {
        q: "How do I keep bad reviews off Google?",
        a: "You can’t control what people post on Google, and Sundeck Pro doesn’t try to. What it does is ask first. With Ask How We Did First on (on to start, in Settings › Company and Branding › Reminders and Reviews), the review email asks “How did we do?” with two links. A customer who picks “Something went wrong” writes what happened, and that goes to you privately as a complaint. Customers with an open complaint aren’t sent review requests, and customers who are happy get the Leave a Google Review link.",
        for: "both",
      },
      {
        q: "Do customers get payment reminders?",
        a: "Yes, by email, by text, or both. Choose Email, Text or Both under Send Reminders By in Settings › Company and Branding › Reminders and Reviews. By default a quote gets a reminder 3 and 7 days after sending, and an invoice 7, 14 and 30 days after. They stop when the quote is accepted or the invoice is paid, and you can change the days or clear them. A text goes only to a mobile number that hasn’t replied STOP.",
        for: "both",
      },
    ],
  },
  {
    id: "money",
    title: "Getting paid",
    items: [
      {
        q: "How do customer payments work?",
        a: "You connect your own Stripe account in Settings › Payments and Deposits. Customers pay deposits and invoices by card or bank account, and the money goes to your Stripe account at Stripe’s usual fees. Card and bank details never reach Sundeck Pro.",
        for: "both",
      },
      {
        q: "Can I pass the card fee on to customers?",
        a: "Yes, if you turn it on. The owner sets a fee of up to 3%. The customer chooses Pay by Bank with no fee or Pay by Card with the fee added and spelled out. Some states don’t allow card fees, so check yours first.",
        for: "both",
      },
      {
        q: "How do I take cash or a check?",
        a: "Tap Record Payment on the invoice, enter the amount, and choose Cash, Check or Other, with a check number if you like. Any tech can do it, even with no signal, and partial payments are fine. The job is Paid when the balance reaches zero.",
        for: "both",
      },
      {
        q: "Does the customer get a receipt?",
        a: "Card and bank payments email their receipt automatically. For cash or a check, Send Receipt offers email or text right after you record it. A payment you record never sends a receipt on its own, and sending one needs a signal.",
        for: "both",
      },
      {
        q: "How do I set deposits and sales tax?",
        a: "In Settings › Payments and Deposits, a deposit can be a percentage of the quote or a fixed amount with a minimum. You also set the sales tax rate, which applies only to price book items marked Taxable. A new shop starts with no deposit.",
        for: "both",
      },
      {
        q: "How does monthly billing work?",
        a: "Each customer’s month is drafted as one invoice on their invoice day, the 1st by default, that includes the plan price, any priced cleanings and charges, and chemicals if you charge for them. You review the drafts, add anything, and send them all at once on the Billing page. Monthly Billing is in Invoices, on the website and in the apps.",
        for: "pool",
      },
      {
        q: "How do I get paid for a leak job?",
        a: "The detection fee goes on one invoice per job, and a repair job copies the accepted quote and credits the deposit already paid. Send it by email, and customers pay from the link. A partly paid invoice shows what’s still due.",
        for: "leak",
      },
      {
        q: "Can customers pay automatically?",
        a: "Yes, if they agree. On their invoice they tick Save for Autopay, and their card or bank account is saved with Stripe. From then on each monthly maintenance invoice is charged as soon as it’s sent, and the customer gets a receipt. Nothing else is charged on its own. Customers can’t turn it off themselves: they ask you, and you tap Turn Off Autopay on their page.",
        for: "pool",
      },
      {
        q: "How do I get a card on file from a customer?",
        a: "On the customer’s page, in the Autopay group, tap Request Card on File. The customer gets a link by email, or by text from your company number when you have one. It opens a page to save a card or bank account, and nothing is charged. Then tap Charge Card on File on any invoice to charge it now, after a confirmation that shows the amount and any card fee.",
        for: "both",
      },
      {
        q: "Can customers pay over time?",
        a: "Yes, with Affirm or Klarna, once Stripe has approved them for your account and the amount qualifies (Affirm from $50 to $30,000, Klarna from $50 to $10,000). The option sits under the pay button on invoices and quotes. Turn it off in Settings › Payments and Deposits with Offer Pay Over Time.",
        for: "both",
      },
      {
        q: "What happens when an automatic payment fails?",
        a: "The customer gets their normal pay link by email, the first time only, and you get a notification on the first failure and if the last try fails. By default Sundeck Pro tries two more times, three days apart, while the invoice is still owed. You can change the number of tries and the gap, or turn retries off, in Settings › Payments and Deposits.",
        for: "pool",
      },
    ],
  },
  {
    id: "team",
    title: "Your team",
    items: [
      {
        q: "How do I add a tech?",
        a: "On the website, Settings › Team, tap Invite Someone, enter their email and a role, and copy the link to send them yourself. Sundeck Pro doesn’t email it. The link works once and expires in 14 days. They sign in on the app with that same email.",
        for: "both",
      },
      {
        q: "What’s the difference between Owner, Admin, and Tech?",
        a: "Owners can do everything, including billing, connecting payments and choosing who has which role. Admins are office staff who run the schedule, customers, jobs, quotes, invoices and most settings. Techs run jobs on the phone.",
        for: "both",
      },
      {
        q: "Can my techs see what I charge?",
        a: "Techs can’t change the price book or payment settings, and you set the largest discount a tech can give. Chemical prices show to techs only if you turn on Charge for Chemicals.",
        for: "both",
      },
      {
        q: "Can my techs see every job?",
        a: "By default, yes. An owner can change Techs see to Only Their Own in Settings › Team, and then a tech sees only jobs they’re on. Customers stay visible to everyone. Admins always see everything. You can also stop techs from making new jobs.",
        for: "both",
      },
      {
        q: "A tech quit. How do I cut off their access?",
        a: "Switch them off in Settings › Team. They can’t sign in, and access to your records ends at once. Their coming jobs stay as they are, so reassign them, and your price goes down. You can switch them back on later.",
        for: "both",
      },
    ],
  },
  {
    id: "data-security",
    title: "Your data and security",
    items: [
      {
        q: "Who owns my customer data?",
        a: "You do. The shop owns what it enters. Each shop’s records are walled off in the database itself, so other shops can’t see them.",
        for: "both",
      },
      {
        q: "Can I get my data out?",
        a: "Owners can export invoices and payments as a spreadsheet file from the Invoices page, for the books or QuickBooks. For anything else, write to us.",
        for: "both",
      },
      {
        q: "What happens to my data if I cancel or delete my account?",
        a: "After you cancel, you keep read-only access to your records. You can ask us to delete the shop’s data, and we do within 30 days, with backups overwritten within a further 30. Deleting the only owner’s account asks for the same.",
        for: "both",
      },
      {
        q: "Can I turn on two-step sign-in?",
        a: "Yes, anyone can, in More › Two-Step Sign-In, with an authenticator app. With it on, a password alone opens nothing, in the app or on the website. If you lose your phone, email us from your account’s address and we’ll help you back in.",
        for: "both",
      },
      {
        q: "Is the data on my techs’ phones protected?",
        a: "Yes. The records saved on a tech’s phone are encrypted, and signing out removes the shop’s records from the phone.",
        for: "both",
      },
      {
        q: "Can I change a report after I’ve sent it?",
        a: "No. A sent report is locked. To correct something, send a new version: the old one stays as it was, and its link tells the customer there’s a newer version. It’s how you can show exactly what a customer was sent, even years later.",
        for: "leak",
      },
      {
        q: "Can I change a visit report after I’ve sent it?",
        a: "No. A sent visit report is a snapshot and doesn’t change, even if the visit, your prices or your branding change later. You can send a new version by hand.",
        for: "pool",
      },
      {
        q: "Can anyone edit or delete a photo?",
        a: "Original photos are kept exactly as taken, with the time and, if allowed, the location. Markup is drawn on top and never changes the file. Deleting a photo hides it from the job with an Undo, but the stored original stays.",
        for: "both",
      },
    ],
  },
  {
    id: "switching",
    title: "Switching from another system",
    items: [
      {
        q: "Can I bring my customers over from Skimmer, Pool Brain, or Jobber?",
        a: "Yes. Export your customer list as a CSV file and use Settings › Import Customers on the website. It also takes files from QuickBooks, Excel and Google Sheets saved as CSV. Each row becomes a customer and their pool.",
        for: "both",
      },
      {
        q: "Will my route and visit plans come over too?",
        a: "In pool care, yes, if your file has the service day, how often, and price. Each one becomes a visit plan, and the visits go straight onto the schedule. If a plan has two service days, the first is used.",
        for: "pool",
      },
      {
        q: "How does the import work?",
        a: "Choose the CSV, check the column matches, and Check File shows a preview of what will be made, with rows worth a look. Then Import. It reads up to 2,000 rows from a file under 5 MB, and it’s all or nothing.",
        for: "both",
      },
      {
        q: "What if I import the same file twice?",
        a: "Nothing doubles. A customer already in Sundeck Pro, with the same email, phone, or name and address, is left out.",
        for: "both",
      },
    ],
  },
  {
    id: "support",
    title: "Support",
    items: [
      {
        q: "How do I reach someone?",
        a: `Email ${CONTACT_EMAIL} or call ${CONTACT_PHONE}. In the app, More › Help has Contact Us and Call Us. For account and security questions you can also write to ${SUPPORT_EMAIL}.`,
        for: "both",
      },
      {
        q: "How do I know if Sundeck Pro is down?",
        a: "The System Status page checks it live. The field app keeps working with no connection either way and syncs when Sundeck Pro is back.",
        for: "both",
      },
    ],
  },
];

/** The topics and questions for one kind of shop. */
export function faqFor(edition: "pool" | "leak"): FaqTopic[] {
  return FAQ_TOPICS.map((t) => ({
    ...t,
    items: t.items.filter((i) => i.for === "both" || i.for === edition),
  })).filter((t) => t.items.length > 0);
}
