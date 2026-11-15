do $$
declare
  v_host uuid := '00000000-0000-0000-0000-000000000001';
  v_guest uuid := '00000000-0000-0000-0000-000000000002';
  v_room jsonb;
  v_room_id uuid;
  v_code text;
  v_state jsonb;
  v_status text;
  v_turn integer;
  v_owner uuid;
  v_cards jsonb;
  v_card_id text;
  v_lead text;
  v_step integer;
  v_before_count integer;
  v_timeout_result jsonb;
  v_original_deadline numeric;
  v_rematch_result jsonb;
  v_start_result jsonb;
  v_human_count integer;
  v_ai_count integer;
begin
  insert into auth.users(id) values(v_host),(v_guest) on conflict do nothing;
  perform set_config('request.jwt.claim.sub',v_host::text,false);
  v_room := public.create_game_room('standard-hokm',4::smallint,'Host');
  v_room_id := (v_room->>'room_id')::uuid;
  v_code := v_room->>'code';

  perform set_config('request.jwt.claim.sub',v_guest::text,false);
  perform public.join_game_room(v_code,'Guest');
  perform public.set_room_ready(v_room_id,true);

  perform set_config('request.jwt.claim.sub',v_host::text,false);
  perform public.start_room_game(v_room_id,true,'S',null);

  select public_state into v_state from public.game_rooms where id=v_room_id;
  if (select count(*) from public.room_game_hands where room_id=v_room_id) <> 4 then
    raise exception 'expected four private seat hands';
  end if;
  if exists(select 1 from public.room_game_hands where room_id=v_room_id and jsonb_array_length(cards)<>13) then
    raise exception 'each seat must start with 13 cards';
  end if;
  if v_state ? 'hands' then raise exception 'private hands leaked into public state'; end if;

  for v_step in 1..70 loop
    select status,public_state into v_status,v_state
      from public.game_rooms where id=v_room_id;
    if v_state ? 'trickPendingUntil' then
      if jsonb_array_length(v_state->'plays')<>4 then
        raise exception 'completed trick must keep all four cards visible';
      end if;
      update public.game_rooms
        set public_state=jsonb_set(public_state,'{trickPendingUntil}',
          to_jsonb(extract(epoch from clock_timestamp())-1),true)
        where id=v_room_id;
      perform public.resolve_room_trick(v_room_id);
      select status,public_state into v_status,v_state
        from public.game_rooms where id=v_room_id;
    end if;
    exit when v_status='finished';
    v_turn := (v_state->>'turn')::integer;
    select owner_user_id,cards into v_owner,v_cards
      from public.room_game_hands where room_id=v_room_id and seat=v_turn;
    if v_owner is null then
      perform set_config('request.jwt.claim.sub',v_host::text,false);
      perform public.play_room_ai_turn(v_room_id);
    else
      perform set_config('request.jwt.claim.sub',v_owner::text,false);
      v_lead := case when jsonb_array_length(v_state->'plays')>0
        then v_state->'plays'->0->'card'->>'suit' else null end;
      select x->>'id' into v_card_id
        from jsonb_array_elements(v_cards) x
       where v_lead is null
          or x->>'suit'=v_lead
          or not exists(select 1 from jsonb_array_elements(v_cards) y where y->>'suit'=v_lead)
       order by random() limit 1;
      perform public.play_room_card(v_room_id,v_card_id);
    end if;
  end loop;

  select status,public_state into v_status,v_state
    from public.game_rooms where id=v_room_id;
  if v_status <> 'finished' then raise exception 'game did not finish after 52 cards'; end if;
  if jsonb_array_length(v_state->'trickWinners')<>13 then
    raise exception 'expected 13 completed tricks';
  end if;
  if (v_state->>'scoreA')::integer + (v_state->>'scoreB')::integer <> 13 then
    raise exception 'Hokm score must total 13 tricks';
  end if;

  -- A second room verifies the Double Kout challenge can resolve early or on trick 13.
  perform set_config('request.jwt.claim.sub',v_host::text,false);
  v_room := public.create_game_room('double-kout',4::smallint,'Host');
  v_room_id := (v_room->>'room_id')::uuid;
  v_code := v_room->>'code';
  perform set_config('request.jwt.claim.sub',v_guest::text,false);
  perform public.join_game_room(v_code,'Guest');
  perform public.set_room_ready(v_room_id,true);
  perform set_config('request.jwt.claim.sub',v_host::text,false);
  perform public.start_room_game(v_room_id,true,'S',null);
  -- The guest in seat 1 declares the challenge and must lead the first trick.
  perform set_config('request.jwt.claim.sub',v_guest::text,false);
  perform public.extend_room_challenge_time(v_room_id);
  perform public.submit_room_challenge_choice(v_room_id,'challenge');
  select public_state into v_state from public.game_rooms where id=v_room_id;
  if (v_state->>'turn')::integer<>1 or (v_state->>'leader')::integer<>1
     or (v_state->>'challengeInitiator')::integer<>1 then
    raise exception 'challenge initiator must be the opening leader';
  end if;

  for v_step in 1..70 loop
    select status,public_state into v_status,v_state
      from public.game_rooms where id=v_room_id;
    if v_state ? 'trickPendingUntil' then
      if jsonb_array_length(v_state->'plays')<>4 then
        raise exception 'completed trick must keep all four cards visible';
      end if;
      update public.game_rooms
        set public_state=jsonb_set(public_state,'{trickPendingUntil}',
          to_jsonb(extract(epoch from clock_timestamp())-1),true)
        where id=v_room_id;
      perform public.resolve_room_trick(v_room_id);
      select status,public_state into v_status,v_state
        from public.game_rooms where id=v_room_id;
    end if;
    exit when v_status='finished';
    v_turn := (v_state->>'turn')::integer;
    select owner_user_id,cards into v_owner,v_cards
      from public.room_game_hands where room_id=v_room_id and seat=v_turn;
    if v_owner is null then
      perform set_config('request.jwt.claim.sub',v_host::text,false);
      perform public.play_room_ai_turn(v_room_id);
    else
      perform set_config('request.jwt.claim.sub',v_owner::text,false);
      v_lead := case when jsonb_array_length(v_state->'plays')>0
        then v_state->'plays'->0->'card'->>'suit' else null end;
      select x->>'id' into v_card_id
        from jsonb_array_elements(v_cards) x
       where v_lead is null
          or x->>'suit'=v_lead
          or not exists(select 1 from jsonb_array_elements(v_cards) y where y->>'suit'=v_lead)
       order by random() limit 1;
      perform public.play_room_card(v_room_id,v_card_id);
    end if;
  end loop;
  select status,public_state into v_status,v_state from public.game_rooms where id=v_room_id;
  if v_status <> 'finished' then raise exception 'Double Kout challenge did not resolve'; end if;
  if v_state->'challengeResult'->>'status' not in ('success','failed-last-trick','failed-opponent-sequence') then
    raise exception 'Double Kout challenge result is missing or invalid';
  end if;
  raise notice 'PASS: Double Kout challenge resolves with the configured sequence rules';
  -- A third room verifies ordinary Double Kout sequence scoring totals all 13 tricks.
  perform set_config('request.jwt.claim.sub',v_host::text,false);
  v_room := public.create_game_room('double-kout',4::smallint,'Host');
  v_room_id := (v_room->>'room_id')::uuid;
  v_code := v_room->>'code';
  perform set_config('request.jwt.claim.sub',v_guest::text,false);
  perform public.join_game_room(v_code,'Guest');
  perform public.set_room_ready(v_room_id,true);
  perform set_config('request.jwt.claim.sub',v_host::text,false);
  perform public.start_room_game(v_room_id,true,'S',null);
  perform public.submit_room_challenge_choice(v_room_id,'pass');
  perform set_config('request.jwt.claim.sub',v_guest::text,false);
  perform public.submit_room_challenge_choice(v_room_id,'pass');
  perform set_config('request.jwt.claim.sub',v_host::text,false);
  for v_step in 1..70 loop
    select status,public_state into v_status,v_state from public.game_rooms where id=v_room_id;
    if v_state ? 'trickPendingUntil' then
      if jsonb_array_length(v_state->'plays')<>4 then
        raise exception 'completed trick must keep all four cards visible';
      end if;
      update public.game_rooms set public_state=jsonb_set(public_state,'{trickPendingUntil}',
        to_jsonb(extract(epoch from clock_timestamp())-1),true) where id=v_room_id;
      perform public.resolve_room_trick(v_room_id);
      select status,public_state into v_status,v_state from public.game_rooms where id=v_room_id;
    end if;
    exit when v_status='finished';
    v_turn := (v_state->>'turn')::integer;
    select owner_user_id,cards into v_owner,v_cards from public.room_game_hands where room_id=v_room_id and seat=v_turn;
    if v_owner is null then
      perform set_config('request.jwt.claim.sub',v_host::text,false);
      perform public.play_room_ai_turn(v_room_id);
    else
      perform set_config('request.jwt.claim.sub',v_owner::text,false);
      v_lead := case when jsonb_array_length(v_state->'plays')>0 then v_state->'plays'->0->'card'->>'suit' else null end;
      select x->>'id' into v_card_id from jsonb_array_elements(v_cards) x
       where v_lead is null or x->>'suit'=v_lead or not exists(select 1 from jsonb_array_elements(v_cards) y where y->>'suit'=v_lead)
       order by random() limit 1;
      perform public.play_room_card(v_room_id,v_card_id);
    end if;
  end loop;
  select status,public_state into v_status,v_state from public.game_rooms where id=v_room_id;
  if v_status <> 'finished' then raise exception 'Double Kout normal game did not finish'; end if;
  if (v_state->>'scoreA')::integer+(v_state->>'scoreB')::integer<>13 then
    raise exception 'Double Kout sequence score must total 13';
  end if;
  raise notice 'PASS: Double Kout non-challenge sequence scoring totals 13';

  -- Verify the server-stamped 15-second rematch countdown, extension, and
  -- host-triggered next game without leaving the room.
  v_original_deadline := (v_state->>'nextGameDeadline')::numeric;
  if v_original_deadline is null then
    raise exception 'finished game must include a shared nextGameDeadline';
  end if;
  perform set_config('request.jwt.claim.sub',v_host::text,false);
  perform public.extend_room_rematch_time(v_room_id);
  select public_state into v_state from public.game_rooms where id=v_room_id;
  if (v_state->>'nextGameDeadline')::numeric < v_original_deadline+14 then
    raise exception 'rematch extension must add 15 seconds';
  end if;
  v_rematch_result := public.start_next_room_game(v_room_id);
  select status,public_state into v_status,v_state from public.game_rooms where id=v_room_id;
  if v_status<>'playing' then raise exception 'manual next game must restart the same room'; end if;
  if v_state->>'phase'<>'challenge_decision' then
    raise exception 'next Double Kout game must reopen the challenge decision';
  end if;
  if exists(select 1 from public.room_game_hands where room_id=v_room_id and jsonb_array_length(cards)<>13) then
    raise exception 'next game must deal fresh 13-card hands';
  end if;
  raise notice 'PASS: rematch deadline, 15-second extension and next game restart';

  -- A fourth room verifies that an expired HUMAN turn is automatically played
  -- by the host timeout worker using the latest migration's AI fallback path.
  perform set_config('request.jwt.claim.sub',v_host::text,false);
  v_room := public.create_game_room('double-kout',4::smallint,'Host');
  v_room_id := (v_room->>'room_id')::uuid;
  v_code := v_room->>'code';
  perform set_config('request.jwt.claim.sub',v_guest::text,false);
  perform public.join_game_room(v_code,'Guest');
  perform public.set_room_ready(v_room_id,true);
  perform set_config('request.jwt.claim.sub',v_host::text,false);
  perform public.start_room_game(v_room_id,true,'S',null);
  perform public.submit_room_challenge_choice(v_room_id,'pass');
  perform set_config('request.jwt.claim.sub',v_guest::text,false);
  perform public.submit_room_challenge_choice(v_room_id,'pass');
  perform set_config('request.jwt.claim.sub',v_host::text,false);

  select jsonb_array_length(cards) into v_before_count
    from public.room_game_hands where room_id=v_room_id and seat=0;
  update public.game_rooms
     set public_state=jsonb_set(public_state,'{turnDeadline}',
       to_jsonb(extract(epoch from clock_timestamp())-1),true),
         revision=revision+1,updated_at=now()
   where id=v_room_id;
  v_timeout_result := public.advance_room_turn_timeout(v_room_id);

  select status,public_state into v_status,v_state
    from public.game_rooms where id=v_room_id;
  if v_timeout_result->'state' is null then
    raise exception 'expired human turn timeout did not return an advanced state: %',v_timeout_result;
  end if;
  if jsonb_array_length(v_state->'plays')<>1 then
    raise exception 'expired human turn must place exactly one card on the table';
  end if;
  if (v_state->>'turn')::integer<>1 then
    raise exception 'expired human turn must advance to the next seat';
  end if;
  if (select jsonb_array_length(cards) from public.room_game_hands
       where room_id=v_room_id and seat=0)<>v_before_count-1 then
    raise exception 'expired human turn must remove one card from the human hand';
  end if;
  raise notice 'PASS: expired human turn is auto-played, removed from hand, and advances turn';

  -- Host may end an indefinite lobby with no guest: one human plus three AI seats.
  perform set_config('request.jwt.claim.sub',v_host::text,false);
  v_room := public.create_game_room('double-kout',4::smallint,'Host');
  v_room_id := (v_room->>'room_id')::uuid;
  v_start_result := public.host_decide_room_start(v_room_id,'ai');
  if v_start_result->'state'->>'humanCount'<>'1' then
    raise exception 'AI-only start must keep exactly one human host';
  end if;
  select count(*) filter(where owner_user_id is not null),
         count(*) filter(where owner_user_id is null)
    into v_human_count,v_ai_count
    from public.room_game_hands where room_id=v_room_id;
  if v_human_count<>1 or v_ai_count<>3 then
    raise exception 'AI-only start must deal one human hand and three AI hands';
  end if;
  raise notice 'PASS: host can end waiting alone and start with three AI seats';

  -- First guest is accepted without requiring a separate ready-button action.
  perform set_config('request.jwt.claim.sub',v_host::text,false);
  v_room := public.create_game_room('double-kout',4::smallint,'Host');
  v_room_id := (v_room->>'room_id')::uuid;
  v_code := v_room->>'code';
  perform set_config('request.jwt.claim.sub',v_guest::text,false);
  perform public.join_game_room(v_code,'Guest',1::smallint);
  perform set_config('request.jwt.claim.sub',v_host::text,false);
  v_start_result := public.host_decide_room_start(v_room_id,'human');
  if v_start_result->'state'->>'humanCount'<>'2' then
    raise exception 'human-accepted start must keep two humans';
  end if;
  select count(*) filter(where owner_user_id is not null),
         count(*) filter(where owner_user_id is null)
    into v_human_count,v_ai_count
    from public.room_game_hands where room_id=v_room_id;
  if v_human_count<>2 or v_ai_count<>2 then
    raise exception 'human-accepted start must deal two human and two AI hands';
  end if;
  raise notice 'PASS: host accepts first guest and fills remaining seats with two AI players';

  raise notice 'PASS: room start, private hands, 2 humans + 2 AI, turn validation, legal cards, 13 tricks, final score and human timeout fallback';
end;
$$;
