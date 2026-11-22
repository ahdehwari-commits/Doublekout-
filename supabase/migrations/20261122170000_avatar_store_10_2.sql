-- Double Kout 10.2: server-authoritative avatar store
-- Apply only after reviewing the matching source branch and backup.
create table if not exists public.store_avatars (
  id text primary key,
  title text not null,
  category text not null check (category in ('gulf','fantasy')),
  point_price integer not null default 0 check (point_price >= 0),
  is_free boolean not null default false,
  asset_path text not null,
  active boolean not null default true,
  sort_order integer not null default 0,
  constraint store_avatars_price_policy check (
    (is_free = true and point_price = 0) or
    (is_free = false and point_price > 0)
  )
);

create table if not exists public.player_avatar_ownership (
  user_id uuid not null references auth.users(id) on delete cascade,
  avatar_id text not null references public.store_avatars(id) on delete restrict,
  acquired_at timestamptz not null default now(),
  price_paid integer not null default 0 check (price_paid >= 0),
  primary key (user_id, avatar_id)
);

alter table public.player_profiles
  add column if not exists avatar_id text references public.store_avatars(id) on delete set null;

create index if not exists player_avatar_ownership_avatar_idx
  on public.player_avatar_ownership(avatar_id);

alter table public.store_avatars enable row level security;
alter table public.player_avatar_ownership enable row level security;
drop policy if exists store_avatars_read_active on public.store_avatars;
create policy store_avatars_read_active on public.store_avatars
  for select to authenticated using (active);
drop policy if exists player_avatar_ownership_deny_direct on public.player_avatar_ownership;
create policy player_avatar_ownership_deny_direct on public.player_avatar_ownership
  for all to anon, authenticated using (false) with check (false);

insert into public.store_avatars(id,title,category,point_price,is_free,asset_path,sort_order)
select
  'gulf-'||lpad(n::text,2,'0'),
  'آواتار خلیجی '||n,
  'gulf',
  80,
  false,
  './assets/avatars/gulf-'||lpad(n::text,2,'0')||'.webp',
  n
from generate_series(1,18) as n
on conflict (id) do update set
  title=excluded.title, category=excluded.category,
  point_price=excluded.point_price, is_free=excluded.is_free,
  asset_path=excluded.asset_path, active=true, sort_order=excluded.sort_order;

insert into public.store_avatars(id,title,category,point_price,is_free,asset_path,sort_order)
select
  'fantasy-'||lpad(n::text,2,'0'),
  'آواتار فانتزی '||n,
  'fantasy',
  0,
  true,
  './assets/avatars/fantasy-'||lpad(n::text,2,'0')||'.webp',
  100+n
from generate_series(1,18) as n
on conflict (id) do update set
  title=excluded.title, category=excluded.category,
  point_price=excluded.point_price, is_free=excluded.is_free,
  asset_path=excluded.asset_path, active=true, sort_order=excluded.sort_order;

create or replace function public.get_avatar_catalog()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare uid uuid := auth.uid(); result jsonb;
begin
  if uid is null then raise exception 'account_login_required'; end if;
  select jsonb_build_object(
    'points', coalesce((select points from public.player_profiles where user_id=uid),0),
    'equipped', (select avatar_id from public.player_profiles where user_id=uid),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',a.id,'title',a.title,'category',a.category,
        'price',a.point_price,'free',a.is_free,'asset_path',a.asset_path,
        'owned',(a.is_free or exists(
          select 1 from public.player_avatar_ownership o
          where o.user_id=uid and o.avatar_id=a.id
        ))
      ) order by a.sort_order,a.id)
      from public.store_avatars a where a.active
    ),'[]'::jsonb)
  ) into result;
  return result;
end;
$$;

create or replace function public.purchase_avatar(p_avatar_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
  item public.store_avatars%rowtype;
  balance bigint;
begin
  if uid is null then raise exception 'account_login_required'; end if;
  if coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then
    raise exception 'permanent_account_required';
  end if;
  select * into item from public.store_avatars
    where id=p_avatar_id and active for share;
  if not found then raise exception 'avatar_unavailable'; end if;

  insert into public.player_profiles(user_id) values(uid)
    on conflict(user_id) do nothing;
  select points into balance from public.player_profiles
    where user_id=uid for update;

  if exists(select 1 from public.player_avatar_ownership
            where user_id=uid and avatar_id=p_avatar_id) then
    return jsonb_build_object('purchased',false,'already_owned',true,'points',balance);
  end if;

  if not item.is_free and balance < item.point_price then
    raise exception 'not_enough_points';
  end if;

  if not item.is_free then
    update public.player_profiles
      set points=points-item.point_price, updated_at=now()
      where user_id=uid returning points into balance;
    insert into public.point_ledger(user_id,delta,balance_after,reason,actor_id)
      values(uid,-item.point_price,balance,'avatar_purchase:'||item.id,uid);
  end if;

  insert into public.player_avatar_ownership(user_id,avatar_id,price_paid)
    values(uid,item.id,case when item.is_free then 0 else item.point_price end);

  return jsonb_build_object(
    'purchased',true,'already_owned',false,'points',balance,
    'avatar_id',item.id,'asset_path',item.asset_path
  );
end;
$$;

create or replace function public.equip_avatar(p_avatar_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare uid uuid := auth.uid(); item public.store_avatars%rowtype;
begin
  if uid is null then raise exception 'account_login_required'; end if;
  select * into item from public.store_avatars
    where id=p_avatar_id and active;
  if not found then raise exception 'avatar_unavailable'; end if;

  if item.is_free then
    insert into public.player_avatar_ownership(user_id,avatar_id,price_paid)
      values(uid,item.id,0) on conflict(user_id,avatar_id) do nothing;
  elsif not exists (
    select 1 from public.player_avatar_ownership
    where user_id=uid and avatar_id=item.id
  ) then
    raise exception 'avatar_not_owned';
  end if;

  insert into public.player_profiles(user_id,avatar_id)
    values(uid,item.id)
    on conflict(user_id) do update
      set avatar_id=excluded.avatar_id,updated_at=now();

  return jsonb_build_object('equipped',item.id,'asset_path',item.asset_path);
end;
$$;

revoke all on function public.get_avatar_catalog() from public, anon;
revoke all on function public.purchase_avatar(text) from public, anon;
revoke all on function public.equip_avatar(text) from public, anon;
grant execute on function public.get_avatar_catalog() to authenticated, service_role;
grant execute on function public.purchase_avatar(text) to authenticated, service_role;
grant execute on function public.equip_avatar(text) to authenticated, service_role;


-- Include the selected account avatar in the lobby roster payload.
create or replace function public.get_room_roster(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_result jsonb;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  if not exists (
    select 1 from public.room_members
    where room_id = p_room_id and user_id = v_user
  ) then raise exception 'not_a_room_member'; end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'seat', m.seat,
        'display_name', m.display_name,
        'is_host', m.is_host,
        'ready', m.ready,
        'user_id', m.user_id,
        'points', coalesce(p.points, 0),
        'wins', coalesce(p.wins, 0),
        'avatar_id', p.avatar_id,
        'avatar_asset_path', a.asset_path
      ) order by m.seat
    ),
    '[]'::jsonb
  )
  into v_result
  from public.room_members m
  left join public.player_profiles p on p.user_id = m.user_id
  left join public.store_avatars a on a.id = p.avatar_id and a.active
  where m.room_id = p_room_id;
  return v_result;
end;
$$;
