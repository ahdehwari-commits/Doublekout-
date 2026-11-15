-- Online rematch lifecycle for the four-seat authoritative engine.
-- The server stamps a shared 15-second deadline when a game finishes.
create or replace function public.stamp_room_rematch_deadline()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_now numeric;
begin
  if new.status='finished' and old.status is distinct from 'finished' then
    v_now := extract(epoch from clock_timestamp());
    new.public_state := jsonb_set(coalesce(new.public_state,'{}'::jsonb),
      '{finishedAt}',to_jsonb(v_now),true);
    new.public_state := jsonb_set(new.public_state,
      '{nextGameDeadline}',to_jsonb(v_now+15),true);
  end if;
  return new;
end;
$$;

drop trigger if exists game_rooms_stamp_rematch_deadline on public.game_rooms;
create trigger game_rooms_stamp_rematch_deadline
before update of status on public.game_rooms
for each row execute function public.stamp_room_rematch_deadline();

create or replace function public.extend_room_rematch_time(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_room public.game_rooms%rowtype;
  v_state jsonb;
  v_deadline numeric;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  select * into v_room from public.game_rooms where id=p_room_id for update;
  if not found then raise exception 'room_not_found'; end if;
  if v_room.host_user_id is distinct from v_user then raise exception 'host_only'; end if;
  if v_room.status<>'finished' or v_room.public_state->>'phase'<>'finished' then
    raise exception 'game_not_finished';
  end if;
  v_state:=v_room.public_state;
  v_deadline:=nullif(v_state->>'nextGameDeadline','')::numeric;
  if v_deadline is null then raise exception 'rematch_deadline_missing'; end if;
  if extract(epoch from clock_timestamp())>=v_deadline then
    raise exception 'rematch_deadline_expired';
  end if;
  v_state:=jsonb_set(v_state,'{nextGameDeadline}',to_jsonb(v_deadline+15),true);
  update public.game_rooms
    set public_state=v_state,revision=revision+1,updated_at=now()
    where id=p_room_id;
  return jsonb_build_object('room_id',p_room_id,'state',v_state,
    'revision',v_room.revision+1,'extended',true);
end;
$$;

create or replace function public.start_next_room_game(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_room public.game_rooms%rowtype;
  v_result jsonb;
  v_trump text;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  select * into v_room from public.game_rooms where id=p_room_id for update;
  if not found then raise exception 'room_not_found'; end if;
  if v_room.host_user_id is distinct from v_user then raise exception 'host_only'; end if;
  if v_room.game_mode not in ('double-kout','standard-hokm') or v_room.player_count<>4 then
    raise exception 'rematch_engine_not_supported_for_this_mode';
  end if;
  if v_room.status<>'finished' or v_room.public_state->>'phase'<>'finished' then
    raise exception 'game_not_finished';
  end if;

  v_trump:=coalesce(nullif(v_room.public_state->>'trump',''),'S');
  update public.game_rooms
    set status='waiting',public_state='{}'::jsonb,
        revision=revision+1,updated_at=now()
    where id=p_room_id;

  v_result:=public.start_room_game(p_room_id,true,v_trump,null);
  return v_result;
end;
$$;

revoke all on function public.extend_room_rematch_time(uuid) from public;
revoke all on function public.start_next_room_game(uuid) from public;
grant execute on function public.extend_room_rematch_time(uuid) to authenticated;
grant execute on function public.start_next_room_game(uuid) to authenticated;

notify pgrst, 'reload schema';
