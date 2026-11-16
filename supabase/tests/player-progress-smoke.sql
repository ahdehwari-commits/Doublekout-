-- Central player progress smoke test. Run after all migrations in the isolated CI database.
insert into auth.users(id,raw_user_meta_data,is_anonymous)
values
 ('10000000-0000-4000-8000-000000000001','{"display_name":"آزمایش الف"}'::jsonb,false),
 ('10000000-0000-4000-8000-000000000002','{"display_name":"آزمایش ب"}'::jsonb,false)
on conflict(id) do nothing;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',false);
do $$
declare first_award jsonb; duplicate_award jsonb; p jsonb; lb jsonb; room uuid;
begin
 first_award:=public.award_local_game_win('local-smoke-test-0001','double-kout');
 duplicate_award:=public.award_local_game_win('local-smoke-test-0001','double-kout');
 if first_award->>'awarded'<>'true' then raise exception 'first local win was not awarded'; end if;
 if duplicate_award->>'awarded'<>'false' then raise exception 'duplicate local win was awarded twice'; end if;
 p:=public.get_my_progress();
 if (p->>'points')::integer<>2 or (p->>'wins')::integer<>1 then raise exception 'local progress total is incorrect: %',p; end if;
 lb:=public.get_player_leaderboard(20);
 if jsonb_array_length(lb)<1 then raise exception 'leaderboard did not include winning player'; end if;
 insert into public.game_rooms(code,game_mode,player_count,host_user_id,status,public_state,revision)
 values('A1B2C3','double-kout',4,'10000000-0000-4000-8000-000000000001','playing',
 '{"phase":"playing","challengeTeam":null,"scoreA":8,"scoreB":5}'::jsonb,1)
 returning id into room;
 insert into public.room_members(room_id,user_id,seat,display_name,is_host)
 values(room,'10000000-0000-4000-8000-000000000001',0,'آزمایش الف',true),
       (room,'10000000-0000-4000-8000-000000000002',1,'آزمایش ب',false);
 update public.game_rooms set status='finished',revision=2,
 public_state='{"phase":"finished","challengeTeam":null,"scoreA":8,"scoreB":5}'::jsonb
 where id=room;
 if (select points from public.player_profiles where user_id='10000000-0000-4000-8000-000000000001')<>4 then
  raise exception 'online winner did not receive two points';
 end if;
 if (select points from public.player_profiles where user_id='10000000-0000-4000-8000-000000000002')<>0 then
  raise exception 'online losing player received a point';
 end if;
end $$;
