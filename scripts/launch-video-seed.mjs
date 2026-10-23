// Readies the two video shops on the hosted dev project for the launch film
// (docs/plans/launch-video.md): Canyon State Leak Detection and Blue Mesa Pool Co. It touches
// only those two companies and their own sign-ins: SQL through the Management API (CLAUDE.md,
// "Hosted dev project"), and photo uploads signed in as Blue Mesa's owner. The shared demo
// company is never seeded.
//
//   NODE_USE_ENV_PROXY=1 node scripts/launch-video-seed.mjs            # dry run: shows the changes
//   NODE_USE_ENV_PROXY=1 node scripts/launch-video-seed.mjs --apply    # makes them (--remake: her story again)
//
// What it does:
//   - Hides Getting Started for the two owners (Marcus Hale, Erin Cole), as the owner's own Hide
//     button does, so the dock doesn't sit over the website captures.
//   - Canyon State: the film's one leak story, the same as the owner's iPhone recordings and the
//     app's screens. The shop reads "Canyon State Leak Detections"; customer Rebecca Quinn at
//     7745 N 42nd Ave, Phoenix (seeded map location, no geocoding) has a finished leak
//     detection, job #5163 on Friday, October 23 (Phoenix time): the checklist with two leaks, a
//     pressure test on the return line that dropped from 20 to 12 PSI in 15 minutes (a break
//     under the deck) and dye drawn into the conduit behind the pool light (its photo,
//     apps/video/assets/photos/leak-dye-light-niche.jpg), both findings pinned on the pool, her
//     signature taken on site, the sent report, a sent quote (Repair return line break $1,150 +
//     Reseal light niche conduit $385 = $1,535, $767.50 deposit) and the sent $375 leak
//     detection invoice #2087. Prints the customer links.
//     With --accept as well: she accepts the quote and pays the deposit by card (the capture of
//     the open quote comes first; see apps/video/src/capture-web.ts).
//   - Canyon State's next week (Oct 26 to 30) for the Schedule captures: each job has one tech,
//     so Dana Ruiz and Jake Turner have their own days, and a new leak detection (Laura
//     Bennett) waits in Needs a Time for the office to place. `--snapshot-week` saves that week
//     and every job in Needs a Time to apps/video/build/week-before.json before the captures
//     move jobs and optimize it (Optimize Week also places Needs a Time's jobs), and
//     `--restore-week --apply` puts them back from there afterwards.
//   - Blue Mesa: completes one weekly visit (Caleb Pacheco, job #5230): its checklist inspected,
//     the water readings, before and after photos (apps/video/assets/photos/pool-before.jpg and
//     pool-after.jpg), and sends its visit report the way the app does (send_visit_report), so
//     the film can show the homeowner's report. Prints the report's link. Sending makes the link
//     only; no email or text goes out.
//
// Run again, it changes nothing that's already done. Never call the website's locate API from
// here: it geocodes through Mapbox, which costs money. Seed latitude and longitude directly when
// a scene needs a place on the map.
import { createHash, randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const dev = JSON.parse(readFileSync(join(root, "config", "supabase-dev.json"), "utf8"));
const ref = dev.projectRef;
const apply = process.argv.includes("--apply");
const accept = process.argv.includes("--accept");
const snapshotWeek = process.argv.includes("--snapshot-week");
const restoreWeek = process.argv.includes("--restore-week");

const SHOPS = {
  canyon: "00000000-0000-4000-9000-00000000c501",
  blueMesa: "00000000-0000-4000-9000-00000000c502",
};
const OWNERS = ["marcus@canyonstate.video.test", "erin@bluemesa.video.test"];
const VIDEO_PASSWORD = "sundeck-video";
/** Rebecca Quinn's leak job: the number in the owner's recording 05 and the app's screens. */
const STORY_JOB = 5163;
const STORY_DAY = "2026-10-23";
/** The day before: the office gave her job to Dana that afternoon. */
const STORY_EVE = "2026-10-22";
/** Her quote: the two repairs, $1,535, half as the deposit. */
const STORY_TOTAL = 153500;
/** Blue Mesa's visit for the film: Caleb Pacheco, a weekly plan. */
const VISIT_NUMBER = 5230;

async function query(sql) {
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

const q = (s) => `'${String(s).replaceAll("'", "''")}'`;
const list = (xs) => xs.map(q).join(", ");

/** A JPEG's size from its header. */
function jpegSize(b) {
  let i = 2;
  while (i < b.length) {
    const marker = b.readUInt16BE(i);
    const len = b.readUInt16BE(i + 2);
    if (marker >= 0xffc0 && marker <= 0xffc3) {
      return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) };
    }
    i += 2 + len;
  }
  throw new Error("Not a JPEG");
}

// Getting Started -------------------------------------------------------------------------

