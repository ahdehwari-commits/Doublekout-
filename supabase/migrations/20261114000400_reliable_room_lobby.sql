-- Reliable lobby roster reads and real membership removal.
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
  if not exists(select 1 from public.room_members where room_id=p_room_id and user_id=v_user) then
    raise exception 'not_a_room_member';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'seat',m.seat,'display_name',m.display_name,'is_host',m.is_host,
    'ready',m.ready,'user_id',m.user_id
  ) order by m.seat),'[]'::jsonb)
  into v_result
  from public.room_members m where m.room_id=p_room_id;
  return v_result;
end;
$$;

create or replace function public.leave_game_room(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_room public.game_rooms%rowtype;
  v_was_host boolean;
  v_next_host uuid;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  select * into v_room from public.game_rooms where id=p_room_id for update;
  if not found then return jsonb_build_object('left',true,'room_deleted',true); end if;
  if v_room.status <> 'waiting' then
    raise exception 'cannot_leave_after_game_started';
  end if;
  select is_host into v_was_host from public.room_members
    where room_id=p_room_id and user_id=v_user for update;
  if not found then return jsonb_build_object('left',true); end if;
  delete from public.room_members where room_id=p_room_id and user_id=v_user;
  if v_was_host then
    select user_id into v_next_host from public.room_members
      where room_id=p_room_id order by joined_at,seat limit 1;
    if v_next_host is null then
      delete from public.game_rooms where id=p_room_id;
      return jsonb_build_object('left',true,'room_deleted',true);
    end if;
    update public.room_members set is_host=(user_id=v_next_host) where room_id=p_room_id;
    update public.game_rooms set host_user_id=v_next_host,revision=revision+1,updated_at=now()
      where id=p_room_id;
  else
    update public.game_rooms set revision=revision+1,updated_at=now() where id=p_room_id;
  end if;
  return jsonb_build_object('left',true,'room_deleted',false);
end;
$$;

revoke all on function public.get_room_roster(uuid) from public;
revoke all on function public.leave_game_room(uuid) from public;
grant execute on function public.get_room_roster(uuid) to authenticated;
grant execute on function public.leave_game_room(uuid) to authenticated;
