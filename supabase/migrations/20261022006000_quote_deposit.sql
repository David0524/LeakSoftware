-- A quote's own deposit (owner, 2026-11-27: "Allow the owner to adjust the deposit settings
-- within the quote/invoice pages", chose "Change it per quote"). quote.deposit_rule already
-- existed (null = the shop's default from settings, frozen by send_quote); owners and admins now
-- set it on a draft from the Quote screen (core quote-deposit.ts). Techs can't: like the
-- discount limit, how much a customer pays up front is the office's call. The server's own
-- writes (send_quote freezing the rule, app.quote_server) and signed-out server code pass.

create function app.guard_quote_deposit() returns trigger
language plpgsql security definer set search_path = public, app, pg_temp as $$
begin
  if auth.uid() is null or current_setting('app.quote_server', true) = 'on' then
    return new;
  end if;
  if (tg_op = 'INSERT' and new.deposit_rule is not null)
     or (tg_op = 'UPDATE' and new.deposit_rule is distinct from old.deposit_rule) then
    if not app.is_manager(new.company_id) then
      raise exception 'Only owners and admins can change a quote''s deposit'
        using errcode = 'insufficient_privilege';
    end if;
  end if;
  return new;
end
$$;
revoke all on function app.guard_quote_deposit() from public;
create trigger guard_quote_deposit before insert or update of deposit_rule on public.quote
  for each row execute function app.guard_quote_deposit();
