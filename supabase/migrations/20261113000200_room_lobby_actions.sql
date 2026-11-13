-- Lobby lifecycle RPCs. Clients never write room tables directly.
create or replace function public.set_room_ready(
  p_room_id uuid,
  p_ready boolean
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_member public.room_members%rowtype;
  v_status text;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  select * into v_member
  from public.room_members
  where room_id = p_room_id and user_id = v_user
  for update;
  if not found then raise exception 'not_a_room_member'; end if;
  select status into v_status from public.game_rooms where id = p_room_id;
  if v_status <> 'waiting' then raise exception 'room_not_waiting'; end if;

  update public.room_members
     set ready = coalesce(p_ready, false)
   where room_id = p_room_id and user_id = v_user;

  update public.game_rooms
     set updated_at = now(), revision = revision + 1
   where id = p_room_id and status = 'waiting';

  return jsonb_build_object('room_id', p_room_id, 'ready', coalesce(p_ready, false));
end;
$$;

create or replace function public.start_game_room(
  p_room_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_room public.game_rooms%rowtype;
  v_total integer;
  v_ready integer;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  select * into v_room from public.game_rooms where id = p_room_id for update;
  if not found then raise exception 'room_not_found'; end if;
  if v_room.host_user_id <> v_user then raise exception 'host_only'; end if;
  if v_room.status <> 'waiting' then raise exception 'room_not_waiting'; end if;

  select count(*), count(*) filter (where ready)
    into v_total, v_ready
    from public.room_members where room_id = p_room_id;

  if v_total <> v_room.player_count then raise exception 'room_not_full'; end if;
  if v_ready <> v_room.player_count then raise exception 'players_not_ready'; end if;

  update public.game_rooms
     set status = 'playing',
         public_state = jsonb_build_object(
           'phase', 'engine_pending',
           'message', 'Lobby ready; authoritative game engine not yet connected'
         ),
         revision = revision + 1,
         updated_at = now()
   where id = p_room_id;

  return jsonb_build_object(
    'room_id', p_room_id,
    'status', 'playing',
    'revision', v_room.revision + 1,
    'phase', 'engine_pending'
  );
end;
$$;

revoke all on function public.set_room_ready(uuid, boolean) from public;
revoke all on function public.start_game_room(uuid) from public;
grant execute on function public.set_room_ready(uuid, boolean) to authenticated;
grant execute on function public.start_game_room(uuid) to authenticated;

-- Keep Realtime aware of ready/status/revision changes.
