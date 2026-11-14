-- Allow a joining human to choose a teammate (team A/even seats)
-- or an opponent (team B/odd seats). The host occupies seat 0/team A.
create or replace function public.join_game_room(
  p_code text,
  p_display_name text,
  p_preferred_seat smallint
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_room public.game_rooms%rowtype;
  v_seat integer;
  v_name text := btrim(coalesce(p_display_name, ''));
  v_parity integer;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  if p_preferred_seat not in (1,2) then raise exception 'invalid_preferred_team'; end if;
  if char_length(v_name) < 2 or char_length(v_name) > 24 then
    raise exception 'invalid_display_name';
  end if;

  select * into v_room
  from public.game_rooms
  where code = upper(btrim(coalesce(p_code, '')))
  for update;

  if not found then raise exception 'room_not_found'; end if;
  if v_room.status <> 'waiting' then raise exception 'room_already_started'; end if;
  if v_room.player_count <> 4 then raise exception 'team_selection_only_for_four_player_rooms'; end if;

  if exists(select 1 from public.room_members where room_id = v_room.id and user_id = v_user) then
    select seat into v_seat from public.room_members where room_id = v_room.id and user_id = v_user;
    return jsonb_build_object('room_id', v_room.id, 'code', v_room.code,
      'game_mode', v_room.game_mode, 'player_count', v_room.player_count,
      'seat', v_seat, 'status', v_room.status);
  end if;

  -- UI value 1 means opponent/team B (odd seats); value 2 means teammate/team A (even seats).
  v_parity := case when p_preferred_seat = 1 then 1 else 0 end;
  select s into v_seat
  from generate_series(0, v_room.player_count - 1) s
  where mod(s,2)=v_parity
    and not exists (
      select 1 from public.room_members m where m.room_id = v_room.id and m.seat = s
    )
  order by s
  limit 1;

  if v_seat is null then raise exception 'preferred_team_is_full_choose_other_team'; end if;

  insert into public.room_members(room_id, user_id, seat, display_name)
  values (v_room.id, v_user, v_seat, v_name);

  update public.game_rooms set revision=revision+1,updated_at=now() where id=v_room.id;

  return jsonb_build_object('room_id', v_room.id, 'code', v_room.code,
    'game_mode', v_room.game_mode, 'player_count', v_room.player_count,
    'seat', v_seat, 'status', v_room.status, 'preferred_team', case when v_parity=1 then 'B' else 'A' end);
end;
$$;

revoke all on function public.join_game_room(text,text,smallint) from public;
grant execute on function public.join_game_room(text,text,smallint) to authenticated;
