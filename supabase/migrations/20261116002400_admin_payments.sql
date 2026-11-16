-- Admin roles, top-up packages, auditable point ledger, manual and ZarinPal payments.
create table if not exists public.admin_roles (
 user_id uuid primary key references auth.users(id) on delete cascade,
 role text not null check(role in ('super_admin','finance','support')),
 active boolean not null default true,
 created_at timestamptz not null default now()
);
create table if not exists public.point_topup_packages (
 id text primary key,
 title text not null,
 price_toman integer not null check(price_toman>0),
 points integer not null check(points>0),
 active boolean not null default true,
 sort_order integer not null default 0
);
insert into public.point_topup_packages(id,title,price_toman,points,sort_order) values
 ('p50','بسته ۵۰ امتیازی',50000,50,1),
 ('p110','بسته ۱۱۰ امتیازی',100000,110,2),
 ('p240','بسته ۲۴۰ امتیازی',200000,240,3),
 ('p650','بسته ۶۵۰ امتیازی',500000,650,4)
on conflict(id) do update set title=excluded.title,price_toman=excluded.price_toman,points=excluded.points,active=true,sort_order=excluded.sort_order;
create table if not exists public.point_payment_orders (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 package_id text not null references public.point_topup_packages(id),
 source text not null check(source in ('zarinpal','manual')),
 status text not null default 'pending' check(status in ('pending','paid','failed','rejected')),
 amount_toman integer not null check(amount_toman>0),
 amount_rial integer not null check(amount_rial=amount_toman*10),
 points integer not null check(points>0),
 authority text unique,
 gateway_ref text,
 payment_reference text,
 admin_note text,
 reviewed_by uuid references auth.users(id),
 created_at timestamptz not null default now(),
 paid_at timestamptz
);
create index if not exists point_payment_orders_user_idx on public.point_payment_orders(user_id,created_at desc);
create index if not exists point_payment_orders_status_idx on public.point_payment_orders(status,created_at desc);
create table if not exists public.point_ledger (
 id bigint generated always as identity primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 delta integer not null check(delta<>0),
 balance_after bigint not null check(balance_after>=0),
 reason text not null,
 order_id uuid references public.point_payment_orders(id),
 actor_id uuid references auth.users(id),
 created_at timestamptz not null default now()
);
create unique index if not exists point_ledger_order_once on public.point_ledger(order_id) where order_id is not null;
create index if not exists point_ledger_user_created on public.point_ledger(user_id,created_at desc);
alter table public.admin_roles enable row level security;
alter table public.point_topup_packages enable row level security;
alter table public.point_payment_orders enable row level security;
alter table public.point_ledger enable row level security;
revoke all on public.admin_roles,public.point_payment_orders,public.point_ledger from anon,authenticated;
grant select on public.point_topup_packages to authenticated;
drop policy if exists "authenticated read active topup packages" on public.point_topup_packages;
create policy "authenticated read active topup packages" on public.point_topup_packages for select to authenticated using(active);

create or replace function public.has_admin_role(p_roles text[] default array['super_admin'])
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from public.admin_roles where user_id=auth.uid() and active and role=any(p_roles));
$$;
revoke all on function public.has_admin_role(text[]) from public,anon;
grant execute on function public.has_admin_role(text[]) to authenticated;

create or replace function public.get_topup_packages()
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'title',title,'price_toman',price_toman,'points',points) order by sort_order),'[]'::jsonb)
 from public.point_topup_packages where active;
$$;
revoke all on function public.get_topup_packages() from public;
grant execute on function public.get_topup_packages() to authenticated;

create or replace function public.get_admin_dashboard(p_query text default '',p_limit integer default 50)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare q text:=btrim(coalesce(p_query,'')); result jsonb;
begin
 if not public.has_admin_role(array['super_admin','finance','support']) then raise exception 'admin_access_required'; end if;
 select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into result from (
  select p.user_id,p.display_name,u.email,p.points,p.wins,p.created_at
  from public.player_profiles p join auth.users u on u.id=p.user_id
  where q='' or p.display_name ilike '%'||q||'%' or u.email ilike '%'||q||'%' or p.user_id::text=q
  order by p.updated_at desc limit greatest(1,least(coalesce(p_limit,50),100))
 ) x;
 return jsonb_build_object('players',result);
end; $$;
revoke all on function public.get_admin_dashboard(text,integer) from public,anon;
grant execute on function public.get_admin_dashboard(text,integer) to authenticated;

create or replace function public.admin_get_payment_orders(p_status text default 'pending',p_limit integer default 100)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
 if not public.has_admin_role(array['super_admin','finance','support']) then raise exception 'admin_access_required'; end if;
 select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into result from (
  select o.id,o.user_id,p.display_name,u.email,o.package_id,k.title as package_title,o.source,o.status,
   o.amount_toman,o.points,o.payment_reference,o.gateway_ref,o.admin_note,o.created_at,o.paid_at
  from public.point_payment_orders o join auth.users u on u.id=o.user_id
  left join public.player_profiles p on p.user_id=o.user_id
  join public.point_topup_packages k on k.id=o.package_id
  where p_status='all' or o.status=p_status
  order by o.created_at desc limit greatest(1,least(coalesce(p_limit,100),200))
 ) x;
 return result;
end; $$;
revoke all on function public.admin_get_payment_orders(text,integer) from public,anon;
grant execute on function public.admin_get_payment_orders(text,integer) to authenticated;