// Only the owners of the two video shops, and only when they own one of them.
const owners = await query(`
  select u.id, u.email, coalesce(u.raw_user_meta_data->>'getting_started_hidden', 'false') as hidden
  from auth.users u
  join public.membership m on m.user_id = u.id and m.role = 'owner'
  where u.email in (${list(OWNERS)}) and m.company_id in (${list(Object.values(SHOPS))})
`);
if (owners.length !== OWNERS.length) {
  throw new Error(`Expected ${OWNERS.length} video shop owners, found ${owners.length}. Stopping.`);
}
const hide = owners.filter((o) => o.hidden !== "true");
for (const o of owners) {
  console.log(`${o.email}: Getting Started ${o.hidden === "true" ? "already hidden" : "to hide"}`);
}

// Blue Mesa's visit report ----------------------------------------------------------------

const [visit] = await query(`
  select j.id, j.number, j.status, j.property_id, j.assigned_user_id, j.scheduled_start,
         c.name as customer,
         (select count(*) from public.chemical_reading r where r.job_id = j.id and r.deleted_at is null)::int as readings,
         (select count(*) from public.media m where m.job_id = j.id and m.deleted_at is null)::int as photos,
         (select count(*) from public.checklist_item_result r where r.job_id = j.id and r.status = 'pending')::int as pending,
         (select s.token from public.report r join public.share_link s on s.report_id = r.id
          where r.job_id = j.id and r.template_key = 'maintenance' and r.status = 'sent'
            and r.deleted_at is null and s.revoked_at is null and s.deleted_at is null
          order by r.version desc limit 1) as token
  from public.job j join public.customer c on c.id = j.bill_to_customer_id
  where j.company_id = ${q(SHOPS.blueMesa)} and j.number = ${VISIT_NUMBER} and j.type = 'maintenance'
    and j.deleted_at is null
`);
if (!visit) throw new Error(`Blue Mesa has no maintenance visit #${VISIT_NUMBER}. Stopping.`);
const steps = [];
if (visit.status !== "done") steps.push("complete the visit");
if (visit.pending > 0) steps.push(`mark ${visit.pending} checklist items inspected`);
if (visit.readings === 0) steps.push("add the water readings");
if (visit.photos === 0) steps.push("upload before and after photos");
if (!visit.token || steps.length) steps.push("send the visit report");
console.log(
  `Blue Mesa visit #${visit.number} (${visit.customer}): ${steps.length ? steps.join(", ") : "ready"}`,
);
if (visit.token && !steps.length) console.log(`  Visit report: ${dev.webUrl}/r/${visit.token}`);

// Canyon State: Rebecca Quinn's leak detection ---------------------------------------------

const SHOP_NAME = "Canyon State Leak Detections";
const [canyon] = await query(`
  select c.name,
    (select row_to_json(x) from (
       select j.id, j.number,
         (select s.token from public.share_link s join public.report r on r.id = s.report_id
          where r.job_id = j.id and r.status = 'sent' and s.revoked_at is null limit 1) as report,
         (select s.token from public.share_link s join public.quote q on q.id = s.quote_id
          where q.job_id = j.id and s.revoked_at is null limit 1) as quote,
         (select q.status from public.quote q where q.job_id = j.id and q.deleted_at is null limit 1) as quote_status,
         (select q.total_cents from public.quote q where q.job_id = j.id and q.deleted_at is null limit 1) as quote_total,
         (j.scheduled_start at time zone 'America/Phoenix')::date::text as day,
         (select s.token from public.share_link s join public.invoice i on i.id = s.invoice_id
          where i.job_id = j.id and s.revoked_at is null limit 1) as invoice
       from public.job j join public.customer cu on cu.id = j.bill_to_customer_id
       where j.company_id = c.id and cu.name = 'Rebecca Quinn' and j.type = 'detection'
         and j.deleted_at is null
       limit 1) x) as story
  from public.company c where c.id = ${q(SHOPS.canyon)}
`);
let story = canyon.story;
// A run cut off before her report was made, or her story under another job number (her sent
// report keeps the number it was sent with): make her story again (an apply only).
const remake =
  story &&
  (process.argv.includes("--remake") ||
    !story.report ||
    story.number !== STORY_JOB ||
    story.quote_total !== STORY_TOTAL ||
    story.day !== STORY_DAY);
const canyonSteps = [];
if (canyon.name !== SHOP_NAME) canyonSteps.push(`rename the shop to "${SHOP_NAME}"`);
if (remake) canyonSteps.push(`remove her earlier story (job #${story.number}, ${story.day})`);
if (!story || remake) {
  canyonSteps.push(
    `add Rebecca Quinn's leak detection (job #${STORY_JOB}), report, quote and invoice`,
  );
}
if (remake && apply) {
  await resetStory(story.id);
  story = null;
}
if (story && !remake) canyonSteps.push("set her story's times (Friday morning)");
if (accept && story?.quote_status !== "accepted")
  canyonSteps.push("accept her quote with the deposit");
