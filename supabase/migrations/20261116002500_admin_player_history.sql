create or replace function public.admin_get_player_history(p_user_id uuid,p_limit integer default 50)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
 if not public.has_admin_role(array['super_admin','finance','support']) then raise exception 'admin_access_required'; end if;
 select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into result from (
  select id,delta,balance_after,reason,order_id,actor_id,created_at
  from public.point_ledger where user_id=p_user_id
  order by created_at desc limit greatest(1,least(coalesce(p_limit,50),100))
 ) x;
 return result;
end; $$;
revoke all on function public.admin_get_player_history(uuid,integer) from public,anon;
grant execute on function public.admin_get_player_history(uuid,integer) to authenticated;
