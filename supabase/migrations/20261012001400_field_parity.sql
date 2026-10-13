-- M8.5: match how the design partner works today (docs/research/2026-10-13-current-report-system.md).
--   * Checklist verdicts per item: not leaking / leaking / attention / not applicable, with
--     "where"; no method or reason required.
--   * Checklist sections and his item list as the default checklist.
--   * Job: detection fee, a second tech, booking answers, location marked.
--   * Customer: more emails. Company: report disclaimer, next job number.

-- ---------------------------------------------------------------------------
-- Checklist verdicts
-- ---------------------------------------------------------------------------

-- inspected + outcome: ok (not leaking), leaking, attention. excluded = not applicable.
alter table public.checklist_item_result
  add column outcome text check (outcome in ('ok', 'leaking', 'attention')),
  add column location_text text,
  drop constraint excluded_needs_reason,
  drop constraint inspected_needs_method;
-- Items checked before verdicts existed passed.
update public.checklist_item_result set outcome = 'ok' where status = 'inspected' and outcome is null;

-- ---------------------------------------------------------------------------
-- Checklist sections and item kinds
-- ---------------------------------------------------------------------------

-- section: where the item is listed (visual, plumbing, bond_beam, other).
-- answer: 'leak' items take a verdict; 'yes_no' items (vinyl stretched) take yes or no,
-- stored as outcome attention (yes) or ok (no).
alter table public.component_type
  add column section text not null default 'plumbing'
    check (section in ('visual', 'plumbing', 'bond_beam', 'other')),
  add column answer text not null default 'leak' check (answer in ('leak', 'yes_no')),
  add column applies_to_pool_type text;

