-- Migration 34: expert online AI and rule-based dealer/hakem rotation.
-- The challenge rule remains unchanged: the same opposing seat must win two
-- consecutive tricks. This migration does not alter challenge evaluation.

create or replace function public.play_room_ai_turn(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_user uuid:=auth.uid();
  v_room public.game_rooms%rowtype;
  v_seat integer;
  v_cards jsonb;
  v_state jsonb;
  v_all_seen jsonb:='[]'::jsonb;
  v_unseen jsonb:='[]'::jsonb;
  v_legal jsonb:='[]'::jsonb;
  v_pool jsonb;
  v_plays jsonb;
  v_sim_plays jsonb;
  v_candidate jsonb;
  v_sim_card jsonb;
  v_card jsonb;
  v_best_card jsonb;
  v_result jsonb;
  v_lead text;
  v_trump text;
  v_sim_lead text;
  v_best_suit text;
  v_best_rank text;
  v_card_suit text;
  v_card_rank text;
  v_winner integer;
  v_best_power integer;
  v_power integer;
  v_next_seat integer;
  v_remaining integer;
  v_j integer;
  v_i integer;
  v_sample integer;
  v_samples integer:=256;
  v_wins integer;
  v_partner_wins integer;
  v_best_score numeric:='-1e30';
  v_score numeric;
  v_rank_order text[];
  v_legal_count integer;
  v_hand_count integer;
  v_reason text:='expert_monte_carlo_256';
  v_last_winner integer;
  v_challenge text;
  v_break_run_bonus numeric:=0;
  v_suit text;
  v_rank text;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  select * into v_room from public.game_rooms
   where id=p_room_id and host_user_id=v_user and status='playing' for update;
  if not found then raise exception 'host_only'; end if;

  v_state:=v_room.public_state;
  if v_state->>'phase'<>'playing' then raise exception 'game_not_in_play_phase'; end if;
  if v_state ? 'trickPendingUntil' then raise exception 'trick_display_pending'; end if;
  if nullif(v_state->>'turn','') is null then raise exception 'turn_not_assigned'; end if;

  select h.seat,h.cards into v_seat,v_cards
    from public.room_game_hands h
   where h.room_id=p_room_id and h.owner_user_id is null
     and h.seat=(v_state->>'turn')::integer for update;
  if v_seat is null then raise exception 'current_turn_is_not_ai'; end if;
  v_cards:=coalesce(v_cards,'[]'::jsonb);
  v_hand_count:=jsonb_array_length(v_cards);
  if v_hand_count=0 then raise exception 'ai_hand_empty'; end if;

  v_rank_order:=public.room_contract_rank_order(v_state->>'contract');
  v_plays:=coalesce(v_state->'plays','[]'::jsonb);
  v_lead:=case when jsonb_array_length(v_plays)>0 then v_plays->0->'card'->>'suit' else null end;
  v_trump:=v_state->>'trump';

  -- Legal cards: follow the led suit whenever the AI has one.
  if v_lead is not null and exists(
    select 1 from jsonb_array_elements(v_cards) c where c->>'suit'=v_lead
  ) then
    select coalesce(jsonb_agg(c),'[]'::jsonb) into v_legal
      from jsonb_array_elements(v_cards) c where c->>'suit'=v_lead;
  else
    v_legal:=v_cards;
  end if;
  v_legal_count:=jsonb_array_length(v_legal);
  if v_legal_count=0 then raise exception 'ai_no_legal_card'; end if;

  -- Recover the public card history from the authoritative action log.
  -- The AI never reads opponents' private hands to make its decision.
  select coalesce(jsonb_agg(distinct card_id),'[]'::jsonb)
    into v_all_seen
    from public.room_game_action_log
   where room_id=p_room_id and outcome='accepted' and card_id is not null;

  -- Build the unseen pool from the standard 52-card deck, excluding the AI's
  -- own cards and every publicly played card recorded by the server.
  for v_suit in select unnest(array['S','H','D','C']) loop
    for v_rank in select unnest(array['2','3','4','5','6','7','8','9','10','J','Q','K','A']) loop
      if not exists(select 1 from jsonb_array_elements(v_cards) x where x->>'id'=v_rank||v_suit)
         and not (v_all_seen @> jsonb_build_array(v_rank||v_suit)) then
        v_unseen:=v_unseen||jsonb_build_array(jsonb_build_object(
          'id',v_rank||v_suit,'rank',v_rank,'suit',v_suit,'kind','normal'));
      end if;
    end loop;
  end loop;

  -- During a challenge, give extra value to stopping the same opponent seat
  -- from winning consecutive tricks. The challenge rule itself is unchanged.
  v_challenge:=v_state->>'challengeTeam';
  if v_challenge is not null
     and jsonb_array_length(coalesce(v_state->'trickWinners','[]'::jsonb))>0 then
    v_last_winner:=(v_state->'trickWinners'->>(jsonb_array_length(v_state->'trickWinners')-1))::integer;
    if mod(v_last_winner,2)<>mod(v_seat,2) then
      v_break_run_bonus:=18;
    end if;
  end if;

  v_remaining:=greatest(0,3-jsonb_array_length(v_plays));
  for v_i in 0..v_legal_count-1 loop
    v_candidate:=v_legal->v_i;
    v_wins:=0;
    v_partner_wins:=0;

    for v_sample in 1..v_samples loop
      v_pool:=v_unseen;
      v_sim_plays:=v_plays||jsonb_build_array(jsonb_build_object('seat',v_seat,'card',v_candidate));

      -- Deal one random legal unseen card to each player still to act.
      for v_j in 1..v_remaining loop
        v_next_seat:=(v_seat+v_j)%4;
        v_sim_lead:=v_sim_plays->0->'card'->>'suit';
        if exists(select 1 from jsonb_array_elements(v_pool) x where x->>'suit'=v_sim_lead) then
          select x into v_sim_card from jsonb_array_elements(v_pool) x
           where x->>'suit'=v_sim_lead order by random() limit 1;
        else
          select x into v_sim_card from jsonb_array_elements(v_pool) x
           order by random() limit 1;
        end if;
        if v_sim_card is not null then
          v_sim_plays:=v_sim_plays||jsonb_build_array(
            jsonb_build_object('seat',v_next_seat,'card',v_sim_card));
          select coalesce(jsonb_agg(x),'[]'::jsonb) into v_pool
            from jsonb_array_elements(v_pool) x where x->>'id'<>v_sim_card->>'id';
        end if;
        v_sim_card:=null;
      end loop;

      if jsonb_array_length(v_sim_plays)=4 then
        v_best_suit:=v_sim_plays->0->'card'->>'suit';
        v_best_rank:=v_sim_plays->0->'card'->>'rank';
        v_winner:=(v_sim_plays->0->>'seat')::integer;
        for v_j in 1..3 loop
          v_card_suit:=v_sim_plays->v_j->'card'->>'suit';
          v_card_rank:=v_sim_plays->v_j->'card'->>'rank';
          v_power:=array_position(v_rank_order,v_card_rank);
          v_best_power:=array_position(v_rank_order,v_best_rank);
          if (v_card_suit=v_trump and v_best_suit<>v_trump)
             or (v_card_suit=v_best_suit and v_power>v_best_power)
             or (v_card_suit=(v_sim_plays->0->'card'->>'suit')
                 and v_best_suit<>v_trump
                 and v_best_suit<>(v_sim_plays->0->'card'->>'suit')) then
            v_winner:=(v_sim_plays->v_j->>'seat')::integer;
            v_best_suit:=v_card_suit;
            v_best_rank:=v_card_rank;
          end if;
        end loop;
        if mod(v_winner,2)=mod(v_seat,2) then
          v_wins:=v_wins+1;
          if v_winner<>v_seat then v_partner_wins:=v_partner_wins+1; end if;
        end if;
      end if;
    end loop;

    -- Win probability dominates; card conservation and suit control break ties.
    v_score:=(v_wins::numeric/v_samples)*100
      +(v_partner_wins::numeric/v_samples)*2
      -coalesce(array_position(v_rank_order,v_candidate->>'rank'),7)*0.22
      -case when v_candidate->>'suit'=v_trump then 2.0 else 0 end;

    if jsonb_array_length(v_plays)=0 then
      v_score:=v_score
        +(select count(*)*1.6 from jsonb_array_elements(v_cards) x
           where x->>'suit'=v_candidate->>'suit')
        +case when array_position(v_rank_order,v_candidate->>'rank')>=array_position(v_rank_order,'Q') then 3 else 0 end;
    elsif v_break_run_bonus>0 then
      -- The Monte-Carlo win rate is the primary sequence-stopping signal.
      v_score:=v_score+(v_wins::numeric/v_samples)*v_break_run_bonus;
    end if;

    if v_score>v_best_score then
      v_best_score:=v_score;
      v_best_card:=v_candidate;
    end if;
  end loop;

  if v_best_card is null then
    select x into v_best_card from jsonb_array_elements(v_legal) x
     order by array_position(v_rank_order,x->>'rank'),x->>'suit' limit 1;
    v_reason:='expert_legal_fallback';
  end if;

  v_result:=public.apply_room_card(p_room_id,v_seat::smallint,v_best_card->>'id',true);
  insert into public.room_game_action_log(
    room_id,actor_user_id,seat,action_type,card_id,outcome,state_revision,turn,phase,
    hand_count,plays,decision_reason,legal_move_count
  ) values(
    p_room_id,v_user,v_seat,'ai_play_card',v_best_card->>'id','accepted',
    coalesce((v_result->>'revision')::bigint,v_room.revision+1),
    nullif(v_state->>'turn','')::integer,v_state->>'phase',
    v_hand_count,coalesce(v_result->'state'->'plays','[]'::jsonb),v_reason,v_legal_count
  );
  return v_result;
end;
$$;

create or replace function public.start_next_room_game(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_user uuid:=auth.uid();
  v_room public.game_rooms%rowtype;
  v_old jsonb;
  v_winners jsonb;
  v_winner_team text;
  v_loser_team text;
  v_old_hakem integer;
  v_old_dealer integer;
  v_new_dealer integer;
  v_new_picker integer;
  v_step integer;
  v_seat integer;
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
  v_score_a integer;
  v_score_b integer;
  v_loser_score integer;
  v_is_kout boolean:=false;
  v_hakem_team text;
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

  v_old:=v_room.public_state;
  v_winners:=coalesce(v_old->'trickWinners','[]'::jsonb);
  v_old_hakem:=coalesce(nullif(v_old->>'trumpPickerSeat','')::integer,
                        nullif(v_old->>'hakemSeat','')::integer,
                        nullif(v_old->>'leader','')::integer,0);
  -- Older rooms did not persist dealerSeat. Use the seat immediately before
  -- the first hakem as the initial dealer, then persist the dealer from now on.
  v_old_dealer:=coalesce(nullif(v_old->>'dealerSeat','')::integer,(v_old_hakem+3)%4);
  v_hakem_team:=case when mod(v_old_hakem,2)=0 then 'A' else 'B' end;
  v_score_a:=coalesce(nullif(v_old->>'scoreA','')::integer,0);
  v_score_b:=coalesce(nullif(v_old->>'scoreB','')::integer,0);

  v_winner_team:=case
    when v_old->'challengeResult'->>'status'='success' then coalesce(v_old->>'challengeTeam',v_hakem_team)
    when v_old->'challengeResult'->>'status' like 'failed%' then
      case when coalesce(v_old->>'challengeTeam',v_hakem_team)='A' then 'B' else 'A' end
    when v_score_a>v_score_b then 'A'
    when v_score_b>v_score_a then 'B'
    when jsonb_array_length(v_winners)>0 then
      case when mod((v_winners->>(jsonb_array_length(v_winners)-1))::integer,2)=0 then 'A' else 'B' end
    else v_hakem_team
  end;
  v_loser_team:=case when v_winner_team='A' then 'B' else 'A' end;
  v_loser_score:=case when v_loser_team='A' then v_score_a else v_score_b end;
  v_is_kout:=(v_loser_score=0 and greatest(v_score_a,v_score_b)=13);

  if v_winner_team=v_hakem_team and not v_is_kout then
    -- The incumbent hakem's team won without kout: keep both roles.
    v_new_dealer:=v_old_dealer;
    v_new_picker:=v_old_hakem;
  else
    -- Pick the next dealer clockwise from the previous dealer, restricted to
    -- the team required by the outcome. Then choose the next hakem clockwise
    -- on the winning team.
    v_new_dealer:=v_old_dealer;
    for v_step in 1..4 loop
      v_seat:=(v_old_dealer+v_step)%4;
      if (case when mod(v_seat,2)=0 then 'A' else 'B' end)=
         (case when v_winner_team=v_hakem_team and v_is_kout then v_loser_team else v_loser_team end) then
        v_new_dealer:=v_seat;
        exit;
      end if;
    end loop;
    v_new_picker:=v_new_dealer;
    for v_step in 1..4 loop
      v_seat:=(v_new_dealer+v_step)%4;
      if (case when mod(v_seat,2)=0 then 'A' else 'B' end)=v_winner_team then
        v_new_picker:=v_seat;
        exit;
      end if;
    end loop;
  end if;

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
  insert into public.room_game_pending_decks(room_id,cards) values(p_room_id,v_pending);

  v_state:=jsonb_build_object(
    'phase','trump_selection','turn',v_new_picker,'leader',v_new_picker,
    'trumpPickerSeat',v_new_picker,'hakemSeat',v_new_picker,'dealerSeat',v_new_dealer,
    'isFirstGame',false,'trickNo',1,'plays','[]'::jsonb,'trickWinners','[]'::jsonb,
    'groupCards','[]'::jsonb,'groupStartIndex',0,'trump',null,'contract',null,
    'seatPlayers',v_names,'startedWithPresent',false,
    'humanCount',(select count(*) from public.room_members where room_id=p_room_id),
    'challengeTeam',null,'challengeResult',null,'scoreA',0,'scoreB',0,
    'handSizes',jsonb_build_object('0',5,'1',5,'2',5,'3',5),
    'message','پنج کارت اول پخش شد؛ حاکم باید قرارداد را انتخاب کند');
  update public.game_rooms set status='playing',public_state=v_state,
    revision=revision+1,updated_at=now() where id=p_room_id;
  return jsonb_build_object('room_id',p_room_id,'status','playing',
    'revision',v_room.revision+1,'state',v_state,'phase','trump_selection',
    'dealer_seat',v_new_dealer,'trump_picker_seat',v_new_picker,
    'winner_team',v_winner_team,'kout',v_is_kout);
end;
$$;

revoke all on function public.play_room_ai_turn(uuid) from public;
grant execute on function public.play_room_ai_turn(uuid) to authenticated;
revoke all on function public.start_next_room_game(uuid) from public;
grant execute on function public.start_next_room_game(uuid) to authenticated;

notify pgrst,'reload schema';
