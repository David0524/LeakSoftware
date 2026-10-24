// Rebuild the demo company on the dev project (owner, 2026-10-20,
// docs/design/2026-10-20-team-week.md section 10), through the Management API like
// scripts/deploy-db.mjs. Only "Demo Leak Co." changes.
//
//   NODE_USE_ENV_PROXY=1 node scripts/demo-reset.mjs            dry run: says what it would do
//   NODE_USE_ENV_PROXY=1 node scripts/demo-reset.mjs --apply    does it
//   node scripts/demo-reset.mjs --local <database> [--apply]    the same against a local
//                                                               Postgres (pnpm test:db's)
//   --ref <project-ref>  another project than config/supabase-dev.json's
//   --sql <file>         also write the SQL it would run to a file
//
// Removes every job, quote, invoice, report (drafts; sent ones can't change) and plan, and
// the customers and pools that only test runs made. Rows are soft-deleted, so the deletions
// reach phones; sent reports and photos stay. Keeps the company, its settings and the team.
//
// Then makes, from a seeded random generator (the same data every run):
//   - the team: Dana (owner), Jake, Luis, Priya and Tony, each with a color;
//   - leak detections, 2 or 3 a working day from the Monday of last week through two weeks
//     from today, Dana the tech and Jake the second tech: past ones finished with a sent
//     report, today's a mix, later ones scheduled;
//   - 50 maintenance customers each for Luis, Priya and Tony, each with one pool and a weekly
//     plan on a fixed weekday (10 a weekday a tech, near each other). Their visits are made by
//     the plans themselves (app.service_plan_changed → app.plan_visits), never inserted here;
//   - one repair a working day for each of Luis, Priya and Tony at one of their own customers'
//     pools, over the same dates as the detections.
// Every address is a realistic Phoenix street address on the city's grid, with coordinates
// and geocoded_address stored, so nothing is looked up or shown as not on the map.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const apply = flag("--apply");
const local = option("--local");
const ref =
  option("--ref") ??
  JSON.parse(readFileSync(join(root, "config", "supabase-dev.json"), "utf8")).projectRef;
// The demo company lives on the dev project only (docs/release/PRODUCTION.md).
const prodFile = join(root, "config", "supabase-prod.json");
if (
  !local &&
  existsSync(prodFile) &&
  JSON.parse(readFileSync(prodFile, "utf8")).projectRef === ref
) {
  console.error(`${ref} is the production project. The demo never goes there.`);
  process.exit(2);
}

const DEMO = "Demo Leak Co.";
// The demo shop is the one the demo owner signs in to: its name can change (the owner renamed
// it Canyon State Leak Detections, 2026-10-22), its owner's login doesn't.
const DEMO_OWNER = "owner@demo.leakbook.test";
const demoCompany = `(select c.id from public.company c
    join public.membership m on m.company_id = c.id and m.role = 'owner' and m.deleted_at is null
    join auth.users u on u.id = m.user_id
    where u.email = ${"'"}${DEMO_OWNER}${"'"} and c.deleted_at is null
    order by c.created_at limit 1)`;
const PASSWORD = "leakbook-demo";

// ---------------------------------------------------------------------------
// Database access
// ---------------------------------------------------------------------------

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

const lit = (s) => (s == null ? "null" : `'${String(s).replaceAll("'", "''")}'`);

// ---------------------------------------------------------------------------
// What test runs made: names with a run suffix, and the e2e and simulator fixtures
// ---------------------------------------------------------------------------

/**
 * A customer made by a test run, by its name: a run suffix ("Zoo Pool mvh98v8llzo4",
 * "City Center 5es", "Hall, Grace 884", "Swift Quote 65810D"), or a fixture's name.
 * Seeded demo customers (fixed ids) and anything else someone typed are kept.
 */
export const TEST_NAME = String.raw`(\s(mv[a-z0-9]{8,}|[a-z0-9]{3}|[0-9A-F]{6})$)|^(E2E|EDGE|Hosted media test|Swift media test|Apple Map|Plan Week|Routes |Reorder |Visibility Check)`;
const SEEDED_ID = "00000000-0000-4000-8000-%";

// ---------------------------------------------------------------------------
// The generated demo
// ---------------------------------------------------------------------------

/** A small seeded generator (mulberry32), so every run makes the same demo. */
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

