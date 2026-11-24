-- DRAFT ONLY: avatar store schema and RPCs.
-- Not a production migration. Review and test in an isolated database before promotion.
-- Static image objects must exist at assets/avatars/<image_file> before enabling this catalog.

create table if not exists public.store_avatars (
 id text primary key check (id ~ '^[a-z0-9_]{3,48}$'),
 title text not null check (char_length(title) between 1 and 40),
 category text not null check (category in ('fantasy_free','gulf_paid','regional_paid')),
 image_file text not null unique check (image_file ~ '^[a-z0-9_]+[.]webp$'),
 point_price integer not null check (point_price in (0,100)),
 active boolean not null default true,
 sort_order integer not null default 0
);
insert into public.store_avatars(id,title,category,image_file,point_price,sort_order) values
('fantasy_a_01_01','فانتزی 01','fantasy_free','fantasy_a_01_01.webp',0,1),
('fantasy_a_01_02','فانتزی 02','fantasy_free','fantasy_a_01_02.webp',0,2),
('fantasy_a_01_03','فانتزی 03','fantasy_free','fantasy_a_01_03.webp',0,3),
('fantasy_a_02_01','فانتزی 04','fantasy_free','fantasy_a_02_01.webp',0,4),
('fantasy_a_02_02','فانتزی 05','fantasy_free','fantasy_a_02_02.webp',0,5),
('fantasy_a_02_03','فانتزی 06','fantasy_free','fantasy_a_02_03.webp',0,6),
('fantasy_a_03_01','فانتزی 07','fantasy_free','fantasy_a_03_01.webp',0,7),
('fantasy_a_03_02','فانتزی 08','fantasy_free','fantasy_a_03_02.webp',0,8),
('fantasy_a_03_03','فانتزی 09','fantasy_free','fantasy_a_03_03.webp',0,9),
('gulf_b_01_01','خلیجی 01','gulf_paid','gulf_b_01_01.webp',100,10),
('gulf_b_01_02','خلیجی 02','gulf_paid','gulf_b_01_02.webp',100,11),
('gulf_b_01_03','خلیجی 03','gulf_paid','gulf_b_01_03.webp',100,12),
('gulf_b_01_04','خلیجی 04','gulf_paid','gulf_b_01_04.webp',100,13),
('gulf_b_01_05','خلیجی 05','gulf_paid','gulf_b_01_05.webp',100,14),
('gulf_b_02_01','خلیجی 06','gulf_paid','gulf_b_02_01.webp',100,15),
('gulf_b_02_02','خلیجی 07','gulf_paid','gulf_b_02_02.webp',100,16),
('gulf_b_02_03','خلیجی 08','gulf_paid','gulf_b_02_03.webp',100,17),
('gulf_b_02_04','خلیجی 09','gulf_paid','gulf_b_02_04.webp',100,18),
('gulf_b_02_05','خلیجی 10','gulf_paid','gulf_b_02_05.webp',100,19),
('gulf_b_03_01','خلیجی 11','gulf_paid','gulf_b_03_01.webp',100,20),
('gulf_b_03_02','خلیجی 12','gulf_paid','gulf_b_03_02.webp',100,21),
('gulf_b_03_03','خلیجی 13','gulf_paid','gulf_b_03_03.webp',100,22),
('gulf_b_03_04','خلیجی 14','gulf_paid','gulf_b_03_04.webp',100,23),
('gulf_b_03_05','خلیجی 15','gulf_paid','gulf_b_03_05.webp',100,24),
('regional_c_01_01','منطقه‌ای 01','regional_paid','regional_c_01_01.webp',100,25),
('regional_c_01_02','منطقه‌ای 02','regional_paid','regional_c_01_02.webp',100,26),
('regional_c_01_03','منطقه‌ای 03','regional_paid','regional_c_01_03.webp',100,27),
('regional_c_01_04','منطقه‌ای 04','regional_paid','regional_c_01_04.webp',100,28),
('regional_c_01_05','منطقه‌ای 05','regional_paid','regional_c_01_05.webp',100,29),
('regional_c_01_06','منطقه‌ای 06','regional_paid','regional_c_01_06.webp',100,30),
('regional_c_02_01','منطقه‌ای 07','regional_paid','regional_c_02_01.webp',100,31),
('regional_c_02_02','منطقه‌ای 08','regional_paid','regional_c_02_02.webp',100,32),
('regional_c_02_03','منطقه‌ای 09','regional_paid','regional_c_02_03.webp',100,33),
('regional_c_02_04','منطقه‌ای 10','regional_paid','regional_c_02_04.webp',100,34),
('regional_c_02_05','منطقه‌ای 11','regional_paid','regional_c_02_05.webp',100,35),
('regional_c_02_06','منطقه‌ای 12','regional_paid','regional_c_02_06.webp',100,36),
('regional_c_03_01','منطقه‌ای 13','regional_paid','regional_c_03_01.webp',100,37),
('regional_c_03_02','منطقه‌ای 14','regional_paid','regional_c_03_02.webp',100,38),
('regional_c_03_03','منطقه‌ای 15','regional_paid','regional_c_03_03.webp',100,39),
('regional_c_03_04','منطقه‌ای 16','regional_paid','regional_c_03_04.webp',100,40),
('regional_c_03_05','منطقه‌ای 17','regional_paid','regional_c_03_05.webp',100,41),
('regional_c_03_06','منطقه‌ای 18','regional_paid','regional_c_03_06.webp',100,42),
('fantasy_d_01_01','فانتزی 10','fantasy_free','fantasy_d_01_01.webp',0,43),
('fantasy_d_01_02','فانتزی 11','fantasy_free','fantasy_d_01_02.webp',0,44),
('fantasy_d_01_03','فانتزی 12','fantasy_free','fantasy_d_01_03.webp',0,45),
('fantasy_d_01_04','فانتزی 13','fantasy_free','fantasy_d_01_04.webp',0,46),
('fantasy_d_01_05','فانتزی 14','fantasy_free','fantasy_d_01_05.webp',0,47),
('fantasy_d_01_06','فانتزی 15','fantasy_free','fantasy_d_01_06.webp',0,48),
('fantasy_d_02_01','فانتزی 16','fantasy_free','fantasy_d_02_01.webp',0,49),
('fantasy_d_02_02','فانتزی 17','fantasy_free','fantasy_d_02_02.webp',0,50),
('fantasy_d_02_03','فانتزی 18','fantasy_free','fantasy_d_02_03.webp',0,51),
('fantasy_d_02_04','فانتزی 19','fantasy_free','fantasy_d_02_04.webp',0,52),
('fantasy_d_02_05','فانتزی 20','fantasy_free','fantasy_d_02_05.webp',0,53),
('fantasy_d_02_06','فانتزی 21','fantasy_free','fantasy_d_02_06.webp',0,54),
('fantasy_d_03_01','فانتزی 22','fantasy_free','fantasy_d_03_01.webp',0,55),
('fantasy_d_03_02','فانتزی 23','fantasy_free','fantasy_d_03_02.webp',0,56),
('fantasy_d_03_03','فانتزی 24','fantasy_free','fantasy_d_03_03.webp',0,57),
('fantasy_d_03_04','فانتزی 25','fantasy_free','fantasy_d_03_04.webp',0,58),
('fantasy_d_03_05','فانتزی 26','fantasy_free','fantasy_d_03_05.webp',0,59),
('fantasy_d_03_06','فانتزی 27','fantasy_free','fantasy_d_03_06.webp',0,60)
on conflict(id) do update set title=excluded.title,category=excluded.category,
 image_file=excluded.image_file,point_price=excluded.point_price,active=true,sort_order=excluded.sort_order;

