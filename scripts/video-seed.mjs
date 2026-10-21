// The two shops the demo videos are filmed in (docs/plans/demo-videos.md section 6.5), on the
// dev project, through the Management API like scripts/demo-reset.mjs. Only these two companies
// change; "Demo Leak Co." and every other shop are never touched.
//
//   NODE_USE_ENV_PROXY=1 node scripts/video-seed.mjs            dry run: says what it would do
//   NODE_USE_ENV_PROXY=1 node scripts/video-seed.mjs --apply    does it (and uploads the logos)
//   node scripts/video-seed.mjs --local <database> [--apply]    the same against a local
//                                                               Postgres (pnpm test:db's); no
//                                                               logo upload (no storage there)
//   --ref <project-ref>  another project than config/supabase-dev.json's
//   --sql <file>         also write the SQL it would run to a file
//
// Every run puts both shops back to the same data (a seeded random generator), dated from the
// shop's today (America/Phoenix):
//   - Canyon State Leak Detection: owner Marcus Hale; Dana Ruiz the tech and Jake Turner the
//     second tech on every job. Leak detections from five months back (about one a working day),
//     then 2 or 3 a working day from the Monday of last week through two weeks out: finished ones
//     with a sent report, and a quote, deposit, repair, invoice and payments where a leak was
//     found. Today Dana's first stop is Rebecca Soto at 9:30 (scheduled, nothing done: the video
//     films it). Gregory Lin, the working day before, is the same story finished: pressure test
//     Dropped on the return line, dye drawn in at the light niche, a sent report, a $1,840 quote
//     accepted and its $920 deposit paid by card.
//   - Blue Mesa Pool Co.: owner Erin Cole; Luis Ramirez, Priya Shah and Tony Alvarez. 50 weekly
//     plans whose visits the plans make (app.service_plan_changed), never inserted here. Today
//     Priya has 12 stops from home, Megan Price the 4th. Monthly plan invoices from April through
//     last month, most paid by card; repairs; a "pump noise" finding quoted and accepted.
//
// Rows from earlier runs are soft-deleted, so the deletions reach phones. Sent reports never
// change (the customer's copy) and stay. Fixed ids (00000000-0000-4000-9000-…, not demo-reset's
// 00000000-0000-4000-8000-… range) keep the companies, people, customers and pools the same on
// every run. Every address is on Phoenix's street grid with its coordinates and geocoded_address
// stored, so nothing is ever looked up.
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = join(import.meta.dirname, "..");

export const PASSWORD = "sundeck-video";
export const TZ = "America/Phoenix";
/** Every fixed id here starts with this (demo-reset's are 00000000-0000-4000-8000-…). */
export const ID_PREFIX = "00000000-0000-4000-9000-";
const id = (hex) => `${ID_PREFIX}${hex.padStart(12, "0")}`;
export const CANYON_ID = id("c501");
export const MESA_ID = id("c502");

// ---------------------------------------------------------------------------
// The generator
// ---------------------------------------------------------------------------

/** A small seeded generator (mulberry32), so every run makes the same shops. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- Dates: shop-local days ("2026-10-21") and times ("2026-10-21 09:30") -------------------

const isoDay = (d) => d.toISOString().slice(0, 10);
export const addDays = (date, n) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return isoDay(d);
};
const weekdayOf = (date) => new Date(`${date}T12:00:00Z`).getUTCDay();
const isWorkday = (date) => weekdayOf(date) >= 1 && weekdayOf(date) <= 5;
const nextWorkday = (date) => {
  let d = addDays(date, 1);
  while (!isWorkday(d)) d = addDays(d, 1);
  return d;
};
const prevWorkday = (date) => {
  let d = addDays(date, -1);
  while (!isWorkday(d)) d = addDays(d, -1);
  return d;
};
const at = (date, hm) => `${date} ${hm}`;
const later = (stamp, minutes) => {
  const d = new Date(`${stamp.replace(" ", "T")}:00Z`);
  d.setUTCMinutes(d.getUTCMinutes() + minutes);
  return d.toISOString().slice(0, 16).replace("T", " ");
};
const dayOf = (stamp) => stamp.slice(0, 10);
const hm = (minutes) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
const monthStart = (date, back = 0) => {
  const [y, m] = date.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 - back, 1, 12));
  return isoDay(d);
};
const monthName = (date) =>
  new Date(`${date}T12:00:00Z`).toLocaleString("en-US", { month: "long", timeZone: "UTC" });
const workdays = (from, through) => {
  const out = [];
  for (let d = from; d <= through; d = addDays(d, 1)) if (isWorkday(d)) out.push(d);
  return out;
};

// ---- Phoenix's address grid (as scripts/demo-reset.mjs) ------------------------------------

// Washington St is 0 north, Central Ave 0 east and west. About 1,000 house numbers a mile north;
// numbered streets east (16th St) and avenues west (35th Ave).
const ORIGIN = { lat: 33.4484, lng: -112.074 };
const latOf = (north) => +(ORIGIN.lat + (north / 1000) * 0.013075).toFixed(6);
const lngOf = (x) => +(ORIGIN.lng + x * (x >= 0 ? 0.00195 : 0.0018)).toFixed(6);

const CROSS_STREETS = [
  [1100, "Willetta St"],
  [1300, "Culver St"],
  [1500, "Lynwood St"],
  [1900, "Palm Ln"],
  [2100, "Lewis Ave"],
  [2300, "Cambridge Ave"],
  [2500, "Oak St"],
  [2700, "Virginia Ave"],
  [3100, "Earll Dr"],
  [3500, "Weldon Ave"],
  [3700, "Clarendon Ave"],
  [3900, "Devonshire Ave"],
  [4300, "Glenrosa Ave"],
  [4500, "Campbell Ave"],
  [4700, "Highland Ave"],
  [4900, "Pierson St"],
  [5300, "Colter St"],
  [5500, "Montebello Ave"],
  [5700, "Rose Ln"],
  [5900, "Marlette Ave"],
  [6300, "Rancho Dr"],
  [6500, "Medlock Dr"],
  [6700, "Orange Dr"],
  [7100, "Maryland Ave"],
  [7300, "Keim Dr"],
  [7500, "Ocotillo Rd"],
  [7700, "Myrtle Ave"],
  [8300, "Butler Dr"],
  [8700, "Hayward Ave"],
  [9100, "Mission Ln"],
  [9500, "Cinnabar Ave"],
  [9900, "Cheryl Dr"],
  [10500, "Las Palmaritas Dr"],
  [10700, "Sahuaro Dr"],
  [11100, "Cochise Dr"],
  [11300, "Shangri La Rd"],
  [11700, "Cholla St"],
  [12100, "Sunnyside Ave"],
  [12500, "Corrine Dr"],
  [12700, "Laurel Ln"],
  [13100, "Dahlia Dr"],
  [13700, "Sweetwater Ave"],
  [14300, "Gelding Dr"],
  [14700, "Wethersfield Rd"],
  [15100, "Cortez St"],
  [15500, "Larkspur Dr"],
  [16100, "Acoma Dr"],
];

const ZIPS = [
  [85006, 33.465, -112.048],
  [85007, 33.448, -112.091],
  [85008, 33.465, -111.986],
  [85009, 33.456, -112.128],
  [85012, 33.507, -112.071],
  [85013, 33.509, -112.084],
  [85014, 33.509, -112.056],
  [85015, 33.508, -112.101],
  [85016, 33.509, -112.03],
  [85017, 33.515, -112.122],
  [85018, 33.497, -111.986],
  [85019, 33.512, -112.142],
  [85020, 33.566, -112.056],
  [85021, 33.56, -112.093],
  [85022, 33.63, -112.052],
  [85023, 33.632, -112.111],
  [85028, 33.584, -112.008],
  [85029, 33.597, -112.12],
  [85031, 33.495, -112.17],
  [85032, 33.625, -112.003],
  [85033, 33.494, -112.213],
  [85035, 33.472, -112.19],
  [85037, 33.491, -112.247],
  [85051, 33.56, -112.133],
  [85053, 33.63, -112.13],
];
const zipOf = (lat, lng) =>
  String(
    ZIPS.reduce((best, z) =>
      (z[1] - lat) ** 2 + (z[2] - lng) ** 2 < (best[1] - lat) ** 2 + (best[2] - lng) ** 2
        ? z
        : best,
    )[0],
  );
const ordinal = (n) => {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th");
  return `${n}${s}`;
};
/** A fixed place on the grid: `x` streets east (negative: west), `north` house numbers. */
const place = (street, x, north) => {
  const lat = latOf(north);
  const lng = lngOf(x);
  return { street, city: "Phoenix", state: "AZ", zip: zipOf(lat, lng), lat, lng };
};

// ---- People ----------------------------------------------------------------------------------

const FIRST = [
  "Aaron",
  "Abby",
  "Alan",
  "Alicia",
  "Amber",
  "Andrea",
  "Anthony",
  "Ashley",
  "Ben",
  "Beth",
  "Brandon",
  "Brenda",
  "Caleb",
  "Carmen",
  "Chris",
  "Cindy",
  "Craig",
  "Dawn",
  "Diego",
  "Donna",
  "Dylan",
  "Elena",
  "Eric",
  "Faith",
  "Frank",
  "Gabriel",
  "Gina",
  "Greg",
  "Heather",
  "Hector",
  "Holly",
  "Ian",
  "Irene",
  "Jacob",
  "Janet",
  "Jason",
  "Jill",
  "Joel",
  "Julia",
  "Karen",
  "Keith",
  "Kristen",
  "Lance",
  "Laura",
  "Lorenzo",
  "Lucy",
  "Mark",
  "Megan",
  "Miguel",
  "Molly",
  "Nathan",
  "Nicole",
  "Oscar",
  "Pam",
  "Peter",
  "Rachel",
  "Ramon",
  "Rebecca",
  "Rick",
  "Ruth",
  "Scott",
  "Sharon",
  "Steve",
  "Tara",
  "Tim",
  "Valerie",
  "Walter",
  "Wendy",
  "Xavier",
  "Zoe",
];
const LAST = [
  "Acosta",
  "Adler",
  "Baker",
  "Barnes",
  "Bishop",
  "Burke",
  "Castillo",
  "Chavez",
  "Cline",
  "Cooper",
  "Dalton",
  "Delgado",
  "Dixon",
  "Duran",
  "Ellison",
  "Espinoza",
  "Fischer",
  "Flores",
  "Garner",
  "Gibbs",
  "Guerrero",
  "Harmon",
  "Herrera",
  "Hughes",
  "Ingram",
  "Jensen",
  "Keller",
  "Kerr",
  "Lambert",
  "Larson",
  "Lowe",
  "Maddox",
  "Medina",
  "Meyer",
  "Molina",
  "Navarro",
  "Nolan",
  "Ochoa",
  "Owens",
  "Pacheco",
  "Palmer",
  "Pena",
  "Quinn",
  "Ramos",
  "Reese",
  "Rios",
  "Romero",
  "Salazar",
  "Sandoval",
  "Schultz",
  "Serrano",
  "Sexton",
  "Snyder",
  "Stanton",
  "Tate",
  "Trujillo",
  "Vance",
  "Vargas",
  "Vega",
  "Wade",
  "Walters",
  "Webb",
  "Whitaker",
  "Wolfe",
  "Yates",
  "Zamora",
];
const ACCESS = [
  "Side gate code 4417.",
  "Dog in the yard; latch the gate.",
  "Gate on the east side. Ring the bell first.",
  "Equipment behind the garage.",
  "Gate code 2580. Equipment on the north wall.",
  null,
  null,
  null,
];

