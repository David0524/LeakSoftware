import type { ChlorineProduct } from "./chemistry";
import type { Services } from "./models";

// New-shop onboarding (owner, 2026-10-16), designed with the app-onboarding-questionnaire
// skill: a goal, what gets in the way, how Tidemark answers each, a few choices that set the
// shop up, a hands-on demo, then the card for the 14-day trial. Pool Maintenance and Leak
// Detection each get their own questions and demo; Both follows Pool Maintenance. No
// testimonials or invented statistics: Tidemark has none yet (docs/DECISIONS.md).

export type OnboardingPackage = "maintenance" | "leak";

export const onboardingPackage = (services: Services): OnboardingPackage =>
  services === "leak" ? "leak" : "maintenance";

export interface OnboardingOption {
  id: string;
  emoji: string;
  label: string;
}

export interface OnboardingPain {
  id: string;
  label: string;
  /** How Tidemark answers it, for the "Here's how" screen. */
  answer: string;
}

export interface OnboardingContent {
  welcome: { title: string; body: string };
  goalQuestion: string;
  goals: OnboardingOption[];
  painQuestion: string;
  pains: OnboardingPain[];
  /** Shown when nothing was picked on the pain screen. */
  defaultPains: string[];
  demoTitle: string;
  demoIntro: string;
  /** The final screen's headline. */
  promise: string;
  included: string[];
}

export const ONBOARDING: Record<OnboardingPackage, OnboardingContent> = {
  maintenance: {
    welcome: {
      title: "Every pool on your route, handled.",
      body: "Two minutes to set up your shop. Then you’ll run a sample visit, start to finish.",
    },
    goalQuestion: "What should Tidemark fix first?",
    goals: [
      { id: "billing", emoji: "🧾", label: "Getting paid every month" },
      { id: "proof", emoji: "✅", label: "Proof every pool got done" },
      { id: "chemistry", emoji: "🧪", label: "Getting the chemicals right" },
      { id: "techs", emoji: "📍", label: "Knowing where my techs are" },
      { id: "paper", emoji: "📱", label: "Getting off paper and group texts" },
      { id: "grow", emoji: "📈", label: "Room to add more pools" },
    ],
    painQuestion: "What gets in the way today?",
    pains: [
      {
        id: "proof",
        label: "Customers say we skipped their pool",
        answer:
          "A checklist and photos on every visit, and a visit summary the homeowner gets when you finish.",
      },
      {
        id: "billing",
        label: "Chasing payments at the end of the month",
        answer:
          "One invoice per customer each month, drafted from the finished visits, paid by card, Apple Pay, or bank.",
      },
      {
        id: "chemistry",
        label: "New techs guess at chemical amounts",
        answer: "Enter the readings and Tidemark says what to add, in half gallons and scoops.",
      },
      {
        id: "paper",
        label: "The route lives in group texts",
        answer: "Each tech’s stops on their phone, in order, even with no signal.",
      },
      {
        id: "techs",
        label: "I can’t see the day without calling around",
        answer: "Every stop shows as finished the moment it is, from the office or your phone.",
      },
      {
        id: "texting",
        label: "Customers text my personal phone",
        answer: "One shop number for texts and calls, shared by the whole team.",
      },
    ],
    defaultPains: ["proof", "billing", "chemistry"],
    demoTitle: "Try a visit",
    demoIntro: "The Rivera pool, 18,000 gallons. Set today’s readings and see what to add.",
    promise: "Your route, sorted with Tidemark.",
    included: [
      "Unlimited pools: adding to your route never costs more",
      "Checklist, photos, and a summary on every visit",
      "Monthly invoices drafted for you",
      "Chemical calculator on every visit",
    ],
  },
  leak: {
    welcome: {
      title: "Reports that sell the repair.",
      body: "Two minutes to set up your shop. Then you’ll write a sample report for a homeowner.",
    },
    goalQuestion: "What should Tidemark fix first?",
    goals: [
      { id: "repairs", emoji: "🔧", label: "Win more repair jobs" },
      { id: "speed", emoji: "⏱️", label: "Finish reports on site" },
      { id: "pro", emoji: "🤝", label: "Look more professional" },
      { id: "deposits", emoji: "💵", label: "Collect deposits up front" },
      { id: "team", emoji: "👥", label: "Keep the crew on the same page" },
      { id: "paper", emoji: "🗂️", label: "Get off paper" },
    ],
    painQuestion: "What gets in the way today?",
    pains: [
      {
        id: "speed",
        label: "Reports take my evenings",
        answer: "Finish the report on site: it’s drafted from your checklist and findings.",
      },
      {
        id: "explain",
        label: "Homeowners don’t understand what we found",
        answer: "Plain words, a diagram of their pool with each leak marked, and the photos.",
      },
      {
        id: "quotes",
        label: "Quotes go cold before they say yes",
        answer: "Quote from the report; they accept online, and reminders go out on their own.",
      },
      {
        id: "deposits",
        label: "Deposits are a hassle to collect",
        answer: "The deposit is paid by card or bank the moment they accept.",
      },
      {
        id: "paper",
        label: "Notes and photos get lost",
        answer: "Every test, photo, and note is saved with the job, even with no signal.",
      },
      {
        id: "records",
        label: "Customers call back months later about an old job",
        answer:
          "Every sent report is kept unchanged with the customer, so the history is a tap away.",
      },
    ],
    defaultPains: ["speed", "explain", "quotes"],
    demoTitle: "Try an inspection",
    demoIntro: "The Rivera pool is losing water. Mark what you found at each spot.",
    promise: "Reports that sell the repair, starting today.",
    included: [
      "Inspection checklists and pressure and dye tests",
      "Homeowner reports with a diagram and photos",
      "Quotes accepted online, with a deposit",
      "Works with no signal",
    ],
  },
};

