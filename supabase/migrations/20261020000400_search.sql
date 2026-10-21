-- Search (owner, 2026-10-20: "Ok add that search in"; docs/plans/search-and-activity.md,
-- section 1). Phones search their own database; the website asks here.
--
-- search_candidates() finds the rows a search could show, through the caller's own row
-- security (security invoker), so what a person can't open they can't find: techs in a shop
-- set to "Only Their Own" get only their jobs and those jobs' quotes and invoices. It matches
-- generously and boundedly; packages/core (searchShop) then applies the exact rule (word
-- starts, number prefixes, phone digits), ranks, groups, and caps, the same rule the phones run.

create extension if not exists pg_trgm with schema extensions;

/** Lower case without accents ("José" -> "jose"), for matching. Mirrors core's foldText. */
create or replace function app.fold(value text) returns text
language sql immutable parallel safe as $$
  select lower(translate(coalesce(value, ''),
    'ÀÁÂÃÄÅàáâãäåÈÉÊËèéêëÌÍÎÏìíîïÒÓÔÕÖØòóôõöøÙÚÛÜùúûüÑñÇçÝýÿŠšŽž',
    'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOOooooooUUUUuuuuNnCcYyySsZz'))
$$;
revoke all on function app.fold(text) from public;
grant execute on function app.fold(text) to authenticated, service_role;

-- What each kind matches on, indexed for "contains" (trigrams) and number prefixes.
create index customer_search on public.customer using gin (
  app.fold(coalesce(name, '') || ' ' || coalesce(company_name, '') || ' ' || coalesce(email, ''))
  extensions.gin_trgm_ops);