/** Owners and techs: fixed ids, the sign-in emails, their Schedule colors and order. */
export const SHOPS_TEAM = {
  canyon: [
    {
      key: "marcus",
      id: id("a101"),
      email: "marcus@canyonstate.video.test",
      name: "Marcus Hale",
      role: "owner",
      color: "slate",
      order: 3,
      phone: "(602) 555-0114",
    },
    {
      key: "dana",
      id: id("a102"),
      email: "dana@canyonstate.video.test",
      name: "Dana Ruiz",
      role: "tech",
      color: "blue",
      order: 1,
      phone: "(602) 555-0127",
    },
    {
      key: "jake",
      id: id("a103"),
      email: "jake@canyonstate.video.test",
      name: "Jake Turner",
      role: "tech",
      color: "orange",
      order: 2,
      phone: "(602) 555-0138",
    },
  ],
  mesa: [
    {
      key: "erin",
      id: id("a201"),
      email: "erin@bluemesa.video.test",
      name: "Erin Cole",
      role: "owner",
      color: "slate",
      order: 4,
      phone: "(480) 555-0152",
    },
    {
      key: "luis",
      id: id("a202"),
      email: "luis@bluemesa.video.test",
      name: "Luis Ramirez",
      role: "tech",
      color: "green",
      order: 1,
      phone: "(480) 555-0163",
    },
    {
      key: "priya",
      id: id("a203"),
      email: "priya@bluemesa.video.test",
      name: "Priya Shah",
      role: "tech",
      color: "purple",
      order: 2,
      phone: "(480) 555-0171",
    },
    {
      key: "tony",
      id: id("a204"),
      email: "tony@bluemesa.video.test",
      name: "Tony Alvarez",
      role: "tech",
      color: "teal",
      order: 3,
      phone: "(480) 555-0186",
    },
  ],
};
const who = (shop, key) => SHOPS_TEAM[shop].find((t) => t.key === key).id;

/** Names given by hand; the generator never makes them again. */
export const STORY_NAMES = ["Rebecca Soto", "Gregory Lin", "Megan Price"];

/** Shared helpers for one shop's people and places. */
function maker(rand, prefix, team) {
  const pick = (list) => list[Math.floor(rand() * list.length)];
  const between = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
  const names = new Set([...STORY_NAMES, ...team.map((t) => t.name)]);
  const places = new Set();
  let n = 0;

  const person = () => {
    for (;;) {
      const name = `${pick(FIRST)} ${pick(LAST)}`;
      if (!names.has(name)) {
        names.add(name);
        return name;
      }
    }
  };

  /** A street address on the grid within x (streets) and north (house numbers) ranges. */
  const address = (xs, norths) => {
    for (;;) {
      let x = between(xs[0], xs[1]);
      if (Math.abs(x) < 3) continue;
      let north = between(norths[0], norths[1]);
      let street;
      if (rand() < 0.6) {
        north += (north % 2) - (rand() < 0.5 ? 1 : 0);
        const kind =
          x >= 0 ? pick(["St", "St", "St", "Pl", "Way"]) : pick(["Ave", "Ave", "Ave", "Dr", "Ln"]);
        street = `${north} N ${ordinal(Math.abs(x))} ${kind}`;
      } else {
        const [line, name] = CROSS_STREETS.reduce((b, c) =>
          Math.abs(c[0] - north) < Math.abs(b[0] - north) ? c : b,
        );
        north = line;
        const num = Math.abs(x) * 100 + between(1, 49) * 2 - (rand() < 0.5 ? 1 : 0);
        street = `${num} ${x >= 0 ? "E" : "W"} ${name}`;
        x = (num / 100) * Math.sign(x);
      }
      if (places.has(street)) continue;
      places.add(street);
      return place(street, x, north);
    }
  };

  const pool = () => {
    const spa = rand() < 0.3;
    return {
      pool_type: pick(["gunite_plaster", "gunite_plaster", "gunite_plaster", "fiberglass"]),
      has_spa: spa,
      diagram_shape: pick(["rectangle", "kidney", "oval", "freeform"]),
      approx_gallons: between(12, 26) * 1000,
      access_notes: pick(ACCESS),
    };
  };

  /** A customer with one pool; `name` given or made up. */
  const customer = (a, name = person(), extra = {}) => {
    n += 1;
    const area = [602, 480, 623][Math.floor(n / 100) % 3];
    return {
      id: id(`${prefix}0${String(n).padStart(9, "0")}`),
      property_id: id(`${prefix}1${String(n).padStart(9, "0")}`),
      name,
      kind: "homeowner",
      phone: `(${area}) 555-${String(100 + (n % 100)).padStart(4, "0")}`,
      email: `${name.toLowerCase().replace(/[^a-z]+/g, ".")}@example.com`,
      ...a,
      ...pool(),
      ...extra,
    };
  };

  return { pick, between, person, address, customer };
}

/** Payment methods, mostly card. */
const method = (rand) => {
  const r = rand();
  return r < 0.8 ? "card" : r < 0.92 ? "ach" : "other";
};
/** A business-hours time on `date`, between two hours. */
const timeOn = (rand, date, fromHour, toHour) =>
  at(date, hm(fromHour * 60 + Math.floor(rand() * (toHour - fromHour) * 60)));

// ---- Canyon State Leak Detection ---------------------------------------------------------------

// The shop's prices (its price book is changed to these), so the video's live quote for Rebecca
// Soto (line, light niche, fitting) comes to $1,840 with a $920 deposit.
export const CANYON_PRICES = {
  "Leak detection - pool": 37500,
  "Leak detection - pool and spa": 45000,
  "Repair underground pressure line (per break)": 135000,
  "Light niche reseal": 30500,
  "Replace return fitting": 18500,
  "Skimmer throat repair": 32500,
  "Main drain repair (diver)": 85000,
};
const TAXABLE = { "Leak detection - pool": false, "Leak detection - pool and spa": false };
const line = (name, findingKey, quantity = 1) => ({
  name,
  quantity,
  unit_price_cents: CANYON_PRICES[name],
  taxable: TAXABLE[name] ?? true,
  warranty_months: TAXABLE[name] === false ? null : 12,
  finding: findingKey,
});

const LINES = { return: "Return line", skimmer: "Skimmer line", cleaner_line: "Cleaner line" };
const DYE_AT = {
  light: "Light niche",
  skimmer_seam: "Skimmer seam",
  skimmer: "Skimmer throat",
  main_drain: "Main drain",
};

/** What a detection found. `leaks`: component key → where; each finding names its component. */
const LEAK_TYPES = {
  return_line: {
    leaks: { return: "Return line under the deck, about 6 ft from the pool wall" },
    pressure: ["return"],
    dye: [],
    findings: [
      {
        key: "return",
        component: "return",
        title: "Return line break",
        location: "Under the deck, about 6 ft from the pool wall",
        severity: "major",
        notes:
          "Lost 8 PSI in 15 minutes. Held when plugged at the pool, so the break is under the deck.",
      },
    ],
    quote: [
      ["Repair underground pressure line (per break)", "return"],
      ["Replace return fitting", "return"],
    ],
    summary:
      "We found a break in the return line under the deck. The rest of the pool, its plumbing and equipment tested tight.",
    found:
      "The return line lost 8 PSI in 15 minutes while every other line held. The break is under the deck, about 6 feet from the pool wall.",
    next: "We sent a quote to repair the line. Until it's fixed, the pool will keep losing water while the pump runs.",
  },
  skimmer_line: {
    leaks: { skimmer: "Skimmer line under the deck" },
    pressure: ["skimmer"],
    dye: [],
    findings: [
      {
        key: "skimmer",
        component: "skimmer",
        title: "Skimmer line break",
        location: "Under the deck between the skimmer and the equipment",
        severity: "major",
        notes: "Dropped 6 PSI in 15 minutes. Every other line held.",
      },
    ],
    quote: [["Repair underground pressure line (per break)", "skimmer"]],
    summary:
      "We found a break in the skimmer line under the deck. The pool shell, fittings and other lines tested tight.",
    found:
      "The skimmer line lost pressure during the test while every other line held. The break is under the deck between the skimmer and the equipment.",
    next: "We sent a quote to repair the line. Keep the water topped up so the pump doesn't run dry.",
  },
  light_niche: {
    leaks: { light: "Conduit at the back of the light niche" },
    pressure: [],
    dye: ["light"],
    findings: [
      {
        key: "light",
        component: "light",
        title: "Light niche conduit leak",
        location: "Conduit at the back of the light niche",
        severity: "moderate",
        notes: "Dye drew into the conduit at the back of the niche.",
      },
    ],
    quote: [["Light niche reseal", "light"]],
    summary:
      "We found a leak at the pool light. Water is getting into the conduit behind the light. Everything else tested tight.",
    found:
      "Dye drew into the conduit at the back of the light niche. All plumbing lines held pressure.",
    next: "We sent a quote to reseal the light niche, about an hour's work.",
  },
  skimmer_throat: {
    leaks: { skimmer: "Crack in the skimmer throat" },
    pressure: [],
    dye: ["skimmer"],
    findings: [
      {
        key: "skimmer",
        component: "skimmer",
        title: "Skimmer throat crack",
        location: "Skimmer throat, left side",
        severity: "moderate",
        notes: "Dye drew into a hairline crack in the skimmer throat.",
      },
    ],
    quote: [["Skimmer throat repair", "skimmer"]],
    summary:
      "We found a crack in the skimmer throat. The rest of the pool and its plumbing tested tight.",
    found: "Dye drew into a hairline crack on the left side of the skimmer throat.",
    next: "We sent a quote to repair the skimmer throat.",
  },
  main_drain: {
    leaks: { main_drain: "Crack around the main drain sump" },
    pressure: [],
    dye: ["main_drain"],
    findings: [
      {
        key: "main_drain",
        component: "main_drain",
        title: "Main drain crack",
        location: "Around the main drain sump",
        severity: "major",
        notes: "Diver found dye drawing in at a crack around the sump.",
      },
    ],
    quote: [["Main drain repair (diver)", "main_drain"]],
    summary:
      "We found a crack around the main drain at the bottom of the pool. The lines and fittings tested tight.",
    found:
      "Our diver saw dye drawn into a crack around the main drain sump. The plumbing lines held pressure.",
    next: "We sent a quote for a diver to repair the main drain without draining the pool.",
  },
  skimmer_seam: {
    onsite: "Skimmer throat repair",
    leaks: { skimmer_seam: "Seam at the skimmer throat" },
    pressure: [],
    dye: ["skimmer_seam"],
    findings: [
      {
        key: "skimmer_seam",
        component: "skimmer_seam",
        title: "Skimmer seam leak",
        location: "Seam at the skimmer throat",
        severity: "moderate",
        status: "repaired",
        notes: "Dye drew in at the seam. Sealed with underwater epoxy.",
      },
    ],
    quote: [],
    summary:
      "We found a leak at the skimmer seam and sealed it during the visit. The rest of the pool, its plumbing and equipment tested tight.",
    found:
      "Dye drew in at the seam where the skimmer meets the pool wall. We sealed it with underwater epoxy.",
    next: "Watch the water level for a week. It should now drop only from evaporation.",
  },
  // Gregory Lin's: the video's story, finished.
  return_and_light: {
    leaks: {
      return: "Return line under the deck, about 6 ft from the pool wall",
      light: "Conduit at the back of the light niche",
    },
    pressure: ["return"],
    dye: ["light"],
    findings: [
      {
        key: "return",
        component: "return",
        title: "Return line break",
        location: "Under the deck, about 6 ft from the pool wall",
        severity: "major",
        pin: [0.42, 0.18],
        notes:
          "Lost 8 PSI in 15 minutes. Held when plugged at the pool, so the break is under the deck.",
      },
      {
        key: "light",
        component: "light",
        title: "Light niche conduit leak",
        location: "Conduit at the back of the light niche",
        severity: "moderate",
        pin: [0.78, 0.62],
        notes: "Dye drew into the conduit at the back of the niche.",
      },
    ],
    quote: [
      ["Repair underground pressure line (per break)", "return"],
      ["Light niche reseal", "light"],
      ["Replace return fitting", "return"],
    ],
    summary:
      "We found two leaks: a break in the return line under the deck, and water getting into the conduit behind the pool light. Everything else tested tight.",
    found:
      "The return line dropped 8 PSI in 15 minutes while every other line held, so the break is under the deck, about 6 feet from the pool wall. Dye drew into the conduit at the back of the light niche.",
    next: "We sent a quote to repair the line, reseal the light niche and replace the return fitting. Once the deposit is in, we'll book the repair.",
  },
};
const LEAK_ROTATION = [
  "return_line",
  "light_niche",
  "skimmer_seam",
  "skimmer_throat",
  "return_line",
  "skimmer_line",
  "main_drain",
  "light_niche",
];
const NO_LEAK = {
  summary:
    "We found no leak. The pool shell, plumbing lines, fittings and equipment all tested tight.",
  found: "Every line held pressure and dye showed no draw at any fitting, light niche or crack.",
  next: "The water loss is likely evaporation. Run a bucket test for three days if it continues.",
};
const REASONS = [
  "Pool water level dropping",
  "Pool company told them to call",
  "Spa water level dropping",
];
const DETECTION_NOTES = [
  "Losing about an inch a day.",
  "Water bill went up last month.",
  "Pool company saw a wet spot by the equipment pad.",
  "Level drops faster when the pump runs.",
  "Autofill runs every night.",
  "Losing about half an inch a day, more with the pump on.",
];