const TEAM = [
  {
    id: "00000000-0000-4000-8000-00000000d001",
    key: "dana",
    email: "owner@demo.leakbook.test",
    name: "Dana Owner",
    role: "owner",
    color: "blue",
  },
  {
    id: "00000000-0000-4000-8000-00000000d004",
    key: "jake",
    email: "jake@demo.leakbook.test",
    name: "Jake Turner",
    role: "tech",
    color: "orange",
  },
  {
    id: "00000000-0000-4000-8000-00000000d003",
    key: "luis",
    email: "luis@demo.leakbook.test",
    name: "Luis Ramirez",
    role: "tech",
    color: "green",
  },
  {
    id: "00000000-0000-4000-8000-00000000d005",
    key: "priya",
    email: "priya@demo.leakbook.test",
    name: "Priya Shah",
    role: "tech",
    color: "purple",
  },
  {
    id: "00000000-0000-4000-8000-00000000d002",
    key: "tony",
    email: "tech@demo.leakbook.test",
    name: "Tony Tech",
    role: "tech",
    color: "teal",
  },
];
const member = (key) => TEAM.find((t) => t.key === key);

// Phoenix's address grid: Washington St is 0 north, Central Ave 0 east and west. About 1,000
// house numbers a mile north; numbered streets east (16th St) and avenues west (35th Ave).
const ORIGIN = { lat: 33.4484, lng: -112.074 };
const latOf = (north) => +(ORIGIN.lat + (north / 1000) * 0.013075).toFixed(6);
const lngOf = (x) => +(ORIGIN.lng + x * (x >= 0 ? 0.00195 : 0.0018)).toFixed(6);

// East-west residential streets, by their place on the grid (house numbers north).
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

// ZIP codes by their rough middle, for the nearest one.
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
  ZIPS.reduce((best, z) =>
    (z[1] - lat) ** 2 + (z[2] - lng) ** 2 < (best[1] - lat) ** 2 + (best[2] - lng) ** 2 ? z : best,
  )[0];

const ordinal = (n) => {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th");
  return `${n}${s}`;
};

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
  "Hale",
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
  "Soto",
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
const BUSINESSES = [
  ["Sunbelt Pool Service", "pool_company"],
  ["Desert Breeze HOA", "property_manager"],
  ["Canyon Crest Apartments", "property_manager"],
  ["Clearwater Pool Builders", "builder"],
  ["Saguaro Pool Care", "pool_company"],
];
const ACCESS = [
  "Side gate code 4417.",
  "Dog in the yard; latch the gate.",
  "Gate on the east side. Ring the bell first.",
  "Equipment behind the garage.",
  null,
  null,
  null,
];
const PLAN_NOTES = [
  "Salt pool. Check the cell.",
  "Backwash every other visit.",
  "Leaves from the palo verde.",
  null,
  null,
  null,
];
const REPAIRS = [
  ["Replace skimmer throat and seal the seam.", 38500],
  ["Repair the return line under the deck.", 68500],
  ["Replace the pump shaft seal.", 24500],
  ["Replace the light niche gasket.", 29500],
  ["Rebuild the autofill valve.", 18500],
  ["Replace the cleaner line fitting.", 21500],
];
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
];

const isoDay = (d) => d.toISOString().slice(0, 10);
const addDays = (date, n) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return isoDay(d);
};
const weekdayOf = (date) => new Date(`${date}T12:00:00Z`).getUTCDay();