create table if not exists public.player_avatar_ownership (
 user_id uuid not null references auth.users(id) on delete cascade,
 avatar_id text not null references public.store_avatars(id),
 acquired_at timestamptz not null default now(),
 primary key(user_id,avatar_id)
);
alter table public.player_profiles
 add column if not exists equipped_avatar_id text;
do $
begin
 if not exists(select 1 from pg_constraint where conname='player_profiles_equipped_avatar_fk'
   and conrelid='public.player_profiles'::regclass) then
  alter table public.player_profiles add constraint player_profiles_equipped_avatar_fk
   foreign key(equipped_avatar_id) references public.store_avatars(id) on delete set null;
 end if;
end $;
alter table public.player_profiles enable row level security;
alter table public.store_avatars enable row level security;
alter table public.player_avatar_ownership enable row level security;
revoke all on public.store_avatars,public.player_avatar_ownership from anon,authenticated;
-- No direct table access: all reads and writes go through the guarded RPCs below.

create or replace function public.get_avatar_store_catalog()
returns jsonb language plpgsql stable security definer
set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid(); result jsonb;
begin
 if uid is null then raise exception 'account_login_required'; end if;
 select jsonb_build_object(
  'points',coalesce((select points from public.player_profiles where user_id=uid),0),
  'equipped', (select equipped_avatar_id from public.player_profiles where user_id=uid),
  'items',coalesce((select jsonb_agg(jsonb_build_object(
    'id',a.id,'title',a.title,'category',a.category,'image_file',a.image_file,
    'image_url','./assets/avatars/'||a.image_file,'price',a.point_price,
    'owned',(a.point_price=0 or exists(select 1 from public.player_avatar_ownership o where o.user_id=uid and o.avatar_id=a.id))
   ) order by a.sort_order,a.id) from public.store_avatars a where a.active),'[]'::jsonb)
 ) into result;
 return result;
