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

  for v_step in 1..52 loop
    select status,public_state into v_status,v_state
      from public.game_rooms where id=v_room_id;
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

  for v_step in 1..52 loop
    select status,public_state into v_status,v_state
      from public.game_rooms where id=v_room_id;
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
  for v_step in 1..52 loop
    select status,public_state into v_status,v_state from public.game_rooms where id=v_room_id;
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

  raise notice 'PASS: room start, private hands, 2 humans + 2 AI, turn validation, legal cards, 13 tricks and final score';
end;
$$;