console.log(`Canyon State: ${canyonSteps.length ? canyonSteps.join(", ") : "ready"}`);
if (story) printLinks(story);

// Canyon State's next week: one tech per job, and a new leak detection to place --------------

const WEEK = { from: "2026-10-26T00:00:00-07:00", to: "2026-11-02T00:00:00-07:00" };
const weekFile = join(root, "apps", "video", "build", "week-before.json");
const [week] = await query(`
  select
    (select count(*) from public.job where company_id = ${q(SHOPS.canyon)} and deleted_at is null
       and scheduled_start >= ${q(WEEK.from)} and scheduled_start < ${q(WEEK.to)}
       and second_tech_id is not null)::int as shared,
    (select j.id from public.job j join public.customer c on c.id = j.bill_to_customer_id
       where j.company_id = ${q(SHOPS.canyon)} and c.name = 'Laura Bennett' and j.deleted_at is null
       limit 1) as laura
`);
if (snapshotWeek || restoreWeek) {
  await weekSnapshot();
  process.exit(0);
}
const weekSteps = [];
if (week.shared) weekSteps.push(`give ${week.shared} of next week's jobs one tech each`);
if (!week.laura) weekSteps.push("add Laura Bennett's leak detection to Needs a Time");
console.log(`Canyon State next week: ${weekSteps.length ? weekSteps.join(", ") : "ready"}`);

const total = hide.length + steps.length + canyonSteps.length + weekSteps.length;
if (!total) {
  console.log("Nothing to change.");
} else if (!apply) {
  console.log(`Dry run: ${total} change(s). Run with --apply to make them.`);
} else {
  if (hide.length) {
    await query(`
      update auth.users
      set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || '{"getting_started_hidden": true}'::jsonb
      where id in (${list(hide.map((o) => o.id))})
    `);
  }
  if (steps.length) await completeVisit(visit);
  if (canyon.name !== SHOP_NAME) {
    await query(`update public.company set name = ${q(SHOP_NAME)} where id = ${q(SHOPS.canyon)}`);
  }
  let made = story;
  if (!made) made = await rebeccaStory();
  await catchUpCounters(SHOPS.canyon);
  if (accept && made.quote_status !== "accepted") await acceptQuote(made.id);
  if (week.shared) {
    await query(`
      update public.job set second_tech_id = null
      where company_id = ${q(SHOPS.canyon)} and deleted_at is null and second_tech_id is not null
        and scheduled_start >= ${q(WEEK.from)} and scheduled_start < ${q(WEEK.to)}`);
  }
  if (!week.laura) await addLaura();
  await setStoryTimes(made.id);
  if (!story) printLinks(made);
  console.log(`Applied ${total} change(s).`);
}

async function completeVisit(v) {
  const company = SHOPS.blueMesa;
  const start = new Date(v.scheduled_start);
  const done = new Date(start.getTime() + 38 * 60_000);
  await query(`
    update public.job set status = 'done', started_at = coalesce(started_at, ${q(start.toISOString())}),
      completed_at = coalesce(completed_at, ${q(done.toISOString())})
    where id = ${q(v.id)} and company_id = ${q(company)};
    update public.checklist_item_result set status = 'inspected', outcome = 'ok'
    where job_id = ${q(v.id)} and company_id = ${q(company)} and status = 'pending';
  `);
  if (v.readings === 0) {
    await query(`
      insert into public.chemical_reading (company_id, property_id, job_id, recorded_at, recorded_by,
        gallons, fc, ph, ta, ch, cya, chlorine_product, acid_product, notes)
      values (${q(company)}, ${q(v.property_id)}, ${q(v.id)},
        ${q(new Date(start.getTime() + 12 * 60_000).toISOString())}, ${q(v.assigned_user_id)},
        18000, 3.0, 7.5, 90, 260, 45, 'liquid12', 'muriatic31', 'Added 1 gal liquid chlorine.')
    `);
  }
  if (v.photos === 0) {
    const session = await signIn("erin@bluemesa.video.test");
    const shots = [
      { file: "pool-before.jpg", caption: "Before", at: 4 },
      { file: "pool-after.jpg", caption: "After", at: 34 },
    ];
    for (const s of shots) {
      const bytes = readFileSync(join(root, "apps", "video", "assets", "photos", s.file));
      const id = randomUUID();
      const path = `${company}/${v.id}/${id}.jpg`;
      const up = await fetch(`${dev.url}/storage/v1/object/media/${path}`, {
        method: "POST",
        headers: {
          apikey: dev.publishableKey,
          authorization: `Bearer ${session}`,
          "content-type": "image/jpeg",
        },
        body: bytes,
      });
      if (!up.ok)
        throw new Error(`Upload of ${s.file} failed: HTTP ${up.status} ${await up.text()}`);
      const { width, height } = jpegSize(bytes);
      await query(`
        insert into public.media (id, company_id, job_id, kind, storage_path, upload_state, mime_type,
          size_bytes, sha256, width, height, captured_at, caption)
        values (${q(id)}, ${q(company)}, ${q(v.id)}, 'photo', ${q(path)}, 'uploaded', 'image/jpeg',
          ${bytes.length}, ${q(createHash("sha256").update(bytes).digest("hex"))}, ${width}, ${height},
          ${q(new Date(start.getTime() + s.at * 60_000).toISOString())}, ${q(s.caption)})
      `);
    }
  }
  // Sent the way the server's own catch-up sends it (the service role), so it's frozen with
  // everything above.
  // (One query string runs as one transaction, so the role holds for the call only.)
  const [sent] = await query(`
    set local role service_role;
    select public.send_visit_report(${q(v.id)}) ->> 'token' as token;
  `);
  const token = sent?.token;
  if (!token) throw new Error(`Sending the visit report returned ${JSON.stringify(sent)}`);
  console.log(`  Visit report: ${dev.webUrl}/r/${token}`);
}

