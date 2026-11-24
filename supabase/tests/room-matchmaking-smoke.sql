-- Transactional smoke test for automatic two-room matchmaking.
-- Uses four existing auth users and rolls back every test room/game mutation.
begin;
do $test$
declare
  u uuid[];
  r1 uuid; r2 uuid; c1 text; c2 text;
  result jsonb; st jsonb;
begin
  select array_agg(id order by created_at) into u
  from (select id,created_at from auth.users order by created_at limit 4) x;
  if coalesce(array_length(u,1),0) <> 4 then
    raise exception 'smoke_test_requires_four_auth_users';
  end if;

  -- Four-player: two ready pairs become opposing teams and all four remain human.
  c1:=upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
  c2:=upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
  insert into public.game_rooms(code,game_mode,player_count,host_user_id,created_at)
  values(c1,'double-kout',4,u[1],now()-interval '2 minutes') returning id into r1;
  insert into public.game_rooms(code,game_mode,player_count,host_user_id,created_at)
  values(c2,'double-kout',4,u[3],now()-interval '1 minute') returning id into r2;
  insert into public.room_members(room_id,user_id,seat,display_name,is_host,ready,last_seen_at) values
    (r1,u[1],0,'Test A host',true,true,clock_timestamp()),
    (r1,u[2],1,'Test A guest',false,true,clock_timestamp()),
    (r2,u[3],0,'Test B host',true,true,clock_timestamp()),
    (r2,u[4],1,'Test B guest',false,true,clock_timestamp());

  perform set_config('request.jwt.claim.sub',u[3]::text,true);
  result:=public.try_merge_waiting_rooms(r2);
  if not coalesce((result->>'merged')::boolean,false) or result->>'room_id'<>r1::text then
    raise exception 'four_player_merge_failed: %',result;
  end if;
  if (select count(*) from public.room_members where room_id=r1)<>4 then
    raise exception 'four_player_roster_count_incorrect';
  end if;
  if not exists(select 1 from public.room_members where room_id=r1 and user_id=u[1] and seat=0 and is_host)
     or not exists(select 1 from public.room_members where room_id=r1 and user_id=u[2] and seat=2)
     or not exists(select 1 from public.room_members where room_id=r1 and user_id=u[3] and seat=1 and not is_host)
     or not exists(select 1 from public.room_members where room_id=r1 and user_id=u[4] and seat=3) then
    raise exception 'four_player_team_seat_mapping_incorrect';
  end if;

  perform set_config('request.jwt.claim.sub',u[1]::text,true);
  result:=public.host_decide_room_start(r1,'human');
  st:=result->'state';
  if coalesce((st->>'humanCount')::integer,0)<>4 then
    raise exception 'four_player_start_did_not_keep_four_humans';
  end if;
  if exists(select 1 from jsonb_each(st->'seatPlayers') x where coalesce((x.value->>'human')::boolean,false)=false) then
    raise exception 'four_player_start_contains_ai_seat';
  end if;

  perform set_config('request.jwt.claim.sub',u[3]::text,true);
  result:=public.try_merge_waiting_rooms(r2);
  if result->>'room_id'<>r1::text or not coalesce((result->>'redirected')::boolean,false) then
    raise exception 'four_player_source_redirect_failed: %',result;
  end if;

  -- Six-player Kuwaiti: four real players plus two AI seats.
  c1:=upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
  c2:=upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
  insert into public.game_rooms(code,game_mode,player_count,host_user_id,created_at)
  values(c1,'kuwaiti',6,u[1],now()-interval '2 minutes') returning id into r1;
  insert into public.game_rooms(code,game_mode,player_count,host_user_id,created_at)
  values(c2,'kuwaiti',6,u[3],now()-interval '1 minute') returning id into r2;
  insert into public.room_members(room_id,user_id,seat,display_name,is_host,ready,last_seen_at) values
    (r1,u[1],0,'Test A host',true,true,clock_timestamp()),
    (r1,u[2],1,'Test A guest',false,true,clock_timestamp()),
    (r2,u[3],0,'Test B host',true,true,clock_timestamp()),
    (r2,u[4],1,'Test B guest',false,true,clock_timestamp());

  perform set_config('request.jwt.claim.sub',u[3]::text,true);
  result:=public.try_merge_waiting_rooms(r2);
  if not coalesce((result->>'merged')::boolean,false) or result->>'room_id'<>r1::text then
    raise exception 'six_player_merge_failed: %',result;
  end if;

  perform set_config('request.jwt.claim.sub',u[1]::text,true);
  result:=public.kuwaiti_online_start_with_ai(r1,54,true);
  st:=result->'state';
  if jsonb_array_length(coalesce(st->'aiSeats','[]'::jsonb))<>2 then
    raise exception 'six_player_ai_fill_not_two';
  end if;
  if (select count(*) from jsonb_each(st->'seatPlayers') x where (x.value->>'human')::boolean)<>4 then
    raise exception 'six_player_start_did_not_keep_four_humans';
  end if;

  raise notice 'PASS: four-player merge keeps four humans; six-player merge keeps four humans and fills two AI seats.';
end;
$test$;
rollback;
