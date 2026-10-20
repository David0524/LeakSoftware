// Pool chemical calculator (owner, 2026-10-16): from the pool's size and today's readings, how
// much of each product to add. No I/O. Doses are the industry rule-of-thumb amounts per
// 10,000 gallons (county health department charts and CPO course tables), scaled by volume
// and change. They are starting points: add in portions, circulate, and retest.

// ---------------------------------------------------------------------------
// Pool volume
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Readings and targets
// ---------------------------------------------------------------------------

export interface Readings {
  /** Free chlorine, ppm. */
  fc?: number | null;
  ph?: number | null;
  /** Total alkalinity, ppm. */
  ta?: number | null;
  /** Calcium hardness, ppm. */
  ch?: number | null;
  /** Cyanuric acid (stabilizer), ppm. */
  cya?: number | null;
  /** Salt, ppm (salt pools; left blank otherwise). */
  salt?: number | null;
}

export interface Range {
  low: number;
  high: number;
  target: number;
}

export type ReadingKey = "fc" | "ph" | "ta" | "ch" | "cya" | "salt";

/**
 * The ranges a residential pool aims for. One set for every pool (owner, 2026-10-18: "The type
 * of pool should not effect the chemical targets"); a tech who wants another level types it
 * under Aim For. Free chlorine scales with stabilizer.
 */
