-- Defaults per package (owner, 2026-10-16: "adjust the default pricebook depending on
-- maintenance and leak companies"). A new shop starts with only its package's setup:
--
--   Pool care:      the visit checklist and a pool service price book (cleanings, chemicals,
--                   common repairs).
--   Leak detection: the inspection checklist, test types, severities, exclusion reasons,
--                   and the leak detection price book (detection fees and repairs).
--   Both:           both.
--
-- Report templates go to every shop. Turning a package on later (Settings › Company ›
-- Services) adds that package's defaults (public.add_package_defaults); turning one off
-- keeps them, hidden. Existing shops keep what they have. Prices are first drafts for the
-- owner to confirm; each shop edits its own copy.

-- ---------------------------------------------------------------------------
-- Price book: the leak list as before, plus the pool care list.
-- ---------------------------------------------------------------------------

update app.config_default
set rows = (select jsonb_agg(r || '{"package": "leak"}' order by ord)
            from jsonb_array_elements(rows) with ordinality as t(r, ord))
where key = 'price_book_item';

update app.config_default
set rows = rows || $json$[
  {"package": "pool", "name": "Filter clean, cartridge", "category": "Service", "component_type_key": "svc_filter", "unit": "each", "price_cents": 9500, "taxable": false, "warranty_months": null, "sort_order": 10},
  {"package": "pool", "name": "Filter clean, DE (with new DE)", "category": "Service", "component_type_key": "svc_filter", "unit": "each", "price_cents": 12500, "taxable": false, "warranty_months": null, "sort_order": 20},
  {"package": "pool", "name": "Salt cell clean", "category": "Service", "component_type_key": "svc_equipment", "unit": "each", "price_cents": 8500, "taxable": false, "warranty_months": null, "sort_order": 30},
  {"package": "pool", "name": "Green pool cleanup", "category": "Service", "component_type_key": null, "unit": "each", "price_cents": 35000, "taxable": false, "warranty_months": null, "sort_order": 40},
  {"package": "pool", "name": "Drain and acid wash", "category": "Service", "component_type_key": null, "unit": "each", "price_cents": 59500, "taxable": false, "warranty_months": null, "sort_order": 50},
  {"package": "pool", "name": "Extra service visit", "category": "Service", "component_type_key": null, "unit": "each", "price_cents": 6500, "taxable": false, "warranty_months": null, "sort_order": 60},
  {"package": "pool", "name": "Liquid chlorine", "category": "Chemicals", "component_type_key": "svc_water", "unit": "gal", "price_cents": 800, "taxable": true, "warranty_months": null, "sort_order": 110},
  {"package": "pool", "name": "Muriatic acid", "category": "Chemicals", "component_type_key": "svc_water", "unit": "gal", "price_cents": 1500, "taxable": true, "warranty_months": null, "sort_order": 120},
  {"package": "pool", "name": "Stabilizer (CYA)", "category": "Chemicals", "component_type_key": "svc_water", "unit": "lb", "price_cents": 900, "taxable": true, "warranty_months": null, "sort_order": 130},
  {"package": "pool", "name": "Salt, 40 lb bag", "category": "Chemicals", "component_type_key": "svc_water", "unit": "bag", "price_cents": 1800, "taxable": true, "warranty_months": null, "sort_order": 140},
  {"package": "pool", "name": "Phosphate remover", "category": "Chemicals", "component_type_key": "svc_water", "unit": "each", "price_cents": 3500, "taxable": true, "warranty_months": null, "sort_order": 150},
  {"package": "pool", "name": "Replace pump motor", "category": "Repair", "component_type_key": "svc_equipment", "unit": "each", "price_cents": 65000, "taxable": true, "warranty_months": 12, "sort_order": 210},
  {"package": "pool", "name": "Replace pump lid O-ring", "category": "Repair", "component_type_key": "svc_equipment", "unit": "each", "price_cents": 4500, "taxable": true, "warranty_months": null, "sort_order": 220},
  {"package": "pool", "name": "Replace filter pressure gauge", "category": "Repair", "component_type_key": "svc_filter", "unit": "each", "price_cents": 4500, "taxable": true, "warranty_months": 6, "sort_order": 230},
  {"package": "pool", "name": "Replace skimmer basket", "category": "Repair", "component_type_key": "svc_baskets", "unit": "each", "price_cents": 3500, "taxable": true, "warranty_months": null, "sort_order": 240},
  {"package": "pool", "name": "Replace pool light bulb", "category": "Repair", "component_type_key": null, "unit": "each", "price_cents": 17500, "taxable": true, "warranty_months": 12, "sort_order": 250}
]$json$::jsonb
where key = 'price_book_item';

-- ---------------------------------------------------------------------------
-- One package's defaults for one shop. Adds only what's missing (by key, name, or label),
-- so it's safe to run again and never touches a shop's own edits.
-- ---------------------------------------------------------------------------

create or replace function app.seed_package_defaults(target_company uuid, pkg text) returns void
language plpgsql security definer set search_path = public, app, pg_temp as $$
begin
  if pkg not in ('pool', 'leak') then
    raise exception 'Unknown package %', pkg using errcode = 'invalid_parameter_value';
  end if;

  -- Checklist: inspection items for leak detection, visit items for pool care.
  insert into public.component_type
    (company_id, key, name, section, answer, job_type, applies_to_pool_type, allows_multiple,
     default_count, applies_to, methods, sort_order)
  select target_company, r.key, r.name, coalesce(r.section, 'visual'), coalesce(r.answer, 'leak'),
         coalesce(r.job_type, 'detection'), r.pool_type, r.allows_multiple, r.default_count,
         r.applies_to, r.methods, r.sort_order
  from app.config_default d,
       jsonb_to_recordset(d.rows) as r(key text, name text, section text, answer text,
         job_type text, pool_type text, allows_multiple boolean, default_count integer,
         applies_to text, methods text[], sort_order integer)
  where d.key = 'component_type'
    and coalesce(r.job_type, 'detection') = case pkg when 'pool' then 'maintenance' else 'detection' end
    and not exists (select 1 from public.component_type t
                    where t.company_id = target_company and t.key = r.key and t.deleted_at is null);

  if pkg = 'leak' then
    insert into public.test_type
      (company_id, key, name, field_schema, calculator, result_options, sort_order)
    select target_company, r.key, r.name, r.field_schema, r.calculator, r.result_options, r.sort_order
    from app.config_default d,
         jsonb_to_recordset(d.rows) as r(key text, name text, field_schema jsonb, calculator text,
           result_options text[], sort_order integer)
    where d.key = 'test_type'
      and not exists (select 1 from public.test_type t
                      where t.company_id = target_company and t.key = r.key and t.deleted_at is null);

    insert into public.severity_level (company_id, key, name, color, must_mention, sort_order)
    select target_company, r.key, r.name, r.color, r.must_mention, r.sort_order
    from app.config_default d,
         jsonb_to_recordset(d.rows) as r(key text, name text, color text, must_mention boolean,
           sort_order integer)
    where d.key = 'severity_level'
      and not exists (select 1 from public.severity_level t
                      where t.company_id = target_company and t.key = r.key and t.deleted_at is null);

    insert into public.exclusion_reason (company_id, label, sort_order)
    select target_company, r.label, r.sort_order
    from app.config_default d, jsonb_to_recordset(d.rows) as r(label text, sort_order integer)
    where d.key = 'exclusion_reason'
      and not exists (select 1 from public.exclusion_reason t
                      where t.company_id = target_company and t.label = r.label and t.deleted_at is null);
  end if;

  insert into public.price_book_item
    (company_id, name, category, component_type_key, unit, price_cents, taxable, warranty_months,
     sort_order)
  select target_company, r.name, r.category, r.component_type_key, r.unit, r.price_cents,
         r.taxable, r.warranty_months, r.sort_order
  from app.config_default d,
       jsonb_to_recordset(d.rows) as r(package text, name text, category text,
         component_type_key text, unit text, price_cents integer, taxable boolean,
         warranty_months integer, sort_order integer)
  where d.key = 'price_book_item' and coalesce(r.package, 'leak') = pkg
    and not exists (select 1 from public.price_book_item t
                    where t.company_id = target_company and t.name = r.name and t.deleted_at is null);
end
$$;

-- A new shop's setup: report templates, then each package it does.
drop function app.seed_company_defaults(uuid);
create function app.seed_company_defaults(target_company uuid, services text default 'both')
returns void
language plpgsql security definer set search_path = public, app, pg_temp as $$
begin
  if services not in ('pool', 'leak', 'both') then
    raise exception 'Unknown services %', services using errcode = 'invalid_parameter_value';
  end if;

  insert into public.report_template (company_id, key, name, enabled, sections, tone)
  select target_company, r.key, r.name, r.enabled, r.sections, r.tone
  from app.config_default d,
       jsonb_to_recordset(d.rows) as r(key text, name text, enabled boolean, sections jsonb, tone text)
  where d.key = 'report_template'
    and not exists (select 1 from public.report_template t
                    where t.company_id = target_company and t.key = r.key and t.deleted_at is null);

  if services in ('pool', 'both') then
    perform app.seed_package_defaults(target_company, 'pool');
  end if;
  if services in ('leak', 'both') then
    perform app.seed_package_defaults(target_company, 'leak');
  end if;
end
$$;
revoke all on function app.seed_company_defaults(uuid, text), app.seed_package_defaults(uuid, text)
  from public;

-- Sign-up says what the shop does, so it starts with the right setup. Older callers (no
-- services) get both, as before.
drop function public.create_company(text, text);
create function public.create_company(
  company_name text, company_timezone text default null, company_services text default 'both')
returns uuid
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  caller uuid := auth.uid();
  new_company uuid;
begin
  if caller is null then
    raise exception 'Sign in before creating a company' using errcode = 'insufficient_privilege';
  end if;
  if company_timezone is not null and not exists (
    select 1 from pg_timezone_names where name = company_timezone) then
    raise exception 'Unknown time zone %', company_timezone using errcode = 'invalid_parameter_value';
  end if;
  if company_services not in ('pool', 'leak', 'both') then
    raise exception 'Unknown services %', company_services using errcode = 'invalid_parameter_value';
  end if;

  insert into public.company (name, timezone)
  values (trim(company_name), coalesce(company_timezone, 'America/New_York'))
  returning id into new_company;
  update public.company
  set settings = settings || jsonb_build_object('services', company_services)
  where id = new_company;

  insert into public.membership (company_id, user_id, role) values (new_company, caller, 'owner');
  perform app.seed_company_defaults(new_company, company_services);
  insert into public.subscription (company_id, status, trial_ends_at)
  values (new_company, 'trialing', now() + interval '14 days');

  return new_company;
end
$$;
revoke all on function public.create_company(text, text, text) from public, anon;
grant execute on function public.create_company(text, text, text) to authenticated;

-- Owners: when the shop takes on a package, add its setup (Settings › Company › Services).
create or replace function public.add_package_defaults(target_company uuid, services text)
returns void
language plpgsql security definer set search_path = public, app, pg_temp as $$
begin
  if not app.is_owner(target_company) then
    raise exception 'Only owners can change what the shop does' using errcode = 'insufficient_privilege';
  end if;
  if services not in ('pool', 'leak', 'both') then
    raise exception 'Unknown services %', services using errcode = 'invalid_parameter_value';
  end if;
  if services in ('pool', 'both') then
    perform app.seed_package_defaults(target_company, 'pool');
  end if;
  if services in ('leak', 'both') then
    perform app.seed_package_defaults(target_company, 'leak');
  end if;
end
$$;
revoke all on function public.add_package_defaults(uuid, text) from public, anon;
grant execute on function public.add_package_defaults(uuid, text) to authenticated;