const sumLines = (lines) =>
  lines.reduce((s, l) => s + Math.round(l.quantity * l.unit_price_cents), 0);

/** Canyon State's rows, from the shop's today. */
function buildCanyon(today) {
  const rand = rng(20261021);
  const team = SHOPS_TEAM.canyon;
  const m = maker(rand, "1", team);
  const dana = who("canyon", "dana");
  const jake = who("canyon", "jake");
  const yesterday = prevWorkday(today);
  const latest = at(yesterday, "19:30"); // nothing has happened later than this
  const monday = addDays(today, -((weekdayOf(today) + 6) % 7));
  const first = addDays(monday, -7);
  const last = addDays(today, 14);
  const historyStart = monthStart(today, 5);

  const customers = [];
  const jobs = [];
  const repairDays = new Set();
  let leakTurn = 0;

  const booked = (start) => {
    const b = later(at(dayOf(start), "09:00"), -24 * 60 * m.between(2, 10) + m.between(0, 480));
    return b < latest ? b : timeOn(rand, addDays(yesterday, -m.between(0, 5)), 8, 17);
  };

  /** One leak detection, Dana with Jake. */
  const detection = (date, time, opts = {}) => {
    const a = m.address([-60, 64], [1200, 16000]);
    const c = m.customer(a, opts.name);
    if (opts.spa !== undefined) c.has_spa = opts.spa;
    if (opts.pool_type) c.pool_type = opts.pool_type;
    customers.push(c);
    const start = at(date, time);
    const fee = c.has_spa
      ? CANYON_PRICES["Leak detection - pool and spa"]
      : CANYON_PRICES["Leak detection - pool"];
    const reason = c.has_spa && rand() < 0.4 ? REASONS[2] : m.pick(REASONS.slice(0, 2));
    const job = {
      id: randomUUID(),
      key: opts.key,
      type: "detection",
      customer_id: c.id,
      property_id: c.property_id,
      customer: c.name,
      tech: dana,
      second: jake,
      start,
      minutes: 120,
      fee_cents: fee,
      intake: { reason: [reason], ...(c.has_spa ? { spa_size: "About 7 x 7 ft" } : {}) },
      notes: opts.notes ?? m.pick(DETECTION_NOTES),
      created: opts.created ?? booked(start),
      checklist: "pending",
      leaks: {},
      tests: [],
      findings: [],
      quotes: [],
      invoices: [],
      path: [],
    };
    jobs.push(job);
    const finished = opts.finished ?? start < at(today, "00:00");
    if (!finished) return job;

    // ---- Finished: the tests, what was found, the report, quote, invoice -----------------
    const type =
      opts.leak ??
      (rand() < 0.55 ? LEAK_TYPES[LEAK_ROTATION[leakTurn++ % LEAK_ROTATION.length]] : null);
    const t = type ?? NO_LEAK;
    job.checklist = "done";
    job.started = start;
    job.completed = later(start, 110);
    job.leaks = type ? type.leaks : {};
    let minute = 20;
    for (const comp of ["skimmer", "return", "cleaner_line"]) {
      const fails = type?.pressure.includes(comp);
      const drop = fails ? (comp === "return" ? 8 : 6) : 0;
      job.tests.push({
        type: "pressure",
        component: comp,
        data: { line_name: LINES[comp], start_psi: 20, end_psi: 20 - drop, duration_min: 15 },
        computed: { drop_psi: drop, drop_psi_per_min: +(drop / 15).toFixed(3) },
        outcome: fails ? "fail" : "pass",
        at: later(start, minute),
      });
      minute += 15;
    }
    for (const comp of ["light", "skimmer_seam", ...(type?.dye ?? [])].filter(
      (v, i, all) => all.indexOf(v) === i,
    )) {
      const fails = type?.dye.includes(comp);
      job.tests.push({
        type: "dye",
        component: comp,
        data: { location: DYE_AT[comp], observation: fails ? "Dye drawn in (leak)" : "No draw" },
        computed: {},
        outcome: fails ? "fail" : "pass",
        notes: fails ? "Steady draw." : null,
        at: later(start, minute),
      });
      minute += 10;
    }
    if (opts.bucket) {
      job.tests.push({
        type: "bucket",
        component: null,
        data: {
          pool_start_in: 10,
          pool_end_in: 8.9,
          bucket_start_in: 10,
          bucket_end_in: 9.75,
          duration_hours: 24,
        },
        computed: {
          pool_loss_in: 1.1,
          bucket_loss_in: 0.25,
          unexplained_loss_in: 0.85,
          unexplained_in_per_day: 0.85,
        },
        outcome: "fail",
        at: later(start, -24 * 60),
      });
    }
    job.findings = (type?.findings ?? []).map((f) => ({
      ...f,
      id: randomUUID(),
      status: f.status ?? (type.quote.length ? "quoted" : "open"),
      pin: f.pin ?? [+(0.15 + rand() * 0.7).toFixed(3), +(0.15 + rand() * 0.7).toFixed(3)],
    }));
    const findingId = (key) => job.findings.find((f) => f.key === key)?.id ?? null;
    job.report = {
      id: randomUUID(),
      sent_at: later(start, 125),
      unsigned_reason: "Customer not home",
      sections: [
        { key: "summary", title: "Summary", text: t.summary },
        { key: "findings", title: "What we found", text: t.found },
        { key: "next_steps", title: "What happens next", text: t.next },
      ],
    };
    job.path.push("report_sent");

    // The quote for the repair, sent from the truck.
    if (type?.quote.length) {
      const lines = type.quote.map(([name, f]) => ({ ...line(name, f), finding_id: findingId(f) }));
      const total = sumLines(lines);
      const deposit = Math.round(total / 2);
      const sent = later(start, 140);
      const q = { id: randomUUID(), lines, sent_at: sent, status: "sent", total, deposit };
      const acceptedAt =
        opts.accepted !== undefined
          ? later(sent, opts.accepted)
          : rand() < 0.75
            ? later(sent, m.pick([5 * 60, 24 * 60, 48 * 60]) + m.between(0, 90))
            : null;
      if (acceptedAt && acceptedAt <= latest) {
        q.status = "accepted";
        q.accepted_at = acceptedAt;
        q.accepted_by = c.name;
        q.deposit_paid_at = later(acceptedAt, 2);
        q.deposit_method = "card";
      } else if (dayOf(sent) < addDays(today, -30)) {
        q.status = "declined";
      }
      job.quotes.push(q);
      job.path.push("quote_sent");
      if (q.status === "accepted") {
        job.path.push("quote_accepted");
        repairFor(job, q, c, opts.repair);
      }
    }

    // The detection's invoice: the fee, and a repair made on the spot.
    const invLines = [
      { name: "Leak detection", quantity: 1, unit_price_cents: fee, taxable: false },
      ...(type?.onsite ? [line(type.onsite, null)] : []),
    ];
    const sent = later(start, 130);
    const inv = { id: randomUUID(), lines: invLines, sent_at: sent, due_days: 15, payments: [] };
    const paidAt =
      opts.feePaidAt ??
      (dayOf(sent) < first
        ? later(timeOn(rand, dayOf(sent), 9, 18), 24 * 60 * m.between(0, 5))
        : rand() < (dayOf(sent) <= addDays(today, -3) ? 0.8 : 0.4)
          ? later(timeOn(rand, dayOf(sent), 9, 18), 24 * 60 * m.between(0, 2))
          : null);
    if (paidAt && paidAt > sent && paidAt <= latest) {
      inv.payments.push({ method: opts.feeMethod ?? method(rand), paid_at: paidAt });
    }
    job.invoices.push(inv);
    job.path.push("invoiced");
    if (inv.payments.length) job.path.push("paid");
    return job;
  };

  /** The repair a quote's acceptance made: booked a few days on, finished if that's passed. */
  const repairFor = (parent, q, c, when) => {
    const job = {
      id: randomUUID(),
      type: "repair",
      customer_id: c.id,
      property_id: c.property_id,
      customer: c.name,
      parent_id: parent.id,
      from_quote: q.id,
      tech: null,
      second: null,
      minutes: 150,
      fee_cents: null,
      created: q.accepted_at,
      checklist: null,
      leaks: {},
      tests: [],
      findings: [],
      quotes: [],
      invoices: [],
      path: [],
    };
    jobs.push(job);
    const accepted = dayOf(q.accepted_at);
    if (when === "unscheduled" || accepted >= addDays(today, -2)) return job;
    let date = accepted;
    for (let i = m.between(3, 8); i > 0; i--) date = nextWorkday(date);
    while (repairDays.has(date)) date = nextWorkday(date);
    repairDays.add(date);
    job.tech = dana;
    job.second = jake;
    job.start = at(date, "15:30");
    if (date >= today) return job;
    job.started = job.start;
    job.completed = later(job.start, 135);
    const sent = later(job.completed, 5);
    const inv = {
      id: randomUUID(),
      quote_id: q.id,
      lines: [
        ...q.lines.map(({ finding: _f, finding_id: _id, ...l }) => l),
        { kind: "deposit_credit", from_quote: q.id, name: "Deposit" },
      ],
      sent_at: sent,
      due_days: 15,
      payments: [],
    };
    const paidAt = later(timeOn(rand, dayOf(sent), 9, 18), 24 * 60 * m.between(1, 5));
    if (paidAt <= latest && (date < first || rand() < 0.6)) {
      inv.payments.push({ method: method(rand), paid_at: paidAt });
    }
    job.invoices.push(inv);
    job.path.push("invoiced");
    if (inv.payments.length) job.path.push("paid");
    return job;
  };

  // History: about one a working day for five months, so the Dashboard has its months.
  for (const day of workdays(historyStart, addDays(first, -1))) {
    detection(day, "09:00");
    if (rand() < 0.25) detection(day, "12:30");
  }
  // Last week through two weeks out: 2 or 3 a working day.
  for (const day of workdays(first, last)) {
    if (day === today || day === yesterday) continue;
    const count = rand() < 0.5 ? 2 : 3;
    for (let slot = 0; slot < count; slot++) detection(day, ["08:00", "10:30", "13:00"][slot]);
  }
  // The working day before today: two jobs, then Gregory Lin, the video's story finished.
  detection(yesterday, "08:00");
  detection(yesterday, "10:30");
  const gregory = detection(yesterday, "13:00", {
    key: "gregory",
    name: "Gregory Lin",
    spa: false,
    pool_type: "gunite_plaster",
    leak: LEAK_TYPES.return_and_light,
    notes: "Losing about an inch a day. Autofill runs every night.",
    bucket: true,
    accepted: 3 * 60 + 25, // 18:45, on the quote link that evening
    repair: "unscheduled",
    feePaidAt: at(yesterday, "15:22"),
    feeMethod: "card",
  });
  // Today: Rebecca Soto first at 9:30, nothing started (the video films it), then one more.
  const rebecca = detection(today, "09:30", {
    key: "rebecca",
    name: "Rebecca Soto",
    spa: false,
    pool_type: "gunite_plaster",
    notes: "Losing about 2 inches a week. Autofill runs every night.",
    finished: false,
    created: later(at(today, "10:15"), -3 * 24 * 60),
  });
  rebecca.intake = { reason: ["Pool water level dropping"] };
  detection(today, "12:30", { finished: false });

  // Today's repair (15:30): the earliest one booked after today moves here; one a day.
  const repairs = jobs.filter((j) => j.type === "repair" && j.start);
  if (!repairs.some((j) => dayOf(j.start) === today)) {
    const next = repairs
      .filter((j) => dayOf(j.start) > today)
      .sort((p, q) => (p.start < q.start ? -1 : 1))[0];
    if (next) next.start = at(today, "15:30");
  }

  jobs.sort((p, q) => (p.created < q.created ? -1 : p.created > q.created ? 1 : 0));
  return {
    today,
    yesterday,
    first,
    last,
    historyStart,
    customers,
    jobs,
    gregory: gregory.id,
    rebecca: rebecca.id,
  };
}