async function signIn(email) {
  const res = await fetch(`${dev.url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: dev.publishableKey, "content-type": "application/json" },
    body: JSON.stringify({ email, password: VIDEO_PASSWORD }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Sign-in as ${email} failed: ${body.msg ?? body.error_description}`);
  return body.access_token;
}

function printLinks(st) {
  console.log(`  Report:  ${dev.webUrl}/r/${st.report}`);
  console.log(`  Quote:   ${dev.webUrl}/q/${st.quote} (${st.quote_status})`);
  console.log(`  Invoice: ${dev.webUrl}/i/${st.invoice}`);
}

async function upload(session, path, bytes, type) {
  const res = await fetch(`${dev.url}/storage/v1/object/media/${path}`, {
    method: "POST",
    headers: {
      apikey: dev.publishableKey,
      authorization: `Bearer ${session}`,
      "content-type": type,
    },
    body: bytes,
  });
  if (!res.ok) throw new Error(`Upload of ${path} failed: HTTP ${res.status} ${await res.text()}`);
}

async function rebeccaStory() {
  const c = SHOPS.canyon;
  const ids = {
    customer: randomUUID(),
    property: randomUUID(),
    job: randomUUID(),
    finding: randomUUID(),
    finding2: randomUUID(),
    media: randomUUID(),
    signature: randomUUID(),
    report: randomUUID(),
    quote: randomUUID(),
    invoice: randomUUID(),
  };
  // Friday, the same day as the app's screens (Phoenix time): worked 8:10 to 9:40, signed on
  // site at 9:42, the report and quote sent at 9:45 and the invoice at 9:46.
  const day = STORY_DAY;
  const at = (hhmm) => `${day}T${hhmm}:00-07:00`;
  const [nums] = await query(`
    select (select max(number) from public.quote where company_id = ${q(c)}) + 1 as quote,
      (select max(number) from public.invoice where company_id = ${q(c)}) + 1 as invoice,
      (select user_id from public.membership m join public.profile p on p.id = m.user_id
       where m.company_id = ${q(c)} and p.full_name = 'Dana Ruiz') as dana
  `);
  // The template: the shop's own finished leak job (#2588): its checklist, as checked.
  await query(`
    insert into public.customer (id, company_id, name, email, phone)
    values (${q(ids.customer)}, ${q(c)}, 'Rebecca Quinn', 'rebecca.quinn@example.com', '(480) 555-0171');
    insert into public.property (id, company_id, customer_id, address_line1, city, state, postal_code,
      latitude, longitude, location_source, pool_type, has_pool, has_spa, diagram_shape, diagram_layout,
      approx_gallons, access_notes)
    values (${q(ids.property)}, ${q(c)}, ${q(ids.customer)}, '7745 N 42nd Ave', 'Phoenix', 'AZ', '85051',
      33.5463, -112.1497, 'manual', 'gunite_plaster', true, true, 'roman',
      -- Roman, the spa at the upper left, as in the owner's recording 05 and the app's screens.
      '{"spa":{"r":17.8,"x":0.1364,"y":0.2144,"size":"large","shape":"round"},"centered":true}'::jsonb,
      20000, 'Code #1955');
    insert into public.job (id, company_id, number, type, property_id, bill_to_customer_id, status,
      assigned_user_id, scheduled_start, scheduled_end, started_at, completed_at, fee_cents)
    values (${q(ids.job)}, ${q(c)}, ${STORY_JOB}, 'detection', ${q(ids.property)}, ${q(ids.customer)},
      'in_progress', ${q(nums.dana)}, ${q(at("08:00"))}, ${q(at("10:00"))}, ${q(at("08:10"))},
      ${q(at("09:40"))}, 37500);
    with src as (
      select jc.*, ct.key, r.status as r_status, r.method, r.inspected_at
      from public.job_component jc
      join public.component_type ct on ct.id = jc.component_type_id
      left join public.checklist_item_result r on r.job_component_id = jc.id and r.deleted_at is null
      where jc.job_id = (select id from public.job where company_id = ${q(c)} and number = 2588)
        and jc.deleted_at is null
    ), made as (
      insert into public.job_component (id, company_id, job_id, component_type_id, instance_number, label,
        sort_order)
      select gen_random_uuid(), ${q(c)}, ${q(ids.job)}, component_type_id, instance_number, label, sort_order
      from src
      returning id, component_type_id, instance_number
    )
    insert into public.checklist_item_result (company_id, job_id, job_component_id, status, method,
      outcome, location_text, inspected_at, inspected_by)
    select ${q(c)}, ${q(ids.job)}, made.id, 'inspected',
      case src.key when 'return' then 'Pressure test' when 'light' then 'Dye test' else src.method end,
      case when src.key in ('return', 'light') then 'leaking' else 'ok' end,
      case src.key when 'return' then 'Under the deck, 6 ft from the pool wall'
        when 'light' then 'Behind the pool light' end,
      ${q(at("09:25"))}, ${q(nums.dana)}
    from made join src on src.component_type_id = made.component_type_id
      and src.instance_number = made.instance_number;
  `);
  const comp = async (key) =>
    (
      await query(`
        select jc.id from public.job_component jc join public.component_type ct on ct.id = jc.component_type_id
        where jc.job_id = ${q(ids.job)} and ct.key = ${q(key)} limit 1`)
    )[0]?.id ?? null;
  const ret = await comp("return");
  const skimmer = await comp("skimmer");
  const cleaner = await comp("cleaner_line");
  const light = await comp("light");
  const types = await query(`
    select id, key from public.test_type where company_id = ${q(c)} and key in ('pressure', 'dye')`);
  const type = (k) => types.find((t) => t.key === k).id;
  const test = (component, key, data, computed, outcome, time) =>
    `(${q(c)}, ${q(ids.job)}, ${component ? q(component) : "null"}, ${q(type(key))}, 1,
      ${q(JSON.stringify(data))}::jsonb, ${q(JSON.stringify(computed))}::jsonb, ${q(outcome)}, ${q(at(time))})`;
  await query(`
    insert into public.test_result (company_id, job_id, job_component_id, test_type_id, schema_version,
      data, computed, outcome, performed_at)
    values
      ${test(skimmer, "pressure", { line_name: "Skimmer", start_psi: 20, end_psi: 20, duration_min: 15 }, { drop_psi: 0, drop_psi_per_min: 0 }, "pass", "08:25")},
      ${test(ret, "pressure", { line_name: "Return line", start_psi: 20, end_psi: 12, duration_min: 15 }, { drop_psi: 8, drop_psi_per_min: 0.533 }, "fail", "08:45")},
      ${test(cleaner, "pressure", { line_name: "Cleaner line", start_psi: 20, end_psi: 20, duration_min: 15 }, { drop_psi: 0, drop_psi_per_min: 0 }, "pass", "09:05")},
      ${test(light, "dye", { location: "Light niche", observation: "Dye drawn into the conduit (leak)" }, {}, "fail", "09:20")};
    insert into public.finding (id, company_id, job_id, job_component_id, title, location_text,
      severity_key, pin_x, pin_y, status)
    values (${q(ids.finding)}, ${q(c)}, ${q(ids.job)}, ${q(ret)}, 'Return line break',
      'Under the deck, 6 ft from the pool wall', 'major', 0.55, 0.06, 'quoted'),
      (${q(ids.finding2)}, ${q(c)}, ${q(ids.job)}, ${q(light)}, 'Light niche conduit leak',
      'Behind the pool light', 'moderate', 0.3, 0.94, 'quoted');
  `);
  // The photo of the dye at the light, and her signature, uploaded as the shop's owner would.
  const session = await signIn("marcus@canyonstate.video.test");
  const photo = readFileSync(
    join(root, "apps", "video", "assets", "photos", "leak-dye-light-niche.jpg"),
  );
  const photoPath = `${c}/${ids.job}/${ids.media}.jpg`;
  await upload(session, photoPath, photo, "image/jpeg");
  const size = jpegSize(photo);
  // Her signature: the same strokes the app saved on the iPhone (the film shows both).
  const svg = readFileSync(join(root, "apps", "video", "assets", "owner", "rebecca-signature.svg"));
  const sigPath = `${c}/${ids.job}/signature-${ids.signature}.svg`;
  await upload(session, sigPath, svg, "image/svg+xml");
  await query(`
    insert into public.media (id, company_id, job_id, finding_id, job_component_id, kind, storage_path,
      upload_state, mime_type, size_bytes, sha256, width, height, captured_at, caption, latitude, longitude)
    values (${q(ids.media)}, ${q(c)}, ${q(ids.job)}, ${q(ids.finding2)}, ${q(light)}, 'photo',
      ${q(photoPath)}, 'uploaded', 'image/jpeg', ${photo.length},
      ${q(createHash("sha256").update(photo).digest("hex"))}, ${size.width}, ${size.height},
      ${q(at("09:20"))}, 'Dye drawn into the conduit behind the light', 33.5463, -112.1497);
    insert into public.signature (id, company_id, job_id, purpose, signer_name, signer_role, image_path,
      signed_at, device_id)
    values (${q(ids.signature)}, ${q(c)}, ${q(ids.job)}, 'inspection_ack', 'Rebecca Quinn', 'Homeowner',
      ${q(sigPath)}, ${q(at("09:42"))}, 'seed');
  `);
  const sections = [
    {
      key: "summary",
      title: "Summary",
      text: "We found two leaks: a break in the return line under the deck, and water getting into the conduit behind the pool light. Everything else we checked is holding.",
    },
    {
      key: "findings",
      title: "What we found",
      text: "The return line dropped from 20 to 12 PSI in 15 minutes while the skimmer and cleaner lines held. Dye drew into the conduit behind the pool light.",
    },
    {
      key: "next_steps",
      title: "What happens next",
      text: "We sent a quote to repair the return line and reseal the light niche conduit. Once the deposit is in, we'll book the repair.",
    },
  ];
  const [links] = await query(`
    insert into public.report (id, company_id, job_id, template_key, version, status, final_sections,
      data_snapshot, sent_at)
    values (${q(ids.report)}, ${q(c)}, ${q(ids.job)}, 'homeowner', 1, 'sent',
      ${q(JSON.stringify(sections))}::jsonb, app.report_snapshot(${q(ids.job)}), ${q(at("09:45"))});
    update public.signature set report_id = ${q(ids.report)} where id = ${q(ids.signature)};
    insert into public.quote (id, company_id, job_id, number, status, subtotal_cents, discount_cents,
      tax_cents, total_cents, deposit_rule, deposit_cents, valid_until)
    values (${q(ids.quote)}, ${q(c)}, ${q(ids.job)}, ${nums.quote}, 'draft', ${STORY_TOTAL}, 0, 0, ${STORY_TOTAL},
      '{"type":"percent","value_bps":5000,"minimum_cents":0}'::jsonb, ${STORY_TOTAL / 2}, '2026-11-22');
    insert into public.quote_line_item (company_id, quote_id, finding_id, description, quantity,
      unit_price_cents, taxable, sort_order)
    values (${q(c)}, ${q(ids.quote)}, ${q(ids.finding)}, 'Repair return line break', 1, 115000, false, 1),
           (${q(c)}, ${q(ids.quote)}, ${q(ids.finding2)}, 'Reseal light niche conduit', 1, 38500, false, 2);
    -- Lines first, then sent (a sent quote's lines are frozen).
    update public.quote set status = 'sent', sent_at = ${q(at("09:45"))} where id = ${q(ids.quote)};
    insert into public.invoice (id, company_id, job_id, customer_id, number, status, subtotal_cents,
      discount_cents, tax_cents, credit_cents, total_cents, amount_paid_cents, due_date)
    values (${q(ids.invoice)}, ${q(c)}, ${q(ids.job)}, ${q(ids.customer)}, ${nums.invoice}, 'draft',
      37500, 0, 0, 0, 37500, 0, '2026-11-07');
    insert into public.invoice_line_item (company_id, invoice_id, kind, description, quantity,
      unit_price_cents, taxable, sort_order)
    values (${q(c)}, ${q(ids.invoice)}, 'item', 'Leak detection', 1, 37500, false, 1);
    -- Sending is the server's step (as its own send does).
    select set_config('app.invoice_server', 'on', true);
    update public.invoice set status = 'sent', sent_at = ${q(at("09:46"))} where id = ${q(ids.invoice)};
    insert into public.share_link (company_id, job_id, report_id)
    values (${q(c)}, ${q(ids.job)}, ${q(ids.report)});
    insert into public.share_link (company_id, job_id, quote_id)
    values (${q(c)}, ${q(ids.job)}, ${q(ids.quote)});
    insert into public.share_link (company_id, job_id, invoice_id)
    values (${q(c)}, ${q(ids.job)}, ${q(ids.invoice)});
    -- The job moves on the way it does in the app: report sent, quote sent, invoiced.
    update public.job set status = 'report_sent' where id = ${q(ids.job)};
    update public.job set status = 'quote_sent' where id = ${q(ids.job)};
    update public.job set status = 'invoiced' where id = ${q(ids.job)};
    select
      (select token from public.share_link where report_id = ${q(ids.report)}) as report,
      (select token from public.share_link where quote_id = ${q(ids.quote)}) as quote,
      (select token from public.share_link where invoice_id = ${q(ids.invoice)}) as invoice;
  `);
  return { id: ids.job, ...links, quote_status: "sent" };
}

