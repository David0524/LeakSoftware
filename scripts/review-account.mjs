// A shop for Apple's (and later Google's) app reviewers (docs/release/PRODUCTION.md, "App
// Review account"). Through the Management API like scripts/demo-reset.mjs, or a local
// Postgres for testing.
//
//   NODE_USE_ENV_PROXY=1 node scripts/review-account.mjs --ref <ref>                dry run
//   NODE_USE_ENV_PROXY=1 node scripts/review-account.mjs --ref <ref> --apply        makes it
//   node scripts/review-account.mjs --local <database> [--apply]                    local Postgres
//
//   --with-tech   also a tech login (appreview.tech@sundeckpro.com), with its own password
//   --allow-dev   needed to apply it to the dev project (config/supabase-dev.json); the owner
//                 decides that, not a session
//
// What it makes, in its own company (never the shared demo company, "Demo Leak Co." and its
// renames, which is found by its owner's login and left alone):
//   - The owner login appreview@sundeckpro.com (and the tech's), each with a new random password
//     printed once at the end and never saved anywhere. Run again, it resets the passwords
//     (and removes any two-step sign-in a reviewer turned on) and rebuilds the shop's data.
//   - "Palo Verde Pool Service (App Review)" in Phoenix, both packages (pool care and leak
//     detection), made by public.create_company as the owner, as sign-up does.
//   - Billing through the Admin portal's own functions: Extend Trial (admin_extend_trial,
//     which also marks setup finished) and Make Demo (admin_set_demo): no card, no charge, no
//     trial end, never locked (app.company_locked), never held on Finish Setting Up
//     (core mustFinishSetup: a demo plan is never held). A trial alone would lock the shop 30
//     days later, mid-review.
//   - 24 customers with one pool each, on Phoenix's address grid with their map positions
//     stored (nothing is looked up). 21 have weekly pool service, three every day of the week,
//     so Today has a route whatever day the reviewer opens it; the plans make their own visits.
//   - Three leak detections: yesterday's finished, with its checklist, a pressure test, a
//     finding, the sent report, a sent quote for the repair and the sent invoice for the visit;
//     today's at 1 PM with its checklist to work; tomorrow's.
//
// Nothing it makes reaches a real person: customers have example.com addresses and 555-01xx
// numbers (reserved for fiction), every customer is opted out of reminder and review emails,
// the shop's quote and invoice reminders are off, and visit reports go only when sent by hand.
// And it's the App Review shop (company.review_shop, migration 20261022002800): whatever a
// reviewer does by hand, the server records the shop's texts and emails as sent without
// handing them to Twilio or Resend (email to sundeckpro.com still goes, for testing), and
// refuses phone number purchases and calls. Its texting number is made up ((602) 555-0100, the
// shop's own), so Messages works as in any shop; nobody can text or call it.
import { randomInt } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const root = join(import.meta.dirname, "..");
const devConfig = JSON.parse(readFileSync(join(root, "config", "supabase-dev.json"), "utf8"));
const DEV_REFS = new Set(["evmxdfasurkaxbwkceti", devConfig.projectRef]);

/** The shared demo company is the one this login owns (scripts/demo-reset.mjs). */
export const DEMO_OWNER = "owner@demo.leakbook.test";

export const SHOP = {
  name: "Palo Verde Pool Service (App Review)",
  timezone: "America/Phoenix",
  phone: "(602) 555-0100",
  /** The made-up texting number (the shop's own phone, reserved for fiction). */
  texting: "+16025550100",
  email: "appreview@sundeckpro.com",
  street: "2602 N 16th St",
  city: "Phoenix",
  state: "AZ",
  zip: "85016",
  north: 2602,
  x: 16,
};
export const OWNER = { email: "appreview@sundeckpro.com", name: "Riley Brooks" };
export const TECH = { email: "appreview.tech@sundeckpro.com", name: "Jordan Lee" };

// Phoenix's address grid, as scripts/demo-reset.mjs: Washington St is 0 north, Central Ave 0
// east and west; about 1,000 house numbers a mile north, numbered streets east.
const ORIGIN = { lat: 33.4484, lng: -112.074 };
export const latOf = (north) => +(ORIGIN.lat + (north / 1000) * 0.013075).toFixed(6);
export const lngOf = (x) => +(ORIGIN.lng + x * (x >= 0 ? 0.00195 : 0.0018)).toFixed(6);

/**
 * The customers: [name, kind, street, house numbers north, streets east, ZIP, pool type, spa].
 * The first 21 are the weekly route (three a weekday, Monday first); the last three are the
 * leak detections (yesterday's, today's, tomorrow's).
 */
