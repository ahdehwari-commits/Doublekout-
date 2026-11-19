-- Six-player Kuwaiti Kout: optional AI seats and server-driven bot turns.
-- Private bot hands remain inaccessible through the Data API; only authenticated RPCs use them.
alter table public.kuwaiti_online_hands alter column owner_user_id drop not null;

CREATE OR REPLACE FUNCTION public.kuwaiti_online_action(p_room_id uuid, p_action jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_user uuid := auth.uid();
  v_room public.game_rooms%rowtype;
  v_state jsonb;
  v_secret text;
  v_seat integer;
  v_owner uuid;
  v_type text := p_action->>'type';
  v_kind text;
  v_rank integer;
  v_target integer;
  v_passes integer;
  v_highest jsonb;
  v_highest_rank integer;
  v_highest_player integer;
  v_winner integer;
  v_contract text;
  v_trump text;
  v_hidden boolean;
  v_hand jsonb;
  v_new_hand jsonb;
  v_card jsonb;
  v_plays jsonb;
  v_play jsonb;
  v_lead text;
  v_has_trump boolean := false;
  v_eligible boolean;
  v_power integer;
  v_best_power integer := -1;
  v_best_seat integer;
  v_trick_no integer;
  v_winners jsonb;
  v_count integer;
  v_bidder_tricks integer;
  v_opponent_tricks integer;
  v_auction_winner integer;
  v_bidder_team text;
  v_other_team text;
  v_success boolean;
  v_score integer;
  v_score_a integer;
  v_score_b integer;
  v_match_limit integer;
  v_match_over boolean;
  v_first_picker integer;
  v_first_game boolean;
  v_previous_winner integer;
  v_obligated integer;
  v_starter integer;
  v_names jsonb;
  v_deck jsonb[] := array[]::jsonb[];
  v_shuffled jsonb[];
  v_hands jsonb[] := array_fill('[]'::jsonb,array[6]);
  v_i integer;
  v_suit text;
  v_card_rank text;
  v_new_state jsonb;
  v_legal text[];
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  if jsonb_typeof(p_action)<>'object' or v_type is null then raise exception 'invalid_action'; end if;
  select * into v_room from public.game_rooms where id=p_room_id for update;
  if not found then raise exception 'room_not_found'; end if;
  if v_room.game_mode<>'kuwaiti' or v_room.player_count<>6 then raise exception 'not_a_kuwaiti_six_player_room'; end if;
  v_state:=coalesce(v_room.public_state,'{}'::jsonb);
  if p_action ? 'bot_seat' then
    if v_room.host_user_id is distinct from v_user then raise exception 'host_only_bot_action'; end if;
    v_seat:=nullif(p_action->>'bot_seat','')::integer;
    if v_seat is null or v_seat not between 0 and 5 then raise exception 'invalid_bot_seat'; end if;
    if coalesce((v_state->'seatPlayers'->v_seat::text->>'human')::boolean,true) then raise exception 'seat_is_not_ai'; end if;
  else
    select seat into v_seat from public.room_members where room_id=p_room_id and user_id=v_user;
    if v_seat is null then raise exception 'not_a_room_member'; end if;
  end if;

  if v_type='next_game' then
    if v_room.status<>'finished' or v_state->>'phase'<>'finished' then raise exception 'game_not_finished'; end if;
    v_score_a:=coalesce((v_state->>'scoreA')::integer,0);
    v_score_b:=coalesce((v_state->>'scoreB')::integer,0);
    v_match_limit:=coalesce((v_state->>'matchLimit')::integer,54);
    v_match_over:=case when v_match_limit>=0 then (v_score_a>=v_match_limit or v_score_b>=v_match_limit)
                       else (v_score_a<=v_match_limit or v_score_b<=v_match_limit) end;
    v_bidder_team:=v_state->>'previousWinningTeam';
    if v_match_over then
      if v_room.host_user_id is distinct from v_user then raise exception 'host_only_new_match'; end if;
      v_first_game:=true; v_previous_winner:=null; v_score_a:=0; v_score_b:=0;
      v_first_picker:=null;
    else
      if v_bidder_team is null or (case when mod(v_seat,2)=0 then 'A' else 'B' end)<>v_bidder_team then
        raise exception 'winning_team_selects_next_auction_player';
      end if;
      v_first_picker:=nullif(p_action->>'first_auction_player','')::integer;
      if v_first_picker is null or v_first_picker<0 or v_first_picker>5 then raise exception 'invalid_first_auction_player'; end if;
      if (case when mod(v_first_picker,2)=0 then 'A' else 'B' end)<>v_bidder_team then raise exception 'picker_must_be_on_winning_team'; end if;
      v_first_game:=false;
      v_previous_winner:=coalesce(nullif(v_state->>'previousAuctionWinner','')::integer,nullif(v_state->>'auctionWinner','')::integer);
      if v_previous_winner is null then raise exception 'previous_auction_winner_missing'; end if;
    end if;

    for v_suit in select unnest(array['S','H','D','C']) loop
      for v_card_rank in select unnest(array['2','3','4','5','6','7','8','9','10','J','Q','K','A']) loop
        v_deck:=array_append(v_deck,jsonb_build_object('id',v_card_rank||v_suit,'rank',v_card_rank,'suit',v_suit,'kind','normal'));
      end loop;
    end loop;
    v_deck:=array_append(v_deck,jsonb_build_object('id','JR','kind','joker','color','red'));
    v_deck:=array_append(v_deck,jsonb_build_object('id','JB','kind','joker','color','black'));
    select array_agg(x order by random()) into v_shuffled from unnest(v_deck) x;
    for v_i in 1..54 loop v_hands[((v_i-1)%6)+1]:=v_hands[((v_i-1)%6)+1]||jsonb_build_array(v_shuffled[v_i]); end loop;

    if v_first_game then
      v_starter:=null;
      for v_i in 0..5 loop
        if exists(select 1 from jsonb_array_elements(v_hands[v_i+1]) c where c->>'id'='2C') then
          v_starter:=v_i; exit;
        end if;
      end loop;
      if v_starter is null then raise exception 'opening_two_of_clubs_not_dealt'; end if;
      v_obligated:=(v_starter+5)%6;
    else
      v_starter:=v_first_picker;
      v_obligated:=(v_previous_winner+5)%6;
    end if;

    delete from public.kuwaiti_online_hands where room_id=p_room_id;
    for v_seat in 0..5 loop
      select user_id into v_owner from public.room_members where room_id=p_room_id and seat=v_seat;
      if v_owner is not null then
        insert into public.kuwaiti_online_hands(room_id,seat,owner_user_id,cards)
        values(p_room_id,v_seat,v_owner,v_hands[v_seat+1]);
      else
        if coalesce((v_state->'seatPlayers'->v_seat::text->>'human')::boolean,true) then
          raise exception 'missing_human_seat_in_next_game';
        end if;
        insert into public.kuwaiti_online_hands(room_id,seat,owner_user_id,cards)
        values(p_room_id,v_seat,null,v_hands[v_seat+1]);
      end if;
    end loop;
    insert into public.kuwaiti_online_secrets(room_id,trump_suit) values(p_room_id,null)
      on conflict(room_id) do update set trump_suit=null,updated_at=now();
    v_names:=coalesce(v_state->'seatPlayers','{}'::jsonb);
    v_state:=jsonb_build_object(
      'engine','kuwaiti-six-player-v1','phase','auction','turn',v_starter,
      'auctionStarter',v_starter,'obligatedPlayer',v_obligated,
      'highest',null,'highestRank',0,'highestPlayer',null,'passes',0,'bids','[]'::jsonb,
      'auctionWinner',null,'auctionBid',null,'contract',null,'selectedContract',null,
      'trumpSuit',null,'hiddenTrump',false,'trumpAnnounced',true,'isMalzoom',false,
      'trickNo',1,'plays','[]'::jsonb,'lastTrick','[]'::jsonb,'trickWinners','[]'::jsonb,
      'leader',v_starter,'target',null,'scoreA',v_score_a,'scoreB',v_score_b,
      'matchLimit',v_match_limit,'firstGame',v_first_game,
      'previousAuctionWinner',v_previous_winner,'previousWinningTeam',v_bidder_team,
      'seatPlayers',v_names,'aiSeats',coalesce(v_state->'aiSeats','[]'::jsonb),'aiEnabled',coalesce((v_state->>'aiEnabled')::boolean,false),'done',false,'matchOver',false,
      'message','کارت‌ها پخش شد؛ مزایده آغاز می‌شود'
    );
    update public.game_rooms set status='playing',public_state=v_state,revision=revision+1,updated_at=now()
      where id=p_room_id;
    return jsonb_build_object('room_id',p_room_id,'status','playing','state',v_state,'phase','auction');
  end if;

  if v_room.status<>'playing' then raise exception 'room_not_playing'; end if;

  if v_type='bid' then
    if v_state->>'phase'<>'auction' then raise exception 'auction_not_active'; end if;
    if coalesce((v_state->>'turn')::integer,-1)<>v_seat then raise exception 'not_your_auction_turn'; end if;
    v_kind:=p_action->>'kind';
    v_passes:=coalesce((v_state->>'passes')::integer,0);
    v_highest:=nullif(v_state->'highest','null'::jsonb);
    v_highest_rank:=coalesce((v_state->>'highestRank')::integer,0);
    v_highest_player:=nullif(v_state->>'highestPlayer','')::integer;

    if v_kind='pass' then
      if v_passes>=5 and v_highest is null then raise exception 'forced_bid_cannot_pass'; end if;
      v_passes:=v_passes+1;
      v_state:=jsonb_set(v_state,'{bids}',coalesce(v_state->'bids','[]'::jsonb)||jsonb_build_array(jsonb_build_object('player',v_seat,'label','پاس')),true);
    elsif v_kind='normal' then
      v_rank:=nullif(p_action->>'rank','')::integer;
      if v_rank is null or v_rank not between 1 and 4 then raise exception 'invalid_bid_rank'; end if;
      if v_rank<=v_highest_rank then raise exception 'bid_must_raise'; end if;
      v_target:=case v_rank when 1 then 6 when 2 then 7 when 3 then 8 when 4 then 9 end;
      v_highest:=jsonb_build_object('type','normal','rank',v_rank,'label',case when v_target=9 then 'باون · ۹ دست' else v_target::text end,'target',v_target);
      v_highest_rank:=v_rank;v_highest_player:=v_seat;v_passes:=0;
      v_state:=jsonb_set(v_state,'{bids}',coalesce(v_state->'bids','[]'::jsonb)||jsonb_build_array(jsonb_build_object('player',v_seat,'label',case when v_target=9 then 'باون · ۹ دست' else v_target::text end)),true);
    elsif v_kind='malzoom' then
      if v_seat<>coalesce((v_state->>'obligatedPlayer')::integer,-1) or v_highest is not null or v_highest_rank>0 then
        raise exception 'malzoom_only_for_obligated_player_before_any_bid';
      end if;
      v_highest:=jsonb_build_object('type','malzoom','rank',1,'label','ملزوم');
      v_highest_rank:=1;v_highest_player:=v_seat;v_passes:=0;
      v_state:=jsonb_set(v_state,'{bids}',coalesce(v_state->'bids','[]'::jsonb)||jsonb_build_array(jsonb_build_object('player',v_seat,'label','ملزوم')),true);
    else
      raise exception 'invalid_bid_kind';
    end if;

    if v_passes>=5 and v_highest is not null then
      v_state:=v_state||jsonb_build_object(
        'phase',case when v_highest->>'type'='malzoom' then 'malzoom_selection' else 'contract_selection' end,
        'turn',v_highest_player,'highest',v_highest,'highestRank',v_highest_rank,
        'highestPlayer',v_highest_player,'passes',v_passes,
        'auctionWinner',v_highest_player,'auctionBid',v_highest,
        'isMalzoom',(v_highest->>'type'='malzoom'),'message','مزایده پایان یافت؛ برنده قرارداد را تعیین می‌کند'
      );
    else
      v_winner:=case when v_passes>=5 and v_highest is null then (v_seat+1)%6 else (v_seat+1)%6 end;
      v_state:=v_state||jsonb_build_object('turn',v_winner,'highest',v_highest,
        'highestRank',v_highest_rank,'highestPlayer',v_highest_player,'passes',v_passes);
    end if;

  elsif v_type='select_contract' then
    if v_state->>'phase'<>'contract_selection' then raise exception 'contract_selection_not_active'; end if;
    if v_seat<>coalesce((v_state->>'auctionWinner')::integer,-1) then raise exception 'auction_winner_only'; end if;
    v_contract:=p_action->>'contract';
    if v_contract is null or v_contract not in ('hokm_spades','hokm_hearts','hokm_diamonds','hokm_clubs','naras','tak_naras','saras') then
      raise exception 'invalid_kuwaiti_contract';
    end if;
    v_trump:=case v_contract when 'hokm_spades' then 'S' when 'hokm_hearts' then 'H'
      when 'hokm_diamonds' then 'D' when 'hokm_clubs' then 'C' else null end;
    update public.kuwaiti_online_secrets set trump_suit=v_trump,updated_at=now() where room_id=p_room_id;
    v_state:=v_state||jsonb_build_object('phase','playing','turn',v_seat,'leader',v_seat,
      'contract',case when v_contract in ('naras','tak_naras','saras') then v_contract else 'hokm' end,
      'selectedContract',v_contract,'trumpSuit',v_trump,'hiddenTrump',false,
      'trumpAnnounced',true,'isMalzoom',false,'target',(v_state->'auctionBid'->>'target')::integer,
      'trickNo',1,'plays','[]'::jsonb,'trickWinners','[]'::jsonb,'lastTrick','[]'::jsonb,
      'done',false,'message','قرارداد ثبت شد؛ نوبت بازی برنده مزایده است');

  elsif v_type='select_malzoom' then
    if v_state->>'phase'<>'malzoom_selection' then raise exception 'malzoom_selection_not_active'; end if;
    if v_seat<>coalesce((v_state->>'auctionWinner')::integer,-1) then raise exception 'auction_winner_only'; end if;
    v_trump:=p_action->>'trump_suit';
    if v_trump is null or v_trump not in ('S','H','D','C') then raise exception 'invalid_trump_suit'; end if;
    v_hidden:=coalesce((p_action->>'hidden')::boolean,true);
    update public.kuwaiti_online_secrets set trump_suit=v_trump,updated_at=now() where room_id=p_room_id;
    v_state:=v_state||jsonb_build_object('phase','playing','turn',v_seat,'leader',v_seat,
      'contract','hokm','selectedContract','hokm','trumpSuit',case when v_hidden then null else v_trump end,
      'hiddenTrump',v_hidden,'trumpAnnounced',not v_hidden,'isMalzoom',true,'target',null,
      'trickNo',1,'plays','[]'::jsonb,'trickWinners','[]'::jsonb,'lastTrick','[]'::jsonb,
      'done',false,'message',case when v_hidden then 'ملزوم آغاز شد؛ حکم مخفی است' else 'ملزوم آغاز شد' end);

  elsif v_type='announce_trump' then
    if v_state->>'phase'<>'playing' then raise exception 'game_not_playing'; end if;
    if coalesce((v_state->>'hiddenTrump')::boolean,false)=false or coalesce((v_state->>'trumpAnnounced')::boolean,false) then
      raise exception 'hidden_trump_not_waiting';
    end if;
    if coalesce((v_state->>'turn')::integer,-1)<>v_seat then raise exception 'not_your_turn'; end if;
    if v_seat<>coalesce((v_state->>'auctionWinner')::integer,-1) then
      v_plays:=coalesce(v_state->'plays','[]'::jsonb);
      if jsonb_array_length(v_plays)=0 then raise exception 'hidden_trump_request_requires_a_lead'; end if;
      if (v_state->'trickNo')::integer=9 and v_plays->0->'card'->>'kind'='joker' then
        if jsonb_array_length(v_plays)>1 then v_lead:=v_plays->1->'card'->>'suit'; end if;
      else
        v_lead:=v_plays->0->'card'->>'suit';
      end if;
      select cards into v_hand from public.kuwaiti_online_hands where room_id=p_room_id and seat=v_seat;
      if v_lead is null or exists(select 1 from jsonb_array_elements(v_hand) c where c->>'kind'='normal' and c->>'suit'=v_lead) then
        raise exception 'player_must_be_void_in_lead_to_request_hidden_trump';
      end if;
    end if;
    select trump_suit into v_trump from public.kuwaiti_online_secrets where room_id=p_room_id;
    v_state:=v_state||jsonb_build_object('trumpAnnounced',true,'trumpSuit',v_trump,'message','حکم مخفی اعلام شد');

  elsif v_type='play_card' then
    if v_state->>'phase'<>'playing' then raise exception 'game_not_playing'; end if;
    if coalesce((v_state->>'turn')::integer,-1)<>v_seat then raise exception 'not_your_turn'; end if;
    select cards into v_hand from public.kuwaiti_online_hands where room_id=p_room_id and seat=v_seat for update;
    if not found then raise exception 'hand_not_found'; end if;
    select x into v_card from jsonb_array_elements(v_hand) x where x->>'id'=p_action->>'card_id' limit 1;
    if v_card is null then raise exception 'card_not_in_hand'; end if;
    select trump_suit into v_secret from public.kuwaiti_online_secrets where room_id=p_room_id;
    v_plays:=coalesce(v_state->'plays','[]'::jsonb);
    v_trick_no:=(v_state->>'trickNo')::integer;
    v_legal:=public.kuwaiti_online_legal_card_ids(
      v_hand,v_plays,v_trick_no,case when v_trick_no=1 or not coalesce((v_state->>'hiddenTrump')::boolean,false) or coalesce((v_state->>'trumpAnnounced')::boolean,false) or v_seat=(v_state->>'auctionWinner')::integer then v_secret else null end,v_seat,(v_state->>'auctionWinner')::integer
    );
    if not (v_card->>'id'=any(v_legal)) then raise exception 'illegal_card_for_kuwaiti_rules'; end if;

    select coalesce(jsonb_agg(x order by ord),'[]'::jsonb) into v_new_hand
    from jsonb_array_elements(v_hand) with ordinality t(x,ord)
    where x->>'id'<>v_card->>'id';
    update public.kuwaiti_online_hands set cards=v_new_hand,updated_at=now()
      where room_id=p_room_id and seat=v_seat;

    v_play:=jsonb_build_object('player',v_seat,'card',v_card);
    v_plays:=v_plays||jsonb_build_array(v_play);
    v_count:=jsonb_array_length(v_plays);
    if v_count<6 then
      v_state:=v_state||jsonb_build_object('plays',v_plays,'turn',(v_seat+1)%6,
        'message','کارت ثبت شد؛ نوبت بازیکن بعدی است');
    else
      if v_plays->0->'card'->>'kind'='joker' then
        v_lead:=case when v_plays->1->'card'->>'kind'='normal' then v_plays->1->'card'->>'suit' else null end;
      else
        v_lead:=case when v_plays->0->'card'->>'kind'='normal' then v_plays->0->'card'->>'suit' else null end;
      end if;
      v_trump:=case when not coalesce((v_state->>'hiddenTrump')::boolean,false)
                         or coalesce((v_state->>'trumpAnnounced')::boolean,false)
                         then v_secret else v_secret end;
      select exists(select 1 from jsonb_array_elements(v_plays) p
        where p->'card'->>'kind'='normal' and p->'card'->>'suit'=v_trump)
        into v_has_trump;
      v_best_power:=-1;v_best_seat:=null;
      for v_i in 0..5 loop
        v_play:=v_plays->v_i;v_card:=v_play->'card';
        if v_card->>'kind'='joker' then
          v_power:=public.kuwaiti_online_card_power(v_card,v_state->>'contract',v_trick_no,v_i=0,
            coalesce((v_state->>'isMalzoom')::boolean,false),coalesce((v_state->>'trumpAnnounced')::boolean,false));
          v_eligible:=v_power>0;
        elsif v_has_trump then
          v_eligible:=v_card->>'suit'=v_trump;
          v_power:=public.kuwaiti_online_normal_power(v_card,v_state->>'contract');
        else
          v_eligible:=v_lead is not null and v_card->>'suit'=v_lead;
          v_power:=public.kuwaiti_online_normal_power(v_card,v_state->>'contract');
        end if;
        if v_eligible and v_power>v_best_power then
          v_best_power:=v_power;v_best_seat:=(v_play->>'player')::integer;
        end if;
      end loop;
      if v_best_seat is null then v_best_seat:=(v_plays->1->>'player')::integer; end if;

      v_winners:=coalesce(v_state->'trickWinners','[]'::jsonb)||jsonb_build_array(v_best_seat);
      v_state:=v_state||jsonb_build_object('plays','[]'::jsonb,'lastTrick',v_plays,
        'trickWinners',v_winners,'leader',v_best_seat,'turn',v_best_seat,
        'trickNo',v_trick_no+1,'message','دست جمع شد؛ برنده دست نوبت بعد را آغاز می‌کند');

      v_count:=jsonb_array_length(v_winners);
      v_auction_winner:=(v_state->>'auctionWinner')::integer;
      v_bidder_team:=case when mod(v_auction_winner,2)=0 then 'A' else 'B' end;
      v_other_team:=case when v_bidder_team='A' then 'B' else 'A' end;
      select count(*) into v_bidder_tricks from jsonb_array_elements_text(v_winners) x
        where mod(x::integer,2)=mod(v_auction_winner,2);
      v_opponent_tricks:=v_count-v_bidder_tricks;

      if coalesce((v_state->>'isMalzoom')::boolean,false) and v_count=9 then
        v_state:=v_state||jsonb_build_object('phase','malzoom_result','done',true,
          'bidderTricks',v_bidder_tricks,'opponentTricks',v_opponent_tricks,
          'message','۹ دست تمام شد؛ نتیجه ملزوم باید ثبت شود');
      elsif not coalesce((v_state->>'isMalzoom')::boolean,false) then
        v_target:=coalesce((v_state->>'target')::integer,9);
        v_success:=null;
        if v_bidder_tricks>=v_target then v_success:=true;
        elsif v_opponent_tricks>9-v_target then v_success:=false;
        elsif v_count=9 then v_success:=v_bidder_tricks>=v_target;
        end if;
        if v_success is not null then
          v_score:=case when v_success then case when v_target=9 then 36 else v_target end
                        else case when v_target=9 then -18 else -2*v_target end end;
          v_score_a:=coalesce((v_state->>'scoreA')::integer,0);
          v_score_b:=coalesce((v_state->>'scoreB')::integer,0);
          if v_bidder_team='A' then v_score_a:=v_score_a+v_score; else v_score_b:=v_score_b+v_score; end if;
          v_match_limit:=coalesce((v_state->>'matchLimit')::integer,54);
          v_match_over:=case when v_match_limit>=0 then (v_score_a>=v_match_limit or v_score_b>=v_match_limit)
                             else (v_score_a<=v_match_limit or v_score_b<=v_match_limit) end;
          v_state:=v_state||jsonb_build_object('phase','finished','done',true,
            'scoreA',v_score_a,'scoreB',v_score_b,'previousAuctionWinner',v_auction_winner,
            'previousWinningTeam',case when v_success then v_bidder_team else v_other_team end,
            'matchOver',v_match_over,'result',jsonb_build_object('success',v_success,
              'bidderTeam',v_bidder_team,'winnerTeam',case when v_success then v_bidder_team else v_other_team end,
              'bidderTricks',v_bidder_tricks,'opponentTricks',v_opponent_tricks,'score',v_score),
            'message',case when v_success then 'قرارداد موفق شد' else 'قرارداد ناموفق شد' end);
          update public.game_rooms set status='finished' where id=p_room_id;
        end if;
      end if;
    end if;

  elsif v_type='score_malzoom' then
    if v_state->>'phase'<>'malzoom_result' then raise exception 'malzoom_result_not_ready'; end if;
    if v_seat<>coalesce((v_state->>'auctionWinner')::integer,-1) then raise exception 'auction_winner_only'; end if;
    if jsonb_typeof(p_action->'success') is distinct from 'boolean' then raise exception 'malzoom_success_choice_required'; end if;
    v_success:=(p_action->>'success')::boolean;
    v_auction_winner:=(v_state->>'auctionWinner')::integer;
    v_bidder_team:=case when mod(v_auction_winner,2)=0 then 'A' else 'B' end;
    v_other_team:=case when v_bidder_team='A' then 'B' else 'A' end;
    v_bidder_tricks:=coalesce((v_state->>'bidderTricks')::integer,0);
    v_opponent_tricks:=coalesce((v_state->>'opponentTricks')::integer,0);
    v_score:=case when v_success then 5 else -5 end;
    v_score_a:=coalesce((v_state->>'scoreA')::integer,0);
    v_score_b:=coalesce((v_state->>'scoreB')::integer,0);
    if v_bidder_team='A' then v_score_a:=v_score_a+v_score; else v_score_b:=v_score_b+v_score; end if;
    v_match_limit:=coalesce((v_state->>'matchLimit')::integer,54);
    v_match_over:=case when v_match_limit>=0 then (v_score_a>=v_match_limit or v_score_b>=v_match_limit)
                       else (v_score_a<=v_match_limit or v_score_b<=v_match_limit) end;
    select trump_suit into v_trump from public.kuwaiti_online_secrets where room_id=p_room_id;
    v_state:=v_state||jsonb_build_object('phase','finished','done',true,'trumpSuit',v_trump,
      'trumpAnnounced',true,'scoreA',v_score_a,'scoreB',v_score_b,
      'previousAuctionWinner',v_auction_winner,'previousWinningTeam',case when v_success then v_bidder_team else v_other_team end,
      'matchOver',v_match_over,'result',jsonb_build_object('success',v_success,'bidderTeam',v_bidder_team,
        'winnerTeam',case when v_success then v_bidder_team else v_other_team end,
        'bidderTricks',v_bidder_tricks,'opponentTricks',v_opponent_tricks,'score',v_score),
      'message',case when v_success then 'ملزوم موفق شد' else 'ملزوم ناموفق شد' end);
    update public.game_rooms set status='finished' where id=p_room_id;

  else
    raise exception 'unsupported_kuwaiti_action';
  end if;

  update public.game_rooms set public_state=v_state,revision=revision+1,updated_at=now()
    where id=p_room_id;
  return jsonb_build_object('room_id',p_room_id,'status',
    case when v_state->>'phase'='finished' then 'finished' else 'playing' end,
    'revision',v_room.revision+1,'state',v_state);
end;
$function$
;
revoke all on function public.kuwaiti_online_action(uuid,jsonb) from public, anon;
grant execute on function public.kuwaiti_online_action(uuid,jsonb) to authenticated;

CREATE OR REPLACE FUNCTION public.kuwaiti_online_start_with_ai(p_room_id uuid, p_match_limit integer DEFAULT 54, p_fill_ai boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_user uuid := auth.uid();
  v_room public.game_rooms%rowtype;
  v_total integer;
  v_ready integer;
  v_ai_seats jsonb := '[]'::jsonb;
  v_owner uuid;
  v_seat integer;
  v_i integer;
  v_suit text;
  v_rank text;
  v_deck jsonb[] := array[]::jsonb[];
  v_shuffled jsonb[];
  v_hands jsonb[] := array_fill('[]'::jsonb,array[6]);
  v_card jsonb;
  v_starter integer;
  v_names jsonb := '{}'::jsonb;
  v_state jsonb;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  if p_match_limit is null or p_match_limit not in (54,-54,108,-108) then raise exception 'invalid_match_limit'; end if;

  select * into v_room from public.game_rooms where id=p_room_id for update;
  if not found then raise exception 'room_not_found'; end if;
  if v_room.game_mode<>'kuwaiti' or v_room.player_count<>6 then raise exception 'not_a_kuwaiti_six_player_room'; end if;
  if v_room.host_user_id is distinct from v_user then raise exception 'host_only'; end if;
  if v_room.status<>'waiting' then raise exception 'room_not_waiting'; end if;
  if not exists(select 1 from public.room_members where room_id=p_room_id and user_id=v_user and is_host) then
    raise exception 'host_membership_required';
  end if;

  select count(*),count(*) filter(where ready) into v_total,v_ready
  from public.room_members where room_id=p_room_id;
  if p_fill_ai then
    if v_total<1 or v_total>6 then raise exception 'at_least_one_human_required'; end if;
    if v_ready<>v_total then raise exception 'all_joined_humans_must_be_ready'; end if;
  else
    if v_total<>6 then raise exception 'room_not_full'; end if;
    if v_ready<>6 then raise exception 'all_six_players_must_be_ready'; end if;
  end if;

  for v_suit in select unnest(array['S','H','D','C']) loop
    for v_rank in select unnest(array['2','3','4','5','6','7','8','9','10','J','Q','K','A']) loop
      v_deck:=array_append(v_deck,jsonb_build_object('id',v_rank||v_suit,'rank',v_rank,'suit',v_suit,'kind','normal'));
    end loop;
  end loop;
  v_deck:=array_append(v_deck,jsonb_build_object('id','JR','kind','joker','color','red'));
  v_deck:=array_append(v_deck,jsonb_build_object('id','JB','kind','joker','color','black'));
  select array_agg(x order by random()) into v_shuffled from unnest(v_deck) x;

  for v_i in 1..54 loop
    v_hands[((v_i-1)%6)+1]:=v_hands[((v_i-1)%6)+1]||jsonb_build_array(v_shuffled[v_i]);
  end loop;

  v_starter:=null;
  for v_seat in 0..5 loop
    if exists(select 1 from jsonb_array_elements(v_hands[v_seat+1]) c where c->>'id'='2C') then
      v_starter:=v_seat; exit;
    end if;
  end loop;
  if v_starter is null then raise exception 'opening_two_of_clubs_not_dealt'; end if;

  for v_seat in 0..5 loop
    select user_id into v_owner from public.room_members where room_id=p_room_id and seat=v_seat;
    if v_owner is not null then
      select jsonb_build_object('name',display_name,'human',true,'user_id',user_id)
        into v_card from public.room_members where room_id=p_room_id and seat=v_seat;
      insert into public.kuwaiti_online_hands(room_id,seat,owner_user_id,cards)
        values(p_room_id,v_seat,v_owner,v_hands[v_seat+1])
      on conflict(room_id,seat) do update
        set owner_user_id=excluded.owner_user_id,cards=excluded.cards,updated_at=now();
    else
      if not p_fill_ai then raise exception 'missing_room_seat'; end if;
      v_card:=jsonb_build_object('name','هوش مصنوعی '||(v_seat+1),'human',false,'user_id',null);
      v_ai_seats:=v_ai_seats||jsonb_build_array(v_seat);
      insert into public.kuwaiti_online_hands(room_id,seat,owner_user_id,cards)
        values(p_room_id,v_seat,null,v_hands[v_seat+1])
      on conflict(room_id,seat) do update
        set owner_user_id=null,cards=excluded.cards,updated_at=now();
    end if;
    v_names:=v_names||jsonb_build_object(v_seat::text,v_card);
  end loop;

  insert into public.kuwaiti_online_secrets(room_id,trump_suit)
  values(p_room_id,null)
  on conflict(room_id) do update set trump_suit=null,updated_at=now();

  v_state:=jsonb_build_object(
    'engine','kuwaiti-six-player-v1','phase','auction','turn',v_starter,
    'auctionStarter',v_starter,'obligatedPlayer',(v_starter+5)%6,
    'highest',null,'highestRank',0,'highestPlayer',null,'passes',0,'bids','[]'::jsonb,
    'auctionWinner',null,'auctionBid',null,'contract',null,'selectedContract',null,
    'trumpSuit',null,'hiddenTrump',false,'trumpAnnounced',true,'isMalzoom',false,
    'trickNo',1,'plays','[]'::jsonb,'lastTrick','[]'::jsonb,'trickWinners','[]'::jsonb,
    'leader',v_starter,'target',null,'scoreA',0,'scoreB',0,'matchLimit',p_match_limit,
    'firstGame',true,'previousAuctionWinner',null,'previousWinningTeam',null,
    'seatPlayers',v_names,'aiSeats',v_ai_seats,'aiEnabled',jsonb_array_length(v_ai_seats)>0,'done',false,'matchOver',false,
    'message','۵۴ کارت پخش شد؛ مزایده از دارنده ۲ خاج آغاز می‌شود'
  );

  update public.game_rooms set status='playing',public_state=v_state,
    revision=revision+1,updated_at=now() where id=p_room_id;
  return jsonb_build_object('room_id',p_room_id,'status','playing',
    'revision',v_room.revision+1,'state',v_state,'phase','auction');
end;
$function$
;
revoke all on function public.kuwaiti_online_start_with_ai(uuid,integer,boolean) from public, anon;
grant execute on function public.kuwaiti_online_start_with_ai(uuid,integer,boolean) to authenticated;

CREATE OR REPLACE FUNCTION public.kuwaiti_online_ai_turn(p_room_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
declare
  v_user uuid:=auth.uid();
  v_room public.game_rooms%rowtype;
  v_state jsonb;
  v_seat integer;
  v_meta jsonb;
  v_hand jsonb;
  v_phase text;
  v_strength numeric:=0;
  v_rank integer;
  v_threshold numeric;
  v_kind text;
  v_contract text;
  v_best_suit text;
  v_best_score numeric;
  v_high_count integer:=0;
  v_joker_count integer:=0;
  v_two_count integer:=0;
  v_trump text;
  v_plays jsonb;
  v_lead text;
  v_legal text[];
  v_card_id text;
  v_result jsonb;
  v_success boolean;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  select * into v_room from public.game_rooms where id=p_room_id for update;
  if not found then raise exception 'room_not_found'; end if;
  if v_room.host_user_id is distinct from v_user then raise exception 'host_only'; end if;
  if v_room.game_mode<>'kuwaiti' or v_room.status<>'playing' then raise exception 'room_not_playing'; end if;
  v_state:=coalesce(v_room.public_state,'{}'::jsonb);
  v_phase:=v_state->>'phase';
  v_seat:=case when v_phase='malzoom_result' then coalesce((v_state->>'auctionWinner')::integer,-1)
               else coalesce((v_state->>'turn')::integer,-1) end;
  if v_seat<0 or v_seat>5 then raise exception 'ai_turn_not_assigned'; end if;
  v_meta:=v_state->'seatPlayers'->v_seat::text;
  if v_meta is null or coalesce((v_meta->>'human')::boolean,true) then raise exception 'current_turn_is_human'; end if;
  select cards into v_hand from public.kuwaiti_online_hands where room_id=p_room_id and seat=v_seat for update;
  if v_hand is null then raise exception 'ai_hand_not_found'; end if;

  if v_phase='auction' then
    select coalesce(max(card_count*1.7+high_score),0) into v_strength
    from (
      select c->>'suit' suit,
             count(*) filter(where c->>'kind'='normal') card_count,
             sum(case c->>'rank' when 'A' then 5 when 'K' then 4 when 'Q' then 3 when 'J' then 2 when '10' then 1.3 when '9' then .8 else 0 end) high_score
      from jsonb_array_elements(v_hand) c
      where c->>'kind'='normal'
      group by c->>'suit'
    ) x;
    v_rank:=coalesce((v_state->>'highestRank')::integer,0);
    if v_seat=coalesce((v_state->>'obligatedPlayer')::integer,-1)
       and v_state->'highest'='null'::jsonb and v_rank=0 and v_strength>22 then
      v_kind:='malzoom';
      v_result:=public.kuwaiti_online_action(p_room_id,jsonb_build_object('type','bid','kind',v_kind,'bot_seat',v_seat));
    elsif v_rank>=4 then
      v_kind:='pass';
      v_result:=public.kuwaiti_online_action(p_room_id,jsonb_build_object('type','bid','kind',v_kind,'bot_seat',v_seat));
    else
      v_rank:=v_rank+1;
      v_threshold:=case v_rank when 1 then 15.5 when 2 then 20.5 when 3 then 25.5 else 30 end;
      if coalesce((v_state->>'passes')::integer,0)>=5 and v_state->'highest'='null'::jsonb then
        v_kind:='normal';v_rank:=1;
      elsif v_strength>=v_threshold then v_kind:='normal';
      else v_kind:='pass'; end if;
      v_result:=public.kuwaiti_online_action(p_room_id,jsonb_build_object('type','bid','kind',v_kind,'rank',case when v_kind='normal' then v_rank else null end,'bot_seat',v_seat));
    end if;
    return v_result;

  elsif v_phase='contract_selection' then
    select count(*) filter(where c->>'kind'='joker'),
           count(*) filter(where c->>'kind'='normal' and c->>'rank' in ('A','K','Q')),
           count(*) filter(where c->>'kind'='normal' and c->>'rank'='2')
      into v_joker_count,v_high_count,v_two_count
    from jsonb_array_elements(v_hand) c;
    if v_joker_count>=2 and v_high_count>=3 then
      v_contract:='saras';
    else
      select suit into v_best_suit
      from (
        select c->>'suit' suit,
               count(*) filter(where c->>'kind'='normal') card_count,
               sum(case c->>'rank' when 'A' then 5 when 'K' then 4 when 'Q' then 3 when 'J' then 2 when '10' then 1.3 when '9' then .8 else 0 end) high_score
        from jsonb_array_elements(v_hand) c where c->>'kind'='normal'
        group by c->>'suit'
        order by count(*) filter(where c->>'kind'='normal')*1.7+
          sum(case c->>'rank' when 'A' then 5 when 'K' then 4 when 'Q' then 3 when 'J' then 2 when '10' then 1.3 when '9' then .8 else 0 end) desc
        limit 1
      ) q;
      select coalesce(max(card_count*1.7+high_score),0) into v_best_score
      from (
        select c->>'suit' suit,count(*) card_count,
          sum(case c->>'rank' when 'A' then 5 when 'K' then 4 when 'Q' then 3 when 'J' then 2 when '10' then 1.3 when '9' then .8 else 0 end) high_score
        from jsonb_array_elements(v_hand) c where c->>'kind'='normal' group by c->>'suit'
      ) q;
      if coalesce((select count(*) from jsonb_array_elements(v_hand) c where c->>'kind'='normal' and c->>'suit'=v_best_suit),0)>=5 and v_best_score>=12 then
        v_contract:=case v_best_suit when 'S' then 'hokm_spades' when 'H' then 'hokm_hearts' when 'D' then 'hokm_diamonds' else 'hokm_clubs' end;
      elsif v_two_count>=3 then v_contract:='naras';
      else v_contract:='tak_naras'; end if;
    end if;
    return public.kuwaiti_online_action(p_room_id,jsonb_build_object('type','select_contract','contract',v_contract,'bot_seat',v_seat));

  elsif v_phase='malzoom_selection' then
    select suit into v_best_suit
    from (select c->>'suit' suit,count(*) n from jsonb_array_elements(v_hand) c where c->>'kind'='normal' group by c->>'suit' order by count(*) desc,c->>'suit' limit 1) q;
    v_best_suit:=coalesce(v_best_suit,'S');
    return public.kuwaiti_online_action(p_room_id,jsonb_build_object('type','select_malzoom','trump_suit',v_best_suit,'hidden',true,'bot_seat',v_seat));

  elsif v_phase='playing' then
    v_plays:=coalesce(v_state->'plays','[]'::jsonb);
    select trump_suit into v_trump from public.kuwaiti_online_secrets where room_id=p_room_id;
    if coalesce((v_state->>'hiddenTrump')::boolean,false)
       and not coalesce((v_state->>'trumpAnnounced')::boolean,false)
       and jsonb_array_length(v_plays)>0
       and v_seat<>coalesce((v_state->>'auctionWinner')::integer,-1) then
      v_lead:=case when v_plays->0->'card'->>'kind'='joker'
                   then case when jsonb_array_length(v_plays)>1 then v_plays->1->'card'->>'suit' else null end
                   else v_plays->0->'card'->>'suit' end;
      if v_lead is not null and not exists(select 1 from jsonb_array_elements(v_hand) c where c->>'kind'='normal' and c->>'suit'=v_lead) then
        v_result:=public.kuwaiti_online_action(p_room_id,jsonb_build_object('type','announce_trump','bot_seat',v_seat));
        v_state:=coalesce(v_result->'state',v_state);
      end if;
    end if;
    v_plays:=coalesce(v_state->'plays','[]'::jsonb);
    v_legal:=public.kuwaiti_online_legal_card_ids(
      v_hand,v_plays,coalesce((v_state->>'trickNo')::integer,1),
      case when coalesce((v_state->>'trickNo')::integer,1)=1
             or not coalesce((v_state->>'hiddenTrump')::boolean,false)
             or coalesce((v_state->>'trumpAnnounced')::boolean,false)
             or v_seat=coalesce((v_state->>'auctionWinner')::integer,-1)
           then v_trump else null end,
      v_seat,coalesce((v_state->>'auctionWinner')::integer,-1)
    );
    select c->>'id' into v_card_id
    from jsonb_array_elements(v_hand) c
    where c->>'id'=any(v_legal)
    order by case when c->>'kind'='joker'
      then public.kuwaiti_online_card_power(c,'hokm',coalesce((v_state->>'trickNo')::integer,1),
        jsonb_array_length(v_plays)=0,coalesce((v_state->>'isMalzoom')::boolean,false),
        coalesce((v_state->>'trumpAnnounced')::boolean,false))
      else public.kuwaiti_online_normal_power(c,coalesce(v_state->>'contract','hokm')) end asc
    limit 1;
    if v_card_id is null then raise exception 'ai_has_no_legal_card'; end if;
    return public.kuwaiti_online_action(p_room_id,jsonb_build_object('type','play_card','card_id',v_card_id,'bot_seat',v_seat));

  elsif v_phase='malzoom_result' then
    v_success:=coalesce((v_state->>'bidderTricks')::integer,0)>=5;
    return public.kuwaiti_online_action(p_room_id,jsonb_build_object('type','score_malzoom','success',v_success,'bot_seat',v_seat));
  end if;
  raise exception 'unsupported_ai_phase';
end;
$function$;
revoke all on function public.kuwaiti_online_ai_turn(uuid) from public, anon;
grant execute on function public.kuwaiti_online_ai_turn(uuid) to authenticated;
