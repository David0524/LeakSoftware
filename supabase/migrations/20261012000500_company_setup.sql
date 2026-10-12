-- Company signup, default configuration, and team invites.

-- ---------------------------------------------------------------------------
-- Default configuration copied into every new company. First drafts, to be confirmed
-- with the design partner; change them with a new migration that updates these rows.
-- Existing companies keep their own copies.
-- ---------------------------------------------------------------------------

create table app.config_default (
  key text primary key,
  rows jsonb not null check (jsonb_typeof(rows) = 'array')
);

insert into app.config_default (key, rows) values
('component_type', $json$[
  {"key": "skimmer", "name": "Skimmer", "allows_multiple": true, "default_count": 1, "applies_to": "pool",
   "methods": ["Pressure test", "Dye test", "Visual"], "sort_order": 10},
  {"key": "return", "name": "Return", "allows_multiple": true, "default_count": 2, "applies_to": "pool",
   "methods": ["Pressure test", "Dye test", "Visual"], "sort_order": 20},
  {"key": "main_drain", "name": "Main drain", "allows_multiple": true, "default_count": 1, "applies_to": "pool",
   "methods": ["Pressure test", "Dye test", "Visual"], "sort_order": 30},
  {"key": "light", "name": "Light", "allows_multiple": true, "default_count": 1, "applies_to": "both",
   "methods": ["Dye test", "Visual", "Conduit check"], "sort_order": 40},
  {"key": "shell", "name": "Shell", "allows_multiple": false, "default_count": 1, "applies_to": "pool",
   "methods": ["Visual", "Dye test", "Electronic listening"], "sort_order": 50},
  {"key": "steps_benches", "name": "Steps and benches", "allows_multiple": false, "default_count": 1, "applies_to": "pool",
   "methods": ["Visual", "Dye test"], "sort_order": 60},
  {"key": "spa", "name": "Spa", "allows_multiple": false, "default_count": 1, "applies_to": "spa",
   "methods": ["Pressure test", "Dye test", "Visual"], "sort_order": 70},
  {"key": "equipment_pad", "name": "Equipment pad", "allows_multiple": false, "default_count": 1, "applies_to": "both",
   "methods": ["Visual", "Pressure test"], "sort_order": 80}
]$json$),
('test_type', $json$[
  {"key": "pressure", "name": "Pressure test", "calculator": "pressure_drop", "sort_order": 10,
   "result_options": ["pass", "fail", "inconclusive"],
   "field_schema": {"fields": [
     {"key": "line_name", "label": "Line", "type": "text", "required": true},
     {"key": "start_psi", "label": "Start pressure", "type": "number", "unit": "PSI", "required": true},
     {"key": "end_psi", "label": "End pressure", "type": "number", "unit": "PSI", "required": true},
     {"key": "duration_min", "label": "Duration", "type": "number", "unit": "min", "required": true}
   ]}},
  {"key": "dye", "name": "Dye test", "calculator": null, "sort_order": 20,
   "result_options": ["pass", "fail", "inconclusive"],
   "field_schema": {"fields": [
     {"key": "location", "label": "Location", "type": "text", "required": true},
     {"key": "observation", "label": "Result", "type": "select", "required": true,
      "options": ["No draw", "Dye drawn in (leak)", "Inconclusive"]},
     {"key": "notes", "label": "Notes", "type": "textarea"}
   ]}},
  {"key": "bucket", "name": "Bucket / evaporation test", "calculator": "bucket_evaporation", "sort_order": 30,
   "result_options": ["pass", "fail", "inconclusive"],
   "field_schema": {"fields": [
     {"key": "pool_start_in", "label": "Pool level start", "type": "number", "unit": "in", "required": true},
     {"key": "pool_end_in", "label": "Pool level end", "type": "number", "unit": "in", "required": true},
     {"key": "bucket_start_in", "label": "Bucket level start", "type": "number", "unit": "in", "required": true},
     {"key": "bucket_end_in", "label": "Bucket level end", "type": "number", "unit": "in", "required": true},
     {"key": "duration_hours", "label": "Duration", "type": "number", "unit": "h", "required": true}
   ]}},
  {"key": "listening", "name": "Listening / electronic detection", "calculator": null, "sort_order": 40,
   "result_options": ["pass", "fail", "inconclusive"],
   "field_schema": {"fields": [
     {"key": "location", "label": "Location", "type": "text", "required": true},
     {"key": "observation", "label": "Result", "type": "select", "required": true,
      "options": ["Nothing detected", "Leak sound detected", "Inconclusive"]},
     {"key": "notes", "label": "Notes", "type": "textarea"}
   ]}}
]$json$),
('severity_level', $json$[
  {"key": "minor", "name": "Minor", "color": "#5B6B7A", "must_mention": false, "sort_order": 10},
  {"key": "moderate", "name": "Moderate", "color": "#9A6210", "must_mention": false, "sort_order": 20},
  {"key": "major", "name": "Major", "color": "#C62F2B", "must_mention": true, "sort_order": 30},
  {"key": "critical", "name": "Critical", "color": "#8E1B18", "must_mention": true, "sort_order": 40}
]$json$),
('exclusion_reason', $json$[
  {"label": "No diver on site", "sort_order": 10},
  {"label": "Area not accessible", "sort_order": 20},
  {"label": "Customer declined", "sort_order": 30},
  {"label": "Equipment off or not working", "sort_order": 40},
  {"label": "Not part of this job", "sort_order": 50}
]$json$),
('report_template', $json$[
  {"key": "homeowner", "name": "Homeowner report", "enabled": true,
   "sections": ["header", "summary", "findings", "diagram", "next_steps", "coverage", "photos", "signature", "quote", "footer"],
   "tone": "Write for a homeowner with no pool background. Plain words, short sentences. Say what was found, what it means for them, and the recommended next step. Do not use jargon without explaining it."},
  {"key": "partner", "name": "Partner report", "enabled": true,
   "sections": ["header", "summary", "findings", "diagram", "tests", "coverage", "photos", "signature", "quote", "footer"],
   "tone": "Write for a pool service company or builder. Technical and concise. Go component by component and cite test values with units."},
  {"key": "insurance", "name": "Insurance adjuster report", "enabled": false,
   "sections": ["header", "summary", "findings", "diagram", "tests", "coverage", "photos", "signature", "footer"],
   "tone": "Coming soon."}
]$json$),
('price_book_item', $json$[
  {"name": "Leak detection - pool", "category": "Detection", "component_type_key": null, "unit": "each", "price_cents": 37500, "taxable": false, "warranty_months": null, "sort_order": 10},
  {"name": "Leak detection - pool and spa", "category": "Detection", "component_type_key": null, "unit": "each", "price_cents": 45000, "taxable": false, "warranty_months": null, "sort_order": 20},
  {"name": "Replace return fitting", "category": "Repair", "component_type_key": "return", "unit": "each", "price_cents": 18500, "taxable": true, "warranty_months": 12, "sort_order": 30},
  {"name": "Repair underground pressure line (per break)", "category": "Repair", "component_type_key": "return", "unit": "each", "price_cents": 125000, "taxable": true, "warranty_months": 12, "sort_order": 40},
  {"name": "Skimmer throat repair", "category": "Repair", "component_type_key": "skimmer", "unit": "each", "price_cents": 22500, "taxable": true, "warranty_months": 12, "sort_order": 50},
  {"name": "Light niche reseal", "category": "Repair", "component_type_key": "light", "unit": "each", "price_cents": 15000, "taxable": true, "warranty_months": 12, "sort_order": 60},
  {"name": "Main drain repair (diver)", "category": "Repair", "component_type_key": "main_drain", "unit": "each", "price_cents": 65000, "taxable": true, "warranty_months": 12, "sort_order": 70},
  {"name": "Shell crack repair", "category": "Repair", "component_type_key": "shell", "unit": "ft", "price_cents": 4500, "taxable": true, "warranty_months": 12, "sort_order": 80},
  {"name": "Equipment pad plumbing repair", "category": "Repair", "component_type_key": "equipment_pad", "unit": "each", "price_cents": 27500, "taxable": true, "warranty_months": 6, "sort_order": 90},
  {"name": "Replace spa jet fitting", "category": "Repair", "component_type_key": "spa", "unit": "each", "price_cents": 16500, "taxable": true, "warranty_months": 12, "sort_order": 100}
]$json$);