-- The default checklist, in his sections and words. Existing component keys keep their ids.
update app.config_default set rows = $json$[
  {"key": "equipment_area", "name": "Equipment area", "section": "visual", "answer": "leak", "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 10},
  {"key": "backwash", "name": "Backwash", "section": "visual", "answer": "leak", "allows_multiple": false, "default_count": 1, "applies_to": "both", "methods": ["Visual"], "sort_order": 20},
  {"key": "water_feature", "name": "Around water feature", "section": "visual", "answer": "leak", "allows_multiple": false, "default_count": 1, "applies_to": "pool", "methods": ["Visual", "Dye test"], "sort_order": 30},
  {"key": "vinyl_stretched", "name": "If vinyl, is vinyl stretched?", "section": "visual", "answer": "yes_no", "allows_multiple": false, "default_count": 1, "applies_to": "pool", "pool_type": "vinyl", "methods": ["Visual"], "sort_order": 40},
  {"key": "vinyl_tears", "name": "Any noticeable tears in vinyl?", "section": "visual", "answer": "yes_no", "allows_multiple": false, "default_count": 1, "applies_to": "pool", "pool_type": "vinyl", "methods": ["Visual"], "sort_order": 50},
  {"key": "shell", "name": "Structural cracks in pool", "section": "visual", "answer": "leak", "allows_multiple": false, "default_count": 1, "applies_to": "pool", "methods": ["Visual", "Dye test", "Electronic listening"], "sort_order": 60},
  {"key": "bond_beam_visual", "name": "Bond beam", "section": "visual", "answer": "leak", "allows_multiple": false, "default_count": 1, "applies_to": "pool", "methods": ["Visual"], "sort_order": 70},
  {"key": "return", "name": "Returns", "section": "plumbing", "answer": "leak", "allows_multiple": true, "default_count": 1, "applies_to": "pool", "methods": ["Hydrophone", "Dye test", "Pressure test"], "sort_order": 100},
  {"key": "skimmer", "name": "Skimmer", "section": "plumbing", "answer": "leak", "allows_multiple": true, "default_count": 1, "applies_to": "pool", "methods": ["Hydrophone", "Dye test", "Pressure test"], "sort_order": 110},
  {"key": "skimmer_seam", "name": "Skimmer seam", "section": "plumbing", "answer": "leak", "allows_multiple": true, "default_count": 1, "applies_to": "pool", "methods": ["Dye test", "Visual"], "sort_order": 120},
  {"key": "skimmer_suction", "name": "Skimmer suction", "section": "plumbing", "answer": "leak", "allows_multiple": true, "default_count": 1, "applies_to": "pool", "methods": ["Hydrophone", "Pressure test"], "sort_order": 130},
  {"key": "skimmer_ports", "name": "Skimmer ports", "section": "plumbing", "answer": "leak", "allows_multiple": true, "default_count": 1, "applies_to": "pool", "methods": ["Dye test"], "sort_order": 140},
  {"key": "main_drain", "name": "Main drain", "section": "plumbing", "answer": "leak", "allows_multiple": true, "default_count": 1, "applies_to": "pool", "methods": ["Hydrophone", "Dye test", "Pressure test"], "sort_order": 150},
  {"key": "light", "name": "All light niches and conduits", "section": "plumbing", "answer": "leak", "allows_multiple": true, "default_count": 1, "applies_to": "both", "methods": ["Dye test", "Visual", "Conduit check"], "sort_order": 160},
  {"key": "cleaner_line", "name": "Cleaner lines", "section": "plumbing", "answer": "leak", "allows_multiple": true, "default_count": 1, "applies_to": "pool", "methods": ["Hydrophone", "Pressure test"], "sort_order": 170},
  {"key": "side_suction", "name": "Side suctions", "section": "plumbing", "answer": "leak", "allows_multiple": true, "default_count": 1, "applies_to": "pool", "methods": ["Hydrophone", "Pressure test"], "sort_order": 180},
  {"key": "equalizer", "name": "Front to equalizer or main drain", "section": "plumbing", "answer": "leak", "allows_multiple": false, "default_count": 1, "applies_to": "pool", "methods": ["Dye test", "Pressure test"], "sort_order": 190},
  {"key": "structural_cracks", "name": "Structural cracks", "section": "plumbing", "answer": "leak", "allows_multiple": false, "default_count": 1, "applies_to": "pool", "methods": ["Dye test"], "sort_order": 200},
  {"key": "spa", "name": "Spa jets", "section": "plumbing", "answer": "leak", "allows_multiple": false, "default_count": 1, "applies_to": "spa", "methods": ["Hydrophone", "Dye test", "Pressure test"], "sort_order": 210},
  {"key": "spa_fill", "name": "Spa fill", "section": "plumbing", "answer": "leak", "allows_multiple": false, "default_count": 1, "applies_to": "spa", "methods": ["Hydrophone", "Pressure test"], "sort_order": 220},
  {"key": "surge_tank", "name": "Surge tank", "section": "plumbing", "answer": "leak", "allows_multiple": false, "default_count": 1, "applies_to": "pool", "methods": ["Visual", "Dye test"], "sort_order": 230},
  {"key": "scum_gutter", "name": "Scum gutters", "section": "plumbing", "answer": "leak", "allows_multiple": false, "default_count": 1, "applies_to": "pool", "methods": ["Visual", "Dye test"], "sort_order": 240},
  {"key": "bond_beam_pool", "name": "Pool", "section": "bond_beam", "answer": "leak", "allows_multiple": false, "default_count": 1, "applies_to": "pool", "methods": ["Dye test", "Visual"], "sort_order": 300},
  {"key": "bond_beam_spa", "name": "Spa", "section": "bond_beam", "answer": "leak", "allows_multiple": false, "default_count": 1, "applies_to": "spa", "methods": ["Dye test", "Visual"], "sort_order": 310},
  {"key": "autofill", "name": "Autofill", "section": "bond_beam", "answer": "leak", "allows_multiple": false, "default_count": 1, "applies_to": "pool", "methods": ["Dye test", "Visual"], "sort_order": 320},
  {"key": "fittings", "name": "Around all fittings", "section": "bond_beam", "answer": "leak", "allows_multiple": false, "default_count": 1, "applies_to": "pool", "methods": ["Dye test"], "sort_order": 330},
  {"key": "autofill_eq", "name": "Autofill EQ line", "section": "bond_beam", "answer": "leak", "allows_multiple": false, "default_count": 1, "applies_to": "pool", "methods": ["Dye test", "Pressure test"], "sort_order": 340}
]$json$
where key = 'component_type';

-- Seeding reads the new columns too. Updates types that exist (by key), adds missing ones.
create or replace function app.seed_component_types(target_company uuid) returns void
language plpgsql security definer set search_path = public, app, pg_temp as $$
begin
  create temp table if not exists pg_temp.default_types on commit drop as
  select r.* from app.config_default d,
       jsonb_to_recordset(d.rows) as r(key text, name text, section text, answer text,
         pool_type text, allows_multiple boolean, default_count integer, applies_to text,
         methods text[], sort_order integer)
  where d.key = 'component_type';
  update public.component_type t
  set name = r.name, section = r.section, answer = r.answer, applies_to_pool_type = r.pool_type,
      allows_multiple = r.allows_multiple, default_count = r.default_count,
      applies_to = r.applies_to, methods = r.methods, sort_order = r.sort_order
  from pg_temp.default_types r
  where t.company_id = target_company and t.key = r.key and t.deleted_at is null;
  insert into public.component_type
    (company_id, key, name, section, answer, applies_to_pool_type, allows_multiple,
     default_count, applies_to, methods, sort_order)
  select target_company, r.key, r.name, r.section, r.answer, r.pool_type, r.allows_multiple,
         r.default_count, r.applies_to, r.methods, r.sort_order
  from pg_temp.default_types r
  where not exists (select 1 from public.component_type t
                    where t.company_id = target_company and t.key = r.key and t.deleted_at is null);
  drop table pg_temp.default_types;
end
$$;

create or replace function app.seed_company_defaults(target_company uuid) returns void
language plpgsql security definer set search_path = public, app, pg_temp as $$
begin
  perform app.seed_component_types(target_company);

  insert into public.test_type
    (company_id, key, name, field_schema, calculator, result_options, sort_order)
  select target_company, r.key, r.name, r.field_schema, r.calculator, r.result_options, r.sort_order
  from app.config_default d,
       jsonb_to_recordset(d.rows) as r(key text, name text, field_schema jsonb, calculator text,
         result_options text[], sort_order integer)
  where d.key = 'test_type';

  insert into public.severity_level (company_id, key, name, color, must_mention, sort_order)
  select target_company, r.key, r.name, r.color, r.must_mention, r.sort_order
  from app.config_default d,
       jsonb_to_recordset(d.rows) as r(key text, name text, color text, must_mention boolean,
         sort_order integer)
  where d.key = 'severity_level';

  insert into public.exclusion_reason (company_id, label, sort_order)
  select target_company, r.label, r.sort_order
  from app.config_default d, jsonb_to_recordset(d.rows) as r(label text, sort_order integer)
  where d.key = 'exclusion_reason';

  insert into public.report_template (company_id, key, name, enabled, sections, tone)
  select target_company, r.key, r.name, r.enabled, r.sections, r.tone
  from app.config_default d,
       jsonb_to_recordset(d.rows) as r(key text, name text, enabled boolean, sections jsonb, tone text)
  where d.key = 'report_template';

  insert into public.price_book_item
    (company_id, name, category, component_type_key, unit, price_cents, taxable, warranty_months,
     sort_order)
  select target_company, r.name, r.category, r.component_type_key, r.unit, r.price_cents,
         r.taxable, r.warranty_months, r.sort_order
  from app.config_default d,
       jsonb_to_recordset(d.rows) as r(name text, category text, component_type_key text,
         unit text, price_cents integer, taxable boolean, warranty_months integer,
         sort_order integer)
  where d.key = 'price_book_item';
end
$$;

-- Existing shops get the new list now (no shop has customized it yet; dev and demo only).
-- Types not in the new list ("Steps and benches", "Equipment pad") stay, filed under other.
select app.seed_component_types(id) from public.company;
-- Not applicable is a verdict now; a reason is optional.

update public.component_type set section = 'other'
where key not in (select r ->> 'key' from app.config_default d, jsonb_array_elements(d.rows) r
                  where d.key = 'component_type');

-- ---------------------------------------------------------------------------
-- Jobs and customers
-- ---------------------------------------------------------------------------

alter table public.job
  -- Price of the detection visit, shown on the report and carried to the invoice.
  add column fee_cents integer check (fee_cents >= 0),
  add column second_tech_id uuid,
  -- Answers to the shop's booking questions: {question_key: value or [values]}.
  add column intake jsonb,
  add column location_marked boolean,
  add foreign key (company_id, second_tech_id) references public.membership (company_id, user_id);

-- Extra addresses that also get reports and quotes.
alter table public.customer add column cc_emails text[] not null default '{}';

-- The shop's own legal text, printed at the end of every report.
alter table public.company add column report_disclaimer text;

-- Booking questions and the second-tech default live in company settings (config, not code).
update public.company
set settings = settings || jsonb_build_object('intake_questions', $json$[
  {"key": "reason", "label": "Why they called", "type": "multi",
   "options": ["Pool water level dropping", "Spa water level dropping", "Pool company told them to call", "Other"]},
  {"key": "pool_size", "label": "Size of the pool", "type": "single",
   "options": ["Normal (about 15x30 or 20x40)", "Smaller than normal", "Larger than normal", "Other"]},
  {"key": "spa_size", "label": "Spa size or dimensions", "type": "text"}
]$json$::jsonb)
where not settings ? 'intake_questions';
alter table public.company alter column settings set default (
  '{"deposit": {"type": "percent", "value_bps": 5000, "minimum_cents": 0},
    "tax_rate_bps": 0, "tech_discount_limit_bps": 1000,
    "reminders": {"quote_days": [3, 7], "invoice_days": [7, 14, 30]},
    "review_requests": true, "sync_window_days": 365,
    "signature_purposes": {"inspection_ack": true, "work_authorization": false,
                           "quote_acceptance": true, "completion": false},
    "intake_questions": [
      {"key": "reason", "label": "Why they called", "type": "multi",
       "options": ["Pool water level dropping", "Spa water level dropping", "Pool company told them to call", "Other"]},
      {"key": "pool_size", "label": "Size of the pool", "type": "single",
       "options": ["Normal (about 15x30 or 20x40)", "Smaller than normal", "Larger than normal", "Other"]},
      {"key": "spa_size", "label": "Spa size or dimensions", "type": "text"}]}'::jsonb);

-- Owners continue numbering from their old system: the next job gets at least this number.
create or replace function public.set_next_job_number(target_company uuid, next_number integer)
returns integer
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  current_last integer;
begin
  if not app.is_owner(target_company) then
    raise exception 'Only owners can change numbering' using errcode = 'insufficient_privilege';
  end if;
  select last_value into current_last from app.company_counter
  where company_id = target_company and kind = 'job';
  if next_number <= coalesce(current_last, 0) then
    raise exception 'Numbers already go up to %. Choose a number above it.', current_last
      using errcode = 'check_violation';
  end if;
  insert into app.company_counter (company_id, kind, last_value)
  values (target_company, 'job', next_number - 1)
  on conflict (company_id, kind) do update set last_value = excluded.last_value;
  return next_number;
end
$$;
revoke all on function public.set_next_job_number(uuid, integer) from public, anon;
grant execute on function public.set_next_job_number(uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Access for the new columns (same registry as 20261012000600_access.sql)
-- ---------------------------------------------------------------------------

do $$
declare
  add_cols jsonb := $json${
    "checklist_item_result": {"insert": ["outcome", "location_text"], "update": ["outcome", "location_text"]},
    "component_type": {"insert": ["section", "answer", "applies_to_pool_type"], "update": ["section", "answer", "applies_to_pool_type"]},
    "job": {"insert": ["fee_cents", "second_tech_id", "intake", "location_marked"], "update": ["fee_cents", "second_tech_id", "intake", "location_marked"]},
    "customer": {"insert": ["cc_emails"], "update": ["cc_emails"]},
    "company": {"insert": [], "update": ["report_disclaimer"]}
  }$json$;
  t text;
  ins text[];
  upd text[];
begin
  for t in select jsonb_object_keys(add_cols) loop
    ins := array(select jsonb_array_elements_text(add_cols -> t -> 'insert'));
    upd := array(select jsonb_array_elements_text(add_cols -> t -> 'update'));
    update app.sync_table
    set insert_columns = case when insert_columns is null then null else insert_columns || ins end,
        update_columns = case when update_columns is null then null else update_columns || upd end
    where table_name = t;
    if cardinality(ins) > 0 and (select insert_columns is not null from app.sync_table where table_name = t) then
      execute format('grant insert (%s) on public.%I to authenticated', array_to_string(ins, ', '), t);
    end if;
    if cardinality(upd) > 0 then
      execute format('grant update (%s) on public.%I to authenticated', array_to_string(upd, ', '), t);
    end if;
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- Report snapshot: verdicts, sections, fee, techs, disclaimer, booking answers
-- ---------------------------------------------------------------------------

alter function app.report_snapshot(uuid) rename to report_snapshot_m7;

create or replace function app.report_snapshot(target_job uuid) returns jsonb
language sql stable security definer set search_path = public, app, pg_temp as $$
  with base as (select app.report_snapshot_m7(target_job) as s),
  j as (select * from public.job where id = target_job and deleted_at is null),
  c as (select * from public.company where id = (select company_id from j)),
  cu as (select * from public.customer where id = coalesce(
           (select bill_to_customer_id from j),
           (select p.customer_id from public.property p where p.id = (select property_id from j)))),
  questions as (
    select q ->> 'key' as key, q ->> 'label' as label
    from c, jsonb_array_elements(coalesce(c.settings -> 'intake_questions', '[]')) q)
  select case when base.s is null then null else base.s || jsonb_build_object(
    'company', (base.s -> 'company') || jsonb_build_object(
      'disclaimer', (select nullif(trim(report_disclaimer), '') from c)),
    'customer', case when base.s -> 'customer' = 'null'::jsonb then base.s -> 'customer'
      else (base.s -> 'customer') || jsonb_build_object(
        'cc_emails', (select to_jsonb(cu.cc_emails) from cu)) end,
    'job', (base.s -> 'job') || (select jsonb_build_object(
      'fee_cents', j.fee_cents, 'completed_at', j.completed_at,
      'location_marked', j.location_marked,
      'second_tech_name', (select coalesce(pr.full_name, pr.email) from public.profile pr
                           where pr.id = j.second_tech_id),
      -- Booking answers keyed by the question's label, in the shop's order.
      'intake', (select jsonb_object_agg(q.label, j.intake -> q.key)
                 from questions q where j.intake ? q.key
                   and j.intake -> q.key not in ('null'::jsonb, '""'::jsonb, '[]'::jsonb)))
      from j),
    'components', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', jc.id, 'result_id', r.id, 'label', jc.label, 'type_key', t.key,
        'type_name', t.name, 'status', coalesce(r.status, 'pending'), 'method', r.method,
        'exclusion_reason', r.exclusion_reason, 'notes', r.notes,
        'section', t.section, 'answer', t.answer, 'outcome', r.outcome,
        'location_text', r.location_text)
        order by t.sort_order, jc.sort_order, jc.label)
      from public.job_component jc
      join public.component_type t on t.id = jc.component_type_id
      left join public.checklist_item_result r
        on r.job_component_id = jc.id and r.deleted_at is null
      where jc.job_id = target_job and jc.deleted_at is null), '[]'::jsonb))
  end
  from base
$$;
revoke all on function app.report_snapshot(uuid), app.report_snapshot_m7(uuid) from public;
