-- Double Kout 10.1 cosmetics catalog: premium Gulf avatars, free fantasy avatars,
-- server-authoritative ownership/equipment, and auditable shared-point spending.
begin;

alter table public.player_profiles
  add column if not exists equipped_avatar_id text;

create table if not exists public.game_avatars (
  id text primary key,
  title text not null,
  category text not null check (category in ('gulf','fantasy')),
  point_price integer not null default 0 check (point_price >= 0),
  asset_path text not null,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create table if not exists public.player_avatar_ownership (
  user_id uuid not null references auth.users(id) on delete cascade,
  avatar_id text not null references public.game_avatars(id) on delete restrict,
  acquired_at timestamptz not null default now(),
  primary key(user_id, avatar_id)
);
create index if not exists player_avatar_ownership_avatar_idx
  on public.player_avatar_ownership(avatar_id);

alter table public.game_avatars enable row level security;
alter table public.player_avatar_ownership enable row level security;
drop policy if exists deny_direct_api_access on public.game_avatars;
create policy deny_direct_api_access on public.game_avatars for all using (false) with check (false);
drop policy if exists deny_direct_api_access on public.player_avatar_ownership;
create policy deny_direct_api_access on public.player_avatar_ownership for all using (false) with check (false);

insert into public.game_avatars(id,title,category,point_price,asset_path,sort_order)
values
('gulf-01','آواتار خلیجی 1','gulf',100,'avatars/gulf-01.webp',1),
('gulf-02','آواتار خلیجی 2','gulf',100,'avatars/gulf-02.webp',2),
('gulf-03','آواتار خلیجی 3','gulf',100,'avatars/gulf-03.webp',3),
('gulf-04','آواتار خلیجی 4','gulf',100,'avatars/gulf-04.webp',4),
('gulf-05','آواتار خلیجی 5','gulf',100,'avatars/gulf-05.webp',5),
('gulf-06','آواتار خلیجی 6','gulf',100,'avatars/gulf-06.webp',6),
('gulf-07','آواتار خلیجی 7','gulf',100,'avatars/gulf-07.webp',7),
('gulf-08','آواتار خلیجی 8','gulf',100,'avatars/gulf-08.webp',8),
('gulf-09','آواتار خلیجی 9','gulf',100,'avatars/gulf-09.webp',9),
('gulf-10','آواتار خلیجی 10','gulf',100,'avatars/gulf-10.webp',10),
('gulf-11','آواتار خلیجی 11','gulf',100,'avatars/gulf-11.webp',11),
('gulf-12','آواتار خلیجی 12','gulf',100,'avatars/gulf-12.webp',12),
('gulf-13','آواتار خلیجی 13','gulf',100,'avatars/gulf-13.webp',13),
('gulf-14','آواتار خلیجی 14','gulf',100,'avatars/gulf-14.webp',14),
('gulf-15','آواتار خلیجی 15','gulf',100,'avatars/gulf-15.webp',15),
('gulf-16','آواتار خلیجی 16','gulf',100,'avatars/gulf-16.webp',16),
('gulf-17','آواتار خلیجی 17','gulf',100,'avatars/gulf-17.webp',17),
('gulf-18','آواتار خلیجی 18','gulf',100,'avatars/gulf-18.webp',18),
('fantasy-01','آواتار فانتزی 1','fantasy',0,'avatars/fantasy-01.webp',19),
('fantasy-02','آواتار فانتزی 2','fantasy',0,'avatars/fantasy-02.webp',20),
('fantasy-03','آواتار فانتزی 3','fantasy',0,'avatars/fantasy-03.webp',21),
('fantasy-04','آواتار فانتزی 4','fantasy',0,'avatars/fantasy-04.webp',22),
('fantasy-05','آواتار فانتزی 5','fantasy',0,'avatars/fantasy-05.webp',23),
('fantasy-06','آواتار فانتزی 6','fantasy',0,'avatars/fantasy-06.webp',24),
('fantasy-07','آواتار فانتزی 7','fantasy',0,'avatars/fantasy-07.webp',25),
('fantasy-08','آواتار فانتزی 8','fantasy',0,'avatars/fantasy-08.webp',26),
('fantasy-09','آواتار فانتزی 9','fantasy',0,'avatars/fantasy-09.webp',27),
('fantasy-10','آواتار فانتزی 10','fantasy',0,'avatars/fantasy-10.webp',28),
('fantasy-11','آواتار فانتزی 11','fantasy',0,'avatars/fantasy-11.webp',29),
('fantasy-12','آواتار فانتزی 12','fantasy',0,'avatars/fantasy-12.webp',30),
('fantasy-13','آواتار فانتزی 13','fantasy',0,'avatars/fantasy-13.webp',31),
('fantasy-14','آواتار فانتزی 14','fantasy',0,'avatars/fantasy-14.webp',32),
('fantasy-15','آواتار فانتزی 15','fantasy',0,'avatars/fantasy-15.webp',33),
('fantasy-16','آواتار فانتزی 16','fantasy',0,'avatars/fantasy-16.webp',34),
('fantasy-17','آواتار فانتزی 17','fantasy',0,'avatars/fantasy-17.webp',35),
('fantasy-18','آواتار فانتزی 18','fantasy',0,'avatars/fantasy-18.webp',36)
on conflict(id) do update set title=excluded.title,category=excluded.category,point_price=excluded.point_price,asset_path=excluded.asset_path,active=true,sort_order=excluded.sort_order;

-- Keep the basic blue design free; raise premium card-back prices to a consistent progression.
update public.store_card_backs set point_price=case id
 when 'classic-blue' then 0
 when 'black-gold' then 80
 when 'emerald' then 120
 when 'ruby' then 160
 when 'violet' then 200
 else point_price end;

create or replace function public.get_store_catalog()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public','pg_temp'
as $function$
declare uid uuid:=auth.uid(); result jsonb;
begin
 if uid is null then raise exception 'account_login_required'; end if;
 select jsonb_build_object(
  'points',coalesce((select points from public.player_profiles where user_id=uid),0),
  'equipped',coalesce((select equipped_card_back from public.player_profiles where user_id=uid),'classic-blue'),
  'equipped_avatar', (select equipped_avatar_id from public.player_profiles where user_id=uid),
  'items',coalesce((select jsonb_agg(jsonb_build_object(
    'id',s.id,'title',s.title,'description',s.description,'price',s.point_price,
    'theme',s.theme,'owned',exists(select 1 from public.player_card_back_ownership o where o.user_id=uid and o.card_back_id=s.id)
   ) order by s.sort_order,s.id) from public.store_card_backs s where s.active),'[]'::jsonb),
  'avatars',coalesce((select jsonb_agg(jsonb_build_object(
    'id',a.id,'title',a.title,'category',a.category,'price',a.point_price,'asset_path',a.asset_path,
    'owned',exists(select 1 from public.player_avatar_ownership o where o.user_id=uid and o.avatar_id=a.id)
   ) order by a.sort_order,a.id) from public.game_avatars a where a.active),'[]'::jsonb)
 ) into result;
 return result;
end;
$function$;

create or replace function public.purchase_card_back(p_card_back_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare uid uuid:=auth.uid(); item public.store_card_backs%rowtype; balance bigint;
begin
 if uid is null then raise exception 'account_login_required'; end if;
 if coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'permanent_account_required'; end if;
 select * into item from public.store_card_backs where id=p_card_back_id and active for share;
 if not found then raise exception 'store_item_unavailable'; end if;
 insert into public.player_profiles(user_id) values(uid) on conflict(user_id) do nothing;
 select points into balance from public.player_profiles where user_id=uid for update;
 if exists(select 1 from public.player_card_back_ownership where user_id=uid and card_back_id=p_card_back_id) then
  return jsonb_build_object('purchased',false,'already_owned',true,'points',balance);
 end if;
 if balance<item.point_price then raise exception 'not_enough_points'; end if;
 update public.player_profiles set points=points-item.point_price,updated_at=now() where user_id=uid returning points into balance;
 insert into public.player_card_back_ownership(user_id,card_back_id) values(uid,p_card_back_id);
 if item.point_price>0 then
  insert into public.point_ledger(user_id,delta,balance_after,reason,actor_id)
  values(uid,-item.point_price,balance,'store:card_back:'||item.id,uid);
 end if;
 return jsonb_build_object('purchased',true,'already_owned',false,'points',balance,'item_id',p_card_back_id);
end;
$function$;

create or replace function public.purchase_avatar(p_avatar_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare uid uuid:=auth.uid(); item public.game_avatars%rowtype; balance bigint;
begin
 if uid is null then raise exception 'account_login_required'; end if;
 select * into item from public.game_avatars where id=p_avatar_id and active for share;
 if not found then raise exception 'avatar_unavailable'; end if;
 if item.point_price>0 and coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'permanent_account_required'; end if;
 insert into public.player_profiles(user_id) values(uid) on conflict(user_id) do nothing;
 select points into balance from public.player_profiles where user_id=uid for update;
 if exists(select 1 from public.player_avatar_ownership where user_id=uid and avatar_id=p_avatar_id) then
  return jsonb_build_object('purchased',false,'already_owned',true,'points',balance);
 end if;
 if balance<item.point_price then raise exception 'not_enough_points'; end if;
 update public.player_profiles set points=points-item.point_price,updated_at=now() where user_id=uid returning points into balance;
 insert into public.player_avatar_ownership(user_id,avatar_id) values(uid,p_avatar_id);
 if item.point_price>0 then
  insert into public.point_ledger(user_id,delta,balance_after,reason,actor_id)
  values(uid,-item.point_price,balance,'store:avatar:'||item.id,uid);
 end if;
 return jsonb_build_object('purchased',true,'already_owned',false,'points',balance,'avatar_id',p_avatar_id);
end;
$function$;

create or replace function public.equip_avatar(p_avatar_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare uid uuid:=auth.uid();
begin
 if uid is null then raise exception 'account_login_required'; end if;
 if not exists(select 1 from public.player_avatar_ownership where user_id=uid and avatar_id=p_avatar_id) then
  raise exception 'avatar_not_owned';
 end if;
 update public.player_profiles set equipped_avatar_id=p_avatar_id,updated_at=now() where user_id=uid;
 return jsonb_build_object('equipped_avatar',p_avatar_id);
end;
$function$;

revoke all on function public.get_store_catalog() from public, anon;
revoke all on function public.purchase_card_back(text) from public, anon;
revoke all on function public.purchase_avatar(text) from public, anon;
revoke all on function public.equip_avatar(text) from public, anon;
grant execute on function public.get_store_catalog() to authenticated;
grant execute on function public.purchase_card_back(text) to authenticated;
grant execute on function public.purchase_avatar(text) to authenticated;
grant execute on function public.equip_avatar(text) to authenticated;

create or replace function public.get_room_roster(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_user uuid := auth.uid();
  v_result jsonb;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  if not exists (select 1 from public.room_members where room_id=p_room_id and user_id=v_user) then
    raise exception 'not_a_room_member';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'seat',m.seat,'display_name',m.display_name,'is_host',m.is_host,'ready',m.ready,
    'user_id',m.user_id,'points',coalesce(p.points,0),'wins',coalesce(p.wins,0),
    'avatar_id',p.equipped_avatar_id
  ) order by m.seat),'[]'::jsonb)
  into v_result
  from public.room_members m
  left join public.player_profiles p on p.user_id=m.user_id
  where m.room_id=p_room_id;
  return v_result;
end;
$function$;
revoke all on function public.get_room_roster(uuid) from public,anon;
grant execute on function public.get_room_roster(uuid) to authenticated;

commit;
