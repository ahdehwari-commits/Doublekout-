-- Six-player Kuwaiti timeout integration smoke test.
-- Requires all six test accounts to be created in the isolated CI database.
do $$
declare
  v_host uuid:='60000000-0000-4000-8000-000000000001';
  v_users uuid[]:=array[
    '60000000-0000-4000-8000-000000000001'::uuid,
    '60000000-0000-4000-8000-000000000002'::uuid,
    '60000000-0000-4000-8000-000000000003'::uuid,
    '60000000-0000-4000-8000-000000000004'::uuid,
    '60000000-0000-4000-8000-000000000005'::uuid,
    '60000000-0000-4000-8000-000000000006'::uuid
  ];
  v_room jsonb;
  v_room_id uuid;
  v_code text;
  v_state jsonb;
  v_seat integer;
  v_before integer;
  v_after integer;
  v_deadline numeric;
  v_result jsonb;
  i integer;
begin
  insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,is_anonymous)
  select u,'timeout-'||u::text||'@example.test',now(),'{}'::jsonb,false
  from unnest(v_users) u
  on conflict(id) do update set email_confirmed_at=excluded.email_confirmed_at,
    raw_app_meta_data=excluded.raw_app_meta_data,is_anonymous=false;

  perform set_config('request.jwt.claim.sub',v_host::text,false);
  perform public.require_verified_player();
  v_room:=public.create_game_room('kuwaiti',6::smallint,'Timeout host');
  v_room_id:=(v_room->>'room_id')::uuid;
  v_code:=v_room->>'code';

  for i in 2..6 loop
    perform set_config('request.jwt.claim.sub',v_users[i]::text,false);
    perform public.join_game_room(v_code,'Timeout player '||i);
  end loop;

  for i in 1..6 loop
    perform set_config('request.jwt.claim.sub',v_users[i]::text,false);
    perform public.set_room_ready(v_room_id,true);
  end loop;

  perform set_config('request.jwt.claim.sub',v_host::text,false);
  v_result:=public.kuwaiti_online_start(v_room_id,54);
  select public_state into v_state from public.game_rooms where id=v_room_id;
  if v_state->>'phase'<>'auction' then raise exception 'six-player game did not start in auction phase'; end if;
  if v_state->'turnDeadline' is not null then raise exception 'card-play deadline must not run during auction'; end if;

  -- Complete auction and contract selection using the existing server-side AI.
  -- Convert the five non-host seats to AI one at a time only for this isolated test.
  -- This test focuses on the card-play timeout path, not auction policy.
  select (v_state->>'turn')::integer into v_seat;
  update public.game_rooms
     set public_state=jsonb_set(public_state,array['seatPlayers',v_seat::text,'human'],'false'::jsonb,false),
         revision=revision+1,updated_at=now()
   where id=v_room_id;
  v_result:=public.kuwaiti_online_ai_turn(v_room_id);
  select public_state into v_state from public.game_rooms where id=v_room_id;

  -- The remaining auction is resolved with the existing AI function by marking
  -- each current seat as AI in the test fixture only.
  for i in 1..30 loop
    exit when v_state->>'phase'='playing';
    v_seat:=coalesce((v_state->>'turn')::integer,(v_state->>'auctionWinner')::integer);
    if v_seat is null then raise exception 'AI phase has no assigned seat'; end if;
    update public.game_rooms
       set public_state=jsonb_set(public_state,array['seatPlayers',v_seat::text,'human'],'false'::jsonb,false),
           revision=revision+1,updated_at=now()
     where id=v_room_id;
    v_result:=public.kuwaiti_online_ai_turn(v_room_id);
    select public_state into v_state from public.game_rooms where id=v_room_id;
  end loop;
  if v_state->>'phase'<>'playing' then
    raise exception 'could not reach card-play phase for timeout test: %',v_state->>'phase';
  end if;

  -- Restore the current seat as human and verify that the server stamps ten seconds.
  v_seat:=(v_state->>'turn')::integer;
  update public.game_rooms
     set public_state=jsonb_set(public_state,array['seatPlayers',v_seat::text,'human'],'true'::jsonb,false),
         revision=revision+1,updated_at=now()
   where id=v_room_id;
  select public_state into v_state from public.game_rooms where id=v_room_id;
  v_deadline:=nullif(v_state->>'turnDeadline','')::numeric;
  if v_deadline is null or v_deadline<extract(epoch from clock_timestamp())+9 then
    raise exception 'server did not stamp a ten-second deadline: %',v_state->>'turnDeadline';
  end if;
  select jsonb_array_length(cards) into v_before
    from public.kuwaiti_online_hands where room_id=v_room_id and seat=v_seat;

  perform pg_sleep(10.2);
  perform set_config('request.jwt.claim.sub',v_host::text,false);
  v_result:=public.kuwaiti_online_timeout(v_room_id);
  if coalesce((v_result->>'timed_out')::boolean,false) is not true then
    raise exception 'expired human turn was not auto-played: %',v_result;
  end if;

  select public_state into v_state from public.game_rooms where id=v_room_id;
  select jsonb_array_length(cards) into v_after
    from public.kuwaiti_online_hands where room_id=v_room_id and seat=v_seat;
  if v_after<>v_before-1 then
    raise exception 'AI timeout must remove exactly one legal card from the expired seat hand';
  end if;
  if coalesce(v_state->'seatPlayers'->v_seat::text->>'human','false')<>'true' then
    raise exception 'expired human seat marker was not restored after AI play';
  end if;
  if (v_state->>'turn')::integer=v_seat then
    raise exception 'turn did not advance after the timeout AI play';
  end if;
  if v_state ? 'hands' then raise exception 'private hands leaked into public state'; end if;

  raise notice 'PASS: six-player server deadline, host timeout RPC, legal AI card, hand decrement and human-seat restoration';
end;
$$;
