-- 0021_phase5_loyalty_rpc.sql

create or replace function public.complete_booking_with_loyalty(
  p_booking_id     uuid,
  p_bill_idr       int,
  p_redemption_ids uuid[]
) returns jsonb
  language plpgsql
  security invoker
  set search_path = public, pg_temp
as $$
declare
  v_booking         record;
  v_customer        record;
  v_org             record;
  v_points_earned   int;
  v_total_redeemed  int := 0;
  v_new_balance     int;
  v_new_lifetime    int;
  v_new_tier_id     uuid;
  v_reward          record;
  v_customer_tier_index int;
begin
  -- 1. Load booking, customer, org config under RLS
  select * into v_booking from public.bookings where id = p_booking_id;
  if not found then
    raise exception 'booking_not_found' using errcode = 'P0001';
  end if;
  if v_booking.status not in ('confirmed', 'seated') then
    raise exception 'booking_not_completable' using errcode = 'P0001';
  end if;

  select * into v_customer from public.customers where id = v_booking.customer_id;
  select * into v_org      from public.organizations where id = v_booking.organization_id;

  if not v_customer.is_member then
    raise exception 'customer_not_member' using errcode = 'P0001';
  end if;
  if not v_org.loyalty_enabled then
    raise exception 'loyalty_disabled' using errcode = 'P0001';
  end if;

  -- 2. Compute earn
  v_points_earned := floor(p_bill_idr::numeric / v_org.loyalty_earn_rate_idr_per_point);

  -- 3. Validate each requested redemption + sum cost
  select tier_index into v_customer_tier_index
    from public.loyalty_tiers where id = v_customer.current_tier_id;
  if v_customer_tier_index is null then v_customer_tier_index := 0; end if;

  for v_reward in
    select r.id, r.points_cost, r.min_tier_index, r.is_active, r.name, r.type, r.type_value
    from public.loyalty_rewards r
    where r.id = any(p_redemption_ids)
      and r.organization_id = v_booking.organization_id
  loop
    if not v_reward.is_active then
      raise exception 'reward_inactive: %', v_reward.name using errcode = 'P0001';
    end if;
    if v_customer_tier_index < v_reward.min_tier_index then
      raise exception 'reward_tier_locked: %', v_reward.name using errcode = 'P0001';
    end if;
    v_total_redeemed := v_total_redeemed + v_reward.points_cost;
  end loop;

  if v_total_redeemed > v_customer.points_balance then
    raise exception 'insufficient_balance' using errcode = 'P0001';
  end if;

  -- 4. Insert earn ledger row
  insert into public.loyalty_transactions
    (organization_id, customer_id, booking_id, bill_idr, points_earned,
     earn_rate_idr_per_point, created_by)
  values
    (v_booking.organization_id, v_customer.id, v_booking.id, p_bill_idr, v_points_earned,
     v_org.loyalty_earn_rate_idr_per_point, auth.uid());

  -- 5. Insert one redemption row per selected reward (snapshot reward fields)
  insert into public.loyalty_redemptions
    (organization_id, customer_id, reward_id, reward_name, reward_type, reward_type_value,
     points_spent, booking_id, status, created_by)
  select
    v_booking.organization_id, v_customer.id, r.id, r.name, r.type, r.type_value,
    r.points_cost, v_booking.id, 'applied', auth.uid()
  from public.loyalty_rewards r
  where r.id = any(p_redemption_ids);

  -- 6. Update customer counters + derived tier
  v_new_balance  := v_customer.points_balance  + v_points_earned - v_total_redeemed;
  v_new_lifetime := v_customer.points_lifetime + v_points_earned;
  select id into v_new_tier_id
    from public.loyalty_tiers
    where organization_id = v_booking.organization_id
      and min_points_lifetime <= v_new_lifetime
    order by tier_index desc limit 1;

  update public.customers
    set points_balance  = v_new_balance,
        points_lifetime = v_new_lifetime,
        current_tier_id = v_new_tier_id
    where id = v_customer.id;

  -- 7. Mark booking completed
  update public.bookings
    set status = 'completed', completed_at = now()
    where id = v_booking.id;

  return jsonb_build_object(
    'points_earned',   v_points_earned,
    'points_redeemed', v_total_redeemed,
    'new_balance',     v_new_balance,
    'new_lifetime',    v_new_lifetime,
    'new_tier_id',     v_new_tier_id
  );
end;
$$;

revoke all on function public.complete_booking_with_loyalty(uuid, int, uuid[]) from public, anon;
grant execute on function public.complete_booking_with_loyalty(uuid, int, uuid[]) to authenticated;
