import {
  ACID_PRODUCTS,
  CHLORINE_PRODUCTS,
  READING_LABELS,
  READING_LIMITS,
  INVOICE_STATUS_LABELS,
  QUOTE_STATUS_LABELS,
  calculateChemistry,
  discountAllowed,
  doseSummary,
  gettingStarted,
  dryMeasure,
  fluidAmount,
  gallonMeasure,
  invoiceBalance,
  invoiceShareText,
  invoiceTotals,
  launchCards,
  lineFromItem,
  lineTotal,
  quoteShareText,
  quoteTotals,
  readingSummary,
  saturationIndex,
  seenTips,
  suggestItems,
  targets,
  tipFor,
  weightAmount,
  type AcidProduct,
  type ChemistryInput,
  type ChlorineProduct,
  type DepositRule,
  type InvoiceLine,
  type PriceBookItem,
  type QuoteLine,
  type Readings,
  type Services,
  type ShopProgress,
  type TipPackage,
} from "@leakbook/core";
import { rule, type ModuleCases } from "../case";

const HALF: DepositRule = { type: "percent", value_bps: 5000, minimum_cents: 0 };
const deposits: DepositRule[] = [
  HALF,
  { type: "percent", value_bps: 3333, minimum_cents: 0 },
  { type: "percent", value_bps: 5000, minimum_cents: 25_000 },
  { type: "percent", minimum_cents: 0 },
  { type: "fixed", value_cents: 30_000, minimum_cents: 0 },
  { type: "fixed", value_cents: 30_000, minimum_cents: 50_000 },
  { type: "fixed", minimum_cents: 1_000 },
];

// QUOTE_FIXTURE from packages/core/test/quote.test.ts.
const repair: QuoteLine[] = [
  { quantity: 1, unit_price_cents: 85_000, taxable: true },
  { quantity: 2.5, unit_price_cents: 12_999, taxable: true },
  { quantity: 1, unit_price_cents: 15_000, taxable: false },
];
const lineSets: QuoteLine[][] = [
  repair,
  [
    { quantity: 1, unit_price_cents: 5_000, taxable: true },
    { quantity: 1, unit_price_cents: 9_999, taxable: true, deleted_at: "2026-01-01" },
  ],
  [],
  [{ quantity: 0.33, unit_price_cents: 100, taxable: false }],
  [
    { quantity: 3, unit_price_cents: 333, taxable: true },
    { quantity: 0.5, unit_price_cents: 1, taxable: true },
    { quantity: 1.25, unit_price_cents: 4_999, taxable: false },
    { quantity: 1, unit_price_cents: 700, taxable: true, deleted_at: "" },
  ],
  [{ quantity: 1, unit_price_cents: -2_500, taxable: true }],
  [
    { quantity: 2, unit_price_cents: 64_900, taxable: true },
    { quantity: 1, unit_price_cents: -5_000, taxable: false },
  ],
];

const item = (over: Partial<PriceBookItem>): PriceBookItem => ({
  id: over.name ?? "x",
  company_id: "c",
  name: "Item",
  unit: "each",
  price_cents: 1000,
  taxable: true,
  sort_order: 0,
  active: true,
  ...over,
});
const priceBook = [
  item({ name: "Return line repair", component_type_key: "return", sort_order: 2 }),
  item({ name: "Return fitting", component_type_key: "return", sort_order: 1 }),
  item({ name: "Skimmer rebuild", component_type_key: "skimmer" }),
  item({ name: "Old return part", component_type_key: "return", active: false }),
  item({ name: "Gone return part", component_type_key: "return", deleted_at: "2026-01-01" }),
  item({ name: "return valve", component_type_key: "return", sort_order: 1 }),
  item({ name: "Return Valve", component_type_key: "return", sort_order: 1 }),
  item({ name: "Return 10 ft", component_type_key: "return", sort_order: 1 }),
  item({ name: "Return 2 ft", component_type_key: "return", sort_order: 1 }),
  item({ name: "Return-fitting kit", component_type_key: "return", sort_order: 1 }),
  item({ name: "Return fitting", id: "dup", component_type_key: "return", sort_order: 1 }),
  item({ name: "Éclairage return", component_type_key: "return", sort_order: 1 }),
  item({ name: "eclairage return", component_type_key: "return", sort_order: 1 }),
  item({ name: "Light niche", component_type_key: "light", sort_order: -1, category: "Lights" }),
  item({ name: "Light cord", component_type_key: "light", sort_order: 3 }),
];