// ---- Blue Mesa Pool Co. --------------------------------------------------------------------

const PLAN_NOTES = [
  "Salt pool. Check the cell.",
  "Backwash every other visit.",
  "Leaves from the palo verde.",
  "Dog in the yard; latch the gate.",
  null,
  null,
  null,
];
const POOL_REPAIRS = [
  ["Replace pump shaft seal", 24500],
  ["Replace pool light bulb", 17500],
  ["Rebuild autofill valve", 18500],
  ["Replace cartridge filter elements", 38500],
  ["Replace filter pressure gauge", 8500],
  ["Replace skimmer basket and weir", 6500],
  ["Green pool cleanup", 35000],
  ["Replace pump lid O-ring", 4500],
];
// Each tech's part of town (as demo-reset).
const AREAS = {
  luis: { xs: [-75, -19], norths: [1600, 8400] }, // west
  tony: { xs: [-27, 24], norths: [8800, 16400] }, // north central
  priya: { xs: [16, 64], norths: [2400, 7600] }, // east
};
const MESA_DEPOT = place("3838 E McDowell Rd", 38.38, 1600);
const PRIYA_HOME = place("4431 E Devonshire Ave", 44.31, 3900);

/** Blue Mesa's rows, from the shop's today. */
function buildMesa(today) {
  const rand = rng(20261022);
  const team = SHOPS_TEAM.mesa;
  const m = maker(rand, "2", team);
  const yesterday = prevWorkday(today);
  const latest = at(yesterday, "19:30");
  const monday = addDays(today, -((weekdayOf(today) + 6) % 7));
  const first = addDays(monday, -7);
  const last = addDays(today, 14);
  const historyStart = monthStart(today, 5);
  // Priya's big day is today's weekday (Monday when the shop's today is a weekend).
  const bigDay = isWorkday(today) ? weekdayOf(today) : 1;

  // Plans a weekday (Mon..Fri) for each tech: 50 in all, Priya's 12 on the big day and 10 on
  // her other four days.
  const others = [3, 2, 3, 2];
  const COUNTS = {
    luis: [3, 3, 3, 2, 3],
    priya: [1, 2, 3, 4, 5].map((wd) => (wd === bigDay ? 12 : others.shift())),
    tony: [3, 3, 2, 3, 3],
  };

  const customers = [];
  const plans = [];
  const byTech = { luis: [], priya: [], tony: [] };
  for (const tech of ["luis", "priya", "tony"]) {
    const area = AREAS[tech];
    const band = (area.norths[1] - area.norths[0]) / 5;
    for (let wd = 1; wd <= 5; wd++) {
      const lo = Math.round(area.norths[0] + band * (wd - 1));
      const day = [];
      for (let k = 0; k < COUNTS[tech][wd - 1]; k++) {
        day.push(m.address(area.xs, [lo, Math.round(lo + band)]));
      }
      // The order a tech drives them: nearest next, from where the day starts.
      let from = tech === "priya" ? PRIYA_HOME : MESA_DEPOT;
      const left = [...day];
      let stop = 0;
      while (left.length) {
        left.sort(
          (p, q) =>
            (p.lat - from.lat) ** 2 +
            (p.lng - from.lng) ** 2 -
            ((q.lat - from.lat) ** 2 + (q.lng - from.lng) ** 2),
        );
        const a = left.shift();
        from = a;
        stop += 1;
        const megan = tech === "priya" && wd === bigDay && stop === 4;
        const c = m.customer(a, megan ? "Megan Price" : undefined);
        if (megan) Object.assign(c, { has_spa: false, pool_type: "gunite_plaster" });
        customers.push(c);
        // Most have been with the shop a long time; some joined this summer.
        const joinBack = rand() < 0.72 ? m.between(7, 20) : m.between(1, 5);
        let starts = monthStart(today, joinBack);
        while (weekdayOf(starts) !== wd) starts = addDays(starts, 1);
        const notes = m.pick(PLAN_NOTES);
        const plan = {
          id: randomUUID(),
          customer_id: c.id,
          property_id: c.property_id,
          customer: c.name,
          tech: who("mesa", tech),
          techKey: tech,
          weekday: wd,
          stop,
          starts_on: starts,
          join_month: monthStart(starts),
          price_cents: m.pick([14500, 16500, 16500, 18500, 21000]),
          notes,
          salt: notes?.startsWith("Salt") ?? false,
          gallons: c.approx_gallons,
        };
        plans.push(plan);
        byTech[tech].push(plan);
      }
    }
  }
  const megan = plans.find((p) => p.customer === "Megan Price");
  const priyaToday = plans
    .filter((p) => p.techKey === "priya" && p.weekday === bigDay)
    .sort((p, q) => p.stop - q.stop);

  // Scheduled cleanings: the filter on stops 3 and 4 (Megan) of Priya's big day is due today;
  // some others over the next months.
  const cleanings = [];
  const bigDate = isWorkday(today) ? today : nextWorkday(today);
  for (const p of [priyaToday[2], megan]) {
    cleanings.push({
      plan_id: p.id,
      key: "svc_filter_clean",
      every_months: 3,
      next_due: bigDate,
      price_cents: 9500,
    });
  }
  for (const p of plans.filter((_, i) => i % 6 === 1 && !priyaToday.includes(plans[i]))) {
    cleanings.push({
      plan_id: p.id,
      key: p.salt ? "svc_salt_clean" : "svc_filter_clean",
      every_months: p.salt ? 4 : 3,
      next_due: addDays(today, 7 * m.between(1, 10)),
      price_cents: p.salt ? 8500 : 9500,
    });
  }

  // Readings from Priya's last four visits at each of today's stops.
  const readings = [];
  let lastBig = addDays(bigDate, -7);
  for (let week = 0; week < 4; week++, lastBig = addDays(lastBig, -7)) {
    for (const p of priyaToday) {
      const when = at(lastBig, hm(8 * 60 + (p.stop - 1) * 45 + m.between(5, 25)));
      readings.push({
        property_id: p.property_id,
        recorded_at: when,
        gallons: p.gallons,
        fc: +(1.5 + rand() * 2.5).toFixed(1),
        ph: +(7.2 + rand() * 0.6).toFixed(1),
        ta: 70 + 10 * m.between(0, 5),
        ch: 200 + 25 * m.between(0, 8),
        cya: 30 + 10 * m.between(0, 4),
        salt: p.salt ? 3000 + 100 * m.between(0, 6) : null,
      });
    }
  }

  // Repairs: twice a week for five months, then one a working day; past ones paid.
  const jobs = [];
  const own = (tech) => byTech[tech][Math.floor(rand() * byTech[tech].length)];
  const repair = (date, tech, time = "08:00", spec = m.pick(POOL_REPAIRS)) => {
    const p = own(tech);
    const [note, fee] = spec;
    const start = at(date, time);
    const job = {
      id: randomUUID(),
      type: "repair",
      customer_id: p.customer_id,
      property_id: p.property_id,
      customer: p.customer,
      tech: who("mesa", tech),
      second: null,
      start,
      minutes: 90,
      fee_cents: fee,
      notes: note,
      created: (() => {
        const b = later(at(date, "09:00"), -24 * 60 * m.between(2, 6) + m.between(0, 420));
        return b < latest ? b : timeOn(rand, addDays(yesterday, -m.between(0, 5)), 8, 17);
      })(),
      checklist: null,
      leaks: {},
      tests: [],
      findings: [],
      quotes: [],
      invoices: [],
      path: [],
    };
    jobs.push(job);
    if (date >= today) return job;
    job.started = start;
    job.completed = later(start, 80);
    const inv = {
      id: randomUUID(),
      lines: [{ name: note, quantity: 1, unit_price_cents: fee, taxable: false }],
      sent_at: later(job.completed, 10),
      due_days: 15,
      payments: [],
    };
    const paidAt = later(timeOn(rand, date, 10, 18), 24 * 60 * m.between(0, 4));
    if (paidAt <= latest && (date < first || rand() < 0.75)) {
      inv.payments.push({ method: method(rand), paid_at: paidAt });
    }
    job.invoices.push(inv);
    job.path.push("invoiced");
    if (inv.payments.length) job.path.push("paid");
    return job;
  };
  const techs = ["luis", "tony", "priya"];
  let turn = 0;
  for (const day of workdays(historyStart, addDays(first, -1))) {
    if (weekdayOf(day) === 2 || weekdayOf(day) === 4) repair(day, techs[turn++ % 3]);
  }
  // The pump noise: a service call last Thursday, quoted, accepted the next morning, and the
  // repair booked for next Tuesday.
  const callDay = addDays(first, 3);
  const pumpRepairDay = addDays(monday, 8);
  for (const day of workdays(first, last)) {
    let tech = techs[turn++ % 3];
    if (tech === "priya" && (day === today || weekdayOf(day) === bigDay)) tech = "tony";
    if (tech === "luis" && day === pumpRepairDay) tech = "tony";
    if (day === callDay && tech === "luis") tech = "tony";
    repair(day, tech);
  }
  const call = repair(callDay, "luis", "13:30", [
    "Service call: pump making a grinding noise",
    9500,
  ]);
  const pump = {
    id: randomUUID(),
    key: "pump",
    component: null,
    title: "Pump noise",
    location: "Pool pump at the equipment pad",
    severity: "moderate",
    status: "quoted",
    pin: null,
    notes: "Bearings grinding at startup and under load. The motor is about 9 years old.",
  };
  call.findings.push(pump);
  const pumpLines = [
    {
      name: "Replace pump motor",
      quantity: 1,
      unit_price_cents: 65000,
      taxable: true,
      warranty_months: 12,
      finding_id: pump.id,
    },
    {
      name: "Replace pump lid O-ring",
      quantity: 1,
      unit_price_cents: 4500,
      taxable: true,
      finding_id: pump.id,
    },
  ];
  const pumpQuote = {
    id: randomUUID(),
    lines: pumpLines,
    sent_at: later(call.start, 40),
    status: "accepted",
    accepted_at: at(nextWorkday(callDay), "09:20"),
    accepted_by: call.customer,
    total: sumLines(pumpLines),
    deposit: 0,
  };
  call.quotes.push(pumpQuote);
  const pumpJob = {
    id: randomUUID(),
    type: "repair",
    customer_id: call.customer_id,
    property_id: call.property_id,
    customer: call.customer,
    parent_id: call.id,
    from_quote: pumpQuote.id,
    tech: who("mesa", "luis"),
    second: null,
    start: at(pumpRepairDay, "08:00"),
    minutes: 120,
    fee_cents: null,
    created: pumpQuote.accepted_at,
    checklist: null,
    leaks: {},
    tests: [],
    findings: [],
    quotes: [],
    invoices: [],
    path: [],
  };
  jobs.push(pumpJob);
  jobs.sort((p, q) => (p.created < q.created ? -1 : p.created > q.created ? 1 : 0));

  // Monthly plan invoices: April through last month, sent on the 1st, most paid by card within
  // days; five of last month's are still owed.
  const invoices = [];
  const lastMonth = monthStart(today, 1);
  for (let back = 6; back >= 1; back--) {
    const month = monthStart(today, back);
    const sent = at(monthStart(today, back - 1), "07:30");
    const these = plans.filter((p) => p.join_month <= month);
    const owed = new Set(
      month === lastMonth ? these.filter((_, i) => i % 9 === 4).map((p) => p.id) : [],
    );
    for (const p of these) {
      const inv = {
        id: randomUUID(),
        plan_id: p.id,
        customer_id: p.customer_id,
        customer: p.customer,
        period_month: month,
        lines: [
          {
            name: `Pool service, ${monthName(month)}`,
            quantity: 1,
            unit_price_cents: p.price_cents,
            taxable: false,
            service_plan_id: p.id,
          },
        ],
        sent_at: sent,
        due_days: 15,
        payments: [],
      };
      const paidAt = later(timeOn(rand, dayOf(sent), 8, 20), 24 * 60 * m.between(0, 9));
      if (!owed.has(p.id) && paidAt <= latest) {
        inv.payments.push({ method: rand() < 0.88 ? "card" : "ach", paid_at: paidAt });
      }
      invoices.push(inv);
    }
  }

  return {
    today,
    first,
    last,
    historyStart,
    bigDay,
    customers,
    plans,
    cleanings,
    readings,
    jobs,
    invoices,
    megan: megan.id,
    priyaToday: priyaToday.map((p) => p.customer),
    pumpCustomer: call.customer,
    starts: [
      {
        id: id("d203"),
        user_id: who("mesa", "priya"),
        address: `${PRIYA_HOME.street}, Phoenix, AZ ${PRIYA_HOME.zip}`,
        lat: PRIYA_HOME.lat,
        lng: PRIYA_HOME.lng,
      },
    ],
  };
}