end; $$;
revoke all on function public.get_avatar_store_catalog() from public,anon;
grant execute on function public.get_avatar_store_catalog() to authenticated;

create or replace function public.purchase_avatar(p_avatar_id text)
returns jsonb language plpgsql security definer
set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid(); item public.store_avatars%rowtype; balance bigint;
begin
 if uid is null then raise exception 'account_login_required'; end if;
 if coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'permanent_account_required'; end if;
 select * into item from public.store_avatars where id=p_avatar_id and active for share;
 if not found then raise exception 'store_item_unavailable'; end if;
 if item.point_price=0 then return jsonb_build_object('purchased',false,'free_item',true,'points',
   coalesce((select points from public.player_profiles where user_id=uid),0)); end if;
 insert into public.player_profiles(user_id) values(uid) on conflict(user_id) do nothing;
 select points into balance from public.player_profiles where user_id=uid for update;
 if exists(select 1 from public.player_avatar_ownership where user_id=uid and avatar_id=p_avatar_id) then
  return jsonb_build_object('purchased',false,'already_owned',true,'points',balance);
 end if;
 if balance<item.point_price then raise exception 'not_enough_points'; end if;
 update public.player_profiles set points=points-item.point_price,updated_at=now()
  where user_id=uid returning points into balance;
 insert into public.player_avatar_ownership(user_id,avatar_id) values(uid,p_avatar_id);
 return jsonb_build_object('purchased',true,'already_owned',false,'points',balance,'avatar_id',p_avatar_id);
end; $$;
revoke all on function public.purchase_avatar(text) from public,anon;
grant execute on function public.purchase_avatar(text) to authenticated;

create or replace function public.equip_avatar(p_avatar_id text)
returns jsonb language plpgsql security definer
set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid(); item public.store_avatars%rowtype;
begin
 if uid is null then raise exception 'account_login_required'; end if;
 select * into item from public.store_avatars where id=p_avatar_id and active;
 if not found then raise exception 'avatar_unavailable'; end if;
 if item.point_price>0 and not exists(
  select 1 from public.player_avatar_ownership where user_id=uid and avatar_id=p_avatar_id
 ) then raise exception 'avatar_not_owned'; end if;
 insert into public.player_profiles(user_id) values(uid) on conflict(user_id) do nothing;
 update public.player_profiles set equipped_avatar_id=p_avatar_id,updated_at=now()
  where user_id=uid;
 return jsonb_build_object('equipped',p_avatar_id);
end; $$;
revoke all on function public.equip_avatar(text) from public,anon;
grant execute on function public.equip_avatar(text) to authenticated;
