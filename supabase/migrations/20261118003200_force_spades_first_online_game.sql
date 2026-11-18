-- Force spades as the only selectable contract in the first game of an online room.
-- Later games/rematches retain the normal contract-selection rules.

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
    'isFirstGame',true,
    'trickNo',1,'plays','[]'::jsonb,'trickWinners','[]'::jsonb,
    'groupCards','[]'::jsonb,'groupStartIndex',0,'trump',null,'contract',null,
    'seatPlayers',v_names,'startedWithPresent',v_total<4,
    'humanCount',v_total,'challengeTeam',null,'challengeResult',null,
    'scoreA',0,'scoreB',0,
    'handSizes',jsonb_build_object('0',5,'1',5,'2',5,'3',5),
    'message','بازی اول: حکم پیک اجباری است؛ پنج کارت به هر بازیکن داده شد');
  update public.game_rooms set status='playing',public_state=v_state,
    revision=revision+1,updated_at=now() where id=p_room_id;
  return jsonb_build_object('room_id',p_room_id,'status','playing',
    'revision',v_room.revision+1,'state',v_state,'phase','trump_selection');
end;
$$;

create or replace function public.select_room_trump(p_room_id uuid,p_contract text default null)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_user uuid:=auth.uid();
  v_room public.game_rooms%rowtype;
  v_state jsonb;
  v_picker integer;
  v_owner uuid;
  v_hand jsonb;
  v_pending jsonb;
  v_contract text:=p_contract;
  v_suit text;
  v_best_suit text:='S';
  v_best_score numeric:=-1;
  v_score numeric;
  v_count integer;
  v_high integer;
  v_card jsonb;
  v_i integer;
  v_seat integer;
  v_now numeric:=extract(epoch from clock_timestamp());
  v_deadlines jsonb:='{}'::jsonb;
  v_human record;
  v_first_game boolean;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  select * into v_room from public.game_rooms where id=p_room_id for update;
  if not found or v_room.status<>'playing' then raise exception 'room_not_playing'; end if;
  v_state:=v_room.public_state;
  if v_state->>'phase'<>'trump_selection' then raise exception 'trump_selection_not_pending'; end if;
  v_first_game:=coalesce((v_state->>'isFirstGame')::boolean,false);
  v_picker:=(v_state->>'trumpPickerSeat')::integer;
  select owner_user_id,cards into v_owner,v_hand from public.room_game_hands
    where room_id=p_room_id and seat=v_picker for update;
  if v_owner is null then
    if v_room.host_user_id is distinct from v_user then raise exception 'ai_trump_selection_host_only'; end if;
    if v_contract is not null then raise exception 'ai_contract_is_server_selected'; end if;
    if v_first_game then
      v_best_suit:='S';
    else
      for v_suit in select unnest(array['S','H','D','C']) loop
        select count(*),
          count(*) filter(where rank in ('A','K','Q','J'))
          into v_count,v_high
          from jsonb_to_recordset(v_hand) as c(rank text,suit text)
          where suit=v_suit;
        v_score:=v_count*1.7+v_high*1.4;
        if v_score>v_best_score then v_best_score:=v_score;v_best_suit:=v_suit;end if;
      end loop;
    end if;
    v_contract:='hokm_'||case v_best_suit when 'S' then 'spades' when 'H' then 'hearts' when 'D' then 'diamonds' else 'clubs' end;
  elsif v_owner is distinct from v_user then
    raise exception 'not_trump_picker';
  end if;

  if v_first_game and v_contract is distinct from 'hokm_spades' then
    raise exception 'first_game_spades_required';
  end if;
  if v_contract is null or v_contract not in ('hokm_spades','hokm_hearts','hokm_diamonds','hokm_clubs',
                        'naras','tak_naras','saras','partner_middle') then
    raise exception 'invalid_contract';
  end if;
  v_suit:=case v_contract
    when 'hokm_spades' then 'S' when 'hokm_hearts' then 'H'
    when 'hokm_diamonds' then 'D' when 'hokm_clubs' then 'C'
    when 'partner_middle' then null else null end;
  if v_contract='partner_middle' then
    select cards->2->>'suit' into v_suit from public.room_game_hands
      where room_id=p_room_id and seat=((v_picker+2)%4);
    if v_suit not in ('S','H','D','C') then raise exception 'partner_middle_card_missing'; end if;
  end if;

  select cards into v_pending from public.room_game_pending_decks
    where room_id=p_room_id for update;
  if v_pending is null or jsonb_array_length(v_pending)<>32 then
    raise exception 'pending_deck_missing_or_invalid';
  end if;
  for v_i in 0..31 loop
    v_seat:=v_i%4;
    v_card:=v_pending->v_i;
    update public.room_game_hands
      set cards=cards||jsonb_build_array(v_card),updated_at=now()
      where room_id=p_room_id and seat=v_seat;
  end loop;
  delete from public.room_game_pending_decks where room_id=p_room_id;

  v_state:=jsonb_set(v_state,'{contract}',to_jsonb(v_contract),true);
  if v_suit is null then v_state:=jsonb_set(v_state,'{trump}','null'::jsonb,true);
  else v_state:=jsonb_set(v_state,'{trump}',to_jsonb(v_suit),true); end if;
  v_state:=jsonb_set(v_state,'{handSizes}',jsonb_build_object('0',13,'1',13,'2',13,'3',13),true);
  v_state:=jsonb_set(v_state,'{turn}',to_jsonb(v_picker),true);
  v_state:=jsonb_set(v_state,'{leader}',to_jsonb(v_picker),true);
  if v_room.game_mode='double-kout' then
    for v_human in select seat from public.room_game_hands where room_id=p_room_id and owner_user_id is not null loop
      v_deadlines:=jsonb_set(v_deadlines,array[v_human.seat::text],to_jsonb(v_now+10),true);
    end loop;
    v_state:=jsonb_set(v_state,'{phase}','"challenge_decision"'::jsonb,true);
    v_state:=jsonb_set(v_state,'{challengeStartedAt}',to_jsonb(v_now),true);
    v_state:=jsonb_set(v_state,'{challengeDeadlines}',v_deadlines,true);
    v_state:=jsonb_set(v_state,'{challengeExtendedSeats}','[]'::jsonb,true);
    v_state:=jsonb_set(v_state,'{challengePassed}','[]'::jsonb,true);
    v_state:=jsonb_set(v_state,'{challengeInitiator}','null'::jsonb,true);
    v_state:=jsonb_set(v_state,'{challengeTeam}','null'::jsonb,true);
    v_state:=jsonb_set(v_state,'{message}',to_jsonb(case when v_first_game then 'حکم پیک انتخاب شد؛ همه بازیکنان انسانی ۱۰ ثانیه فرصت مستقل برای اعلام چلنج دارند' else 'قرارداد انتخاب شد؛ همه بازیکنان انسانی ۱۰ ثانیه فرصت مستقل برای اعلام چالش دارند' end),true);
  else
    v_state:=jsonb_set(v_state,'{phase}','"playing"'::jsonb,true);
    v_state:=jsonb_set(v_state,'{turnDeadline}',to_jsonb(v_now+10),true);
    v_state:=jsonb_set(v_state,'{message}',to_jsonb('قرارداد انتخاب شد؛ بازی آغاز شد'::text),true);
  end if;
  update public.game_rooms set public_state=v_state,revision=revision+1,updated_at=now()
    where id=p_room_id;
  return jsonb_build_object('room_id',p_room_id,'state',v_state,
    'revision',v_room.revision+1,'contract',v_contract,'cards_dealt',52);
end;
$$;

revoke all on function public.start_initial_room_game_staged(uuid) from public;
grant execute on function public.start_initial_room_game_staged(uuid) to authenticated;
revoke all on function public.select_room_trump(uuid,text) from public;
grant execute on function public.select_room_trump(uuid,text) to authenticated;

notify pgrst,'reload schema';
