alter table public.subscriptions
  add column direction text not null default 'out'
  check (direction in ('in', 'out'));

create or replace function public.generate_due_subscription_charges()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_count integer := 0;
  next_date date;
  anchor_day integer;
  iteration_count integer;
  subscription record;
begin
  for subscription in
    select * from public.subscriptions
    where active and next_charge_on <= current_date
    for update
  loop
    next_date := subscription.next_charge_on;
    anchor_day := extract(day from subscription.started_on)::integer;
    iteration_count := 0;

    while next_date <= current_date and iteration_count < 240 loop
      insert into public.finances
        (label, amount, direction, category, category_id, occurred_on, created_by, subscription_id)
      values
        (subscription.label, subscription.amount, subscription.direction,
         subscription.category, subscription.category_id, next_date,
         subscription.created_by, subscription.id)
      on conflict (subscription_id, occurred_on) where subscription_id is not null do nothing;

      if found then
        created_count := created_count + 1;
      end if;

      next_date := public.add_billing_period(next_date, anchor_day, subscription.billing_interval);
      iteration_count := iteration_count + 1;
    end loop;

    update public.subscriptions set next_charge_on = next_date where id = subscription.id;
  end loop;
  return created_count;
end;
$$;

revoke all on function public.generate_due_subscription_charges() from public, anon, authenticated;