/** Laura Bennett's leak detection, new and not yet given a day (Needs a Time). */
async function addLaura() {
  const c = q(SHOPS.canyon);
  const ids = { customer: randomUUID(), property: randomUUID(), job: randomUUID() };
  await query(`
    insert into public.customer (id, company_id, name, email, phone)
    values (${q(ids.customer)}, ${c}, 'Laura Bennett', 'laura.bennett@example.com', '(602) 555-0148');
    insert into public.property (id, company_id, customer_id, address_line1, city, state, postal_code,
      latitude, longitude, location_source, pool_type, has_pool, has_spa, diagram_shape)
    values (${q(ids.property)}, ${c}, ${q(ids.customer)}, '6214 N 31st Dr', 'Phoenix', 'AZ', '85017',
      33.5293, -112.1255, 'manual', 'gunite_plaster', true, false, 'rectangle');
    insert into public.job (id, company_id, type, property_id, bill_to_customer_id, status, fee_cents)
    values (${q(ids.job)}, ${c}, 'detection', ${q(ids.property)}, ${q(ids.customer)}, 'unscheduled', 37500);
  `);
}

/**
 * Next week's jobs and Needs a Time's as they stand, saved before the Schedule captures move and
 * optimize them (--snapshot-week), and put back afterwards (--restore-week --apply), with the
 * Activity rows those moves made removed.
 */