export function targets(cya?: number | null) {
  // Free chlorine should stay near 7.5% of the stabilizer level, never under 2.
  const fcMin = Math.max(2, Math.round((cya ?? 40) * 0.075 * 2) / 2);
  return {
    fc: { low: fcMin, high: fcMin + 3, target: fcMin + 1 },
    ph: { low: 7.4, high: 7.6, target: 7.5 },
    ta: { low: 80, high: 120, target: 100 },
    ch: { low: 200, high: 400, target: 300 },
    cya: { low: 30, high: 80, target: 40 },
    salt: { low: 2700, high: 3400, target: 3200 },
  } satisfies Record<ReadingKey, Range>;
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

export type ChlorineProduct = "liquid12" | "liquid10" | "calhypo65" | "calhypo73";
export type AcidProduct = "muriatic31" | "muriatic145" | "dryacid";

export const CHLORINE_PRODUCTS: Record<ChlorineProduct, string> = {
  liquid12: "Liquid chlorine 12.5%",
  liquid10: "Liquid chlorine 10%",
  calhypo65: "Cal-hypo 65%",
  calhypo73: "Cal-hypo 73%",
};
export const ACID_PRODUCTS: Record<AcidProduct, string> = {
  muriatic31: "Muriatic acid 31.45%",
  muriatic145: "Muriatic acid 14.5%",
  dryacid: "Dry acid (sodium bisulfate)",
};

// Amounts per 10,000 gallons. Liquids in fluid ounces, solids in ounces by weight. Checked
// against the chemistry and published charts and labels (owner, 2026-10-16: "confirm that
// your calculator is in line with others"); see docs/DECISIONS.md.
const PER_10K = {
  // +1 ppm free chlorine (stoichiometry: 10.2 fl oz of 12.5%; charts say 10.6 to 10.7)
  chlorine: { liquid12: 10.7, liquid10: 13.4, calhypo65: 2.0, calhypo73: 1.8 },
  // -0.2 pH at 100 ppm alkalinity (more alkalinity takes more acid). Labels say 12 to 16 fl oz
  // of 31.45%; this stays near the low end, since too much acid is the worse mistake.
  // 14.5% and dry acid follow from the alkalinity ratios below.
  acidPh: { muriatic31: 13, muriatic145: 30.5, dryacid: 17.3 },
  // -10 ppm total alkalinity: 7.6 mol of acid. 31.45% muriatic (1.16 g/mL) 25.6 fl oz;
  // 14.5% (1.07 g/mL) 60 fl oz; dry acid (94.5% sodium bisulfate) 34 oz.
  acidTa: { muriatic31: 25.6, muriatic145: 60, dryacid: 34 },
  sodaAshPh: 6, // +0.2 pH, oz
  bakingSodaTa: 22.4, // +10 ppm TA, oz (1.4 lb)
  calciumChlorideCh: 19.3, // +10 ppm CH, oz (1.2 lb of 77%)
  cyaUp: 13.3, // +10 ppm CYA, oz
  saltUp: 133.4, // +100 ppm salt, oz (8.34 lb)
} as const;

const isLiquid = (p: ChlorineProduct | AcidProduct) =>
  p.startsWith("liquid") || p.startsWith("muriatic");

// ---------------------------------------------------------------------------
// The calculation
// ---------------------------------------------------------------------------

export interface DoseStep {
  key: ReadingKey;
  /** What to add, or what to do ("Drain and refill about 25%"). */
  product: string;
  /** The exact amount ("1 gal 26 fl oz", "3.5 lb"); null when the step is an action. */
  amount: string | null;
  /**
   * The same amount the way a tech measures it on the deck (owner, 2026-10-16): "A splash",
   * "2 cups", "½ gallon", "3½ lb", "2 bags". Liquids go by the gallon, not the jug: jug sizes
   * differ from state to state.
   */
  measure: string | null;
  /** Why, in words: "pH 8.0 → 7.5". */
  why: string;
  note?: string;
}

export interface ReadingStatus {
  key: ReadingKey;
  label: string;
  value: number;
  range: Range;
  status: "low" | "ok" | "high";
}

export interface ChemistryResult {
  statuses: ReadingStatus[];
  /** In the order to add them: alkalinity, pH, calcium, stabilizer, salt, chlorine. */
  steps: DoseStep[];
  /** Langelier saturation index (water balance), when pH, TA, and CH are known. */
  lsi: number | null;
  lsiLabel: string | null;
}

export interface ChemistryInput {
  gallons: number;
  readings: Readings;
  chlorine: ChlorineProduct;
  acid: AcidProduct;
  /**
   * Levels the tech wants instead of the recommended targets (owner, 2026-10-18: "chlorine
   * won't always be 4"). Empty keys use the recommended target.
   */
  goals?: Partial<Record<ReadingKey, number | null>>;
}

/** How close to a chosen level counts as there: closer than this, nothing is added. */
const GOAL_TOLERANCE: Record<ReadingKey, number> = {
  fc: 0.5,
  ph: 0.1,
  ta: 10,
  ch: 25,
  cya: 5,
  salt: 100,
};

/**
 * The range to judge a reading by when the tech picked a level: aim for it exactly and start
 * adding below it. pH and alkalinity come down with acid, so above the level they come down
 * too; the rest only come down by draining, so above it they are flagged only past the usual
 * high.
 */
export function goalRange(range: Range, key: ReadingKey, goal: number | null | undefined): Range {
  if (!isNum(goal) || goal < 0) return range;
  const tol = GOAL_TOLERANCE[key];
  return {
    low: goal - tol,
    high: key === "ph" || key === "ta" ? goal + tol : Math.max(range.high, goal + tol),
    target: goal,
  };
}

const LABELS: Record<ReadingKey, string> = {
  fc: "Free chlorine",
  ph: "pH",
  ta: "Alkalinity",
  ch: "Calcium",
  cya: "Stabilizer",
  salt: "Salt",
};

/** "1 gal 26 fl oz", "12 fl oz". */
export function fluidAmount(flOz: number): string {
  const oz = Math.round(flOz);
  if (oz < 128) return `${Math.max(1, oz)} fl oz`;
  const gal = Math.floor(oz / 128);
  const rest = oz - gal * 128;
  return rest ? `${gal} gal ${rest} fl oz` : `${gal} gal`;
}

/** ¼, ½, ¾ as characters: 1.5 → "1½", 0.25 → "¼". */
function fraction(n: number): string {
  const whole = Math.floor(n);
  const part = { 0: "", 0.25: "¼", 0.5: "½", 0.75: "¾" }[n - whole] ?? "";
  return whole ? `${whole}${part}` : part || "0";
}

/** Parts of a gallon under one: thirds too, so 47 and 48 fl oz both read ⅓. */
const PART_GALLON: [number, string][] = [
  [0.25, "¼"],
  [1 / 3, "⅓"],
  [0.5, "½"],
  [2 / 3, "⅔"],
  [0.75, "¾"],
];

/**
 * Liquids the way they're poured: a splash (under 6 fl oz), cups up to 3, then gallons:
 * quarters and thirds under one gallon, quarters to 4, halves past that.
 */
export function gallonMeasure(flOz: number): string {
  if (flOz < 6) return "A splash";
  if (flOz <= 24) {
    const cups = Math.max(0.5, Math.round((flOz / 8) * 2) / 2);
    return `${fraction(cups)} ${cups > 1 ? "cups" : "cup"}`;
  }
  const gallons = flOz / 128;
  if (gallons < 0.875) {
    const [, part] = PART_GALLON.reduce((a, b) =>
      Math.abs(b[0] - gallons) < Math.abs(a[0] - gallons) ? b : a,
    );
    return `${part} gallon`;
  }
  const step = gallons > 4 ? 0.5 : 0.25;
  const n = Math.max(0.25, Math.round(gallons / step) * step);
  return `${fraction(n)} ${n > 1 ? "gallons" : "gallon"}`;
}

/**
 * Dry products by the scoop or the pound, rounded the way they're weighed out: a scoop (under
 * 6 oz), then the nearest ½ lb up to 10 lb, the nearest pound to 40, and 5 lb past that.
 * Salt goes by the 40 lb bag.
 */
export function dryMeasure(oz: number, bag?: number): string {
  if (bag) {
    const bags = Math.max(0.5, Math.round((oz / 16 / bag) * 2) / 2);
    return `${fraction(bags)} ${bags > 1 ? "bags" : "bag"}`;
  }
  if (oz < 6) return "A scoop";
  const lb = oz / 16;
  const step = lb <= 10 ? 0.5 : lb <= 40 ? 1 : 5;
  return `${fraction(Math.max(0.5, Math.round(lb / step) * step))} lb`;
}

/** "10 oz", "3.5 lb". */
export function weightAmount(oz: number): string {
  if (oz < 16) return `${Math.max(1, Math.round(oz))} oz`;
  const lb = oz / 16;
  return `${lb >= 20 ? Math.round(lb) : Math.round(lb * 10) / 10} lb`;
}

const fmt = (n: number, key: ReadingKey) =>
  key === "ph"
    ? n.toFixed(1)
    : key === "fc"
      ? String(Math.round(n * 10) / 10)
      : String(Math.round(n));
const isNum = (v: number | null | undefined): v is number =>
  typeof v === "number" && Number.isFinite(v);

/**
 * Langelier saturation index: below -0.3 the water is corrosive, above 0.3 it scales. The
 * calculator doesn't ask for water temperature (owner, 2026-10-18), so it uses 80 °F, a
 * typical swimming pool (temperature factor 0.65).
 */
export function saturationIndex(r: Readings): number | null {
  if (!isNum(r.ph) || !isNum(r.ta) || !isNum(r.ch) || r.ch <= 0) return null;
  // Carbonate alkalinity: stabilizer accounts for about a third of its ppm in the reading.
  const carb = r.ta - (isNum(r.cya) ? r.cya / 3 : 0);
  if (carb <= 0) return null;
  // Dissolved solids: a salt pool's salt raises them.
  const tds = isNum(r.salt) && r.salt >= 1000 ? 12.2 : 12.1;
  const lsi = r.ph + 0.65 + Math.log10(r.ch) - 0.4 + Math.log10(carb) - tds;
  return Math.round(lsi * 10) / 10;
}

/**
 * One line for the calculator's docked bar: the first step in everyday words, without the
 * product's strength, and how many more ("½ gallon muriatic acid · 1 more").
 */
export function doseSummary(result: ChemistryResult, ready: boolean): string {
  if (!ready) return "Add the gallons and a reading";
  const [first, ...rest] = result.steps;
  if (!first) return "Balanced. Nothing to add.";
  const product = first.product.replace(/ \d+(\.\d+)?%/, "");
  const what = first.measure ? `${first.measure} ${product.toLowerCase()}` : product;
  return rest.length ? `${what} · ${rest.length} more` : what;
}

/** The exact amount and the everyday measure, for a liquid (fl oz) or a dry product (oz). */
function dose(qty: number, liquid: boolean, bag?: number) {
  return liquid
    ? { amount: fluidAmount(qty), measure: gallonMeasure(qty) }
    : { amount: weightAmount(qty), measure: dryMeasure(qty, bag) };
}

export function calculateChemistry(input: ChemistryInput): ChemistryResult {
  const { gallons, readings: r, chlorine, acid, goals = {} } = input;
  const base = targets(r.cya);
  const t = Object.fromEntries(
    (Object.keys(base) as ReadingKey[]).map((key) => [key, goalRange(base[key], key, goals[key])]),
  ) as Record<ReadingKey, Range>;
  const k = Math.max(0, gallons) / 10_000;
  const statuses: ReadingStatus[] = [];
  const steps: DoseStep[] = [];

  const keys: ReadingKey[] = ["fc", "ph", "ta", "ch", "cya", "salt"];
  for (const key of keys) {
    const v = r[key];
    if (!isNum(v)) continue;
    const range = t[key];
    statuses.push({
      key,
      label: LABELS[key],
      value: v,
      range,
      status: v < range.low ? "low" : v > range.high ? "high" : "ok",
    });
  }
  const st = (key: ReadingKey) => statuses.find((s) => s.key === key);
  const why = (key: ReadingKey, from: number, to: number) =>
    `${LABELS[key]} ${fmt(from, key)} → ${fmt(to, key)}`;
  const drain = (key: ReadingKey, from: number, to: number): DoseStep => ({
    key,
    product: `Drain and refill about ${Math.min(90, Math.ceil(((from - to) / from) * 20) * 5)}%`,
    amount: null,
    measure: null,
    why: why(key, from, to),
    note: "Nothing added lowers it; fresh water does.",
  });

  // Alkalinity first: it steadies pH.
  const ta = st("ta");
  let taAfter = ta?.value ?? 100;
  if (ta && ta.status !== "ok") {
    const d = ta.range.target - ta.value;
    if (d > 0) {
      steps.push({
        key: "ta",
        product: "Baking soda",
        ...dose((d / 10) * PER_10K.bakingSodaTa * k, false),
        why: why("ta", ta.value, ta.range.target),
      });
    } else {
      const amt = (-d / 10) * PER_10K.acidTa[acid] * k;
      steps.push({
        key: "ta",
        product: ACID_PRODUCTS[acid],
        ...dose(amt, isLiquid(acid)),
        why: why("ta", ta.value, ta.range.target),
        note: "Add in two or three doses a few hours apart, running the pump, and aerate to bring pH back up.",
      });
    }
    taAfter = ta.range.target;
  }

  // pH, scaled by alkalinity (more buffer takes more to move).
  const ph = st("ph");
  if (ph && ph.status !== "ok") {
    const buffer = Math.min(2, Math.max(0.5, taAfter / 100));
    const d = ph.range.target - ph.value;
    if (d > 0) {
      steps.push({
        key: "ph",
        product: "Soda ash",
        ...dose((d / 0.2) * PER_10K.sodaAshPh * buffer * k, false),
        why: why("ph", ph.value, ph.range.target),
      });
    } else {
      const amt = (-d / 0.2) * PER_10K.acidPh[acid] * buffer * k;
      steps.push({
        key: "ph",
        product: ACID_PRODUCTS[acid],
        ...dose(amt, isLiquid(acid)),
        why: why("ph", ph.value, ph.range.target),
        note: "Pour into the deep end with the pump running. Add acid to water, never water to acid.",
      });
    }
  }

  const ch = st("ch");
  if (ch?.status === "low") {
    steps.push({
      key: "ch",
      product: "Calcium chloride 77%",
      ...dose(((ch.range.target - ch.value) / 10) * PER_10K.calciumChlorideCh * k, false),
      why: why("ch", ch.value, ch.range.target),
    });
  } else if (ch?.status === "high") {
    steps.push(drain("ch", ch.value, ch.range.target));
  }

  const cya = st("cya");
  if (cya?.status === "low") {
    steps.push({
      key: "cya",
      product: "Stabilizer (cyanuric acid)",
      ...dose(((cya.range.target - cya.value) / 10) * PER_10K.cyaUp * k, false),
      why: why("cya", cya.value, cya.range.target),
      note: "Dissolves slowly; put it in a sock in the skimmer basket. Retest in a week.",
    });
  } else if (cya?.status === "high") {
    steps.push(drain("cya", cya.value, cya.range.target));
  }

  const salt = st("salt");
  if (salt?.status === "low") {
    steps.push({
      key: "salt",
      product: "Pool salt",
      ...dose(((salt.range.target - salt.value) / 100) * PER_10K.saltUp * k, false, 40),
      why: why("salt", salt.value, salt.range.target),
      note: "Brush it toward the main drain until it dissolves.",
    });
  } else if (salt?.status === "high") {
    steps.push(drain("salt", salt.value, salt.range.target));
  }

  // Chlorine last.
  const fc = st("fc");
  if (fc?.status === "low") {
    const amt = (fc.range.target - fc.value) * PER_10K.chlorine[chlorine] * k;
    steps.push({
      key: "fc",
      product: CHLORINE_PRODUCTS[chlorine],
      ...dose(amt, isLiquid(chlorine)),
      why: why("fc", fc.value, fc.range.target),
      ...(chlorine.startsWith("calhypo")
        ? { note: "Also raises calcium a little. Pre-dissolve in a bucket of pool water." }
        : {}),
    });
  } else if (fc?.status === "high") {
    steps.push({
      key: "fc",
      product: "Hold off on chlorine",
      amount: null,
      measure: null,
      why: why("fc", fc.value, fc.range.target),
      note: "Sun and time bring it down. Don't swim above 10 ppm.",
    });
  }

  const lsi = saturationIndex(r);
  const lsiLabel =
    lsi === null ? null : lsi < -0.3 ? "Corrosive" : lsi > 0.3 ? "Scale forming" : "Balanced";
  return { statuses, steps, lsi, lsiLabel };
}

/**
 * A submitted set of readings (owner, 2026-10-19: a weekly note of a pool's chemistry): the
 * Chemical screen's left side, saved to the pool's log. Table `chemical_reading`.
 */
export interface ChemicalReading {
  id: string;
  property_id: string;
  job_id?: string | null;
  recorded_at: string;
  recorded_by?: string | null;
  gallons?: number | null;
  fc?: number | null;
  ph?: number | null;
  ta?: number | null;
  ch?: number | null;
  cya?: number | null;
  salt?: number | null;
  chlorine_product?: ChlorineProduct | null;
  acid_product?: AcidProduct | null;
  notes?: string | null;
}

export const READING_LABELS: Record<ReadingKey, string> = {
  fc: "Free chlorine",
  ph: "pH",
  ta: "Alkalinity",
  ch: "Calcium",
  cya: "Stabilizer",
  salt: "Salt",
};

/** Plausible ranges for a typed reading; outside them it is a typo, not a reading. */
export const READING_LIMITS: Record<ReadingKey, { min: number; max: number }> = {
  fc: { min: 0, max: 100 },
  ph: { min: 0, max: 14 },
  ta: { min: 0, max: 1000 },
  ch: { min: 0, max: 5000 },
  cya: { min: 0, max: 1000 },
  salt: { min: 0, max: 20000 },
};

/** "FC 3 · pH 7.6 · TA 90": the readings that were taken, in the calculator's order. */
export function readingSummary(r: Partial<Record<ReadingKey, number | null>>): string {
  const short: Record<ReadingKey, string> = {
    fc: "FC",
    ph: "pH",
    ta: "TA",
    ch: "CH",
    cya: "CYA",
    salt: "Salt",
  };
  return (Object.keys(short) as ReadingKey[])
    .filter((k) => r[k] != null)
    .map((k) => `${short[k]} ${k === "ph" ? Number(r[k]).toFixed(1) : Number(r[k])}`)
    .join(" · ");
}

/**
 * A visit report's water test (owner, 2026-10-20): each reading taken, with the range the pool
 * aims for and whether it was low, in range, or high, in the calculator's order.
 */
export function waterTestRows(r: Partial<Record<ReadingKey, number | null>>): {
  key: ReadingKey;
  label: string;
  value: number;
  range: string;
  status: "low" | "ok" | "high";
  statusLabel: string;
}[] {
  const t = targets(r.cya ?? null);
  const order: ReadingKey[] = ["fc", "ph", "ta", "ch", "cya", "salt"];
  return order
    .filter((k) => r[k] != null && Number.isFinite(Number(r[k])))
    .map((k) => {
      const value = Number(r[k]);
      const range = t[k];
      const status = value < range.low ? "low" : value > range.high ? "high" : "ok";
      return {
        key: k,
        label: READING_LABELS[k],
        value,
        range: `${range.low}–${range.high}`,
        status,
        statusLabel: status === "ok" ? "In range" : status === "low" ? "Low" : "High",
      };
    });
}