create or replace function public.admin_adjust_points(p_user_id uuid,p_delta integer,p_reason text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare bal bigint; actor uuid:=auth.uid();
begin
 if not public.has_admin_role(array['super_admin','finance']) then raise exception 'admin_access_required'; end if;
 if p_delta=0 or abs(p_delta)>100000 then raise exception 'invalid_point_adjustment'; end if;
 if length(btrim(coalesce(p_reason,'')))<4 or length(p_reason)>240 then raise exception 'reason_required'; end if;
 insert into public.player_profiles(user_id) values(p_user_id) on conflict(user_id) do nothing;
 select points into bal from public.player_profiles where user_id=p_user_id for update;
 if bal+p_delta<0 then raise exception 'insufficient_player_points'; end if;
 update public.player_profiles set points=points+p_delta,updated_at=now() where user_id=p_user_id returning points into bal;
 insert into public.point_ledger(user_id,delta,balance_after,reason,actor_id) values(p_user_id,p_delta,bal,btrim(p_reason),actor);
 return jsonb_build_object('points',bal,'delta',p_delta);
end; $$;
revoke all on function public.admin_adjust_points(uuid,integer,text) from public,anon;
grant execute on function public.admin_adjust_points(uuid,integer,text) to authenticated;

create or replace function public.admin_create_manual_payment(p_user_id uuid,p_package_id text,p_reference text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare pkg public.point_topup_packages%rowtype; oid uuid;
begin
 if not public.has_admin_role(array['super_admin','finance']) then raise exception 'admin_access_required'; end if;
 if length(btrim(coalesce(p_reference,'')))<3 or length(p_reference)>120 then raise exception 'payment_reference_required'; end if;
 select * into pkg from public.point_topup_packages where id=p_package_id and active;
 if not found then raise exception 'package_not_found'; end if;
 insert into public.point_payment_orders(user_id,package_id,source,status,amount_toman,amount_rial,points,payment_reference)
 values(p_user_id,pkg.id,'manual','pending',pkg.price_toman,pkg.price_toman*10,pkg.points,btrim(p_reference)) returning id into oid;
 return oid;
end; $$;
revoke all on function public.admin_create_manual_payment(uuid,text,text) from public,anon;
grant execute on function public.admin_create_manual_payment(uuid,text,text) to authenticated;

create or replace function public.admin_review_manual_payment(p_order_id uuid,p_approve boolean,p_note text default '')
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare o public.point_payment_orders%rowtype; bal bigint; actor uuid:=auth.uid();
begin
 if not public.has_admin_role(array['super_admin','finance']) then raise exception 'admin_access_required'; end if;
 select * into o from public.point_payment_orders where id=p_order_id and source='manual' for update;
 if not found then raise exception 'manual_payment_not_found'; end if;
 if o.status<>'pending' then raise exception 'payment_already_reviewed'; end if;
 if p_approve then
  insert into public.player_profiles(user_id) values(o.user_id) on conflict(user_id) do nothing;
  update public.player_profiles set points=points+o.points,updated_at=now() where user_id=o.user_id returning points into bal;
  update public.point_payment_orders set status='paid',paid_at=now(),reviewed_by=actor,admin_note=left(coalesce(p_note,''),240) where id=o.id;
  insert into public.point_ledger(user_id,delta,balance_after,reason,order_id,actor_id)
  values(o.user_id,o.points,bal,'تأیید پرداخت دستی · بسته '||o.package_id,o.id,actor);
 else
  update public.point_payment_orders set status='rejected',reviewed_by=actor,admin_note=left(coalesce(p_note,''),240) where id=o.id;
  bal:=coalesce((select points from public.player_profiles where user_id=o.user_id),0);
 end if;
 return jsonb_build_object('status',case when p_approve then 'paid' else 'rejected' end,'points',bal);
end; $$;
revoke all on function public.admin_review_manual_payment(uuid,boolean,text) from public,anon;
grant execute on function public.admin_review_manual_payment(uuid,boolean,text) to authenticated;

create or replace function public.complete_zarinpal_payment(p_order_id uuid,p_authority text,p_ref_id text,p_success boolean)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare o public.point_payment_orders%rowtype; bal bigint;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'service_role_only'; end if;
 select * into o from public.point_payment_orders where id=p_order_id and source='zarinpal' for update;
 if not found then raise exception 'payment_order_not_found'; end if;
 if o.authority is distinct from p_authority then raise exception 'authority_mismatch'; end if;
 if o.status='paid' then return jsonb_build_object('status','paid','duplicate',true); end if;
 if o.status<>'pending' then return jsonb_build_object('status',o.status,'duplicate',true); end if;
 if not p_success then
  update public.point_payment_orders set status='failed' where id=o.id;
  return jsonb_build_object('status','failed');
 end if;
 insert into public.player_profiles(user_id) values(o.user_id) on conflict(user_id) do nothing;
 update public.player_profiles set points=points+o.points,updated_at=now() where user_id=o.user_id returning points into bal;
 update public.point_payment_orders set status='paid',gateway_ref=p_ref_id,paid_at=now() where id=o.id;
 insert into public.point_ledger(user_id,delta,balance_after,reason,order_id)
 values(o.user_id,o.points,bal,'خرید امتیاز از زرین‌پال · بسته '||o.package_id,o.id);
 return jsonb_build_object('status','paid','duplicate',false,'points',bal);
end; $$;
revoke all on function public.complete_zarinpal_payment(uuid,text,text,boolean) from public,anon,authenticated;
grant execute on function public.complete_zarinpal_payment(uuid,text,text,boolean) to service_role;