create index customer_phone_search on public.customer using gin (
  regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') extensions.gin_trgm_ops);
create index property_search on public.property using gin (
  app.fold(coalesce(address_line1, '') || ' ' || coalesce(city, '')) extensions.gin_trgm_ops);
create index job_number_search on public.job (company_id, (number::text) text_pattern_ops);
create index quote_number_search on public.quote (company_id, (number::text) text_pattern_ops);
create index invoice_number_search on public.invoice (company_id, (number::text) text_pattern_ops);

/**
 * Rows a search may show, at most 100 of each kind. `words` are the query's words as core's
 * normalizeSearch gives them (folded, letters and digits only); `digits` is the query's digits
 * when it reads as a phone number (4 or more), else null. Returns
 * {customers: [{id, name, company_name, phone, email, updated_at}],
 *  pools: [{id, customer_id, address_line1, city, state, postal_code, customer_name}],
 *  jobs: [{id, number, type, status, scheduled_start, created_at, customer_name}],
 *  quotes: [{id, job_id, number, status, total_cents, created_at, customer_name}],
 *  invoices: [{id, job_id, number, status, total_cents, amount_paid_cents, created_at,
 *              customer_name}]}.
 */
create or replace function public.search_candidates(target_company uuid, words text[],
  digits text default null)
returns jsonb
language plpgsql stable security invoker set search_path = public, app, extensions, pg_temp as $$
declare
  -- Letters and digits only, so each is safe inside a pattern.
  ws text[] := array(select w from unnest(coalesce(words, '{}')) w
                     where w ~ '^[a-z0-9]+$' limit 8);
  -- The words that aren't numbers name a customer; numbers can also be a job's number.
  names text[] := array(select w from unnest(ws) w where w !~ '^[0-9]+$');
  nums text[] := array(select w from unnest(ws) w where w ~ '^[0-9]{1,9}$');
  -- The longest word narrows through the trigram index; every word is checked after.
  longest text := (select w from unnest(ws) w order by length(w) desc limit 1);
  longest_name text := (select w from unnest(names) w order by length(w) desc limit 1);
  wanted_phone text := case when digits ~ '^[0-9]{4,15}$' then digits end;
  cap constant integer := 100;
  named uuid[] := '{}';
begin
  if not app.is_member(target_company) then
    raise exception 'Not a member of this shop' using errcode = 'insufficient_privilege';
  end if;
  if cardinality(ws) = 0 and wanted_phone is null then
    return jsonb_build_object('customers', '[]'::jsonb, 'pools', '[]'::jsonb,
      'jobs', '[]'::jsonb, 'quotes', '[]'::jsonb, 'invoices', '[]'::jsonb);
  end if;

  -- Customers whose name every non-number word starts a word of (for jobs, quotes, invoices).
  if longest_name is not null then
    named := array(
      select c.id from public.customer c
      where c.company_id = target_company and c.deleted_at is null
        and app.fold(coalesce(c.name, '') || ' ' || coalesce(c.company_name, '') || ' '
                     || coalesce(c.email, '')) like '%' || longest_name || '%'
        and not exists (select 1 from unnest(names) w
                        where app.fold(c.name) !~ ('(^|[^a-z0-9])' || w))
      limit 500);
  end if;

  return jsonb_build_object(
    'customers', (
      select coalesce(jsonb_agg(to_jsonb(r) order by r.name), '[]'::jsonb) from (
        select c.id, c.name, c.company_name, c.phone, c.email, c.updated_at
        from public.customer c
        where c.company_id = target_company and c.deleted_at is null
          and ((longest is not null
                and app.fold(coalesce(c.name, '') || ' ' || coalesce(c.company_name, '') || ' '
                             || coalesce(c.email, '')) like '%' || longest || '%'
                and not exists (
                  select 1 from unnest(ws) w
                  where app.fold(coalesce(c.name, '') || ' ' || coalesce(c.company_name, '')
                                 || ' ' || coalesce(c.email, '')) !~ ('(^|[^a-z0-9])' || w)))
               or (wanted_phone is not null
                   and regexp_replace(coalesce(c.phone, ''), '[^0-9]', '', 'g')
                       like '%' || wanted_phone || '%'))
        order by c.name
        limit cap) r),
    'pools', (
      select coalesce(jsonb_agg(to_jsonb(r) order by r.address_line1), '[]'::jsonb) from (
        select p.id, p.customer_id, p.address_line1, p.city, p.state, p.postal_code,
               c.name as customer_name
        from public.property p
        left join public.customer c on c.id = p.customer_id
        where p.company_id = target_company and p.deleted_at is null
          and longest is not null
          and app.fold(coalesce(p.address_line1, '') || ' ' || coalesce(p.city, ''))
              like '%' || longest || '%'
          and not exists (
            select 1 from unnest(ws) w
            where app.fold(coalesce(p.address_line1, '') || ' ' || coalesce(p.city, ''))
                  !~ ('(^|[^a-z0-9])' || w))
        order by p.address_line1
        limit cap) r),
    'jobs', (
      select coalesce(jsonb_agg(to_jsonb(r) - 'exact' order by r.exact desc,
                                r.scheduled_start desc nulls last, r.created_at desc), '[]'::jsonb)
      from (
        select j.id, j.number, j.type, j.status, j.scheduled_start, j.created_at,
               coalesce(b.name, o.name) as customer_name,
               j.number::text = any (nums) as exact
        from public.job j
        left join public.customer b on b.id = j.bill_to_customer_id
        left join public.property p on p.id = j.property_id
        left join public.customer o on o.id = p.customer_id
        where j.company_id = target_company and j.deleted_at is null
          and (exists (select 1 from unnest(nums) n where j.number::text like n || '%')
               or j.bill_to_customer_id = any (named)
               or p.customer_id = any (named))
        order by exact desc, j.scheduled_start desc nulls last, j.created_at desc
        limit cap) r),
    'quotes', (
      select coalesce(jsonb_agg(to_jsonb(r) - 'exact' order by r.exact desc, r.created_at desc),
                      '[]'::jsonb)
      from (
        select q.id, q.job_id, q.number, q.status, q.total_cents, q.created_at,
               coalesce(b.name, o.name) as customer_name,
               q.number::text = any (nums) as exact
        from public.quote q
        join public.job j on j.id = q.job_id
        left join public.customer b on b.id = j.bill_to_customer_id
        left join public.property p on p.id = j.property_id
        left join public.customer o on o.id = p.customer_id
        where q.company_id = target_company and q.deleted_at is null and j.deleted_at is null
          and (exists (select 1 from unnest(nums) n where q.number::text like n || '%')
               or j.bill_to_customer_id = any (named)
               or p.customer_id = any (named))
        order by exact desc, q.created_at desc
        limit cap) r),
    'invoices', (
      select coalesce(jsonb_agg(to_jsonb(r) - 'exact' order by r.exact desc, r.created_at desc),
                      '[]'::jsonb)
      from (
        select i.id, i.job_id, i.number, i.status, i.total_cents, i.amount_paid_cents,
               i.created_at, coalesce(b.name, o.name) as customer_name,
               i.number::text = any (nums) as exact
        from public.invoice i
        join public.job j on j.id = i.job_id
        left join public.customer b on b.id = j.bill_to_customer_id
        left join public.property p on p.id = j.property_id
        left join public.customer o on o.id = p.customer_id
        where i.company_id = target_company and i.deleted_at is null and j.deleted_at is null
          and (exists (select 1 from unnest(nums) n where i.number::text like n || '%')
               or j.bill_to_customer_id = any (named)
               or p.customer_id = any (named))
        order by exact desc, i.created_at desc
        limit cap) r)
  );
end
$$;

revoke all on function public.search_candidates(uuid, text[], text) from public, anon;
grant execute on function public.search_candidates(uuid, text[], text) to authenticated;
