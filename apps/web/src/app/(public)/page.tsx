import { ButtonLink } from "@/components/ui";

const STEPS = [
  {
    title: "Inspect",
    text: "Work the checklist on your phone: skimmers, returns, drains, lights, shell, spa, pad. Mark each one inspected or excluded with a reason. No signal needed.",
  },
  {
    title: "Test and document",
    text: "Log pressure, bucket, dye, and listening tests. The app does the math (held, dropped, lost beyond evaporation). Photos, video, and voice notes attach to the line they belong to.",
  },
  {
    title: "Pin the leak",
    text: "Drop findings on a diagram of the pool with severity and location, so the homeowner sees exactly where the problem is.",
  },
  {
    title: "Report, quote, get paid",
    text: "Send a clear report and a repair quote from the driveway, take a deposit, and invoice when the work is done.",
  },
];

const POINTS = [
  ["Works offline", "Everything saves on the phone first and syncs when you’re back in range."],
  [
    "Proof that holds up",
    "Photos keep their original file, time, and location. Markup sits on top.",
  ],
  ["Your shop’s brand", "Reports, quotes, and invoices carry your logo and colors."],
  ["Office view", "Jobs, schedule, customers, and pricing from any browser."],
];

export default function Home() {
  return (
    <main>
      <section className="bg-header text-on-header">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:py-24">
          <p className="font-display text-sm font-semibold tracking-widest text-safety uppercase">
            For pool leak detection shops
          </p>
          <h1 className="mt-3 max-w-3xl font-display text-4xl leading-tight font-extrabold sm:text-6xl">
            Find it, document it, quote it, get paid.
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-neutral-200">
            Tidemark is the field app and office for leak detection techs. Run the inspection on
            your phone, hand the homeowner a report they understand, and send the repair quote
            before you leave the driveway.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink href="/sign-up">Start Free Trial</ButtonLink>
            <ButtonLink href="/sign-in" kind="onDark">
              Sign In
            </ButtonLink>
          </div>
          <p className="mt-4 text-[0.9375rem] text-neutral-300">30 days free. No card needed.</p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14">
        <h2 className="font-display text-3xl font-extrabold">How a job runs</h2>
        <ol className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s.title} className="card p-5">
              <span className="font-display text-3xl font-extrabold text-link">{i + 1}</span>
              <h3 className="mt-2 font-display text-xl font-bold">{s.title}</h3>
              <p className="mt-2 text-text-muted">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="border-t border-border bg-surface">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-14 sm:grid-cols-2">
          {POINTS.map(([title, text]) => (
            <div key={title}>
              <h3 className="font-display text-xl font-bold">{title}</h3>
              <p className="mt-1 text-text-muted">{text}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