const PEOPLE = [
  ["Megan Hale", "homeowner", "4512 N 40th St", 4512, 40, "85018", "gunite_plaster", true],
  [
    "Daniel Ortiz",
    "homeowner",
    "4021 E Campbell Ave",
    4500,
    40.21,
    "85018",
    "gunite_plaster",
    false,
  ],
  ["Priscilla Wong", "homeowner", "4630 N 44th St", 4630, 44, "85018", "gunite_plaster", false],
  ["Tom Becker", "homeowner", "3825 E Glenrosa Ave", 4300, 38.25, "85018", "gunite_plaster", false],
  ["Lena Fischer", "homeowner", "4214 N 46th St", 4214, 46, "85018", "fiberglass", false],
  ["Marcus Bell", "homeowner", "4911 E Highland Ave", 4700, 49.11, "85018", "gunite_plaster", true],
  ["Grace Kim", "homeowner", "5302 N 52nd St", 5302, 52, "85018", "gunite_plaster", true],
  [
    "Owen Ramirez",
    "homeowner",
    "5418 E Montebello Ave",
    5500,
    54.18,
    "85018",
    "gunite_plaster",
    false,
  ],
  ["Hannah Price", "homeowner", "5736 N 56th St", 5736, 56, "85018", "gunite_plaster", false],
  ["Victor Nguyen", "homeowner", "3402 N 36th St", 3402, 36, "85018", "vinyl", false],
  ["Claire Dalton", "homeowner", "3615 E Earll Dr", 3100, 36.15, "85018", "gunite_plaster", false],
  ["Sam Whitfield", "homeowner", "3218 N 32nd St", 3218, 32, "85018", "fiberglass", false],
  ["Nora Castillo", "homeowner", "6227 N 34th St", 6227, 34, "85016", "gunite_plaster", true],
  ["Ethan Brooks", "homeowner", "3309 E Rancho Dr", 6300, 33.09, "85016", "gunite_plaster", false],
  ["Ivy Morales", "homeowner", "6509 N 30th St", 6509, 30, "85016", "gunite_plaster", false],
  [
    "Paul Jensen",
    "homeowner",
    "2421 E Marlette Ave",
    5900,
    24.21,
    "85016",
    "gunite_plaster",
    false,
  ],
  ["Rosa Delgado", "homeowner", "5812 N 22nd St", 5812, 22, "85016", "gunite_plaster", true],
  ["Ben Harper", "homeowner", "2017 E Rose Ln", 5700, 20.17, "85016", "fiberglass", false],
  ["Alicia Tran", "homeowner", "4402 N 28th St", 4402, 28, "85016", "gunite_plaster", false],
  ["Kevin Shaw", "homeowner", "2615 E Pierson St", 4900, 26.15, "85016", "gunite_plaster", false],
  ["Lucy Ford", "homeowner", "4808 N 24th St", 4808, 24, "85016", "gunite_plaster", false],
  [
    "Monica Reyes",
    "homeowner",
    "3931 E Cambridge Ave",
    2300,
    39.31,
    "85008",
    "gunite_plaster",
    true,
  ],
  ["Gabriel Soto", "homeowner", "4227 E Weldon Ave", 3500, 42.27, "85018", "gunite_plaster", false],
  [
    "Sunrise Ridge HOA",
    "property_manager",
    "6015 N 16th St",
    6015,
    16,
    "85016",
    "gunite_plaster",
    true,
  ],
];
const ACCESS = ["Side gate code 2580.", "Dog in the yard; latch the gate.", null, null];
const VISIT_TIMES = ["08:00", "08:45", "09:30"];
const PRICES = [16500, 18500, 21000];

