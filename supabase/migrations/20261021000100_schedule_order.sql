-- The order of techs on the Schedule (owner, 2026-10-21: "Make a way to reorder techs in the
-- schedule"; docs/design/2026-10-21-tech-order.md).
--
--   membership.schedule_order  a person's place on the Schedule and Today's Whose Day, 1 first.
--                              Owners and admins set it from Reorder Techs, like a tech's
--                              color. Null: never placed; those people follow everyone placed,
--                              in the old order (packages/core scheduleOrder).

alter table public.membership
  add column schedule_order integer check (schedule_order between 1 and 10000);

-- ---------------------------------------------------------------------------
-- Access, from the registry (as 20261012007900_team_colors.sql): devices write it, managers
-- only (the table's write role), like membership.color.
-- ---------------------------------------------------------------------------

do $$
declare
  add_cols jsonb := $json${
    "membership": {"insert": [], "update": ["schedule_order"]}
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

-- No new policies (membership's write role is unchanged); kept per the foundation's rule.
select app.speed_up_policies();
