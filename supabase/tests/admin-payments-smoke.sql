-- Role-based admin, manual payment review, point ledger, and history smoke test.
insert into auth.users(id,email,raw_user_meta_data,is_anonymous) values
 ('10000000-0000-4000-8000-000000000003','admin@example.test','{"display_name":"مدیر آزمایشی"}'::jsonb,false)
on conflict(id) do nothing;
insert into public.admin_roles(user_id,role,active)
values('10000000-0000-4000-8000-000000000003','super_admin',true)
on conflict(user_id) do update set role='super_admin',active=true;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',false);
do $$
declare order_id uuid; result jsonb; dashboard jsonb; history jsonb; adjusted jsonb;
begin
 if not public.has_admin_role(array['super_admin']) then raise exception 'super admin role check failed'; end if;
 dashboard:=public.get_admin_dashboard('آزمایش الف',20);
 if jsonb_array_length(dashboard->'players')<1 then raise exception 'admin player search failed'; end if;
 adjusted:=public.admin_adjust_points('10000000-0000-4000-8000-000000000002',7,'امتیاز آزمایشی مدیر');
 if (adjusted->>'points')::integer<>7 then raise exception 'admin point adjustment failed'; end if;
 order_id:=public.admin_create_manual_payment('10000000-0000-4000-8000-000000000002','p50','TEST-TRANSFER-0001');
 result:=public.admin_review_manual_payment(order_id,true,'تأیید آزمایشی');
 if result->>'status'<>'paid' or (result->>'points')::integer<>57 then raise exception 'manual payment approval failed: %',result; end if;
 begin
  perform public.admin_review_manual_payment(order_id,true,'تکرار');
  raise exception 'duplicate manual payment approval should fail';
 exception when others then
  if sqlerrm='duplicate manual payment approval should fail' then raise; end if;
 end;
 history:=public.admin_get_player_history('10000000-0000-4000-8000-000000000002',20);
 if jsonb_array_length(history)<2 then raise exception 'admin point history missing entries'; end if;
 result:=public.admin_set_role('10000000-0000-4000-8000-000000000002','support',true);
 if result->>'role'<>'support' then raise exception 'admin role delegation failed'; end if;
end $$;
