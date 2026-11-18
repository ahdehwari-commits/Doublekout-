-- Version 8.56: preserve manual opening card and all pre-game decisions;
-- start human timeout automation only after the first card is played.
-- Also make the AI selector recover safely from a NULL strategy choice.

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
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  select * into v_room from public.game_rooms where id=p_room_id for update;
  if not found or v_room.status<>'playing' then raise exception 'room_not_playing'; end if;
  v_state:=v_room.public_state;
  if v_state->>'phase'<>'trump_selection' then raise exception 'trump_selection_not_pending'; end if;
  v_picker:=(v_state->>'trumpPickerSeat')::integer;
  select owner_user_id,cards into v_owner,v_hand from public.room_game_hands
    where room_id=p_room_id and seat=v_picker for update;
  if v_owner is null then
    if v_room.host_user_id is distinct from v_user then raise exception 'ai_trump_selection_host_only'; end if;
    if v_contract is not null then raise exception 'ai_contract_is_server_selected'; end if;
    for v_suit in select unnest(array['S','H','D','C']) loop
      select count(*),
        count(*) filter(where rank in ('A','K','Q','J'))
        into v_count,v_high
        from jsonb_to_recordset(v_hand) as c(rank text,suit text)
        where suit=v_suit;
      v_score:=v_count*1.7+v_high*1.4;
      if v_score>v_best_score then v_best_score:=v_score;v_best_suit:=v_suit;end if;
    end loop;
    v_contract:='hokm_'||case v_best_suit when 'S' then 'spades' when 'H' then 'hearts' when 'D' then 'diamonds' else 'clubs' end;
  elsif v_owner is distinct from v_user then
    raise exception 'not_trump_picker';
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
    v_state:=jsonb_set(v_state,'{message}',to_jsonb('قرارداد انتخاب شد؛ همه بازیکنان انسانی ۱۰ ثانیه فرصت مستقل برای اعلام چالش دارند'::text),true);
  else
    v_state:=jsonb_set(v_state,'{phase}','"playing"'::jsonb,true);
    v_state:=v_state-'turnDeadline';
    v_state:=jsonb_set(v_state,'{message}',to_jsonb('قرارداد انتخاب شد؛ بازی آغاز شد'::text),true);
  end if;
  update public.game_rooms set public_state=v_state,revision=revision+1,updated_at=now()
    where id=p_room_id;
  return jsonb_build_object('room_id',p_room_id,'state',v_state,
    'revision',v_room.revision+1,'contract',v_contract,'cards_dealt',52);
end;
$$;

