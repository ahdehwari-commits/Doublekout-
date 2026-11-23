-- Server-authoritative 10-second card-play deadline for the six-player Kuwaiti engine.
-- Kept separate from the existing four-player timeout implementation.
create or replace function public.kuwaiti_online_stamp_turn_deadline()
returns trigger language plpgsql security definer
set search_path to 'public','pg_temp'
as $$
begin
  if new.game_mode='kuwaiti' and new.player_count=6 and new.status='playing'
     and new.public_state->>'phase'='playing' then
    if tg_op='INSERT' or old.public_state is distinct from new.public_state
       or old.status is distinct from new.status then
      new.public_state:=jsonb_set(coalesce(new.public_state,'{}'::jsonb),
        '{turnDeadline}',to_jsonb(extract(epoch from clock_timestamp())+10),true);
    end if;
  else
    new.public_state:=coalesce(new.public_state,'{}'::jsonb)-'turnDeadline';
  end if;
  return new;
end;
$$;

drop trigger if exists kuwaiti_online_turn_deadline_stamp on public.game_rooms;
create trigger kuwaiti_online_turn_deadline_stamp
before insert or update of public_state,status,game_mode on public.game_rooms
for each row execute function public.kuwaiti_online_stamp_turn_deadline();

revoke all on function public.kuwaiti_online_stamp_turn_deadline() from public,anon,authenticated;

create or replace function public.kuwaiti_online_timeout(p_room_id uuid)
returns jsonb language plpgsql security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_user uuid:=auth.uid();
  v_room public.game_rooms%rowtype;
  v_state jsonb;
  v_seat integer;
  v_meta jsonb;
  v_deadline numeric;
  v_ai_result jsonb;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  select * into v_room from public.game_rooms where id=p_room_id for update;
  if not found then raise exception 'room_not_found'; end if;
  if v_room.game_mode<>'kuwaiti' or v_room.player_count<>6 then raise exception 'not_a_kuwaiti_six_player_room'; end if;
  if v_room.host_user_id is distinct from v_user then raise exception 'host_only_timeout'; end if;
  if v_room.status<>'playing' then return jsonb_build_object('timed_out',false,'reason','room_not_playing'); end if;
  v_state:=coalesce(v_room.public_state,'{}'::jsonb);
  if v_state->>'phase'<>'playing' then return jsonb_build_object('timed_out',false,'reason','not_card_play_phase','state',v_state); end if;
  v_deadline:=nullif(v_state->>'turnDeadline','')::numeric;
  if v_deadline is null then return jsonb_build_object('timed_out',false,'reason','deadline_not_stamped'); end if;
  if extract(epoch from clock_timestamp())<v_deadline then
    return jsonb_build_object('timed_out',false,'reason','not_due',
      'remaining_seconds',greatest(0,v_deadline-extract(epoch from clock_timestamp())));
  end if;
  v_seat:=nullif(v_state->>'turn','')::integer;
  if v_seat is null or v_seat not between 0 and 5 then raise exception 'invalid_current_turn'; end if;
  v_meta:=v_state->'seatPlayers'->v_seat::text;
  if v_meta is null or coalesce((v_meta->>'human')::boolean,true)=false then
    return jsonb_build_object('timed_out',false,'reason','current_turn_is_not_human');
  end if;

  -- Temporarily route this expired human turn through the existing AI decision function.
  -- The original human marker is restored in the same transaction before commit.
  v_state:=jsonb_set(v_state,array['seatPlayers',v_seat::text,'human'],'false'::jsonb,false);
  update public.game_rooms set public_state=v_state,revision=revision+1,updated_at=now() where id=p_room_id;
  v_ai_result:=public.kuwaiti_online_ai_turn(p_room_id);

  select public_state into v_state from public.game_rooms where id=p_room_id;
  v_state:=jsonb_set(v_state,array['seatPlayers',v_seat::text,'human'],'true'::jsonb,false);
  update public.game_rooms set public_state=v_state,revision=revision+1,updated_at=now() where id=p_room_id;
  return jsonb_build_object('timed_out',true,'seat',v_seat,'ai_result',v_ai_result,'state',v_state);
end;
$$;

revoke all on function public.kuwaiti_online_timeout(uuid) from public,anon;
grant execute on function public.kuwaiti_online_timeout(uuid) to authenticated;