async function weekSnapshot() {
  const cols = `id, status, scheduled_start, scheduled_end, assigned_user_id, second_tech_id,
    route_order, arrive_at, arrival_fixed, lock_day, lock_time, plan_moved`;
  if (snapshotWeek) {
    const rows = await query(`
      select ${cols}, now() as saved_at from public.job
      where company_id = ${q(SHOPS.canyon)} and deleted_at is null
        and (scheduled_start >= ${q(WEEK.from)} and scheduled_start < ${q(WEEK.to)}
             or status = 'unscheduled')`);
    writeFileSync(weekFile, JSON.stringify(rows, null, 2) + "\n");
    console.log(`Saved ${rows.length} jobs of next week to ${weekFile}`);
    return;
  }
  const rows = JSON.parse(readFileSync(weekFile, "utf8"));
  if (!apply) {
    console.log(`Dry run: would put ${rows.length} jobs back as saved. Run with --apply.`);
    return;
  }
  const saved = rows[0].saved_at;
  await query(`
    delete from public.activity
    where company_id = ${q(SHOPS.canyon)} and kind in ('job_moved', 'job_assigned')
      and created_at > ${q(saved)} and job_id in (select (r ->> 'id')::uuid
        from jsonb_array_elements(${q(JSON.stringify(rows))}::jsonb) r);
    update public.job j set status = r.status, scheduled_start = r.scheduled_start,
      scheduled_end = r.scheduled_end, assigned_user_id = r.assigned_user_id,
      second_tech_id = r.second_tech_id, route_order = r.route_order, arrive_at = r.arrive_at,
      arrival_fixed = r.arrival_fixed, lock_day = r.lock_day, lock_time = r.lock_time,
      plan_moved = r.plan_moved
    from jsonb_populate_recordset(null::public.job, ${q(JSON.stringify(rows))}::jsonb) r
    where j.id = r.id and j.company_id = ${q(SHOPS.canyon)};
    delete from public.activity
    where company_id = ${q(SHOPS.canyon)} and kind in ('job_moved', 'job_assigned')
      and created_at > ${q(saved)} and job_id in (select (r ->> 'id')::uuid
        from jsonb_array_elements(${q(JSON.stringify(rows))}::jsonb) r);
  `);
  console.log(`Put ${rows.length} jobs of next week back.`);
}