/** Report colors to choose from: each keeps white text readable (4.5:1 or better). */
export const BRAND_SWATCHES = [
  { hex: "#12263A", name: "Navy" },
  { hex: "#1F5FA8", name: "Blue" },
  { hex: "#0F6464", name: "Teal" },
  { hex: "#2F6B2F", name: "Green" },
  { hex: "#A12B2B", name: "Red" },
  { hex: "#5B3A8C", name: "Purple" },
] as const;

/** Deposit choices on repairs (leak detection), in basis points; 0 is none. */
export const DEPOSIT_CHOICES = [
  { bps: 2_500, label: "25%" },
  { bps: 5_000, label: "50%" },
  { bps: 0, label: "None" },
] as const;

export const CHLORINE_CHOICES: ChlorineProduct[] = ["liquid12", "liquid10", "calhypo65"];

/** The leak demo's spots to check, in order. */
export const LEAK_DEMO_SPOTS = ["Skimmer", "Main drain", "Return lines", "Light niche"] as const;

export interface OnboardingAnswers {
  package: OnboardingPackage;
  goal: string | null;
  pains: string[];
  people: number;
  color: string;
  chlorine?: ChlorineProduct;
  depositBps?: number;
}

/**
 * Answers from the onboarding form, checked against this package's options; anything unknown
 * is dropped. Null when the package isn't one.
 */
export function parseOnboardingAnswers(raw: unknown): OnboardingAnswers | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const pkg = r.package === "leak" || r.package === "maintenance" ? r.package : null;
  if (!pkg) return null;
  const content = ONBOARDING[pkg];
  const goal = content.goals.some((g) => g.id === r.goal) ? (r.goal as string) : null;
  const pains = Array.isArray(r.pains)
    ? content.pains.map((p) => p.id).filter((id) => (r.pains as unknown[]).includes(id))
    : [];
  const people = Math.min(200, Math.max(1, Math.floor(Number(r.people) || 1)));
  const color = BRAND_SWATCHES.some((s) => s.hex === r.color)
    ? (r.color as string)
    : BRAND_SWATCHES[0].hex;
  const answers: OnboardingAnswers = { package: pkg, goal, pains, people, color };
  if (pkg === "maintenance") {
    answers.chlorine = CHLORINE_CHOICES.includes(r.chlorine as ChlorineProduct)
      ? (r.chlorine as ChlorineProduct)
      : "liquid12";
  } else {
    answers.depositBps = DEPOSIT_CHOICES.some((d) => d.bps === r.depositBps)
      ? (r.depositBps as number)
      : 5_000;
  }
  return answers;
}

/** The pains to answer on the "Here's how" screen: what they picked, else the usual three. */
export function painsToAnswer(pkg: OnboardingPackage, picked: string[]): OnboardingPain[] {
  const content = ONBOARDING[pkg];
  const ids = picked.length ? picked : content.defaultPains;
  return content.pains.filter((p) => ids.includes(p.id));
}