/** The demo's rows, from the shop's today (a "2026-10-20" date in its time zone). */
export function buildDemo(today, depot) {
  const rand = rng(20261020);
  const pick = (list) => list[Math.floor(rand() * list.length)];
  const between = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
  const names = new Set();
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
        // On a numbered street or avenue: "4821 N 38th St".
        north += (north % 2) - (rand() < 0.5 ? 1 : 0);
        const kind =
          x >= 0 ? pick(["St", "St", "St", "Pl", "Way"]) : pick(["Ave", "Ave", "Ave", "Dr", "Ln"]);
        street = `${north} N ${ordinal(Math.abs(x))} ${kind}`;
      } else {
        // On a cross street: "3807 E Campbell Ave".
        const [at, name] = CROSS_STREETS.reduce((b, c) =>
          Math.abs(c[0] - north) < Math.abs(b[0] - north) ? c : b,
        );
        north = at;
        const num = Math.abs(x) * 100 + between(1, 49) * 2 - (rand() < 0.5 ? 1 : 0);
        street = `${num} ${x >= 0 ? "E" : "W"} ${name}`;
        x = (num / 100) * Math.sign(x);
      }
      if (places.has(street)) continue;
      places.add(street);
      const lat = latOf(north);
      const lng = lngOf(x);
      return { street, city: "Phoenix", state: "AZ", zip: String(zipOf(lat, lng)), lat, lng };
    }
  };

  const phone = (i) => {
    const area = [602, 480, 623][Math.floor(i / 100) % 3];
    return `(${area}) 555-${String(100 + (i % 100)).padStart(4, "0")}`;
  };

  const customer = (index, kindName) => {
    n += 1;
    const [name, kind] = kindName ?? [person(), "homeowner"];
    return {
      id: `00000000-0000-4000-8000-0000000e${String(index).padStart(4, "0")}`,
      property_id: `00000000-0000-4000-8000-0000000f${String(index).padStart(4, "0")}`,
      name,
      kind,
      phone: phone(n),
      email: `${name.toLowerCase().replace(/[^a-z]+/g, ".")}@example.com`,
    };
  };

  const pool = () => {
    const spa = rand() < 0.3;
    return {
      pool_type: pick([
        "gunite_plaster",
        "gunite_plaster",
        "gunite_plaster",
        "fiberglass",
        "vinyl",
      ]),
      has_spa: spa,
      diagram_shape: pick(["rectangle", "kidney", "oval", "freeform"]),
      approx_gallons: between(12, 26) * 1000,
      access_notes: pick(ACCESS),
    };
  };

  // Maintenance: 50 customers a tech, 10 a weekday, each weekday a band of the tech's area.
  const AREAS = {
    luis: { xs: [-75, -19], norths: [1600, 8400] }, // west
    tony: { xs: [-27, 24], norths: [8800, 16400] }, // north central
    priya: { xs: [16, 64], norths: [2400, 7600] }, // east
  };
  const customers = [];
  const plans = [];
  let index = 0;
  for (const tech of ["luis", "priya", "tony"]) {
    const area = AREAS[tech];
    const band = (area.norths[1] - area.norths[0]) / 5;
    for (let wd = 1; wd <= 5; wd++) {
      const day = [];
      for (let k = 0; k < 10; k++) {
        index += 1;
        const c = customer(index);
        const lo = Math.round(area.norths[0] + band * (wd - 1));
        const a = address(area.xs, [lo, Math.round(lo + band)]);
        customers.push({ ...c, ...a, ...pool() });
        day.push({ c, a });
      }
      // The order a tech drives them: nearest next, from the shop.
      let at = depot;
      const left = [...day];
      while (left.length) {
        left.sort(
          (p, q) =>
            (p.a.lat - at.lat) ** 2 +
            (p.a.lng - at.lng) ** 2 -
            ((q.a.lat - at.lat) ** 2 + (q.a.lng - at.lng) ** 2),
        );
        const next = left.shift();
        at = next.a;
        plans.push({
          customer_id: next.c.id,
          property_id: next.c.property_id,
          tech: member(tech).id,
          weekday: wd,
          price_cents: pick([14500, 16500, 18500, 21000]),
          notes: pick(PLAN_NOTES),
        });
      }
    }
  }

  // The working days: the Monday of last week through two weeks from today.
  const monday = addDays(today, -((weekdayOf(today) + 6) % 7));
  const first = addDays(monday, -7);
  const last = addDays(today, 14);
  const days = [];
  for (let d = first; d <= last; d = addDays(d, 1)) {
    const wd = weekdayOf(d);
    if (wd >= 1 && wd <= 5) days.push(d);
  }

  // Leak detections: Dana with Jake, 2 or 3 a day, anywhere in the city.
  const detections = [];
  let di = 500;
  for (const day of days) {
    const count = rand() < 0.5 ? 2 : 3;
    for (let slot = 0; slot < count; slot++) {
      di += 1;
      const c = customer(di, rand() < 0.1 ? BUSINESSES[(di - 501) % BUSINESSES.length] : undefined);
      const a = address([-60, 64], [1200, 16000]);
      const p = pool();
      customers.push({ ...c, ...a, ...p });
      const state =
        day < today
          ? "finished"
          : day > today
            ? "scheduled"
            : slot === 0 && count === 3
              ? "finished"
              : slot === count - 1
                ? "scheduled"
                : "in_progress";
      detections.push({
        customer_id: c.id,
        property_id: c.property_id,
        date: day,
        start: ["08:00", "11:00", "14:00"][slot],
        fee_cents: p.has_spa ? 45000 : 37500,
        reason: pick(REASONS),
        notes: pick(DETECTION_NOTES),
        state,
        // About a third find a leak.
        leak: state === "finished" && rand() < 0.35,
      });
    }
  }

  // Repairs: one a working day for each maintenance tech, at one of their own pools.
  const repairs = [];
  for (const day of days) {
    for (const tech of ["luis", "priya", "tony"]) {
      const own = plans.filter((p) => p.tech === member(tech).id);
      const at = own[Math.floor(rand() * own.length)];
      const [note, fee] = pick(REPAIRS);
      repairs.push({
        customer_id: at.customer_id,
        property_id: at.property_id,
        tech: member(tech).id,
        date: day,
        notes: note,
        fee_cents: fee,
        state: day < today ? "finished" : day === today ? "in_progress" : "scheduled",
      });
    }
  }

  // Needs a Time (owner, 2026-10-22: "fill 'needs a time' with like 3-4 demos"): jobs taken
  // but not booked yet, with no time and no tech, for the Schedule's Needs a Time.
  const leakCustomers = customers.filter((c) => !plans.some((p) => p.customer_id === c.id));
  const unscheduled = [
    {
      type: "detection",
      at: leakCustomers[3],
      notes: "Losing about an inch a day. Wants the earliest opening.",
      fee_cents: 37500,
    },
    {
      type: "detection",
      at: leakCustomers[17],
      notes: "Water bill doubled; spa drops faster than the pool.",
      fee_cents: 45000,
    },
    {
      type: "repair",
      at: plans[7],
      notes: "Replace the cracked skimmer lid and the weir door.",
      fee_cents: 18500,
    },
    {
      type: "repair",
      at: plans[66],
      notes: "Pool light out. Check the bulb and the GFCI.",
      fee_cents: 22000,
    },
  ].map((u) => ({
    type: u.type,
    customer_id: u.type === "repair" ? u.at.customer_id : u.at.id,
    property_id: u.at.property_id,
    notes: u.notes,
    fee_cents: u.fee_cents,
  }));

  return { today, first, last, days, customers, plans, detections, repairs, unscheduled };
}