/** The shop's rows. Dates are relative to the shop's today, worked out in the database. */
export function buildReviewShop({ withTech }) {
  const customers = PEOPLE.map(([name, kind, street, north, x, zip, poolType, spa], i) => ({
    name,
    kind,
    // 555-0100 to 555-0199 are reserved for fiction; the shop is 0100.
    phone: `(602) 555-${String(110 + i).padStart(4, "0")}`,
    email: `${name.toLowerCase().replace(/[^a-z]+/g, ".")}@example.com`,
    street,
    city: "Phoenix",
    state: "AZ",
    zip,
    lat: latOf(north),
    lng: lngOf(x),
    pool_type: poolType,
    has_spa: spa,
    diagram_shape: ["kidney", "rectangle", "freeform", "oval"][i % 4],
    approx_gallons: 14000 + (i % 7) * 2000,
    access_notes: ACCESS[i % ACCESS.length],
  }));
  // Weekly service, three stops every day of the week (ISO weekday 1 = Monday ... 7 = Sunday).
  // With a tech, the tech takes each day's last stop; otherwise the owner does the route.
  const plans = customers.slice(0, 21).map((c, i) => ({
    customer: i,
    weekday: Math.floor(i / 3) + 1,
    time: VISIT_TIMES[i % 3],
    price_cents: PRICES[i % 3],
    tech: withTech && i % 3 === 2 ? "tech" : "owner",
  }));
  const detections = [
    { customer: 21, day: -1, time: "09:00", state: "finished", fee_cents: 45000 },
    { customer: 22, day: 0, time: "13:00", state: "scheduled", fee_cents: 37500 },
    { customer: 23, day: 1, time: "10:00", state: "scheduled", fee_cents: 45000 },
  ];
  return { customers, plans, detections };
}

/**
 * A password for a reviewer: 20 characters with lowercase and uppercase letters, digits and a
 * few symbols that are easy to type, as Supabase's rule and core's password.ts require.
 */