/**
 * The story's job, quote and invoice take the next numbers by hand, so the shop's counters move
 * past them too: the next job anyone makes gets a fresh number.
 */
async function catchUpCounters(company) {
  await query(`
    update app.company_counter c set last_value = greatest(c.last_value, coalesce(m.n, 0))
    from (
      select 'job' as kind, max(number) as n from public.job where company_id = ${q(company)}
      union all select 'quote', max(number) from public.quote where company_id = ${q(company)}
      union all select 'invoice', max(number) from public.invoice where company_id = ${q(company)}
    ) m
    where c.company_id = ${q(company)} and c.kind = m.kind;
  `);
}

/** She accepts the quote and pays the $300 deposit by card. */
async function acceptQuote(jobId) {
  // Through the quote page's own function (typed name and the terms box), then the deposit as
  // the Stripe webhook records it.
  await query(`
    set local role service_role;
    select public.accept_quote_by_link(
      (select s.token from public.share_link s join public.quote q on q.id = s.quote_id
        where q.job_id = ${q(jobId)} and q.company_id = ${q(SHOPS.canyon)}),
      'Rebecca Quinn', true, null, 'Sundeck launch film seed');
    reset role;
    -- Her acceptance at 9:57 that morning, written as the server writes a sent quote.
    select set_config('app.quote_server', 'on', true);
    update public.quote set accepted_at = ${q(STORY_DAY + "T10:05:00-07:00")}
    where job_id = ${q(jobId)} and company_id = ${q(SHOPS.canyon)} and status = 'accepted';
    select set_config('app.quote_server', 'off', true);
    insert into public.payment (company_id, quote_id, amount_cents, method, status, paid_at)
    select company_id, id, deposit_cents, 'card', 'succeeded', ${q(STORY_DAY + "T10:06:00-07:00")}
    from public.quote
    where job_id = ${q(jobId)} and company_id = ${q(SHOPS.canyon)} and status = 'accepted'
      and not exists (select 1 from public.payment p where p.quote_id = quote.id);
  `);
}

