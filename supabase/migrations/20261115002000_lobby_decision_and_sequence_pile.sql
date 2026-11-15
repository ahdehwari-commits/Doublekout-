-- 2026-11-15: host-controlled indefinite lobby and sequence-pile display.
-- The trick winner and scoring algorithms remain unchanged.
create or replace function public.start_room_game(
  p_room_id uuid,
  p_start_with_present boolean default false,
  p_trump text default 'S',
  p_challenge_team text default null
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_room public.game_rooms%rowtype;
  v_total integer;
  v_ready integer;
  v_deck jsonb[];
  v_shuffled jsonb[];
  v_card jsonb;
  v_seat integer;
  v_suit text;
  v_rank text;
  v_owner uuid;
  v_hands jsonb[];
  v_state jsonb;
  v_names jsonb := '{}'::jsonb;
  i integer;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  select * into v_room from public.game_rooms where id=p_room_id for update;
  if not found then raise exception 'room_not_found'; end if;
  if v_room.host_user_id <> v_user then raise exception 'host_only'; end if;
  if v_room.status <> 'waiting' then raise exception 'room_not_waiting'; end if;
  if v_room.game_mode not in ('double-kout','standard-hokm') or v_room.player_count <> 4 then
    raise exception 'online_engine_currently_supports_four_players_only';
  end if;
  if p_trump not in ('S','H','D','C') then raise exception 'invalid_trump'; end if;
  if p_challenge_team is not null and (v_room.game_mode <> 'double-kout' or p_challenge_team not in ('A','B')) then raise exception 'invalid_challenge_team'; end if;
  select count(*),count(*) filter(where ready) into v_total,v_ready
    from public.room_members where room_id=p_room_id;
  if v_total < 1 then raise exception 'host_membership_required'; end if;
  if v_ready <> v_total then raise exception 'all_joined_players_must_be_ready'; end if;
  if not coalesce(p_start_with_present,false) and v_total <> 4 then raise exception 'room_not_full'; end if;

  delete from public.room_game_hands where room_id=p_room_id;
  for i in 0..3 loop v_hands[i+1] := '[]'::jsonb; end loop;
  for v_suit in select unnest(array['S','H','D','C']) loop
    for v_rank in select unnest(array['2','3','4','5','6','7','8','9','10','J','Q','K','A']) loop
      v_deck := array_append(v_deck,jsonb_build_object(
        'id',v_rank||v_suit,'rank',v_rank,'suit',v_suit,'kind','normal'));
    end loop;
  end loop;
  select array_agg(x order by random()) into v_shuffled from unnest(v_deck) x;
  for i in 1..52 loop
    v_seat := (i-1)%4;
    v_hands[v_seat+1] := v_hands[v_seat+1] || jsonb_build_array(v_shuffled[i]);
  end loop;

  for v_seat in 0..3 loop
    select user_id into v_owner from public.room_members
      where room_id=p_room_id and seat=v_seat;
    if v_owner is not null then
      select display_name into v_rank from public.room_members
        where room_id=p_room_id and seat=v_seat;
      v_names := v_names || jsonb_build_object(v_seat::text,jsonb_build_object(
        'name',v_rank,'human',true));
    else
      v_names := v_names || jsonb_build_object(v_seat::text,jsonb_build_object(
        'name','هوش مصنوعی','human',false));
    end if;
    insert into public.room_game_hands(room_id,seat,owner_user_id,cards)
      values(p_room_id,v_seat,v_owner,v_hands[v_seat+1]);
  end loop;

  v_state := jsonb_build_object(
    'phase','playing','turn',0,'leader',0,'trickNo',1,'plays','[]'::jsonb,
    'trickWinners','[]'::jsonb,'groupCards','[]'::jsonb,'groupStartIndex',0,'trump',p_trump,'contract','hokm',
    'seatPlayers',v_names,'startedWithPresent',v_total<4,
    'humanCount',v_total,'challengeTeam',p_challenge_team,
    'challengeResult',null,'scoreA',0,'scoreB',0,
    'message','بازی آنلاین چهار نفره آغاز شد');
  update public.game_rooms set status='playing',public_state=v_state,
    revision=revision+1,updated_at=now() where id=p_room_id;
  return jsonb_build_object('room_id',p_room_id,'status','playing',
    'revision',v_room.revision+1,'state',v_state);
end;
$$;

create or replace function public.host_decide_room_start(
  p_room_id uuid,
  p_choice text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_room public.game_rooms%rowtype;
  v_guest uuid;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  if p_choice not in ('human','ai') then raise exception 'invalid_lobby_choice'; end if;
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
  return public.start_room_game(p_room_id,true,'S',null)
    || jsonb_build_object('lobby_choice',p_choice,'human_guest',v_guest);
end;
$$;

revoke all on function public.host_decide_room_start(uuid,text) from public;
grant execute on function public.host_decide_room_start(uuid,text) to authenticated;


create or replace function public.resolve_room_trick(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_room public.game_rooms%rowtype;
  v_state jsonb;
  v_plays jsonb;
  v_winners jsonb;
  v_lead text;
  v_best_suit text;
  v_best_rank text;
  v_best_power integer;
  v_power integer;
  v_winner integer;
  v_trump text;
  v_card_suit text;
  v_card_rank text;
  v_rank_order text[] := array['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
  v_i integer;
  v_challenge text;
  v_opponent text;
  v_fail_at integer;
  v_done boolean := false;
  v_score_a integer := 0;
  v_score_b integer := 0;
  v_group_start integer;
  v_search_from integer;
  v_close_at integer;
  v_group_team integer;
  v_group_end integer;
  v_group_start_index integer := 0;
  v_pile jsonb := '[]'::jsonb;
  v_sequence_closed boolean := false;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  select * into v_room from public.game_rooms where id=p_room_id for update;
  if not found then raise exception 'room_not_found'; end if;
  if v_room.host_user_id is distinct from v_user and not exists(
    select 1 from public.room_members where room_id=p_room_id and user_id=v_user
  ) then raise exception 'not_a_room_player'; end if;
  v_state:=v_room.public_state;
  if not (v_state ? 'trickPendingUntil') then
    return jsonb_build_object('room_id',p_room_id,'state',v_state,
      'revision',v_room.revision,'resolved',false);
  end if;
  if extract(epoch from clock_timestamp()) < (v_state->>'trickPendingUntil')::numeric then
    raise exception 'trick_display_pending';
  end if;
  v_plays:=coalesce(v_state->'plays','[]'::jsonb);
  if jsonb_array_length(v_plays)<>4 then raise exception 'completed_trick_cards_missing'; end if;

  v_lead:=v_plays->0->'card'->>'suit';
  v_best_suit:=v_lead;
  v_best_rank:=v_plays->0->'card'->>'rank';
  v_winner:=(v_plays->0->>'seat')::integer;
  v_trump:=v_state->>'trump';
  for v_i in 1..3 loop
    v_card_suit:=v_plays->v_i->'card'->>'suit';
    v_card_rank:=v_plays->v_i->'card'->>'rank';
    v_power:=array_position(v_rank_order,v_card_rank);
    v_best_power:=array_position(v_rank_order,v_best_rank);
    if (v_card_suit=v_trump and v_best_suit<>v_trump)
      or (v_card_suit=v_best_suit and v_power>v_best_power)
      or (v_card_suit=v_lead and v_best_suit<>v_trump and v_best_suit<>v_lead) then
      v_winner:=(v_plays->v_i->>'seat')::integer;
      v_best_suit:=v_card_suit; v_best_rank:=v_card_rank;
    end if;
  end loop;

  v_pile := coalesce(v_state->'groupCards','[]'::jsonb) || v_plays;
  v_state:=jsonb_set(v_state,'{groupCards}',v_pile,true);
  v_state:=jsonb_set(v_state,'{trickWinners}',
    coalesce(v_state->'trickWinners','[]'::jsonb)||jsonb_build_array(v_winner),true);
  v_state:=jsonb_set(v_state,'{plays}','[]'::jsonb,true);
  v_state:=jsonb_set(v_state,'{leader}',to_jsonb(v_winner),true);
  v_state:=jsonb_set(v_state,'{turn}',to_jsonb(v_winner),true);
  v_state:=jsonb_set(v_state,'{trickNo}',to_jsonb((v_state->>'trickNo')::integer+1),true);
  v_state:=v_state-'trickPendingUntil';
  v_winners:=v_state->'trickWinners';
  v_challenge:=v_state->>'challengeTeam';
  v_group_start_index:=coalesce((v_state->>'groupStartIndex')::integer,0);
  v_i:=jsonb_array_length(v_winners)-1;
  if v_room.game_mode='double-kout' and v_i>0
     and v_i>=greatest(3,v_group_start_index+1)
     and (v_winners->>v_i)=(v_winners->>(v_i-1)) then
    if v_challenge is null or
       mod(v_winner,2)::text=(case when v_challenge='A' then '1' else '0' end) then
      v_sequence_closed:=true;
    end if;
  end if;
  if v_sequence_closed then
    v_state:=jsonb_set(v_state,'{sequenceClearCards}',v_pile,true);
    v_state:=jsonb_set(v_state,'{sequenceClearUntil}',
      to_jsonb(extract(epoch from clock_timestamp())+0.9),true);
    v_state:=jsonb_set(v_state,'{groupCards}','[]'::jsonb,true);
    v_state:=jsonb_set(v_state,'{groupStartIndex}',to_jsonb(v_i+1),true);
  end if;

  if v_challenge is not null then
    v_opponent:=case when v_challenge='A' then 'B' else 'A' end;
    v_fail_at:=null;
    for v_i in 3..jsonb_array_length(v_winners)-1 loop
      if mod((v_winners->>v_i)::integer,2)::text =
          (case when v_opponent='A' then '0' else '1' end)
         and (v_winners->>v_i)=(v_winners->>(v_i-1)) then
        v_fail_at:=v_i+1; exit;
      end if;
    end loop;
    if v_fail_at is not null then
      v_state:=jsonb_set(v_state,'{challengeResult}',
        jsonb_build_object('status','failed-opponent-sequence','endedAtTrick',v_fail_at),true);
      v_done:=true;
    elsif jsonb_array_length(v_winners)=13 then
      if (case when mod((v_winners->>12)::integer,2)=0 then 'A' else 'B' end)=v_challenge then
        v_state:=jsonb_set(v_state,'{challengeResult}',
          jsonb_build_object('status','success','endedAtTrick',13),true);
      else
        v_state:=jsonb_set(v_state,'{challengeResult}',
          jsonb_build_object('status','failed-last-trick','endedAtTrick',13),true);
      end if;
      v_done:=true;
    end if;
  elsif jsonb_array_length(v_winners)=13 then
    if v_room.game_mode='double-kout' then
      v_group_start:=0; v_search_from:=3;
      while v_group_start<13 loop
        v_close_at:=null;
        for v_i in v_search_from..12 loop
          if (v_winners->>v_i)=(v_winners->>(v_i-1)) then v_close_at:=v_i; exit; end if;
        end loop;
        if v_close_at is not null then
          v_group_team:=mod((v_winners->>v_close_at)::integer,2);
          v_group_end:=v_close_at;
          if v_group_team=0 then v_score_a:=v_score_a+(v_group_end-v_group_start+1);
          else v_score_b:=v_score_b+(v_group_end-v_group_start+1); end if;
          v_group_start:=v_close_at+1; v_search_from:=v_group_start+1;
        else
          v_group_team:=mod((v_winners->>12)::integer,2);
          if v_group_team=0 then v_score_a:=v_score_a+(13-v_group_start);
          else v_score_b:=v_score_b+(13-v_group_start); end if;
          v_group_start:=13;
        end if;
      end loop;
    else
      for v_i in 0..12 loop
        if mod((v_winners->>v_i)::integer,2)=0 then v_score_a:=v_score_a+1;
        else v_score_b:=v_score_b+1; end if;
      end loop;
    end if;
    v_state:=jsonb_set(v_state,'{scoreA}',to_jsonb(v_score_a),true);
    v_state:=jsonb_set(v_state,'{scoreB}',to_jsonb(v_score_b),true);
    v_done:=true;
  end if;

  if v_done then
    if jsonb_array_length(coalesce(v_state->'groupCards','[]'::jsonb))>0 then
      v_state:=jsonb_set(v_state,'{sequenceClearCards}',coalesce(v_state->'groupCards','[]'::jsonb),true);
      v_state:=jsonb_set(v_state,'{sequenceClearUntil}',to_jsonb(extract(epoch from clock_timestamp())+0.9),true);
      v_state:=jsonb_set(v_state,'{groupCards}','[]'::jsonb,true);
    end if;
    v_state:=jsonb_set(v_state,'{phase}','"finished"'::jsonb,true);
    v_state:=v_state-'turnDeadline';
  else
    v_state:=jsonb_set(v_state,'{turnDeadline}',
      to_jsonb(extract(epoch from clock_timestamp())+10),true);
  end if;
  update public.game_rooms set public_state=v_state,
    status=case when v_done then 'finished' else 'playing' end,
    revision=revision+1,updated_at=now() where id=p_room_id;
  return jsonb_build_object('room_id',p_room_id,'state',v_state,
    'revision',v_room.revision+1,'done',v_done,'resolved',true);
end;
$$;

notify pgrst, 'reload schema';
