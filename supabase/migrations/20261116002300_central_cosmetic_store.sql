-- Central cosmetic store. Point purchases are atomic and server-authoritative.
alter table public.player_profiles
 add column if not exists equipped_card_back text not null default 'classic-blue';

create table if not exists public.store_card_backs (
 id text primary key check(char_length(id) between 3 and 40),
 title text not null check(char_length(title) between 1 and 40),
 description text not null default '',
 point_price integer not null check(point_price>=0),
 theme text not null check(theme in ('blue-gold','black-gold','emerald','ruby','violet')),
 active boolean not null default true,
 sort_order integer not null default 0
);
insert into public.store_card_backs(id,title,description,point_price,theme,sort_order) values
 ('classic-blue','آبی سلطنتی','طرح کلاسیک با قاب طلایی',0,'blue-gold',1),
 ('black-gold','مشکی طلایی','طرح لوکس با نقش طلایی',25,'black-gold',2),
 ('emerald','زمردی','سبز زمردی با حاشیه طلایی',40,'emerald',3),
 ('ruby','یاقوتی','قرمز یاقوتی با نقش ظریف',60,'ruby',4),
 ('violet','بنفش سلطنتی','بنفش تیره با قاب طلایی',80,'violet',5)
on conflict(id) do update set title=excluded.title,description=excluded.description,
 point_price=excluded.point_price,theme=excluded.theme,active=true,sort_order=excluded.sort_order;

create table if not exists public.player_card_back_ownership (
 user_id uuid not null references auth.users(id) on delete cascade,
 card_back_id text not null references public.store_card_backs(id),
 acquired_at timestamptz not null default now(),
 primary key(user_id,card_back_id)
);
alter table public.store_card_backs enable row level security;
alter table public.player_card_back_ownership enable row level security;
revoke all on public.store_card_backs,public.player_card_back_ownership from anon,authenticated;
grant select on public.store_card_backs to authenticated;
create policy "authenticated users read active card backs" on public.store_card_backs
 for select to authenticated using(active);

create or replace function public.get_store_catalog()
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid(); result jsonb;
begin
 if uid is null then raise exception 'account_login_required'; end if;
 select jsonb_build_object(
  'points',coalesce((select points from public.player_profiles where user_id=uid),0),
  'equipped',coalesce((select equipped_card_back from public.player_profiles where user_id=uid),'classic-blue'),
  'items',coalesce((select jsonb_agg(jsonb_build_object(
    'id',s.id,'title',s.title,'description',s.description,'price',s.point_price,
    'theme',s.theme,'owned',exists(select 1 from public.player_card_back_ownership o where o.user_id=uid and o.card_back_id=s.id)
   ) order by s.sort_order,s.id) from public.store_card_backs s where s.active),'[]'::jsonb)
 ) into result;
 return result;
end; $$;
revoke all on function public.get_store_catalog() from public,anon;
grant execute on function public.get_store_catalog() to authenticated;

create or replace function public.purchase_card_back(p_card_back_id text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid(); item public.store_card_backs%rowtype; balance bigint; inserted integer;
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
 return jsonb_build_object('purchased',true,'already_owned',false,'points',balance,'item_id',p_card_back_id);
end; $$;
revoke all on function public.purchase_card_back(text) from public,anon;
grant execute on function public.purchase_card_back(text) to authenticated;

create or replace function public.equip_card_back(p_card_back_id text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid();
begin
 if uid is null then raise exception 'account_login_required'; end if;
 if not exists(select 1 from public.player_card_back_ownership where user_id=uid and card_back_id=p_card_back_id) then
  raise exception 'card_back_not_owned';
 end if;
 update public.player_profiles set equipped_card_back=p_card_back_id,updated_at=now() where user_id=uid;
 return jsonb_build_object('equipped',p_card_back_id);
end; $$;
revoke all on function public.equip_card_back(text) from public,anon;
grant execute on function public.equip_card_back(text) to authenticated;