/**
 * Her story's events at the times they happened that Thursday morning (Phoenix): the triggers
 * stamp each Activity row with the time the seed wrote it. Also records her first open of the report,
 * as the report page does, so the captures that open it later add nothing.
 */
async function setStoryTimes(jobId) {
  const c = q(SHOPS.canyon);
  const j = q(jobId);
  const at = (hhmm) => q(`${STORY_DAY}T${hhmm}:00-07:00`);
  await query(`
    set local role service_role;
    select public.record_report_opened(s.token)
    from public.share_link s join public.report r on r.id = s.report_id
    where r.job_id = ${j} and r.status = 'sent' and s.revoked_at is null;
    reset role;
    -- An Activity row keeps the time it was written (app.touch_row), so each of hers is
    -- written again with the time it happened, as record_report_opened writes its own.
    create temp table story_times (kind text, at timestamptz) on commit drop;
    insert into story_times values
      ('job_assigned', ${q(`${STORY_EVE}T16:12:00-07:00`)}::timestamptz),
      ('report_signed', ${at("09:45")}), ('report_sent', ${at("09:45")}),
      ('report_opened', ${at("09:50")}), ('quote_accepted', ${at("10:05")}),
      ('payment_received', ${at("10:06")});
    create temp table story_rows on commit drop as
      select a.*, t.at from public.activity a join story_times t on t.kind = a.kind
      where a.company_id = ${c} and a.created_at <> t.at
        and (a.job_id = ${j} or a.job_id in (select id from public.job where parent_job_id = ${j}));
    delete from public.activity where id in (select id from story_rows);
    insert into public.activity
    select (jsonb_populate_record(null::public.activity,
      to_jsonb(r) - 'at' || jsonb_build_object('created_at', r.at, 'updated_at', r.at,
                                                'notified_at', r.at))).*
    from story_rows r;
    update public.share_link set last_viewed_at = ${at("09:50")}
    where job_id = ${j} and report_id is not null and last_viewed_at is not null;
  `);
}

/**
 * Removes her story (a run that stopped part way, or one made under another number), so it's
 * made again in full: its activity, payments, links, the quote and invoice with their lines
 * (as the server removes a sent document's lines), the repair job, the report, and the job.
 */
async function resetStory(jobId) {
  const c = q(SHOPS.canyon);
  const j = q(jobId);
  const jobs = `(select id from public.job where company_id = ${c} and (id = ${j} or parent_job_id = ${j}))`;
  await query(`
    select set_config('app.quote_server', 'on', true);
    select set_config('app.invoice_server', 'on', true);
    delete from public.activity where company_id = ${c} and job_id in ${jobs};
    delete from public.payment where company_id = ${c} and (
      quote_id in (select id from public.quote where job_id = ${j})
      or invoice_id in (select id from public.invoice where job_id = ${j}));
    delete from public.share_link where company_id = ${c} and job_id in ${jobs};
    delete from public.quote_line_item where quote_id in (select id from public.quote where job_id = ${j});
    delete from public.invoice_line_item where invoice_id in (select id from public.invoice where job_id = ${j});
    update public.quote set repair_job_id = null where job_id = ${j};
    delete from public.job where company_id = ${c} and parent_job_id = ${j};
    delete from public.quote where job_id = ${j} and company_id = ${c};
    delete from public.invoice where job_id = ${j} and company_id = ${c};
    update public.signature set report_id = null where job_id = ${j} and company_id = ${c};
    delete from public.report where job_id = ${j} and company_id = ${c};
    delete from public.signature where job_id = ${j} and company_id = ${c};
    delete from public.media where job_id = ${j} and company_id = ${c};
    delete from public.finding where job_id = ${j} and company_id = ${c};
    delete from public.test_result where job_id = ${j} and company_id = ${c};
    delete from public.checklist_item_result where job_id = ${j} and company_id = ${c};
    delete from public.job_component where job_id = ${j} and company_id = ${c};
    with gone as (delete from public.job where id = ${j} and company_id = ${c}
                  returning property_id, bill_to_customer_id),
      p as (delete from public.property where id in (select property_id from gone) returning customer_id)
    delete from public.customer where id in (select customer_id from p) and company_id = ${c};
  `);
}
