-- 2026-11-18: use the staged five-card opening for the FIRST online game too.
-- Also upgrade pre-existing action-log tables created by older deployments.
alter table public.room_game_action_log
  add column if not exists decision_reason text,
  add column if not exists legal_move_count integer;

create or replace function public.start_initial_room_game_staged(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_user uuid:=auth.uid();
  v_room public.game_rooms%rowtype;
  v_total integer;
  v_ready integer;
  v_picker integer;
  v_i integer;
  v_suit text;
  v_rank text;
  v_owner uuid;
  v_name text;
  v_deck jsonb[]:='{}'::jsonb[];
  v_shuffled jsonb[];
  v_hands jsonb[]:='{}'::jsonb[];
  v_pending jsonb:='[]'::jsonb;
  v_names jsonb:='{}'::jsonb;
  v_state jsonb;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  select * into v_room from public.game_rooms where id=p_room_id for update;
  if not found then raise exception 'room_not_found'; end if;
  if v_room.host_user_id is distinct from v_user then raise exception 'host_only'; end if;
  if v_room.status<>'waiting' then raise exception 'room_not_waiting'; end if;
  if v_room.game_mode not in ('double-kout','standard-hokm') or v_room.player_count<>4 then
    raise exception 'online_engine_currently_supports_four_players_only';
  end if;
  select count(*),count(*) filter(where ready) into v_total,v_ready
    from public.room_members where room_id=p_room_id;
  if not exists(select 1 from public.room_members
      where room_id=p_room_id and user_id=v_user and is_host) then
    raise exception 'host_membership_required';
  end if;
  if v_total<1 then raise exception 'host_membership_required'; end if;
  if v_ready<>v_total then raise exception 'all_joined_players_must_be_ready'; end if;

  select seat into v_picker from public.room_members
    where room_id=p_room_id and user_id=v_user;
  if v_picker is null then raise exception 'host_membership_required'; end if;

  delete from public.room_game_hands where room_id=p_room_id;
  delete from public.room_game_pending_decks where room_id=p_room_id;
  for v_i in 1..4 loop v_hands[v_i]:='[]'::jsonb; end loop;
  for v_suit in select unnest(array['S','H','D','C']) loop
    for v_rank in select unnest(array['2','3','4','5','6','7','8','9','10','J','Q','K','A']) loop
      v_deck:=array_append(v_deck,jsonb_build_object(
        'id',v_rank||v_suit,'rank',v_rank,'suit',v_suit,'kind','normal'));
    end loop;
  end loop;
  select array_agg(x order by random()) into v_shuffled from unnest(v_deck) x;
  for v_i in 1..52 loop
    if v_i<=20 then
      v_hands[((v_i-1)%4)+1]:=v_hands[((v_i-1)%4)+1]||jsonb_build_array(v_shuffled[v_i]);
    else
      v_pending:=v_pending||jsonb_build_array(v_shuffled[v_i]);
    end if;
  end loop;

  for v_i in 0..3 loop
    select user_id,display_name into v_owner,v_name
      from public.room_members where room_id=p_room_id and seat=v_i;
    if v_owner is null then
      v_names:=v_names||jsonb_build_object(v_i::text,jsonb_build_object('name','هوش مصنوعی','human',false));
    else
      v_names:=v_names||jsonb_build_object(v_i::text,jsonb_build_object('name',v_name,'human',true));
    end if;
    insert into public.room_game_hands(room_id,seat,owner_user_id,cards)
      values(p_room_id,v_i,v_owner,v_hands[v_i+1]);
  end loop;
  insert into public.room_game_pending_decks(room_id,cards)
    values(p_room_id,v_pending);

  v_state:=jsonb_build_object(
    'phase','trump_selection','turn',v_picker,'leader',v_picker,'trumpPickerSeat',v_picker,
    'trickNo',1,'plays','[]'::jsonb,'trickWinners','[]'::jsonb,
    'groupCards','[]'::jsonb,'groupStartIndex',0,'trump',null,'contract',null,
    'seatPlayers',v_names,'startedWithPresent',v_total<4,
    'humanCount',v_total,'challengeTeam',null,'challengeResult',null,
    'scoreA',0,'scoreB',0,
    'handSizes',jsonb_build_object('0',5,'1',5,'2',5,'3',5),
    'message','پنج کارت به هر بازیکن داده شد؛ حاکم باید قرارداد را انتخاب کند');
  update public.game_rooms set status='playing',public_state=v_state,
    revision=revision+1,updated_at=now() where id=p_room_id;
  return jsonb_build_object('room_id',p_room_id,'status','playing',
    'revision',v_room.revision+1,'state',v_state,'phase','trump_selection');
end;
$$;

create or replace function public.host_decide_room_start(
  p_room_id uuid,
  p_choice text
) returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_user uuid:=auth.uid();
  v_room public.game_rooms%rowtype;
  v_guest uuid;
  v_result jsonb;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  if p_choice is null or p_choice not in ('human','ai') then raise exception 'invalid_lobby_choice'; end if;
  select * into v_room from public.game_rooms where id=p_room_id for update;
  if not found then raise exception 'room_not_found'; end if;
  if v_room.host_user_id is distinct from v_user then raise exception 'host_only'; end if;
  if v_room.status<>'waiting' then raise exception 'room_not_waiting'; end if;
  if v_room.game_mode not in ('double-kout','standard-hokm') or v_room.player_count<>4 then
    raise exception 'online_engine_currently_supports_four_players_only';
  end if;

  if p_choice='human' then
    select user_id into v_guest from public.room_members
      where room_id=p_room_id and user_id<>v_user
      order by joined_at,seat limit 1;
    if v_guest is null then raise exception 'no_human_guest_to_accept'; end if;
    update public.room_members set ready=true where room_id=p_room_id and user_id=v_guest;
    delete from public.room_members where room_id=p_room_id
      and user_id not in (v_user,v_guest);
  else
    delete from public.room_members where room_id=p_room_id and user_id<>v_user;
  end if;

  update public.game_rooms set revision=revision+1,updated_at=now()
    where id=p_room_id;
  v_result:=public.start_initial_room_game_staged(p_room_id);
  return v_result||jsonb_build_object('lobby_choice',p_choice,'human_guest',v_guest);
end;
$$;

revoke all on function public.start_initial_room_game_staged(uuid) from public;
grant execute on function public.start_initial_room_game_staged(uuid) to authenticated;
revoke all on function public.host_decide_room_start(uuid,text) from public;
grant execute on function public.host_decide_room_start(uuid,text) to authenticated;

notify pgrst,'reload schema';