create or replace function app.seed_company_defaults(target_company uuid) returns void
language plpgsql security definer set search_path = public, app, pg_temp as $$
begin
  insert into public.component_type
    (company_id, key, name, allows_multiple, default_count, applies_to, methods, sort_order)
  select target_company, r.key, r.name, r.allows_multiple, r.default_count, r.applies_to,
         r.methods, r.sort_order
  from app.config_default d,
       jsonb_to_recordset(d.rows) as r(key text, name text, allows_multiple boolean,
         default_count integer, applies_to text, methods text[], sort_order integer)
  where d.key = 'component_type';

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

-- ---------------------------------------------------------------------------
-- Signup: the signed-in user creates a company and becomes its owner.
-- ---------------------------------------------------------------------------

create or replace function public.create_company(company_name text, company_timezone text default null)
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

  insert into public.company (name, timezone)
  values (trim(company_name), coalesce(company_timezone, 'America/New_York'))
  returning id into new_company;

  insert into public.membership (company_id, user_id, role) values (new_company, caller, 'owner');
  perform app.seed_company_defaults(new_company);
  insert into public.subscription (company_id, status, trial_ends_at)
  values (new_company, 'trialing', now() + interval '30 days');

  return new_company;
end
$$;

-- ---------------------------------------------------------------------------
-- Invites. Email delivery is added in M7; for now the owner shares the token/link.
-- ---------------------------------------------------------------------------