const invoiceLines: InvoiceLine[][] = [
  [
    { kind: "item", quantity: 1, unit_price_cents: 85_000, taxable: true },
    { kind: "item", quantity: 2.5, unit_price_cents: 12_999, taxable: true },
    { kind: "item", quantity: 1, unit_price_cents: 15_000, taxable: false },
    { kind: "deposit_credit", quantity: 1, unit_price_cents: -65_730, taxable: false },
  ],
  [
    { kind: "item", quantity: 1, unit_price_cents: 64_900, taxable: false },
    {
      kind: "item",
      quantity: 1,
      unit_price_cents: 500,
      taxable: true,
      deleted_at: "2026-10-13T00:00:00Z",
    },
  ],
  [],
  [{ kind: "deposit_credit", quantity: 1, unit_price_cents: -10_000, taxable: false }],
  [
    { kind: "item", quantity: 1.5, unit_price_cents: 3_333, taxable: true },
    { kind: "deposit_credit", quantity: 1, unit_price_cents: -2_000, taxable: true },
    {
      kind: "deposit_credit",
      quantity: 1,
      unit_price_cents: -1_000,
      taxable: false,
      deleted_at: "2026-10-13",
    },
  ],
];

// Pool chemistry: readings that cover every branch, on a few pool sizes and products.
const readingSets: Readings[] = [
  {},
  { fc: 4, ph: 7.5, ta: 100, ch: 350, cya: 40 },
  { fc: 1, cya: 40 },
  { fc: 1, cya: 30 },
  { fc: 12, cya: 40 },
  { ph: 8.0, ta: 100 },
  { ph: 8.0, ta: 110 },
  { ph: 7.0, ta: 100 },
  { ph: 7.0, ta: 60 },
  { ph: 7.8, ta: 180 },
  { ph: 7.1, ta: 20 },
  { ph: 8.4, ta: 300 },
  { ch: 150 },
  { ch: 900 },
  { cya: 120 },
  { cya: 0 },
  { cya: 70 },
  { salt: 2400, cya: 70 },
  { salt: 4500 },
  { salt: 3000 },
  { ph: 7.0, ta: 50, ch: 100 },
  { ph: 8.2, ta: 150, ch: 600 },
  { ph: 7.5, ta: 100, ch: 300, cya: 40 },
  { ph: 7.5, ta: 30, ch: 300, cya: 120 },
  { ph: 7.6, ta: 90, ch: 250, cya: 50, salt: 3200, fc: 3 },
  { fc: 0, ph: 6.8, ta: 40, ch: 120, cya: 10, salt: 1500 },
  { fc: 2.37, ph: 7.25, ta: 87, ch: 333, cya: 47, salt: 2911 },
  { fc: null, ph: null, ta: 75 },
  { ch: 0, ph: 7.5, ta: 100 },
];
const pools = [20_000, 15_000, 7_500, 0, -100, 32_150];
const chlorines: ChlorineProduct[] = ["liquid12", "liquid10", "calhypo65", "calhypo73"];
const acids: AcidProduct[] = ["muriatic31", "muriatic145", "dryacid"];
const goalSets: ChemistryInput["goals"][] = [
  undefined,
  { fc: 6 },
  { ph: 7.2 },
  { fc: null, ta: 120, ch: 500, cya: 60, salt: 3600 },
  { fc: -1, ph: 7.8, ta: 70 },
];

const chemistryCases: [ChemistryInput][] = [];
readingSets.forEach((readings, i) => {
  const gallons = pools[i % pools.length]!;
  for (const [j, chlorine] of chlorines.entries()) {
    const acid = acids[(i + j) % acids.length]!;
    chemistryCases.push([{ gallons, readings, chlorine, acid }]);
  }
  for (const goals of goalSets.slice(1))
    chemistryCases.push([
      { gallons: 20_000, readings, chlorine: "liquid12", acid: "muriatic31", goals },
    ]);
});

const tipCases: [unknown][] = [];
for (const platform of ["web", "app"])
  for (const screen of [
    "today",
    "schedule",
    "messages",
    "customers",
    "invoices",
    "dashboard",
    "chemicals",
    "jobs",
    "job",
    "report",
    "nowhere",
  ])
    for (const role of ["owner", "admin", "tech", null, "stranger"])
      for (const services of ["pool", "leak", "both"] as Services[])
        // The screens with package-specific tips also get a narrowing package.
        for (const pkg of (screen === "job" || screen === "chemicals"
          ? [undefined, "pool", "leak"]
          : [undefined]) as (TipPackage | undefined)[])
          tipCases.push([{ platform, screen, role, services, seen: [], ...(pkg ? { pkg } : {}) }]);
tipCases.push(
  [
    {
      platform: "app",
      screen: "job",
      role: "tech",
      services: "both",
      seen: ["app-inspection"],
      pkg: "leak",
    },
  ],
  [{ platform: "app", screen: "job", role: "tech", services: "both", seen: ["app-visit"] }],
  [
    {
      platform: "web",
      screen: "invoices",
      role: "owner",
      services: "both",
      seen: ["web-invoices-pool"],
    },
  ],
);