// ---- Both shops ----------------------------------------------------------------------------

const CANYON_DEPOT = place("2902 E Thomas Rd", 29.02, 2800);

/** Everything the SQL writes, from the shops' today ("2026-10-21"). */
export function buildVideo(today) {
  const canyon = buildCanyon(today);
  const mesa = buildMesa(today);
  const company = (shop, key, name, depot, extra) => ({
    id: shop,
    key,
    name,
    timezone: TZ,
    phone: extra.phone,
    email: extra.email,
    street: depot.street,
    city: depot.city,
    state: depot.state,
    zip: depot.zip,
    lat: depot.lat,
    lng: depot.lng,
    logo_path: `${shop}/logo-${key}.png`,
    logo_file: extra.logo_file,
    brand_primary: extra.brand_primary,
    brand_secondary: extra.brand_secondary,
    services: extra.services,
    settings: extra.settings,
    counters: extra.counters,
    price_book: extra.price_book ?? [],
    team: SHOPS_TEAM[key].map((t, i) => ({ ...t, profile_id: id(`b${shop.slice(-1)}0${i + 1}`) })),
  });
  return {
    today,
    shops: [
      {
        ...company(CANYON_ID, "canyon", "Canyon State Leak Detection", CANYON_DEPOT, {
          phone: "(602) 555-0140",
          email: "office@canyonstate.video.test",
          logo_file: "apps/video/assets/shops/canyon-state-logo.png",
          brand_primary: "#0B3A55",
          brand_secondary: "#B54B24",
          services: "leak",
          settings: {
            deposit: { type: "percent", value_bps: 5000, minimum_cents: 0 },
            tax_rate_bps: 0,
            tech_discount_limit_bps: 1000,
            techs_see_all_jobs: true,
          },
          counters: { job: 2380, quote: 640, invoice: 1870 },
          price_book: Object.entries(CANYON_PRICES).map(([name, price]) => ({
            name,
            price_cents: price,
          })),
        }),
        ...canyon,
        plans: [],
        cleanings: [],
        readings: [],
        invoices: [],
        starts: [],
      },
      {
        ...company(MESA_ID, "mesa", "Blue Mesa Pool Co.", MESA_DEPOT, {
          phone: "(480) 555-0175",
          email: "office@bluemesa.video.test",
          logo_file: "apps/video/assets/shops/blue-mesa-logo.png",
          brand_primary: "#14619E",
          brand_secondary: "#E9A55A",
          services: "pool",
          settings: {
            deposit: { type: "percent", value_bps: 0, minimum_cents: 0 },
            tax_rate_bps: 0,
            techs_see_all_jobs: true,
          },
          counters: { job: 5120, quote: 210, invoice: 3400 },
        }),
        ...mesa,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// The SQL
// ---------------------------------------------------------------------------

const lit = (s) => (s == null ? "null" : `'${String(s).replaceAll("'", "''")}'`);

/** One transaction that resets both shops. */
export function seedSql(video) {
  const data = JSON.stringify({ shops: video.shops.map(({ key: _k, ...s }) => s) });
  return `
do $video_seed$
declare
  data jsonb := ${lit(data)}::jsonb;
  shop jsonb;
  co uuid;
  tz text;
  owner_id uuid;
  rule jsonb;
  u jsonb;
  c jsonb;
  x jsonb;
  y jsonb;
  l jsonb;
  p jsonb;
  st text;
  ct record;
  comp uuid;
  j uuid;
  inv uuid;
  anchor uuid;
  totals jsonb;
  paid bigint;
  last_paid timestamptz;
  n int;
  start_at timestamptz;
  removed jsonb;
  k bigint;
begin
  if (now() at time zone ${lit(TZ)})::date <> ${lit(video.today)}::date then
    raise exception 'The shop''s day changed since this was built (%); run it again',
      (now() at time zone ${lit(TZ)})::date;
  end if;
  -- Written as the server: sent quotes and invoices are frozen for everyone else.
  perform set_config('app.invoice_server', 'on', true);
  perform set_config('app.quote_server', 'on', true);

  for shop in select * from jsonb_array_elements(data -> 'shops') loop
    co := (shop ->> 'id')::uuid;
    tz := shop ->> 'timezone';
    removed := '{}';
    if exists (select 1 from public.company where id = co and name = 'Demo Leak Co.') then
      raise exception 'Refusing to touch Demo Leak Co.';
    end if;

    -- ---- The company ------------------------------------------------------
    insert into public.company (id, name, phone, email, address_line1, city, state, postal_code,
                                timezone, logo_path, brand_primary, brand_secondary, latitude,
                                longitude, geocoded_address)
    values (co, shop ->> 'name', shop ->> 'phone', shop ->> 'email', shop ->> 'street',
            shop ->> 'city', shop ->> 'state', shop ->> 'zip', tz, shop ->> 'logo_path',
            shop ->> 'brand_primary', shop ->> 'brand_secondary', (shop ->> 'lat')::float8,
            (shop ->> 'lng')::float8,
            (shop ->> 'street') || ', ' || (shop ->> 'city') || ', ' || (shop ->> 'state') || ' ' || (shop ->> 'zip'))
    on conflict (id) do update
      set name = excluded.name, phone = excluded.phone, email = excluded.email,
          address_line1 = excluded.address_line1, city = excluded.city, state = excluded.state,
          postal_code = excluded.postal_code, timezone = excluded.timezone,
          logo_path = excluded.logo_path, brand_primary = excluded.brand_primary,
          brand_secondary = excluded.brand_secondary, latitude = excluded.latitude,
          longitude = excluded.longitude, geocoded_address = excluded.geocoded_address,
          deleted_at = null;
    update public.company
    set settings = settings || jsonb_build_object('services', shop ->> 'services') || (shop -> 'settings')
    where id = co;
    insert into public.subscription (company_id, status, plan, current_period_end, onboarded_at)
    values (co, 'active', 'standard', now() + interval '30 days', now())
    on conflict (company_id) do update
      set status = 'active', current_period_end = excluded.current_period_end,
          card_required = false,
          onboarded_at = coalesce(public.subscription.onboarded_at, excluded.onboarded_at);
    perform app.seed_company_defaults(co, shop ->> 'services');
    for x in select * from jsonb_array_elements(shop -> 'price_book') loop
      update public.price_book_item set price_cents = (x ->> 'price_cents')::integer
      where company_id = co and name = x ->> 'name' and deleted_at is null;
    end loop;
    insert into app.company_counter (company_id, kind, last_value)
    select co, e.key, e.value::integer from jsonb_each_text(shop -> 'counters') e
    on conflict (company_id, kind) do nothing;
    select settings -> 'deposit' into rule from public.company where id = co;

    -- ---- Remove what earlier runs (and filming) made -------------------------
    update public.service_plan set deleted_at = now() where company_id = co and deleted_at is null;
    get diagnostics k = row_count; removed := removed || jsonb_build_object('plans', k);
    update public.plan_cleaning set deleted_at = now() where company_id = co and deleted_at is null;
    update public.job set deleted_at = now() where company_id = co and deleted_at is null;
    get diagnostics k = row_count; removed := removed || jsonb_build_object('jobs', k);
    update public.checklist_item_result set deleted_at = now() where company_id = co and deleted_at is null;
    update public.job_component set deleted_at = now() where company_id = co and deleted_at is null;
    update public.finding set deleted_at = now() where company_id = co and deleted_at is null;
    update public.test_result set deleted_at = now() where company_id = co and deleted_at is null;
    update public.chemical_reading set deleted_at = now() where company_id = co and deleted_at is null;
    update public.quote_line_item set deleted_at = now() where company_id = co and deleted_at is null;
    update public.quote set deleted_at = now() where company_id = co and deleted_at is null;
    get diagnostics k = row_count; removed := removed || jsonb_build_object('quotes', k);
    update public.invoice_line_item set deleted_at = now() where company_id = co and deleted_at is null;
    update public.invoice set deleted_at = now() where company_id = co and deleted_at is null;
    get diagnostics k = row_count; removed := removed || jsonb_build_object('invoices', k);
    update public.payment set deleted_at = now() where company_id = co and deleted_at is null;
    get diagnostics k = row_count; removed := removed || jsonb_build_object('payments', k);
    update public.share_link set deleted_at = now(), revoked_at = coalesce(revoked_at, now())
    where company_id = co and deleted_at is null;
    -- Sent reports never change (the customer's copy); drafts go.
    update public.report set deleted_at = now()
    where company_id = co and deleted_at is null and status = 'draft';
    update public.property set deleted_at = now()
    where company_id = co and deleted_at is null and id::text not like ${lit(`${ID_PREFIX}%`)};
    update public.customer set deleted_at = now()
    where company_id = co and deleted_at is null and id::text not like ${lit(`${ID_PREFIX}%`)};
    get diagnostics k = row_count; removed := removed || jsonb_build_object('other_customers', k);
    -- Not synced (read from the server), and rebuilt below with the times things happened.
    delete from public.activity where company_id = co;

    -- ---- The team ---------------------------------------------------------
    for u in select * from jsonb_array_elements(shop -> 'team') loop
      if not exists (select 1 from auth.users where id = (u ->> 'id')::uuid) then
        insert into auth.users (
          instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
          raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
          confirmation_token, recovery_token, email_change_token_new, email_change)
        values (
          '00000000-0000-0000-0000-000000000000', (u ->> 'id')::uuid, 'authenticated',
          'authenticated', u ->> 'email',
          extensions.crypt(${lit(PASSWORD)}, extensions.gen_salt('bf')), now(),
          '{"provider": "email", "providers": ["email"]}',
          jsonb_build_object('full_name', u ->> 'name'), now(), now(), '', '', '', '');
        insert into auth.identities (
          id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
        values (
          gen_random_uuid(), u ->> 'id', (u ->> 'id')::uuid,
          jsonb_build_object('sub', u ->> 'id', 'email', u ->> 'email', 'email_verified', true),
          'email', now(), now(), now());
      end if;
      update public.profile set full_name = u ->> 'name', phone = u ->> 'phone'
      where id = (u ->> 'id')::uuid;
      insert into public.membership (company_id, user_id, role, color, schedule_order)
      values (co, (u ->> 'id')::uuid, u ->> 'role', u ->> 'color', (u ->> 'order')::integer)
      on conflict (company_id, user_id) do update
        set role = excluded.role, color = excluded.color, schedule_order = excluded.schedule_order,
            status = 'active', deleted_at = null;
      insert into public.team_profile (id, company_id, user_id, name, phone, email)
      values ((u ->> 'profile_id')::uuid, co, (u ->> 'id')::uuid, u ->> 'name', u ->> 'phone',
              u ->> 'email')
      on conflict (id) do update
        set name = excluded.name, phone = excluded.phone, email = excluded.email, deleted_at = null;
      if u ->> 'role' = 'owner' then
        owner_id := (u ->> 'id')::uuid;
      end if;
    end loop;
    -- Anyone else filming added (a test tech) is turned off.
    update public.membership set status = 'disabled'
    where company_id = co and status = 'active'
      and user_id not in (select (e ->> 'id')::uuid from jsonb_array_elements(shop -> 'team') e);
    update public.member_start set deleted_at = now()
    where company_id = co and deleted_at is null
      and id not in (select (e ->> 'id')::uuid from jsonb_array_elements(shop -> 'starts') e);
    for x in select * from jsonb_array_elements(shop -> 'starts') loop
      insert into public.member_start (id, company_id, user_id, start_from, home_address,
                                       home_latitude, home_longitude, home_geocoded_address)
      values ((x ->> 'id')::uuid, co, (x ->> 'user_id')::uuid, 'home', x ->> 'address',
              (x ->> 'lat')::float8, (x ->> 'lng')::float8, x ->> 'address')
      on conflict (id) do update
        set start_from = 'home', home_address = excluded.home_address,
            home_latitude = excluded.home_latitude, home_longitude = excluded.home_longitude,
            home_geocoded_address = excluded.home_geocoded_address, deleted_at = null;
    end loop;

    -- ---- Customers and pools ------------------------------------------------
    for c in select * from jsonb_array_elements(shop -> 'customers') loop
      insert into public.customer (id, company_id, kind, name, phone, email)
      values ((c ->> 'id')::uuid, co, c ->> 'kind', c ->> 'name', c ->> 'phone', c ->> 'email')
      on conflict (id) do update
        set kind = excluded.kind, name = excluded.name, phone = excluded.phone,
            email = excluded.email, deleted_at = null;
      insert into public.property (id, company_id, customer_id, address_line1, city, state,
                                   postal_code, pool_type, has_pool, has_spa, diagram_shape,
                                   approx_gallons, access_notes, latitude, longitude,
                                   geocoded_address, location_source)
      values ((c ->> 'property_id')::uuid, co, (c ->> 'id')::uuid, c ->> 'street', c ->> 'city',
              c ->> 'state', c ->> 'zip', c ->> 'pool_type', true, (c ->> 'has_spa')::boolean,
              c ->> 'diagram_shape', (c ->> 'approx_gallons')::integer, c ->> 'access_notes',
              (c ->> 'lat')::float8, (c ->> 'lng')::float8,
              (c ->> 'street') || ', ' || (c ->> 'city') || ', ' || (c ->> 'state') || ' ' || (c ->> 'zip'),
              'manual')
      on conflict (id) do update
        set customer_id = excluded.customer_id, address_line1 = excluded.address_line1,
            city = excluded.city, state = excluded.state, postal_code = excluded.postal_code,
            pool_type = excluded.pool_type, has_pool = true, has_spa = excluded.has_spa,
            diagram_shape = excluded.diagram_shape, approx_gallons = excluded.approx_gallons,
            access_notes = excluded.access_notes, latitude = excluded.latitude,
            longitude = excluded.longitude, geocoded_address = excluded.geocoded_address,
            location_source = 'manual', diagram_layout = null, deleted_at = null;
    end loop;

    -- ---- Jobs, in the order they were booked --------------------------------
    for x in select * from jsonb_array_elements(shop -> 'jobs') loop
      j := (x ->> 'id')::uuid;
      start_at := (x ->> 'start')::timestamp at time zone tz;
      insert into public.job (id, company_id, type, property_id, bill_to_customer_id, status,
                              assigned_user_id, second_tech_id, scheduled_start, scheduled_end,
                              fee_cents, intake, summary_notes, parent_job_id, created_at)
      values (j, co, x ->> 'type', (x ->> 'property_id')::uuid, (x ->> 'customer_id')::uuid,
              case when start_at is null then 'unscheduled' else 'scheduled' end,
              (x ->> 'tech')::uuid, (x ->> 'second')::uuid, start_at,
              start_at + make_interval(mins => (x ->> 'minutes')::integer),
              (x ->> 'fee_cents')::integer, x -> 'intake', x ->> 'notes',
              (x ->> 'parent_id')::uuid, (x ->> 'created')::timestamp at time zone tz);
      if x ? 'from_quote' then
        update public.quote set repair_job_id = j where id = (x ->> 'from_quote')::uuid;
        update public.job jb
        set summary_notes = 'Repair from quote #' || q.number || ' (job #' || pj.number || ')'
        from public.quote q, public.job pj
        where jb.id = j and q.id = (x ->> 'from_quote')::uuid and pj.id = q.job_id;
      end if;

      -- The checklist, as planComponents builds it for this pool.
      if x ->> 'checklist' in ('pending', 'done') then
        for ct in
          select ty.id, ty.key, ty.name, ty.allows_multiple, ty.default_count, ty.sort_order, g.k
          from public.component_type ty
          join public.property pr on pr.id = (x ->> 'property_id')::uuid
          cross join lateral generate_series(
            1, case when ty.allows_multiple then greatest(ty.default_count, 1) else 1 end) as g(k)
          where ty.company_id = co and ty.active and ty.deleted_at is null
            and ty.job_type = x ->> 'type'
            and (ty.applies_to <> 'spa' or pr.has_spa)
            and (ty.applies_to_pool_type is null or ty.applies_to_pool_type = pr.pool_type)
          order by ty.sort_order, g.k
        loop
          insert into public.job_component (company_id, job_id, component_type_id,
                                            instance_number, label, sort_order)
          values (co, j, ct.id, ct.k,
                  case when ct.allows_multiple and (ct.k > 1 or ct.default_count > 1)
                       then ct.name || ' ' || ct.k else ct.name end,
                  ct.sort_order * 100 + ct.k)
          returning id into comp;
          if x ->> 'checklist' = 'done' then
            insert into public.checklist_item_result (company_id, job_id, job_component_id,
                                                      status, method, outcome, location_text,
                                                      inspected_at, inspected_by)
            values (co, j, comp, 'inspected',
                    case when ct.key in ('skimmer', 'return', 'cleaner_line') then 'Pressure test'
                         when ct.key in ('light', 'skimmer_seam', 'main_drain') then 'Dye test' end,
                    case when x -> 'leaks' ? ct.key then 'leaking' else 'ok' end,
                    x -> 'leaks' ->> ct.key,
                    (x ->> 'start')::timestamp at time zone tz + interval '75 minutes',
                    (x ->> 'tech')::uuid);
          else
            insert into public.checklist_item_result (company_id, job_id, job_component_id, status)
            values (co, j, comp, 'pending');
          end if;
        end loop;
      end if;

      if x ? 'started' then
        update public.job set status = 'in_progress',
          started_at = (x ->> 'started')::timestamp at time zone tz where id = j;
      end if;
      for y in select * from jsonb_array_elements(x -> 'tests') loop
        insert into public.test_result (company_id, job_id, job_component_id, test_type_id,
                                        schema_version, data, computed, outcome, performed_at,
                                        notes)
        select co, j,
               (select jc.id from public.job_component jc
                join public.component_type ty on ty.id = jc.component_type_id
                where jc.job_id = j and ty.key = y ->> 'component' order by jc.sort_order limit 1),
               tt.id, tt.schema_version, y -> 'data', y -> 'computed', y ->> 'outcome',
               (y ->> 'at')::timestamp at time zone tz, y ->> 'notes'
        from public.test_type tt
        where tt.company_id = co and tt.key = y ->> 'type' and tt.deleted_at is null;
      end loop;
      for y in select * from jsonb_array_elements(x -> 'findings') loop
        insert into public.finding (id, company_id, job_id, job_component_id, title,
                                    location_text, severity_key, pin_x, pin_y, status, notes)
        values ((y ->> 'id')::uuid, co, j,
                (select jc.id from public.job_component jc
                 join public.component_type ty on ty.id = jc.component_type_id
                 where jc.job_id = j and ty.key = y ->> 'component' order by jc.sort_order limit 1),
                y ->> 'title', y ->> 'location', y ->> 'severity', (y -> 'pin' ->> 0)::numeric,
                (y -> 'pin' ->> 1)::numeric, y ->> 'status', y ->> 'notes');
      end loop;
      if x ? 'completed' then
        update public.job set completed_at = (x ->> 'completed')::timestamp at time zone tz
        where id = j;
      end if;

      -- The report, sent: the customer's frozen copy (as app.send_report_unchecked).
      if x ? 'report' then
        y := x -> 'report';
        insert into public.report (id, company_id, job_id, template_key, version, status,
                                   final_sections, data_snapshot, sent_at)
        values ((y ->> 'id')::uuid, co, j, 'homeowner', 1, 'sent', y -> 'sections',
                app.report_snapshot(j) || jsonb_build_object('sign_off',
                  jsonb_build_object('unsigned_reason', y ->> 'unsigned_reason')),
                (y ->> 'sent_at')::timestamp at time zone tz);
        insert into public.share_link (company_id, job_id, report_id, created_at)
        values (co, j, (y ->> 'id')::uuid, (y ->> 'sent_at')::timestamp at time zone tz);
      end if;

      -- Quotes: totals as app.finalize_quote, then sent, maybe accepted with its deposit.
      for y in select * from jsonb_array_elements(x -> 'quotes') loop
        insert into public.quote (id, company_id, job_id, status, created_at)
        values ((y ->> 'id')::uuid, co, j, 'draft', (y ->> 'sent_at')::timestamp at time zone tz);
        n := 0;
        for l in select * from jsonb_array_elements(y -> 'lines') loop
          n := n + 1;
          insert into public.quote_line_item (company_id, quote_id, finding_id, price_book_item_id,
                                              description, quantity, unit_price_cents, taxable,
                                              warranty_months, sort_order)
          values (co, (y ->> 'id')::uuid, (l ->> 'finding_id')::uuid,
                  (select pb.id from public.price_book_item pb where pb.company_id = co
                     and pb.name = l ->> 'name' and pb.deleted_at is null limit 1),
                  l ->> 'name', (l ->> 'quantity')::numeric, (l ->> 'unit_price_cents')::integer,
                  (l ->> 'taxable')::boolean, (l ->> 'warranty_months')::integer, n);
        end loop;
        totals := app.quote_totals((y ->> 'id')::uuid, rule);
        update public.quote
        set subtotal_cents = (totals ->> 'subtotal_cents')::integer,
            discount_cents = (totals ->> 'discount_cents')::integer,
            tax_cents = (totals ->> 'tax_cents')::integer,
            total_cents = (totals ->> 'total_cents')::integer,
            deposit_cents = (totals ->> 'deposit_cents')::integer,
            deposit_rule = rule,
            valid_until = ((y ->> 'sent_at')::timestamp)::date + 30,
            status = y ->> 'status',
            sent_at = (y ->> 'sent_at')::timestamp at time zone tz,
            accepted_at = (y ->> 'accepted_at')::timestamp at time zone tz,
            accepted_by_name = y ->> 'accepted_by'
        where id = (y ->> 'id')::uuid;
        insert into public.share_link (company_id, job_id, quote_id, created_at)
        values (co, j, (y ->> 'id')::uuid, (y ->> 'sent_at')::timestamp at time zone tz);
        if y ? 'deposit_paid_at' then
          insert into public.payment (company_id, quote_id, amount_cents, method, status, paid_at)
          select co, q.id, q.deposit_cents, y ->> 'deposit_method', 'succeeded',
                 (y ->> 'deposit_paid_at')::timestamp at time zone tz
          from public.quote q where q.id = (y ->> 'id')::uuid and q.deposit_cents > 0;
        end if;
      end loop;

      -- Invoices: lines, totals as app.send_invoice_unchecked, sent, then its payments.
      for y in select * from jsonb_array_elements(x -> 'invoices') loop
        inv := (y ->> 'id')::uuid;
        insert into public.invoice (id, company_id, job_id, quote_id, status, created_at)
        values (inv, co, j, (y ->> 'quote_id')::uuid, 'draft',
                (y ->> 'sent_at')::timestamp at time zone tz);
        n := 0;
        for l in select * from jsonb_array_elements(y -> 'lines') loop
          n := n + 1;
          if l ->> 'kind' = 'deposit_credit' then
            insert into public.invoice_line_item (company_id, invoice_id, kind, description,
                                                  unit_price_cents, taxable, sort_order)
            select co, inv, 'deposit_credit', 'Deposit paid on quote #' || q.number,
                   -sum(pm.amount_cents), false, 1000
            from public.quote q join public.payment pm on pm.quote_id = q.id
              and pm.status = 'succeeded' and pm.deleted_at is null
            where q.id = (l ->> 'from_quote')::uuid
            group by q.number;
          else
            insert into public.invoice_line_item (company_id, invoice_id, description, quantity,
                                                  unit_price_cents, taxable, warranty_months,
                                                  sort_order)
            values (co, inv, l ->> 'name', (l ->> 'quantity')::numeric,
                    (l ->> 'unit_price_cents')::integer, (l ->> 'taxable')::boolean,
                    (l ->> 'warranty_months')::integer, n);
          end if;
        end loop;
        perform app.video_seed_invoice_placeholder();
      end loop;

      for st in select * from jsonb_array_elements_text(x -> 'path') loop
        update public.job set status = st where id = j;
      end loop;
    end loop;

    -- ---- Weekly plans: saving each makes its visits (app.plan_visits) --------
    for x in select * from jsonb_array_elements(shop -> 'plans') loop
      insert into public.service_plan (id, company_id, customer_id, property_id, assigned_user_id,
                                       starts_on, interval_weeks, duration_minutes, price_cents,
                                       notes, created_at)
      values ((x ->> 'id')::uuid, co, (x ->> 'customer_id')::uuid, (x ->> 'property_id')::uuid,
              (x ->> 'tech')::uuid, (x ->> 'starts_on')::date, 1, 30,
              (x ->> 'price_cents')::integer, x ->> 'notes',
              ((x ->> 'starts_on')::date - 7 + time '10:00') at time zone tz);
    end loop;
    for x in select * from jsonb_array_elements(shop -> 'cleanings') loop
      insert into public.plan_cleaning (company_id, service_plan_id, component_type_id,
                                        every_months, next_due, price_cents)
      select co, (x ->> 'plan_id')::uuid, ty.id, (x ->> 'every_months')::smallint,
             (x ->> 'next_due')::date, (x ->> 'price_cents')::integer
      from public.component_type ty
      where ty.company_id = co and ty.key = x ->> 'key' and ty.deleted_at is null;
    end loop;
    for x in select * from jsonb_array_elements(shop -> 'readings') loop
      insert into public.chemical_reading (company_id, property_id, recorded_at, recorded_by,
                                           gallons, fc, ph, ta, ch, cya, salt)
      values (co, (x ->> 'property_id')::uuid, (x ->> 'recorded_at')::timestamp at time zone tz,
              (select (e ->> 'id')::uuid from jsonb_array_elements(shop -> 'team') e
               where e ->> 'key' = 'priya'),
              (x ->> 'gallons')::integer, (x ->> 'fc')::numeric, (x ->> 'ph')::numeric,
              (x ->> 'ta')::numeric, (x ->> 'ch')::numeric, (x ->> 'cya')::numeric,
              (x ->> 'salt')::numeric);
    end loop;

    -- ---- Monthly plan invoices, on each plan's first visit (as app.bill_maintenance_month) --
    for y in select * from jsonb_array_elements(shop -> 'invoices') loop
      select jb.id into anchor from public.job jb
      where jb.service_plan_id = (y ->> 'plan_id')::uuid and jb.deleted_at is null
      order by jb.plan_date limit 1;
      continue when anchor is null;
      j := anchor;
      inv := (y ->> 'id')::uuid;
      insert into public.invoice (id, company_id, job_id, customer_id, period_month, status,
                                  created_at)
      values (inv, co, anchor, (y ->> 'customer_id')::uuid, (y ->> 'period_month')::date, 'draft',
              (y ->> 'sent_at')::timestamp at time zone tz);
      n := 0;
      for l in select * from jsonb_array_elements(y -> 'lines') loop
        n := n + 1;
        insert into public.invoice_line_item (company_id, invoice_id, description, quantity,
                                              unit_price_cents, taxable, sort_order,
                                              service_plan_id)
        values (co, inv, l ->> 'name', (l ->> 'quantity')::numeric,
                (l ->> 'unit_price_cents')::integer, (l ->> 'taxable')::boolean, n,
                (l ->> 'service_plan_id')::uuid);
      end loop;
      perform app.video_seed_invoice_placeholder();
    end loop;

    -- ---- Activity, at the times things happened ------------------------------
    create temp table video_activity on commit drop as
      select * from public.activity where company_id = co;
    update video_activity a
    set created_at = least(now(), coalesce(case a.kind
          when 'report_sent' then (select r.sent_at from public.report r where r.id = a.subject_id)
          when 'quote_accepted' then (select q.accepted_at from public.quote q where q.id = a.subject_id)
          when 'payment_received' then (select pm.paid_at from public.payment pm where pm.id = a.subject_id)
          when 'job_assigned' then (select jb.created_at from public.job jb where jb.id = a.subject_id)
          when 'job_completed' then (select jb.completed_at from public.job jb where jb.id = a.subject_id)
        end, a.created_at)),
        actor_id = case a.kind
          when 'report_sent' then (select jb.assigned_user_id from public.job jb where jb.id = a.job_id)
          when 'job_assigned' then owner_id
          when 'job_completed' then (select jb.assigned_user_id from public.job jb where jb.id = a.job_id)
          else null end;
    delete from public.activity where company_id = co;
    insert into public.activity select * from video_activity;
    drop table video_activity;

    raise notice 'video seed: % removed %', shop ->> 'name', removed;
  end loop;

  perform set_config('app.invoice_server', 'off', true);
  perform set_config('app.quote_server', 'off', true);
end
$video_seed$;
`.replaceAll("perform app.video_seed_invoice_placeholder();", INVOICE_FINISH);
}

// Shared by both invoice loops: totals as app.send_invoice_unchecked, sent, a customer link,
// then its payments and the status they make (as app.refresh_invoice).
const INVOICE_FINISH = `totals := app.invoice_totals(inv);
        update public.invoice
        set subtotal_cents = (totals ->> 'subtotal_cents')::integer,
            discount_cents = (totals ->> 'discount_cents')::integer,
            tax_cents = (totals ->> 'tax_cents')::integer,
            credit_cents = (totals ->> 'credit_cents')::integer,
            total_cents = (totals ->> 'total_cents')::integer,
            due_date = ((y ->> 'sent_at')::timestamp)::date + (y ->> 'due_days')::integer,
            status = 'sent', sent_at = (y ->> 'sent_at')::timestamp at time zone tz
        where id = inv;
        insert into public.share_link (company_id, job_id, invoice_id, created_at)
        values (co, j, inv, (y ->> 'sent_at')::timestamp at time zone tz);
        for p in select * from jsonb_array_elements(y -> 'payments') loop
          insert into public.payment (company_id, invoice_id, amount_cents, method, status, paid_at)
          select co, inv, i.total_cents - i.amount_paid_cents, p ->> 'method', 'succeeded',
                 (p ->> 'paid_at')::timestamp at time zone tz
          from public.invoice i where i.id = inv and i.total_cents > i.amount_paid_cents;
          update public.invoice i
          set amount_paid_cents = (select coalesce(sum(pm.amount_cents), 0) from public.payment pm
                                   where pm.invoice_id = inv and pm.status = 'succeeded'
                                     and pm.deleted_at is null)
          where i.id = inv;
        end loop;
        select i.amount_paid_cents, (select max(pm.paid_at) from public.payment pm
                                     where pm.invoice_id = inv and pm.deleted_at is null)
        into paid, last_paid from public.invoice i where i.id = inv;
        update public.invoice i
        set status = case when paid >= i.total_cents then 'paid'
                          when paid > 0 then 'partially_paid' else 'sent' end,
            paid_at = case when paid >= i.total_cents then last_paid end
        where i.id = inv;`;

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const flag = (name) => args.includes(name);
  const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
  const apply = flag("--apply");
  const local = option("--local");
  const config = JSON.parse(readFileSync(join(root, "config", "supabase-dev.json"), "utf8"));
  const ref = option("--ref") ?? config.projectRef;

  /** Rows of a select, or nothing for other statements. */
  async function query(sql) {
    if (local) {
      const wrapped = /^\s*(select|with)\b/i.test(sql)
        ? `select coalesce(json_agg(t), '[]') from (${sql}) t`
        : sql;
      const r = spawnSync(
        "runuser",
        ["-u", "postgres", "--", "psql", "-d", local, "-X", "-q", "-At", "-v", "ON_ERROR_STOP=1"],
        { cwd: "/", input: wrapped, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
      );
      if (r.status !== 0) throw new Error(r.stderr || `psql exited ${r.status}`);
      const out = r.stdout.trim();
      return wrapped === sql ? [] : JSON.parse(out || "[]");
    }
    const headers = { "content-type": "application/json" };
    if (process.env.SUPABASE_ACCESS_TOKEN) {
      headers.authorization = `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`;
    }
    const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
      method: "POST",
      headers,
      body: JSON.stringify({ query: sql }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${body.message ?? JSON.stringify(body)}`);
    return body;
  }

  const where = local ? `local database ${local}` : `project ${ref}`;
  const [{ today }] = await query(`select (now() at time zone ${lit(TZ)})::date::text as today`);
  const video = buildVideo(today);
  const ids = video.shops.map((s) => lit(s.id)).join(", ");
  const existing = await query(`
    select c.id, c.name,
      (select count(*) from public.job j where j.company_id = c.id and j.deleted_at is null)::int as jobs,
      (select count(*) from public.service_plan p where p.company_id = c.id and p.deleted_at is null)::int as plans,
      (select count(*) from public.invoice i where i.company_id = c.id and i.deleted_at is null)::int as invoices,
      (select count(*) from public.report r where r.company_id = c.id and r.deleted_at is null and r.status <> 'draft')::int as sent_reports
    from public.company c where c.id in (${ids})`);

  console.log(`${where}: shop's today ${today} (${TZ})`);
  for (const shop of video.shops) {
    const now = existing.find((e) => e.id === shop.id);
    console.log(`\n${shop.name} (${shop.id})`);
    console.log(
      now
        ? `  exists: ${now.jobs} jobs, ${now.plans} plans, ${now.invoices} invoices soft-deleted and remade (${now.sent_reports} sent reports stay)`
        : "  new company",
    );
    console.log(`  team (password ${PASSWORD}):`);
    for (const t of shop.team) {
      console.log(`    ${t.name.padEnd(13)} ${t.role.padEnd(5)} ${t.color.padEnd(7)} ${t.email}`);
    }
    const count = (type, pred = () => true) =>
      shop.jobs.filter((j) => j.type === type && pred(j)).length;
    const quotes = shop.jobs.flatMap((j) => j.quotes);
    const invoices = [...shop.jobs.flatMap((j) => j.invoices), ...shop.invoices];
    const paid = invoices.filter((i) => i.payments.length).length;
    console.log(
      `  ${shop.customers.length} customers with one pool each; ${count("detection")} leak detections (${count("detection", (j) => j.report)} with a sent report), ${count("repair")} repairs`,
    );
    console.log(
      `  ${quotes.length} quotes (${quotes.filter((q) => q.status === "accepted").length} accepted), ${invoices.length} invoices (${paid} paid)`,
    );
    if (shop.plans.length) {
      for (const key of ["luis", "priya", "tony"]) {
        const own = shop.plans.filter((p) => p.techKey === key);
        const days = [1, 2, 3, 4, 5].map((wd) => own.filter((p) => p.weekday === wd).length);
        console.log(`  ${key}: ${own.length} weekly plans (Mon–Fri ${days.join("/")})`);
      }
      console.log(`  Priya's ${shop.priyaToday.length} stops: ${shop.priyaToday.join(", ")}`);
      console.log(`  pump noise quote at ${shop.pumpCustomer}`);
    }
    const todays = shop.jobs
      .filter((j) => j.start && dayOf(j.start) === today)
      .sort((p, q) => (p.start < q.start ? -1 : 1))
      .map((j) => `${j.start.slice(11)} ${j.customer} (${j.type})`);
    if (todays.length) console.log(`  today: ${todays.join("; ")}`);
    console.log(`  logo: ${shop.logo_file} → company-assets/${shop.logo_path}`);
  }

  const sql = seedSql(video);
  const sqlFile = option("--sql");
  if (sqlFile) writeFileSync(sqlFile, sql);
  console.log(
    `\nSQL: ${(sql.length / 1024).toFixed(0)} KB in one transaction${sqlFile ? `, written to ${sqlFile}` : ""}`,
  );
  if (!apply) {
    console.log("\nDry run: nothing changed. Run with --apply to rebuild the two shops.");
    return;
  }

  await query(`begin;\n${sql}\ncommit;`);

  // The logos, uploaded as each shop's owner the way Settings › Branding does (company-assets,
  // owners write). Sent reports keep pointing at the same path, so a rerun replaces the file.
  for (const shop of video.shops) {
    if (local) {
      console.log(`\n${shop.name}: logo not uploaded (local database has no storage)`);
      continue;
    }
    const owner = shop.team.find((t) => t.role === "owner");
    const auth = await fetch(`${config.url}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: config.publishableKey, "content-type": "application/json" },
      body: JSON.stringify({ email: owner.email, password: PASSWORD }),
    });
    const session = await auth.json().catch(() => ({}));
    if (!auth.ok)
      throw new Error(`Sign-in as ${owner.email}: HTTP ${auth.status} ${JSON.stringify(session)}`);
    const up = await fetch(`${config.url}/storage/v1/object/company-assets/${shop.logo_path}`, {
      method: "POST",
      headers: {
        apikey: config.publishableKey,
        authorization: `Bearer ${session.access_token}`,
        "content-type": "image/png",
        "x-upsert": "true",
      },
      body: readFileSync(join(root, shop.logo_file)),
    });
    if (!up.ok)
      throw new Error(`Logo upload for ${shop.name}: HTTP ${up.status} ${await up.text()}`);
    console.log(`\n${shop.name}: logo uploaded to company-assets/${shop.logo_path}`);
  }

  const after = await query(`
    select c.name,
      (select count(*) from public.job j where j.company_id = c.id and j.deleted_at is null and j.type = 'maintenance')::int as visits,
      (select count(*) from public.job j where j.company_id = c.id and j.deleted_at is null and j.type = 'detection')::int as detections,
      (select count(*) from public.job j where j.company_id = c.id and j.deleted_at is null and j.type = 'repair')::int as repairs,
      (select count(*) from public.service_plan p where p.company_id = c.id and p.deleted_at is null)::int as plans,
      (select count(*) from public.quote q where q.company_id = c.id and q.deleted_at is null)::int as quotes,
      (select count(*) from public.invoice i where i.company_id = c.id and i.deleted_at is null)::int as invoices,
      (select count(*) from public.payment p where p.company_id = c.id and p.deleted_at is null)::int as payments
    from public.company c where c.id in (${ids}) order by c.name desc`);
  for (const a of after) {
    console.log(
      `\nApplied ${a.name}: ${a.detections} leak detections, ${a.repairs} repairs, ${a.plans} plans, ${a.visits} plan visits, ${a.quotes} quotes, ${a.invoices} invoices, ${a.payments} payments.`,
    );
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}