// ---------------------------------------------------------------------------
// The SQL
// ---------------------------------------------------------------------------

function resetSql(demo) {
  const data = JSON.stringify({
    team: TEAM,
    customers: demo.customers,
    plans: demo.plans,
    detections: demo.detections,
    repairs: demo.repairs,
    unscheduled: demo.unscheduled,
  });
  const dana = member("dana").id;
  const jake = member("jake").id;
  return `
do $demo_reset$
declare
  data jsonb := ${lit(data)}::jsonb;
  co uuid;
  tz text;
  u jsonb;
  c jsonb;
  x jsonb;
  ct record;
  j uuid;
  comp uuid;
  leak uuid;
  leak_label text;
  rep uuid;
  inv uuid;
  start_at timestamptz;
  this_monday date;
  removed jsonb := '{}';
  k bigint;
begin
  select id, timezone into co, tz from public.company where id = ${demoCompany};
  if co is null then
    raise exception 'No demo company (owned by ${DEMO_OWNER}) on this database';
  end if;
  if (now() at time zone tz)::date <> ${lit(demo.today)}::date then
    raise exception 'The shop''s day changed since this was built (%); run it again',
      (now() at time zone tz)::date;
  end if;
  this_monday := date_trunc('week', ${lit(demo.today)}::date)::date;

  -- Written as the server: sent quotes and invoices are frozen for everyone else.
  perform set_config('app.invoice_server', 'on', true);
  perform set_config('app.quote_server', 'on', true);

  -- ---- Remove -------------------------------------------------------------
  update public.service_plan set deleted_at = now() where company_id = co and deleted_at is null;
  get diagnostics k = row_count; removed := removed || jsonb_build_object('plans', k);
  update public.plan_cleaning set deleted_at = now() where company_id = co and deleted_at is null;
  update public.job set deleted_at = now() where company_id = co and deleted_at is null;
  get diagnostics k = row_count; removed := removed || jsonb_build_object('jobs', k);
  update public.checklist_item_result r set deleted_at = now()
  from public.job jb where r.job_id = jb.id and r.company_id = co and r.deleted_at is null
    and jb.deleted_at is not null;
  update public.job_component x2 set deleted_at = now()
  from public.job jb where x2.job_id = jb.id and x2.company_id = co and x2.deleted_at is null
    and jb.deleted_at is not null;
  update public.finding f set deleted_at = now()
  from public.job jb where f.job_id = jb.id and f.company_id = co and f.deleted_at is null
    and jb.deleted_at is not null;
  update public.test_result t set deleted_at = now()
  from public.job jb where t.job_id = jb.id and t.company_id = co and t.deleted_at is null
    and jb.deleted_at is not null;
  update public.quote_line_item set deleted_at = now() where company_id = co and deleted_at is null;
  update public.quote set deleted_at = now() where company_id = co and deleted_at is null;
  get diagnostics k = row_count; removed := removed || jsonb_build_object('quotes', k);
  update public.invoice_line_item set deleted_at = now() where company_id = co and deleted_at is null;
  update public.invoice set deleted_at = now() where company_id = co and deleted_at is null;
  get diagnostics k = row_count; removed := removed || jsonb_build_object('invoices', k);
  -- Sent reports never change (the customer's copy); drafts go.
  update public.report set deleted_at = now()
  where company_id = co and deleted_at is null and status = 'draft';
  get diagnostics k = row_count; removed := removed || jsonb_build_object('draft_reports', k);
  update public.property set deleted_at = now()
  where company_id = co and deleted_at is null
    and customer_id in (select id from public.customer where company_id = co
                        and id::text not like ${lit(SEEDED_ID)} and name ~ ${lit(TEST_NAME)});
  update public.customer set deleted_at = now()
  where company_id = co and deleted_at is null
    and id::text not like ${lit(SEEDED_ID)} and name ~ ${lit(TEST_NAME)};
  get diagnostics k = row_count; removed := removed || jsonb_build_object('test_customers', k);
  perform set_config('app.invoice_server', 'off', true);
  perform set_config('app.quote_server', 'off', true);

  -- ---- The team -----------------------------------------------------------
  for u in select * from jsonb_array_elements(data -> 'team') loop
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
    insert into public.membership (company_id, user_id, role, color)
    values (co, (u ->> 'id')::uuid, u ->> 'role', u ->> 'color')
    on conflict (company_id, user_id) do update
      set role = excluded.role, color = excluded.color, status = 'active', deleted_at = null;
  end loop;

  -- ---- Customers and pools ------------------------------------------------
  for c in select * from jsonb_array_elements(data -> 'customers') loop
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
            (c ->> 'lat')::double precision, (c ->> 'lng')::double precision,
            (c ->> 'street') || ', ' || (c ->> 'city') || ', ' || (c ->> 'state') || ' ' || (c ->> 'zip'),
            'manual')
    on conflict (id) do update
      set customer_id = excluded.customer_id, address_line1 = excluded.address_line1,
          city = excluded.city, state = excluded.state, postal_code = excluded.postal_code,
          pool_type = excluded.pool_type, has_pool = true, has_spa = excluded.has_spa,
          diagram_shape = excluded.diagram_shape, approx_gallons = excluded.approx_gallons,
          access_notes = excluded.access_notes, latitude = excluded.latitude,
          longitude = excluded.longitude, geocoded_address = excluded.geocoded_address,
          location_source = 'manual', deleted_at = null;
  end loop;

  -- ---- Repairs (before the plans, so each day's visits come after them) ---
  for x in select * from jsonb_array_elements(data -> 'repairs') loop
    start_at := ((x ->> 'date')::date + time '08:00') at time zone tz;
    insert into public.job (company_id, type, property_id, bill_to_customer_id, status,
                            assigned_user_id, scheduled_start, scheduled_end, fee_cents,
                            summary_notes)
    values (co, 'repair', (x ->> 'property_id')::uuid, (x ->> 'customer_id')::uuid, 'scheduled',
            (x ->> 'tech')::uuid, start_at, start_at + interval '90 minutes',
            (x ->> 'fee_cents')::integer, x ->> 'notes')
    returning id into j;
    if x ->> 'state' in ('finished', 'in_progress') then
      update public.job set status = 'in_progress', started_at = start_at where id = j;
    end if;
    if x ->> 'state' = 'finished' then
      update public.job set status = 'invoiced', completed_at = start_at + interval '80 minutes'
      where id = j;
      insert into public.invoice (company_id, job_id, status, subtotal_cents, total_cents,
                                  amount_paid_cents, due_date, sent_at, paid_at)
      values (co, j, 'paid', (x ->> 'fee_cents')::integer, (x ->> 'fee_cents')::integer,
              (x ->> 'fee_cents')::integer, (x ->> 'date')::date,
              start_at + interval '90 minutes', start_at + interval '3 hours')
      returning id into inv;
      perform set_config('app.invoice_server', 'on', true);
      insert into public.invoice_line_item (company_id, invoice_id, description,
                                            unit_price_cents, taxable)
      values (co, inv, 'Repair', (x ->> 'fee_cents')::integer, false);
      perform set_config('app.invoice_server', 'off', true);
      insert into public.payment (company_id, invoice_id, amount_cents, method, status, paid_at)
      values (co, inv, (x ->> 'fee_cents')::integer, 'card', 'succeeded',
              start_at + interval '3 hours');
      update public.job set status = 'paid' where id = j;
    end if;
  end loop;

  -- ---- Needs a Time: taken, not booked (no time, no tech) ----------------
  for x in select * from jsonb_array_elements(data -> 'unscheduled') loop
    insert into public.job (company_id, type, property_id, bill_to_customer_id, status,
                            fee_cents, summary_notes)
    values (co, x ->> 'type', (x ->> 'property_id')::uuid, (x ->> 'customer_id')::uuid,
            'unscheduled', (x ->> 'fee_cents')::integer, x ->> 'notes');
  end loop;

  -- ---- Weekly plans: saving each makes its visits (app.plan_visits) -------
  for x in select * from jsonb_array_elements(data -> 'plans') loop
    insert into public.service_plan (company_id, customer_id, property_id, assigned_user_id,
                                     starts_on, interval_weeks, duration_minutes, price_cents,
                                     notes)
    values (co, (x ->> 'customer_id')::uuid, (x ->> 'property_id')::uuid, (x ->> 'tech')::uuid,
            this_monday - 7 + ((x ->> 'weekday')::integer - 1), 1, 30,
            (x ->> 'price_cents')::integer, x ->> 'notes');
  end loop;

  -- ---- Leak detections: Dana with Jake -----------------------------------
  -- Sending a report checks the sender, so it's sent as Dana.
  perform set_config('request.jwt.claims',
    json_build_object('sub', ${lit(dana)}, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  for x in select * from jsonb_array_elements(data -> 'detections') loop
    start_at := ((x ->> 'date')::date + (x ->> 'start')::time) at time zone tz;
    insert into public.job (company_id, type, property_id, bill_to_customer_id, status,
                            assigned_user_id, second_tech_id, scheduled_start, scheduled_end,
                            fee_cents, intake, summary_notes)
    values (co, 'detection', (x ->> 'property_id')::uuid, (x ->> 'customer_id')::uuid,
            'scheduled', ${lit(dana)}, ${lit(jake)}, start_at,
            start_at + interval '2 hours 30 minutes', (x ->> 'fee_cents')::integer,
            jsonb_build_object('reason', jsonb_build_array(x ->> 'reason'),
                               'pool_size', 'Normal (about 15x30 or 20x40)'),
            x ->> 'notes')
    returning id into j;

    -- The checklist, as planComponents builds it for this pool.
    leak := null;
    leak_label := null;
    for ct in
      select ty.id, ty.key, ty.name, ty.allows_multiple, ty.default_count, ty.sort_order, g.k
      from public.component_type ty
      join public.property pr on pr.id = (x ->> 'property_id')::uuid
      cross join lateral generate_series(
        1, case when ty.allows_multiple then greatest(ty.default_count, 1) else 1 end) as g(k)
      where ty.company_id = co and ty.active and ty.deleted_at is null
        and ty.job_type = 'detection'
        and (ty.applies_to <> 'spa' or pr.has_spa)
        and (ty.applies_to_pool_type is null or ty.applies_to_pool_type = pr.pool_type)
      order by ty.sort_order, g.k
    loop
      insert into public.job_component (company_id, job_id, component_type_id, instance_number,
                                        label, sort_order)
      values (co, j, ct.id, ct.k,
              case when ct.allows_multiple and (ct.k > 1 or ct.default_count > 1)
                   then ct.name || ' ' || ct.k else ct.name end,
              ct.sort_order * 100 + ct.k)
      returning id into comp;
      if x ->> 'state' = 'finished' then
        insert into public.checklist_item_result (company_id, job_id, job_component_id, status,
                                                  outcome, location_text, inspected_at,
                                                  inspected_by)
        values (co, j, comp, 'inspected',
                case when (x ->> 'leak')::boolean and ct.key = 'skimmer_seam' then 'leaking' else 'ok' end,
                case when (x ->> 'leak')::boolean and ct.key = 'skimmer_seam'
                     then 'Seam at the skimmer throat' end,
                start_at + interval '1 hour', ${lit(dana)});
        if (x ->> 'leak')::boolean and ct.key = 'skimmer_seam' then
          leak := comp;
          leak_label := ct.name;
        end if;
      else
        insert into public.checklist_item_result (company_id, job_id, job_component_id, status)
        values (co, j, comp, 'pending');
      end if;
    end loop;

    if x ->> 'state' in ('finished', 'in_progress') then
      update public.job set status = 'in_progress', started_at = start_at where id = j;
    end if;
    if x ->> 'state' = 'finished' then
      if leak is not null then
        insert into public.finding (company_id, job_id, job_component_id, title, location_text,
                                    severity_key, status, notes)
        values (co, j, leak, 'Skimmer seam leak', 'Seam at the skimmer throat', 'moderate',
                'repaired', 'Dye drew in at the seam. Sealed with underwater epoxy.');
      end if;
      insert into public.report (company_id, job_id, template_key, final_sections)
      values (co, j, 'homeowner', jsonb_build_array(
        jsonb_build_object('key', 'summary', 'title', 'Summary', 'text',
          case when leak is not null
               then 'We found a leak at the skimmer seam and sealed it during the visit. The rest of the pool, its plumbing and equipment tested tight.'
               else 'We found no leak. The pool shell, plumbing lines, fittings and equipment all tested tight.' end),
        jsonb_build_object('key', 'findings', 'title', 'What we found', 'text',
          case when leak is not null
               then 'Dye drew in at the seam where the skimmer meets the pool wall. We sealed it with underwater epoxy.'
               else 'Every line held pressure and dye showed no draw at any fitting, light niche or crack.' end),
        jsonb_build_object('key', 'next_steps', 'title', 'What happens next', 'text',
          case when leak is not null
               then 'Watch the water level for a week. It should now drop only from evaporation.'
               else 'The water loss is likely evaporation. Run a bucket test for three days if it continues.' end)))
      returning id into rep;
      perform app.send_report_unchecked(rep, 'Customer not present');
      update public.job set completed_at = start_at + interval '2 hours 15 minutes' where id = j;
    end if;
  end loop;
  perform set_config('request.jwt.claims', '', true);

  raise notice 'demo reset: removed %', removed;
end
$demo_reset$;
`;
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const where = local ? `local database ${local}` : `project ${ref}`;
const [company] = await query(`
  select id, name, timezone, latitude, longitude, (now() at time zone timezone)::date::text as today
  from public.company where id = ${demoCompany}`);
if (!company) {
  console.error(
    `${where}: no demo company (owned by ${DEMO_OWNER}). Load the demo seed first (pnpm db:deploy -- --seed).`,
  );
  process.exit(1);
}
const co = lit(company.id);
const depot = { lat: company.latitude ?? 33.4486, lng: company.longitude ?? -112.0773 };
const demo = buildDemo(company.today, depot);

const [counts] = await query(`
  select
    (select count(*) from public.job where company_id = ${co} and deleted_at is null)::int as jobs,
    (select count(*) from public.quote where company_id = ${co} and deleted_at is null)::int as quotes,
    (select count(*) from public.invoice where company_id = ${co} and deleted_at is null)::int as invoices,
    (select count(*) from public.report where company_id = ${co} and deleted_at is null and status = 'draft')::int as draft_reports,
    (select count(*) from public.report where company_id = ${co} and deleted_at is null and status <> 'draft')::int as sent_reports,
    (select count(*) from public.service_plan where company_id = ${co} and deleted_at is null)::int as plans,
    (select count(*) from public.customer where company_id = ${co} and deleted_at is null)::int as customers,
    (select count(*) from public.customer where company_id = ${co} and deleted_at is null
       and id::text not like ${lit(SEEDED_ID)} and name ~ ${lit(TEST_NAME)})::int as test_customers`);
const kept = await query(`
  select name from public.customer
  where company_id = ${co} and deleted_at is null and id::text not like ${lit(SEEDED_ID)}
    and name !~ ${lit(TEST_NAME)} and id::text not like '00000000-0000-4000-8000-0000000e%'
  order by name`);
const team = await query(`
  select u.email, p.full_name, m.role, m.status from public.membership m
  join auth.users u on u.id = m.user_id left join public.profile p on p.id = m.user_id
  where m.company_id = ${co} and m.deleted_at is null order by m.status, m.created_at`);

const byTech = (list, id) => list.filter((x) => x.tech === id).length;
console.log(
  `${where}: "${company.name}" (${company.id}), today ${company.today} (${company.timezone})`,
);
console.log(`\nRemove (soft-delete):`);
console.log(
  `  ${counts.jobs} jobs, ${counts.quotes} quotes, ${counts.invoices} invoices, ${counts.plans} plans`,
);
console.log(
  `  ${counts.draft_reports} draft reports (${counts.sent_reports} sent reports stay: they never change)`,
);
console.log(
  `  ${counts.test_customers} of ${counts.customers} customers, made by test runs, and their pools`,
);
if (kept.length) {
  console.log(
    `  kept, typed by someone (not demo data, not a test run's): ${kept.map((k) => k.name).join(", ")}`,
  );
}
console.log(`\nTeam (kept; colors set; missing users made with the demo password):`);
for (const t of TEAM) {
  const now = team.find((m) => m.email === t.email);
  console.log(
    `  ${t.name.padEnd(13)} ${t.role.padEnd(5)} ${t.color.padEnd(7)} ${now ? `${now.status}` : "new user"}`,
  );
}
const others = team.filter((m) => !TEAM.some((t) => t.email === m.email));
if (others.length)
  console.log(
    `  and ${others.length} others, unchanged (${others.filter((m) => m.status === "active").length} active)`,
  );

const mCustomers = demo.plans.length;
console.log(`\nMake (${demo.first} to ${demo.last}, ${demo.days.length} working days):`);
console.log(
  `  ${demo.customers.length} customers with one pool each (${mCustomers} maintenance, ${demo.detections.length} leak detection)`,
);
for (const key of ["luis", "priya", "tony"]) {
  const id = member(key).id;
  const days = [1, 2, 3, 4, 5].map(
    (wd) => demo.plans.filter((p) => p.tech === id && p.weekday === wd).length,
  );
  console.log(
    `  ${member(key).name}: ${byTech(demo.plans, id)} weekly plans (Mon–Fri ${days.join("/")}), ${byTech(demo.repairs, id)} repairs`,
  );
}
const state = (list, s) => list.filter((x) => x.state === s).length;
console.log(
  `  ${demo.detections.length} leak detections, Dana with Jake: ${state(demo.detections, "finished")} finished with a sent report (${demo.detections.filter((d) => d.leak).length} found a leak), ${state(demo.detections, "in_progress")} in progress, ${state(demo.detections, "scheduled")} scheduled`,
);
console.log(
  `  ${demo.repairs.length} repairs: ${state(demo.repairs, "finished")} paid, ${state(demo.repairs, "in_progress")} in progress, ${state(demo.repairs, "scheduled")} scheduled`,
);
console.log(
  `  ${demo.unscheduled.length} in Needs a Time (no time, no tech): ${demo.unscheduled.map((u) => u.type).join(", ")}`,
);
console.log(
  `  plan visits: made by the plans (about ${mCustomers} a week through the shop's weeks ahead)`,
);
console.log(`\nSample addresses:`);
for (const c of [0, 10, 50, 60, 100, 110, 150, 160].map((i) => demo.customers[i]).filter(Boolean)) {
  console.log(
    `  ${c.name.padEnd(24)} ${c.street}, ${c.city}, ${c.state} ${c.zip}  (${c.lat}, ${c.lng})`,
  );
}

const sql = resetSql(demo);
const sqlFile = option("--sql");
if (sqlFile) writeFileSync(sqlFile, sql);
console.log(
  `\nSQL: ${(sql.length / 1024).toFixed(0)} KB in one transaction${sqlFile ? `, written to ${sqlFile}` : ""}`,
);

if (!apply) {
  console.log("\nDry run: nothing changed. Run with --apply to rebuild the demo.");
  process.exit(0);
}
await query(`begin;\n${sql}\ncommit;`);
const [after] = await query(`
  select
    (select count(*) from public.job where company_id = ${co} and deleted_at is null and type = 'maintenance')::int as visits,
    (select count(*) from public.job where company_id = ${co} and deleted_at is null and type = 'detection')::int as detections,
    (select count(*) from public.job where company_id = ${co} and deleted_at is null and type = 'repair')::int as repairs,
    (select count(*) from public.service_plan where company_id = ${co} and deleted_at is null)::int as plans`);
console.log(
  `\nApplied: ${after.plans} plans, ${after.visits} plan visits, ${after.detections} leak detections, ${after.repairs} repairs.`,
);