create or replace function public.create_invite(target_company uuid, invite_email text, invite_role text default 'tech')
returns text
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  new_token text;
begin
  if not app.is_owner(target_company) then
    raise exception 'Only owners can invite' using errcode = 'insufficient_privilege';
  end if;
  if invite_role not in ('owner', 'tech') then
    raise exception 'Unknown role %', invite_role using errcode = 'invalid_parameter_value';
  end if;

  -- One open invite per email: revoke earlier ones.
  update public.invite set revoked_at = now()
  where company_id = target_company and lower(email) = lower(trim(invite_email))
    and accepted_at is null and revoked_at is null;

  insert into public.invite (company_id, email, role, created_by)
  values (target_company, lower(trim(invite_email)), invite_role, auth.uid())
  returning token into new_token;
  return new_token;
end
$$;

create or replace function public.accept_invite(invite_token text) returns uuid
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  caller uuid := auth.uid();
  caller_email text := lower(auth.jwt() ->> 'email');
  inv public.invite;
begin
  if caller is null then
    raise exception 'Sign in before accepting an invite' using errcode = 'insufficient_privilege';
  end if;

  select * into inv from public.invite
  where token = invite_token and accepted_at is null and revoked_at is null and expires_at > now()
  for update;
  if not found then
    raise exception 'This invite is invalid or has expired' using errcode = 'invalid_parameter_value';
  end if;
  if caller_email is distinct from inv.email then
    raise exception 'This invite was sent to a different email address'
      using errcode = 'insufficient_privilege';
  end if;

  insert into public.membership (company_id, user_id, role, status)
  values (inv.company_id, caller, inv.role, 'active')
  on conflict (company_id, user_id)
    do update set role = excluded.role, status = 'active', deleted_at = null;

  update public.invite set accepted_at = now(), accepted_by = caller where id = inv.id;
  return inv.company_id;
end
$$;

revoke all on function public.create_company(text, text), public.create_invite(uuid, text, text),
  public.accept_invite(text) from public, anon;
grant execute on function public.create_company(text, text), public.create_invite(uuid, text, text),
  public.accept_invite(text) to authenticated;
revoke all on function app.seed_company_defaults(uuid), app.next_number(uuid, text) from public;