export function makePassword(pick = randomInt) {
  const sets = ["abcdefghijkmnpqrstuvwxyz", "ABCDEFGHJKLMNPQRSTUVWXYZ", "23456789", "!#%+=?@"];
  const all = sets.join("");
  const chars = sets.map((s) => s[pick(s.length)]);
  while (chars.length < 20) chars.push(all[pick(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = pick(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

const lit = (s) => (s == null ? "null" : `'${String(s).replaceAll("'", "''")}'`);

/** The SQL that makes (or remakes) the shop, in one transaction. */
export function reviewSql(data, { ownerHash, techHash }) {
  const json = JSON.stringify({
    shop: { ...SHOP, lat: latOf(SHOP.north), lng: lngOf(SHOP.x) },
    owner: OWNER,
    tech: techHash ? TECH : null,
    ...data,
  });
  return `
do $review$
declare
  data jsonb := ${lit(json)}::jsonb;
  owner_hash text := ${lit(ownerHash)};
  tech_hash text := ${lit(techHash)};
  demo uuid;
  owner_id uuid;
  tech_id uuid;
  co uuid;
  tz text := data -> 'shop' ->> 'timezone';
  today date;
  this_monday date;
  u jsonb;
  c jsonb;
  x jsonb;
  ct record;
  ids uuid[] := '{}';
  cust uuid;
  prop uuid;
  j uuid;
  comp uuid;
  leak uuid;
  rep uuid;
  q uuid;
  inv uuid;
  start_at timestamptz;
  i integer;
begin
  today := (now() at time zone tz)::date;
  this_monday := date_trunc('week', today)::date;

  -- ---- Never the shared demo company --------------------------------------
  select c2.id into demo from public.company c2
  join public.membership m on m.company_id = c2.id and m.role = 'owner'
  join auth.users du on du.id = m.user_id
  where du.email = ${lit(DEMO_OWNER)} order by c2.created_at limit 1;

  -- ---- The logins -----------------------------------------------------------
  for u in select * from jsonb_array_elements(jsonb_build_array(data -> 'owner', data -> 'tech')) loop
    continue when u is null or jsonb_typeof(u) = 'null';
    if not exists (select 1 from auth.users where lower(email) = lower(u ->> 'email')) then
      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change_token_new, email_change)
      values (
        '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated',
        'authenticated', u ->> 'email',
        case when u = data -> 'owner' then owner_hash else tech_hash end, now(),
        '{"provider": "email", "providers": ["email"]}',
        jsonb_build_object('full_name', u ->> 'name'), now(), now(), '', '', '', '');
      insert into auth.identities (
        id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      select gen_random_uuid(), au.id::text, au.id,
             jsonb_build_object('sub', au.id::text, 'email', au.email, 'email_verified', true),
             'email', now(), now(), now()
      from auth.users au where lower(au.email) = lower(u ->> 'email');
    else
      update auth.users
      set encrypted_password = case when u = data -> 'owner' then owner_hash else tech_hash end,
          email_confirmed_at = coalesce(email_confirmed_at, now()), updated_at = now()
      where lower(email) = lower(u ->> 'email');
    end if;
  end loop;
  select id into owner_id from auth.users where lower(email) = lower(data -> 'owner' ->> 'email');
  select id into tech_id from auth.users where lower(email) = lower(data -> 'tech' ->> 'email');
  -- A reviewer who turned on two-step sign-in would lock the next one out.
  if to_regclass('auth.mfa_factors') is not null then
    execute 'delete from auth.mfa_factors where user_id = any($1)'
      using array_remove(array[owner_id, tech_id], null);
  end if;
  update public.profile p set full_name = coalesce(nullif(p.full_name, ''), x2.name)
  from (values (owner_id, data -> 'owner' ->> 'name'), (tech_id, data -> 'tech' ->> 'name')) x2(id, name)
  where p.id = x2.id;

  if exists (select 1 from public.membership m where m.user_id = owner_id and m.company_id = demo) then
    raise exception 'The review login is on the demo company''s team; refusing';
  end if;

  -- ---- The shop: the review owner's own company, made as sign-up does -----
  select c2.id into co from public.company c2
  join public.membership m on m.company_id = c2.id and m.user_id = owner_id and m.role = 'owner'
  where c2.name = data -> 'shop' ->> 'name' and c2.deleted_at is null
  order by c2.created_at limit 1;
  if co = demo then
    raise exception 'The review shop resolved to the demo company; refusing';
  end if;
  if co is null then
    perform set_config('request.jwt.claims', json_build_object(
      'sub', owner_id, 'role', 'authenticated', 'email', data -> 'owner' ->> 'email')::text, true);
    co := public.create_company(data -> 'shop' ->> 'name', tz, 'both');
    perform set_config('request.jwt.claims', '', true);
  else
    -- Remake: everything the shop has goes (soft-deleted, so it leaves the phones too). Sent
    -- reports stay, as they always do; they go with their jobs.
    perform set_config('app.invoice_server', 'on', true);
    perform set_config('app.quote_server', 'on', true);
    update public.service_plan set deleted_at = now() where company_id = co and deleted_at is null;
    update public.plan_cleaning set deleted_at = now() where company_id = co and deleted_at is null;
    update public.share_link set revoked_at = coalesce(revoked_at, now())
    where company_id = co and revoked_at is null;
    update public.quote_line_item set deleted_at = now() where company_id = co and deleted_at is null;
    update public.quote set deleted_at = now() where company_id = co and deleted_at is null;
    update public.invoice_line_item set deleted_at = now() where company_id = co and deleted_at is null;
    update public.invoice set deleted_at = now() where company_id = co and deleted_at is null;
    update public.finding set deleted_at = now() where company_id = co and deleted_at is null;
    update public.test_result set deleted_at = now() where company_id = co and deleted_at is null;
    update public.checklist_item_result set deleted_at = now()
    where company_id = co and deleted_at is null;
    update public.job_component set deleted_at = now() where company_id = co and deleted_at is null;
    update public.report set deleted_at = now()
    where company_id = co and deleted_at is null and status = 'draft';
    update public.job set deleted_at = now() where company_id = co and deleted_at is null;
    update public.property set deleted_at = now() where company_id = co and deleted_at is null;
    update public.customer set deleted_at = now() where company_id = co and deleted_at is null;
    perform set_config('app.invoice_server', 'off', true);
    perform set_config('app.quote_server', 'off', true);
  end if;

  update public.company
  set phone = data -> 'shop' ->> 'phone', email = data -> 'shop' ->> 'email',
      address_line1 = data -> 'shop' ->> 'street', city = data -> 'shop' ->> 'city',
      state = data -> 'shop' ->> 'state', postal_code = data -> 'shop' ->> 'zip',
      latitude = (data -> 'shop' ->> 'lat')::double precision,
      longitude = (data -> 'shop' ->> 'lng')::double precision,
      geocoded_address = (data -> 'shop' ->> 'street') || ', ' || (data -> 'shop' ->> 'city') || ', '
        || (data -> 'shop' ->> 'state') || ' ' || (data -> 'shop' ->> 'zip'),
      review_url = null,
      -- The App Review shop: nothing it sends reaches a real person (server-enforced).
      review_shop = true,
      -- Nothing goes out by itself: no quote or invoice reminders, no review requests, visit
      -- reports only when sent by hand.
      settings = settings || '{"reminders": {"quote_days": [], "invoice_days": []},
                               "review_requests": false, "visit_reports": "manual"}'::jsonb
  where id = co;

  -- A made-up texting number, so Messages works as in any shop. Never bought: with
  -- review_shop on, the server refuses numbers and records texts without sending them.
  if not exists (select 1 from public.phone_line
                 where company_id = co and status <> 'released' and deleted_at is null) then
    insert into public.phone_line (company_id, number, source, status, provider_sid)
    values (co, data -> 'shop' ->> 'texting', 'new', 'active', 'review-shop');
  end if;

  -- Billing, through the Admin portal's own functions: Extend Trial (also marks setup
  -- finished), then Make Demo (no card, no charge, no trial end).
  if (select plan from public.subscription where company_id = co) is distinct from 'demo' then
    perform public.admin_extend_trial(co, 30);
  end if;
  perform public.admin_set_demo(co, true);

  if tech_id is not null then
    insert into public.membership (company_id, user_id, role)
    values (co, tech_id, 'tech')
    on conflict (company_id, user_id) do update
      set role = 'tech', status = 'active', deleted_at = null;
  end if;

  -- ---- Customers and pools --------------------------------------------------
  for c in select * from jsonb_array_elements(data -> 'customers') loop
    insert into public.customer (company_id, kind, name, phone, email, marketing_opt_out)
    values (co, c ->> 'kind', c ->> 'name', c ->> 'phone', c ->> 'email', true)
    returning id into cust;
    insert into public.property (company_id, customer_id, address_line1, city, state, postal_code,
                                 pool_type, has_pool, has_spa, diagram_shape, approx_gallons,
                                 access_notes, latitude, longitude, geocoded_address,
                                 location_source)
    values (co, cust, c ->> 'street', c ->> 'city', c ->> 'state', c ->> 'zip',
            c ->> 'pool_type', true, (c ->> 'has_spa')::boolean, c ->> 'diagram_shape',
            (c ->> 'approx_gallons')::integer, c ->> 'access_notes',
            (c ->> 'lat')::double precision, (c ->> 'lng')::double precision,
            (c ->> 'street') || ', ' || (c ->> 'city') || ', ' || (c ->> 'state') || ' ' || (c ->> 'zip'),
            'manual')
    returning id into prop;
    ids := ids || cust || prop;
  end loop;

  -- ---- Weekly service: saving each plan makes its visits (app.plan_visits) -
  for x in select * from jsonb_array_elements(data -> 'plans') loop
    i := (x ->> 'customer')::integer;
    insert into public.service_plan (company_id, customer_id, property_id, assigned_user_id,
                                     starts_on, interval_weeks, visit_time, duration_minutes,
                                     price_cents)
    values (co, ids[i * 2 + 1], ids[i * 2 + 2],
            case when x ->> 'tech' = 'tech' then tech_id else owner_id end,
            this_monday - 7 + ((x ->> 'weekday')::integer - 1), 1, (x ->> 'time')::time, 30,
            (x ->> 'price_cents')::integer);
  end loop;

  -- ---- Leak detections ------------------------------------------------------
  -- Sending the report checks the sender, so it's done as the owner.
  perform set_config('request.jwt.claims', json_build_object(
    'sub', owner_id, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  for x in select * from jsonb_array_elements(data -> 'detections') loop
    i := (x ->> 'customer')::integer;
    start_at := ((today + (x ->> 'day')::integer) + (x ->> 'time')::time) at time zone tz;
    insert into public.job (company_id, type, property_id, bill_to_customer_id, status,
                            assigned_user_id, second_tech_id, scheduled_start, scheduled_end,
                            fee_cents, intake, summary_notes)
    values (co, 'detection', ids[i * 2 + 2], ids[i * 2 + 1], 'scheduled', owner_id, tech_id,
            start_at, start_at + interval '2 hours', (x ->> 'fee_cents')::integer,
            jsonb_build_object('reason', jsonb_build_array('Pool water level dropping')),
            'Losing about an inch a day; the autofill runs every night.')
    returning id into j;

    -- The checklist, as planComponents builds it for this pool.
    leak := null;
    for ct in
      select ty.id, ty.key, ty.name, ty.allows_multiple, ty.default_count, ty.sort_order, g.k
      from public.component_type ty
      join public.property pr on pr.id = ids[i * 2 + 2]
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
                case when leak is null and ct.key = 'return' then 'leaking' else 'ok' end,
                case when leak is null and ct.key = 'return'
                     then 'Under the deck, 4 ft from the pool wall' end,
                start_at + interval '1 hour', owner_id);
        if leak is null and ct.key = 'return' then
          leak := comp;
        end if;
      else
        insert into public.checklist_item_result (company_id, job_id, job_component_id, status)
        values (co, j, comp, 'pending');
      end if;
    end loop;

    continue when x ->> 'state' <> 'finished';

    update public.job set status = 'in_progress', started_at = start_at where id = j;
    insert into public.test_result (company_id, job_id, job_component_id, test_type_id,
                                    schema_version, data, computed, outcome, performed_at)
    select co, j, leak, tt.id, 1,
           '{"line_name": "Return line", "start_psi": 20, "end_psi": 12, "duration_min": 15}',
           '{"drop_psi": 8, "drop_psi_per_min": 0.533}', 'fail', start_at + interval '45 minutes'
    from public.test_type tt where tt.company_id = co and tt.key = 'pressure' and leak is not null;
    insert into public.finding (company_id, job_id, job_component_id, title, location_text,
                                severity_key, status, notes)
    values (co, j, leak, 'Return line leak', 'Under the deck, 4 ft from the pool wall', 'major',
            'quoted', 'The return line dropped from 20 to 12 PSI in 15 minutes.');
    insert into public.report (company_id, job_id, template_key, final_sections)
    values (co, j, 'homeowner', jsonb_build_array(
      jsonb_build_object('key', 'summary', 'title', 'Summary', 'text',
        'We found a leak in the return line under the deck. The rest of the pool, its plumbing and equipment tested tight.'),
      jsonb_build_object('key', 'findings', 'title', 'What we found', 'text',
        'The return line dropped from 20 to 12 PSI in 15 minutes while the other lines held.'),
      jsonb_build_object('key', 'next_steps', 'title', 'What happens next', 'text',
        'We sent a quote to repair the return line. Once it''s accepted, we''ll book the repair.')))
    returning id into rep;
    perform app.send_report_unchecked(rep, 'Customer not present');

    -- The repair quote: lines first, then sent (a sent quote's lines are frozen).
    insert into public.quote (company_id, job_id, status, subtotal_cents, total_cents,
                              valid_until)
    values (co, j, 'draft', 77000, 77000, today + 30)
    returning id into q;
    insert into public.quote_line_item (company_id, quote_id, description, unit_price_cents,
                                        taxable, sort_order)
    values (co, q, 'Repair the return line under the deck', 68500, false, 1),
           (co, q, 'Pressure test after the repair', 8500, false, 2);
    perform set_config('app.quote_server', 'on', true);
    update public.quote set status = 'sent', sent_at = start_at + interval '2 hours' where id = q;
    perform set_config('app.quote_server', 'off', true);
    insert into public.share_link (company_id, job_id, quote_id) values (co, j, q);
    update public.job set status = 'quote_sent' where id = j;

    -- The leak detection's invoice, sent and not paid yet.
    insert into public.invoice (company_id, job_id, status, subtotal_cents, total_cents, due_date)
    values (co, j, 'draft', (x ->> 'fee_cents')::integer, (x ->> 'fee_cents')::integer,
            today + 14)
    returning id into inv;
    insert into public.invoice_line_item (company_id, invoice_id, description, unit_price_cents,
                                          taxable)
    values (co, inv, 'Leak detection', (x ->> 'fee_cents')::integer, false);
    perform set_config('app.invoice_server', 'on', true);
    update public.invoice set status = 'sent', sent_at = start_at + interval '2 hours' where id = inv;
    perform set_config('app.invoice_server', 'off', true);
    insert into public.share_link (company_id, job_id, invoice_id) values (co, j, inv);
    update public.job set status = 'invoiced', completed_at = start_at + interval '1 hour 50 minutes'
    where id = j;
  end loop;
  perform set_config('request.jwt.claims', '', true);

  raise notice 'review shop %', co;
end
$review$;
`;
}

// ---------------------------------------------------------------------------
// Database access
// ---------------------------------------------------------------------------

function makeQuery({ local, ref }) {
  return async function query(sql, { parameters, readOnly = false } = {}) {
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
      body: JSON.stringify({ query: sql, parameters, read_only: readOnly }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${body.message ?? JSON.stringify(body)}`);
    return body;
  };
}

/** A bcrypt hash made by the database, the password sent as a parameter (not in the statement). */
async function hashPassword(query, local, password) {
  if (local) {
    const [row] = await query(
      `select extensions.crypt(${lit(password)}, extensions.gen_salt('bf', 10)) as hash`,
    );
    return row.hash;
  }
  const [row] = await query("select extensions.crypt($1, extensions.gen_salt('bf', 10)) as hash", {
    parameters: [password],
    readOnly: true,
  });
  return row.hash;
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const flag = (name) => args.includes(name);
  const option = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
  const apply = flag("--apply");
  const local = option("--local");
  const withTech = flag("--with-tech");
  const ref = option("--ref") ?? devConfig.projectRef;
  const isDev = !local && DEV_REFS.has(ref);
  if (apply && isDev && !flag("--allow-dev")) {
    console.error(
      `Refusing: ${ref} is the dev project. The review shop belongs on production; applying it to\n` +
        "dev is the owner's call (add --allow-dev once they've said so).",
    );
    process.exit(2);
  }
  const query = makeQuery({ local, ref });
  const where = local ? `local database ${local}` : `project ${ref}${isDev ? " (dev)" : ""}`;
  const ro = { readOnly: true };

  const [demo] = await query(
    `select c.id, c.name from public.company c
     join public.membership m on m.company_id = c.id and m.role = 'owner'
     join auth.users u on u.id = m.user_id
     where u.email = ${lit(DEMO_OWNER)} order by c.created_at limit 1`,
    ro,
  );
  const logins = await query(
    `select u.email, u.id, u.email_confirmed_at is not null as confirmed,
       (select json_agg(json_build_object('company', c.name, 'role', m.role, 'id', c.id))
        from public.membership m join public.company c on c.id = m.company_id
        where m.user_id = u.id and m.deleted_at is null) as teams
     from auth.users u where lower(u.email) in (${lit(OWNER.email)}, ${lit(TECH.email)})`,
    ro,
  );
  const owner = logins.find((l) => l.email.toLowerCase() === OWNER.email);
  const ownerTeams = owner?.teams ?? [];
  const shop = ownerTeams.find((t) => t.company === SHOP.name && t.role === "owner");
  const otherTeams = ownerTeams.filter((t) => t !== shop);
  if (demo && ownerTeams.some((t) => t.id === demo.id)) {
    console.error(`Refusing: ${OWNER.email} is on the demo company's team.`);
    process.exit(1);
  }
  if (otherTeams.length) {
    console.error(
      `Refusing: ${OWNER.email} is also on other teams (${otherTeams.map((t) => t.company).join(", ")}).`,
    );
    process.exit(1);
  }

  const data = buildReviewShop({ withTech });
  console.log(`${where}: App Review shop (${apply ? "apply" : "dry run"})\n`);
  console.log(
    `Never touched: the demo company${demo ? `, "${demo.name}" (${demo.id})` : " (none here)"}.`,
  );
  console.log(
    `\nLogins (new random passwords, printed once after --apply; two-step sign-in removed):`,
  );
  for (const who of withTech ? [OWNER, TECH] : [OWNER]) {
    const now = logins.find((l) => l.email.toLowerCase() === who.email);
    console.log(
      `  ${who.email.padEnd(32)} ${who === OWNER ? "owner" : "tech "}  ${who.name.padEnd(13)} ${now ? "exists: password reset" : "new"}`,
    );
  }
  if (shop) {
    const [counts] = await query(
      `select
         (select count(*) from public.customer where company_id = ${lit(shop.id)} and deleted_at is null)::int as customers,
         (select count(*) from public.job where company_id = ${lit(shop.id)} and deleted_at is null)::int as jobs,
         (select count(*) from public.service_plan where company_id = ${lit(shop.id)} and deleted_at is null)::int as plans`,
      ro,
    );
    console.log(
      `\nShop "${SHOP.name}" (${shop.id}) exists: remake it. Soft-delete its ${counts.customers} customers, ` +
        `${counts.jobs} jobs and ${counts.plans} plans (sent reports stay), then make the rows below.`,
    );
  } else {
    console.log(
      `\nShop "${SHOP.name}": new, made by create_company as ${OWNER.email} (both packages, with its sample inspection).`,
    );
  }
  console.log(
    `  ${SHOP.street}, ${SHOP.city}, ${SHOP.state} ${SHOP.zip} · ${SHOP.phone} · ${SHOP.timezone}`,
  );
  console.log(
    "  Billing: admin_extend_trial(30) (setup finished), then admin_set_demo: demo plan, no card, never locked",
  );
  console.log(
    "  Sends nothing by itself: reminders off, review requests off, visit reports by hand",
  );
  console.log(
    `  App Review shop (review_shop): texts and emails recorded, not sent (but to sundeckpro.com); no number purchases or calls; made-up texting number ${SHOP.texting}`,
  );
  console.log(
    `\nMake: ${data.customers.length} customers with one pool each (example.com emails, (602) 555-01xx phones, opted out of reminder emails)`,
  );
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  console.log(
    `  ${data.plans.length} weekly plans, 3 stops a day, every day: ${days.join(", ")} at ${VISIT_TIMES.join(", ")}` +
      (withTech ? " (the tech takes each day's last stop)" : " (all the owner's)"),
  );
  for (const d of data.detections) {
    const c = data.customers[d.customer];
    const when = d.day === -1 ? "yesterday" : d.day === 0 ? "today" : "tomorrow";
    console.log(
      `  leak detection ${when} ${d.time}: ${c.name}, ${c.street} · ${d.state === "finished" ? "finished: checklist, pressure test, finding, sent report, sent quote $770.00, sent invoice $" + (d.fee_cents / 100).toFixed(2) : "scheduled, checklist to do"}`,
    );
  }
  console.log("\nSample customers:");
  for (const c of [0, 7, 14, 21, 23].map((i) => data.customers[i])) {
    console.log(
      `  ${c.name.padEnd(18)} ${c.phone}  ${c.email.padEnd(28)} ${c.street}, ${c.zip}  (${c.lat}, ${c.lng})`,
    );
  }

  if (!apply) {
    console.log("\nDry run: nothing changed. Run with --apply to make it.");
    return;
  }

  const ownerPassword = makePassword();
  const techPassword = withTech ? makePassword() : null;
  const ownerHash = await hashPassword(query, local, ownerPassword);
  const techHash = techPassword ? await hashPassword(query, local, techPassword) : null;
  await query(`begin;\n${reviewSql(data, { ownerHash, techHash })}\ncommit;`);

  const [after] = await query(`
    select c.id, c.name, c.review_shop, s.plan, s.status, s.card_required, s.onboarded_at is not null as onboarded,
      app.company_locked(c.id) as locked,
      (select count(*) from public.customer where company_id = c.id and deleted_at is null)::int as customers,
      (select count(*) from public.service_plan where company_id = c.id and deleted_at is null)::int as plans,
      (select count(*) from public.job where company_id = c.id and deleted_at is null
         and type = 'maintenance')::int as visits,
      (select count(*) from public.job where company_id = c.id and deleted_at is null
         and type = 'maintenance' and (scheduled_start at time zone c.timezone)::date
             = (now() at time zone c.timezone)::date)::int as visits_today,
      (select count(*) from public.job where company_id = c.id and deleted_at is null
         and type = 'detection')::int as detections,
      (select count(*) from public.report r join public.job j on j.id = r.job_id
       where r.company_id = c.id and r.deleted_at is null and j.deleted_at is null
         and r.status = 'sent')::int as sent_reports,
      (select count(*) from public.quote where company_id = c.id and deleted_at is null
         and status = 'sent')::int as sent_quotes,
      (select count(*) from public.invoice where company_id = c.id and deleted_at is null
         and status = 'sent')::int as sent_invoices,
      (select count(*) from public.phone_line where company_id = c.id
         and status <> 'released')::int as phone_lines
    from public.company c join public.subscription s on s.company_id = c.id
    join public.membership m on m.company_id = c.id and m.role = 'owner'
    join auth.users u on u.id = m.user_id
    where u.email = ${lit(OWNER.email)} and c.name = ${lit(SHOP.name)} and c.deleted_at is null`);
  const held = after.plan !== "demo" && !after.onboarded;
  console.log(`\nMade "${after.name}" (${after.id}):`);
  console.log(
    `  plan ${after.plan}, ${after.status}, card required ${after.card_required}, setup finished ${after.onboarded}, locked ${after.locked}, held on Finish Setting Up ${held}`,
  );
  console.log(
    `  ${after.customers} customers, ${after.plans} plans, ${after.visits} plan visits (${after.visits_today} today), ${after.detections} leak detections`,
  );
  console.log(
    `  ${after.sent_reports} sent reports, ${after.sent_quotes} sent quotes, ${after.sent_invoices} sent invoices, ${after.phone_lines} texting numbers`,
  );
  console.log(`  App Review shop (nothing reaches a real person): ${after.review_shop}`);
  if (after.locked || held || after.plan !== "demo") {
    console.error(
      "\nThe shop would hit the card gate or the lock. Look into it before submitting.",
    );
    process.exitCode = 1;
  }
  if (!after.review_shop) {
    console.error("\nThe App Review switch is off: the shop could text and email real people.");
    process.exitCode = 1;
  }
  console.log("\nSign-ins for App Store Connect › App Review Information (shown once; not saved):");
  console.log(`  ${OWNER.email}  ${ownerPassword}`);
  if (techPassword) console.log(`  ${TECH.email}  ${techPassword}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!existsSync(join(root, "supabase", "migrations"))) throw new Error("Run from the repository");
  await main();
}