create or replace function public.submit_room_challenge_choice(p_room_id uuid,p_choice text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_user uuid:=auth.uid(); v_room public.game_rooms%rowtype; v_state jsonb;
  v_seat integer; v_team text; v_passed jsonb; v_humans integer; v_first_turn integer;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  if p_choice not in ('pass','challenge') then raise exception 'invalid_challenge_choice'; end if;
  select * into v_room from public.game_rooms where id=p_room_id for update;
  if not found or v_room.status<>'playing' then raise exception 'room_not_playing'; end if;
  v_state:=v_room.public_state;
  if v_state->>'phase'<>'challenge_decision' then raise exception 'challenge_decision_not_pending'; end if;
  select seat into v_seat from public.room_game_hands where room_id=p_room_id and owner_user_id=v_user;
  if v_seat is null then raise exception 'not_your_seat'; end if;
  if coalesce(v_state->'challengePassed','[]'::jsonb) @> jsonb_build_array(v_seat) then raise exception 'choice_already_recorded'; end if;
  if extract(epoch from clock_timestamp())>(v_state->'challengeDeadlines'->>v_seat::text)::numeric then raise exception 'challenge_turn_expired'; end if;
  v_first_turn:=coalesce(nullif(v_state->>'trumpPickerSeat','')::integer,0);
  if p_choice='challenge' then
    v_team:=case when mod(v_seat,2)=0 then 'A' else 'B' end;
    v_state:=jsonb_set(v_state,'{challengeTeam}',to_jsonb(v_team),true);
    v_state:=jsonb_set(v_state,'{challengeInitiator}',to_jsonb(v_seat),true);
    v_state:=jsonb_set(v_state,'{phase}','"playing"'::jsonb,true);
    v_state:=jsonb_set(v_state,'{leader}',to_jsonb(v_seat),true);
    v_state:=jsonb_set(v_state,'{turn}',to_jsonb(v_seat),true);
    v_state:=v_state-'turnDeadline';
    v_state:=jsonb_set(v_state,'{message}',to_jsonb('بازیکن اعلام‌کننده چالش مشخص شد؛ بازی آغاز شد'::text),true);
  else
    v_passed:=coalesce(v_state->'challengePassed','[]'::jsonb)||jsonb_build_array(v_seat);
    select count(*) into v_humans from public.room_game_hands where room_id=p_room_id and owner_user_id is not null;
    v_state:=jsonb_set(v_state,'{challengePassed}',v_passed,true);
    if jsonb_array_length(v_passed)>=v_humans then
      v_state:=jsonb_set(v_state,'{phase}','"playing"'::jsonb,true);
      v_state:=jsonb_set(v_state,'{challengeTeam}','null'::jsonb,true);
      v_state:=jsonb_set(v_state,'{leader}',to_jsonb(v_first_turn),true);
      v_state:=jsonb_set(v_state,'{turn}',to_jsonb(v_first_turn),true);
      v_state:=v_state-'turnDeadline';
      v_state:=jsonb_set(v_state,'{message}',to_jsonb('همه بازیکنان از چالش عبور کردند؛ بازی عادی آغاز شد'::text),true);
    else
      v_state:=jsonb_set(v_state,'{message}',to_jsonb('انتخاب شما ثبت شد؛ منتظر تصمیم سایر بازیکنان هستیم'::text),true);
    end if;
  end if;
  update public.game_rooms set public_state=v_state,revision=revision+1,updated_at=now() where id=p_room_id;
  return jsonb_build_object('room_id',p_room_id,'state',v_state,'choice_recorded',true);
end; $$;

create or replace function public.expire_room_challenge_turn(p_room_id uuid,p_expected_seat smallint)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_user uuid:=auth.uid(); v_room public.game_rooms%rowtype; v_state jsonb;
  v_passed jsonb; v_humans integer; v_first_turn integer;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  select * into v_room from public.game_rooms where id=p_room_id for update;
  if not found or v_room.status<>'playing' then raise exception 'room_not_playing'; end if;
  if not exists(select 1 from public.room_members where room_id=p_room_id and user_id=v_user) then
    raise exception 'not_a_room_member';
  end if;
  v_state:=v_room.public_state;
  if v_state->>'phase'<>'challenge_decision' then
    return jsonb_build_object('expired',false,'state',v_state);
  end if;
  if not (v_state->'challengeDeadlines' ? p_expected_seat::text) then
    return jsonb_build_object('expired',false,'state',v_state);
  end if;
  if extract(epoch from clock_timestamp())<=(v_state->'challengeDeadlines'->>p_expected_seat::text)::numeric then
    return jsonb_build_object('expired',false,'state',v_state);
  end if;
  v_passed:=coalesce(v_state->'challengePassed','[]'::jsonb);
  if v_passed @> jsonb_build_array(p_expected_seat) then
    return jsonb_build_object('expired',false,'state',v_state);
  end if;
  v_passed:=v_passed||jsonb_build_array(p_expected_seat);
  select count(*) into v_humans from public.room_game_hands where room_id=p_room_id and owner_user_id is not null;
  v_first_turn:=coalesce(nullif(v_state->>'trumpPickerSeat','')::integer,0);
  v_state:=jsonb_set(v_state,'{challengePassed}',v_passed,true);
  if jsonb_array_length(v_passed)>=v_humans then
    v_state:=jsonb_set(v_state,'{phase}','"playing"'::jsonb,true);
    v_state:=jsonb_set(v_state,'{challengeTeam}','null'::jsonb,true);
    v_state:=jsonb_set(v_state,'{leader}',to_jsonb(v_first_turn),true);
    v_state:=jsonb_set(v_state,'{turn}',to_jsonb(v_first_turn),true);
    v_state:=v_state-'turnDeadline';
    v_state:=jsonb_set(v_state,'{message}',to_jsonb('مهلت همه بازیکنان تمام شد؛ بازی عادی آغاز شد'::text),true);
  else
    v_state:=jsonb_set(v_state,'{message}',to_jsonb('مهلت یک بازیکن تمام شد؛ سایر بازیکنان همچنان فرصت انتخاب دارند'::text),true);
  end if;
  update public.game_rooms set public_state=v_state,revision=revision+1,updated_at=now() where id=p_room_id;
  return jsonb_build_object('expired',true,'state',v_state);
end; $$;

create or replace function public.advance_room_turn_timeout(p_room_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
 v_room public.game_rooms%rowtype;
 v_seat smallint;
 v_deadline numeric;
begin
 if auth.uid() is null then raise exception 'authentication_required'; end if;
 select * into v_room from public.game_rooms where id=p_room_id for update;
 if not found or v_room.status<>'playing' then raise exception 'room_not_playing'; end if;
 if v_room.host_user_id<>auth.uid() then raise exception 'host_only'; end if;
 if v_room.public_state->>'phase'='challenge_decision' then
   return jsonb_build_object('advanced',false,'reason','challenge_decision_pending');
 end if;
 -- The opening card is always a deliberate player/AI action.
 if coalesce(jsonb_array_length(v_room.public_state->'plays'),0)=0
    and coalesce(jsonb_array_length(v_room.public_state->'trickWinners'),0)=0 then
   return jsonb_build_object('advanced',false,'reason','first_card_required');
 end if;
 v_deadline:=nullif(v_room.public_state->>'turnDeadline','')::numeric;
 if v_deadline is null then
   update public.game_rooms
     set public_state=jsonb_set(public_state,'{turnDeadline}',to_jsonb(extract(epoch from clock_timestamp())+10),true),
         revision=revision+1,updated_at=now()
     where id=p_room_id;
   return jsonb_build_object('advanced',false,'reason','deadline_initialized');
 end if;
 if extract(epoch from clock_timestamp())<v_deadline then
   return jsonb_build_object('advanced',false,'reason','time_remaining');
 end if;
 v_seat:=((v_room.public_state->>'turn')::integer)::smallint;
 return public.apply_room_card(p_room_id,v_seat,null,true);
end; $$;

create or replace function public.play_room_ai_turn(p_room_id uuid)
returns jsonb
language plpgsql security definer
set search_path=public,pg_temp
as $$
declare
  v_user uuid:=auth.uid();
  v_room public.game_rooms%rowtype;
  v_seat integer;
  v_cards jsonb;
  v_all_cards jsonb;
  v_state jsonb;
  v_hand_count integer;
  v_legal_count integer;
  v_reason text;
  v_result jsonb;
  v_lead text;
  v_trump text;
  v_card jsonb;
  v_winner integer;
  v_best_suit text;
  v_best_rank text;
  v_power integer;
  v_best_power integer;
  v_i integer;
  v_can_beat boolean:=false;
  v_partner_winning boolean:=false;
  v_rank_order text[]:=array['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  select * into v_room from public.game_rooms
    where id=p_room_id and host_user_id=v_user and status='playing' for update;
  if not found then raise exception 'host_only'; end if;
  v_state:=v_room.public_state;
  if v_state->>'phase'<>'playing' then raise exception 'game_not_in_play_phase'; end if;
  if v_state ? 'trickPendingUntil' then raise exception 'trick_display_pending'; end if;
  if nullif(v_state->>'turn','') is null then raise exception 'turn_not_assigned'; end if;
  select h.seat,h.cards into v_seat,v_all_cards
    from public.room_game_hands h
    where h.room_id=p_room_id and h.owner_user_id is null
      and h.seat=(v_state->>'turn')::integer for update;
  if v_seat is null then raise exception 'current_turn_is_not_ai'; end if;
  v_cards:=coalesce(v_all_cards,'[]'::jsonb);
  v_hand_count:=coalesce(jsonb_array_length(v_cards),0);
  if v_hand_count=0 then raise exception 'ai_hand_empty: seat %',v_seat; end if;

  v_lead:=v_state->'plays'->0->'card'->>'suit';
  v_trump:=v_state->>'trump';

  if jsonb_array_length(coalesce(v_state->'plays','[]'::jsonb))>0 then
    v_best_suit:=v_lead;
    v_best_rank:=v_state->'plays'->0->'card'->>'rank';
    v_winner:=(v_state->'plays'->0->>'seat')::integer;
    for v_i in 1..jsonb_array_length(v_state->'plays')-1 loop
      v_best_power:=array_position(v_rank_order,v_best_rank);
      v_power:=array_position(v_rank_order,v_state->'plays'->v_i->'card'->>'rank');
      if ((v_state->'plays'->v_i->'card'->>'suit')=v_trump and v_best_suit<>v_trump)
        or ((v_state->'plays'->v_i->'card'->>'suit')=v_best_suit and v_power>v_best_power)
        or ((v_state->'plays'->v_i->'card'->>'suit')=v_lead and v_best_suit<>v_trump and v_best_suit<>v_lead) then
        v_winner:=(v_state->'plays'->v_i->>'seat')::integer;
        v_best_suit:=v_state->'plays'->v_i->'card'->>'suit';
        v_best_rank:=v_state->'plays'->v_i->'card'->>'rank';
      end if;
    end loop;
    v_partner_winning:=mod(v_winner,2)=mod(v_seat,2);
  end if;

  -- Follow suit whenever possible. Only void players may discard or trump.
  if v_lead is not null and exists(
    select 1 from jsonb_array_elements(v_cards) c where c->>'suit'=v_lead
  ) then
    select coalesce(jsonb_agg(c),'[]'::jsonb) into v_cards
      from jsonb_array_elements(v_cards) c where c->>'suit'=v_lead;
  end if;
  v_legal_count:=jsonb_array_length(v_cards);

  if v_lead is null then
    v_reason:='lead_long_suit_low_card';
    -- Lead from a long suit, using a low card first while retaining its controls.
    select c into v_card from jsonb_array_elements(v_cards) c
      order by (select count(*) from jsonb_array_elements(v_cards) x where x->>'suit'=c->>'suit') desc,
        array_position(v_rank_order,c->>'rank') asc limit 1;
  elsif v_partner_winning then
    v_reason:='partner_winning_preserve_off_suit_ace';
    -- Do not throw away an off-suit ace when partner already controls the trick.
    select c into v_card from jsonb_array_elements(v_cards) c
      order by case when c->>'rank'='A' and c->>'suit'<>v_lead and c->>'suit'<>coalesce(v_trump,'') then 1 else 0 end,
        array_position(v_rank_order,c->>'rank') asc,
        case when c->>'suit'=v_trump then 1 else 0 end limit 1;
  else
    select exists(select 1 from jsonb_array_elements(v_cards) c where
      ((c->>'suit')=v_trump and v_best_suit<>v_trump)
      or ((c->>'suit')=v_best_suit and array_position(v_rank_order,c->>'rank')>array_position(v_rank_order,v_best_rank))
      or ((c->>'suit')=v_lead and v_best_suit<>v_trump and v_best_suit<>v_lead)
    ) into v_can_beat;
    if v_can_beat then
      v_reason:='opponent_winning_play_cheapest_overtake';
      select c into v_card from jsonb_array_elements(v_cards) c where
        ((c->>'suit')=v_trump and v_best_suit<>v_trump)
        or ((c->>'suit')=v_best_suit and array_position(v_rank_order,c->>'rank')>array_position(v_rank_order,v_best_rank))
        or ((c->>'suit')=v_lead and v_best_suit<>v_trump and v_best_suit<>v_lead)
        order by array_position(v_rank_order,c->>'rank') asc,
          case when c->>'suit'=v_trump then 1 else 0 end limit 1;
    else
      v_reason:='cannot_overtake_preserve_off_suit_ace';
      select c into v_card from jsonb_array_elements(v_cards) c
        order by case when c->>'rank'='A' and c->>'suit'<>v_lead and c->>'suit'<>coalesce(v_trump,'') then 1 else 0 end,
          array_position(v_rank_order,c->>'rank') asc limit 1;
    end if;
  end if;

  -- Last-resort legal selection from the original hand.
  if v_card is null then
    select c into v_card
      from jsonb_array_elements(coalesce(v_all_cards,'[]'::jsonb)) c
     where v_lead is null
        or c->>'suit'=v_lead
        or not exists(
          select 1 from jsonb_array_elements(coalesce(v_all_cards,'[]'::jsonb)) x
           where x->>'suit'=v_lead
        )
     order by array_position(v_rank_order,c->>'rank') asc,c->>'suit' asc
     limit 1;
  end if;
  if v_card is null then
    raise exception 'ai_no_legal_card: seat %, hand_count %, lead %',v_seat,v_hand_count,v_lead;
  end if;
  if not exists(select 1 from jsonb_array_elements(coalesce(v_all_cards,'[]'::jsonb)) x where x->>'id'=v_card->>'id') then
    raise exception 'ai_selected_card_not_in_hand: seat %',v_seat;
  end if;
  if v_lead is not null
     and exists(select 1 from jsonb_array_elements(coalesce(v_all_cards,'[]'::jsonb)) x where x->>'suit'=v_lead)
     and v_card->>'suit'<>v_lead then
    raise exception 'ai_selected_illegal_suit: seat %, lead %',v_seat,v_lead;
  end if;
  v_result:=public.apply_room_card(p_room_id,v_seat::smallint,v_card->>'id',true);
  insert into public.room_game_action_log(
    room_id,actor_user_id,seat,action_type,card_id,outcome,state_revision,turn,phase,
    hand_count,plays,decision_reason,legal_move_count
  ) values(
    p_room_id,v_user,v_seat,'ai_play_card',v_card->>'id','accepted',
    coalesce((v_result->>'revision')::bigint,v_room.revision+1),
    nullif(v_room.public_state->>'turn','')::integer,v_room.public_state->>'phase',
    v_hand_count,coalesce(v_result->'state'->'plays','[]'::jsonb),v_reason,v_legal_count
  );
  return v_result;
end;
$$;

revoke all on function public.advance_room_turn_timeout(uuid) from public;
grant execute on function public.advance_room_turn_timeout(uuid) to authenticated;
revoke all on function public.play_room_ai_turn(uuid) from public;
grant execute on function public.play_room_ai_turn(uuid) to authenticated;

notify pgrst,'reload schema';
