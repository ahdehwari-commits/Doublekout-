-- Expose the authoritative room snapshot to authenticated room members.
-- The security-definer function returns only public room state, never private hands.
create or replace function public.get_room_snapshot(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_room public.game_rooms%rowtype;
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'authentication_required';
  end if;

  select * into v_room
  from public.game_rooms
  where id = p_room_id;

  if not found then
    raise exception 'room_not_found';
  end if;

  if v_room.host_user_id is distinct from v_user
     and not exists (
       select 1 from public.room_members
       where room_id = p_room_id and user_id = v_user
     ) then
    raise exception 'not_a_room_player';
  end if;

  return jsonb_build_object(
    'room_id', v_room.id,
    'status', v_room.status,
    'public_state', coalesce(v_room.public_state, '{}'::jsonb),
    'revision', v_room.revision,
    'game_mode', v_room.game_mode,
    'player_count', v_room.player_count
  );
end;
$$;

revoke all on function public.get_room_snapshot(uuid) from public;
grant execute on function public.get_room_snapshot(uuid) to authenticated;