// quote.ts, invoice.ts, chemistry.ts and walkthrough.ts.
export const pricing: ModuleCases = {
  QUOTE_STATUS_LABELS: rule(() => QUOTE_STATUS_LABELS, [[]]),
  lineTotal: rule(
    (quantity: number, unit_price_cents: number) => lineTotal({ quantity, unit_price_cents }),
    [
      [2.5, 12_999],
      [0.33, 100],
      [1, 0],
      [0, 5_000],
      [3, 333],
      [0.5, 1],
      [0.5, 3],
      [0.5, -1],
      [0.5, -3],
      [1.005, 1_000],
      [2.675, 100],
      [0.01, 49],
      [0.01, 50],
      [0.01, 51],
      [12.34, 98_765],
      [1, -2_500],
      [-1.5, 333],
    ],
  ),
  quoteTotals: rule(
    (lines: QuoteLine[], discount: number, rate: number, deposit: DepositRule) =>
      quoteTotals(lines, discount, rate, deposit),
    [
      ...lineSets.flatMap((lines) =>
        deposits.map((d) => [lines, 10_000, 825, d] as [QuoteLine[], number, number, DepositRule]),
      ),
      ...lineSets.map((lines) => [lines, 0, 0, HALF] as [QuoteLine[], number, number, DepositRule]),
      ...lineSets.map(
        (lines) => [lines, -500, 700, HALF] as [QuoteLine[], number, number, DepositRule],
      ),
      ...lineSets.map(
        (lines) => [lines, 999_999, 1000, HALF] as [QuoteLine[], number, number, DepositRule],
      ),
      ...lineSets.map((lines) => [lines, 1, 1, HALF] as [QuoteLine[], number, number, DepositRule]),
      ...lineSets.map(
        (lines) => [lines, 3, 625, deposits[1]!] as [QuoteLine[], number, number, DepositRule],
      ),
    ],
  ),
  discountAllowed: rule(
    (subtotal: number, discount: number, isOwner: boolean, limit: number) =>
      discountAllowed(subtotal, discount, isOwner, limit),
    [
      [100_000, 10_000, false, 1000],
      [100_000, 10_001, false, 1000],
      [100_000, 50_000, true, 1000],
      [0, 500, false, 0],
      [-100, 500, false, 0],
      [3, 1, false, 3333],
      [3, 1, false, 3334],
      [132_498, 10_000, false, 754],
      [132_498, 10_000, false, 755],
      [100_000, 0, false, 0],
    ],
  ),
  suggestItems: rule(
    (items: PriceBookItem[], key: string | null) => suggestItems(items, key),
    [
      [priceBook, "return"],
      [priceBook, null],
      [priceBook, ""],
      [priceBook, "light"],
      [priceBook, "skimmer"],
      [priceBook, "drain"],
      [[], "return"],
    ],
  ),
  lineFromItem: rule(
    (it: PriceBookItem, findingId: string | null) => lineFromItem(it, findingId),
    [
      [item({ name: "Return fitting", description: "Replace fitting", price_cents: 4500 }), "f1"],
      [item({ name: "Labor", taxable: false, price_cents: 9_500 }), null],
      [item({ name: "Empty description", description: "" }), "f2"],
      [item({ name: "Null description", description: null }), null],
    ],
  ),
  quoteShareText: rule(
    (shop: string, link: string) => quoteShareText(shop, link),
    [
      ["Demo Leak Co.", "https://x.test/q/abc"],
      ["", ""],
    ],
  ),
  INVOICE_STATUS_LABELS: rule(() => INVOICE_STATUS_LABELS, [[]]),
  invoiceTotals: rule(
    (lines: InvoiceLine[], discount: number, rate: number) => invoiceTotals(lines, discount, rate),
    invoiceLines.flatMap((lines) =>
      (
        [
          [10_000, 825],
          [100_000, 825],
          [0, 0],
          [-1, 700],
          [7, 1],
        ] as [number, number][]
      ).map(([d, r]) => [lines, d, r] as [InvoiceLine[], number, number]),
    ),
  ),
  invoiceBalance: rule(
    (total_cents: number, amount_paid_cents: number) =>
      invoiceBalance({ total_cents, amount_paid_cents }),
    [
      [64_900, 20_000],
      [64_900, 70_000],
      [0, 0],
      [-500, 0],
      [100, 100],
    ],
  ),
  invoiceShareText: rule(
    (shop: string, link: string) => invoiceShareText(shop, link),
    [["Demo Leak Co.", "https://x.test/i/abc"]],
  ),
  CHLORINE_PRODUCTS: rule(() => CHLORINE_PRODUCTS, [[]]),
  ACID_PRODUCTS: rule(() => ACID_PRODUCTS, [[]]),
  READING_LABELS: rule(() => READING_LABELS, [[]]),
  READING_LIMITS: rule(() => READING_LIMITS, [[]]),
  // The chemical log's line: only the readings taken, pH always to one place.
  readingSummary: rule(
    (r: Partial<Readings>) => readingSummary(r),
    [
      [{}],
      [{ fc: 3, ph: 7.6, ta: 90 }],
      [{ fc: 3, ph: 7.6, ta: 90, ch: 250, cya: 40, salt: 3200 }],
      [{ salt: 3200, fc: 0 }],
      [{ ph: 7 }],
      [{ ph: 7.25 }],
      [{ ph: 7.35 }],
      [{ ph: 0.05 }],
      [{ ph: 14 }],
      [{ fc: 2.5, ph: null, ta: null, cya: 37.5 }],
      [{ fc: 0.1, ch: 1234.5, salt: 19999.9 }],
      [{ ta: 1e-7 }],
    ],
  ),
  targets: rule(
    (cya: number | null) => targets(cya),
    [[null], [0], [10], [26], [30], [40], [47], [53.3], [80], [100], [-50]],
  ),
  fluidAmount: rule(
    (n: number) => fluidAmount(n),
    [[12.4], [154], [256], [0], [0.4], [127.5], [128], [383.6]],
  ),
  gallonMeasure: rule(
    (n: number) => gallonMeasure(n),
    [
      [4],
      [5.99],
      [6],
      [8],
      [20],
      [24],
      [24.1],
      [40],
      [47],
      [48],
      [64],
      [85],
      [100],
      [111.9],
      [112],
      [120],
      [150],
      [128 * 4],
      [128 * 4.2],
      [128 * 5.3],
      [128 * 5.25],
      [128 * 20.75],
    ],
  ),
  dryMeasure: rule(
    (oz: number, bag?: number) => dryMeasure(oz, bag),
    [
      [3],
      [6],
      [12],
      [16 * 3.3],
      [16 * 10],
      [16 * 10.2],
      [16 * 23.4],
      [16 * 40.5],
      [16 * 41],
      [16 * 97.5],
      [16 * 133, 40],
      [16 * 5, 40],
      [16 * 50, 40],
      [16 * 50, 0],
    ],
  ),
  weightAmount: rule(
    (oz: number) => weightAmount(oz),
    [[6], [0.2], [15.6], [16], [56], [16 * 19.96], [16 * 20], [16 * 42.4], [16 * 2.25]],
  ),
  saturationIndex: rule(
    (r: Readings) => saturationIndex(r),
    readingSets.map((r) => [r] as [Readings]),
  ),
  calculateChemistry: rule((input: ChemistryInput) => calculateChemistry(input), chemistryCases),
  doseSummary: rule(
    (input: ChemistryInput, ready: boolean) => doseSummary(calculateChemistry(input), ready),
    [
      ...chemistryCases.map(([input]) => [input, true] as [ChemistryInput, boolean]),
      [chemistryCases[0]![0], false],
    ],
  ),
  launchCards: rule((s: Services) => launchCards(s), [["pool"], ["leak"], ["both"]]),
  seenTips: rule(
    (v: unknown) => seenTips(v),
    [
      [["a", 2, null, "b"]],
      ["nope"],
      [null],
      [{ a: "b" }],
      [Array.from({ length: 205 }, (_, i) => `tip-${i}`)],
    ],
  ),
  tipFor: rule(
    (o: Parameters<typeof tipFor>[0]) => tipFor(o),
    tipCases as [Parameters<typeof tipFor>[0]][],
  ),
  gettingStarted: rule(
    (s: Services, p: ShopProgress) => gettingStarted(s, p),
    (["pool", "leak", "both"] as Services[]).flatMap((s): [Services, ShopProgress][] => [
      [
        s,
        {
          people: 1,
          openInvites: 0,
          hasLogo: false,
          paymentsReady: false,
          customers: 0,
          visitPlans: 0,
          leakJobs: 0,
          reportsSent: 0,
          invoicesSent: 0,
        },
      ],
      [
        s,
        {
          people: 1,
          openInvites: 2,
          hasLogo: true,
          paymentsReady: true,
          customers: 4,
          visitPlans: 0,
          leakJobs: 1,
          reportsSent: 0,
          invoicesSent: 3,
        },
      ],
      [
        s,
        {
          people: 3,
          openInvites: 0,
          hasLogo: false,
          paymentsReady: false,
          customers: 0,
          visitPlans: 2,
          leakJobs: 0,
          reportsSent: 1,
          invoicesSent: 0,
        },
      ],
    ]),
  ),
};
