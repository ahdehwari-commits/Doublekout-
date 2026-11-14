-- Rotating per-player challenge decision with a 7s default turn and one 15s extension.
create or replace function public.start_room_game(
 p_room_id uuid,p_start_with_present boolean default false,p_trump text default 'S',p_challenge_team text default null
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_state jsonb; v_revision bigint; v_turn integer:=0; v_owner uuid;
begin
 perform public.start_room_game_before_decision(p_room_id,p_start_with_present,p_trump,null);
 select public_state,revision into v_state,v_revision from public.game_rooms where id=p_room_id;
 if (select game_mode from public.game_rooms where id=p_room_id)='double-kout' then
   select owner_user_id into v_owner from public.room_game_hands where room_id=p_room_id and seat=v_turn;
   while v_owner is null and v_turn<4 loop
     v_turn:=v_turn+1;
     select owner_user_id into v_owner from public.room_game_hands where room_id=p_room_id and seat=v_turn;
   end loop;
   v_state:=jsonb_set(v_state,'{phase}','"challenge_decision"'::jsonb,true);
   v_state:=jsonb_set(v_state,'{challengeTurn}',to_jsonb(v_turn),true);
   v_state:=jsonb_set(v_state,'{challengeDeadline}',to_jsonb(extract(epoch from clock_timestamp())+7),true);
   v_state:=jsonb_set(v_state,'{challengeExtended}','false'::jsonb,true);
   v_state:=jsonb_set(v_state,'{challengePassed}','[]'::jsonb,true);
   v_state:=jsonb_set(v_state,'{challengeInitiator}','null'::jsonb,true);
   v_state:=jsonb_set(v_state,'{challengeTeam}','null'::jsonb,true);
   v_state:=jsonb_set(v_state,'{message}',to_jsonb('کارت‌ها پخش شد؛ نوبت انتخاب چالش به بازیکن اول رسید'::text),true);
 else
   v_state:=jsonb_set(v_state,'{phase}','"playing"'::jsonb,true);
   v_state:=jsonb_set(v_state,'{challengeTeam}','null'::jsonb,true);
   v_state:=jsonb_set(v_state,'{message}',to_jsonb('بازی عادی آغاز شد'::text),true);
 end if;
 update public.game_rooms set public_state=v_state,revision=revision+1,updated_at=now() where id=p_room_id;
 return jsonb_build_object('room_id',p_room_id,'status','playing','revision',v_revision+1,'state',v_state,'decision_required',(v_state->>'phase'='challenge_decision'));
end; $$;

create or replace function public.submit_room_challenge_choice(p_room_id uuid,p_choice text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_user uuid:=auth.uid(); v_room public.game_rooms%rowtype; v_state jsonb; v_seat integer; v_team text; v_next integer; v_owner uuid; v_passed jsonb;
begin
 if v_user is null then raise exception 'authentication_required'; end if;
 if p_choice not in ('pass','challenge') then raise exception 'invalid_challenge_choice'; end if;
 select * into v_room from public.game_rooms where id=p_room_id for update;
 if not found or v_room.status<>'playing' then raise exception 'room_not_playing'; end if;
 v_state:=v_room.public_state;
 if v_state->>'phase'<>'challenge_decision' then raise exception 'challenge_decision_not_pending'; end if;
 v_seat:=(v_state->>'challengeTurn')::integer;
 if not exists(select 1 from public.room_game_hands where room_id=p_room_id and seat=v_seat and owner_user_id=v_user) then raise exception 'not_your_challenge_turn'; end if;
 if extract(epoch from clock_timestamp())>(v_state->>'challengeDeadline')::numeric then raise exception 'challenge_turn_expired'; end if;
 if p_choice='challenge' then
   v_team:=case when mod(v_seat,2)=0 then 'A' else 'B' end;
   v_state:=jsonb_set(v_state,'{challengeTeam}',to_jsonb(v_team),true);
   v_state:=jsonb_set(v_state,'{challengeInitiator}',to_jsonb(v_seat),true);
   v_state:=jsonb_set(v_state,'{phase}','"playing"'::jsonb,true);
   v_state:=jsonb_set(v_state,'{turn}',to_jsonb(0),true);
   v_state:=jsonb_set(v_state,'{message}',to_jsonb('چالش اعلام شد؛ بازی آغاز می‌شود'::text),true);
 else
   v_passed:=coalesce(v_state->'challengePassed','[]'::jsonb)||jsonb_build_array(v_seat);
   v_next:=v_seat;
   loop
     v_next:=(v_next+1)%4;
     exit when v_next=v_seat;
     select owner_user_id into v_owner from public.room_game_hands where room_id=p_room_id and seat=v_next;
     if v_owner is not null and not (v_passed @> jsonb_build_array(v_next)) then exit; end if;
     if v_next=v_seat then exit; end if;
   end loop;
   v_state:=jsonb_set(v_state,'{challengePassed}',v_passed,true);
   if v_next=v_seat or jsonb_array_length(v_passed)>= (select count(*) from public.room_game_hands where room_id=p_room_id and owner_user_id is not null) then
     v_state:=jsonb_set(v_state,'{phase}','"playing"'::jsonb,true);
     v_state:=jsonb_set(v_state,'{challengeTeam}','null'::jsonb,true);
     v_state:=jsonb_set(v_state,'{turn}',to_jsonb(0),true);
     v_state:=jsonb_set(v_state,'{message}',to_jsonb('همه بازیکنان از چالش عبور کردند؛ بازی عادی آغاز شد'::text),true);
   else
     v_state:=jsonb_set(v_state,'{challengeTurn}',to_jsonb(v_next),true);
     v_state:=jsonb_set(v_state,'{challengeDeadline}',to_jsonb(extract(epoch from clock_timestamp())+7),true);
     v_state:=jsonb_set(v_state,'{challengeExtended}','false'::jsonb,true);
     v_state:=jsonb_set(v_state,'{message}',to_jsonb('نوبت انتخاب چالش به بازیکن بعدی رسید'::text),true);
   end if;
 end if;
 update public.game_rooms set public_state=v_state,revision=revision+1,updated_at=now() where id=p_room_id;
 return jsonb_build_object('room_id',p_room_id,'state',v_state,'choice_recorded',true);
end; $$;

create or replace function public.extend_room_challenge_time(p_room_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_user uuid:=auth.uid(); v_room public.game_rooms%rowtype; v_state jsonb; v_seat integer;
begin
 if v_user is null then raise exception 'authentication_required'; end if;
 select * into v_room from public.game_rooms where id=p_room_id for update;
 if not found or v_room.status<>'playing' then raise exception 'room_not_playing'; end if;
 v_state:=v_room.public_state;
 if v_state->>'phase'<>'challenge_decision' then raise exception 'challenge_decision_not_pending'; end if;
 v_seat:=(v_state->>'challengeTurn')::integer;
 if not exists(select 1 from public.room_game_hands where room_id=p_room_id and seat=v_seat and owner_user_id=v_user) then raise exception 'not_your_challenge_turn'; end if;
 if coalesce((v_state->>'challengeExtended')::boolean,false) then raise exception 'challenge_time_already_extended'; end if;
 if extract(epoch from clock_timestamp())>(v_state->>'challengeDeadline')::numeric then raise exception 'challenge_turn_expired'; end if;
 v_state:=jsonb_set(v_state,'{challengeDeadline}',to_jsonb((v_state->>'challengeDeadline')::numeric+15),true);
 v_state:=jsonb_set(v_state,'{challengeExtended}','true'::jsonb,true);
 v_state:=jsonb_set(v_state,'{message}',to_jsonb('۱۵ ثانیه زمان بیشتر برای انتخاب شما ثبت شد'::text),true);
 update public.game_rooms set public_state=v_state,revision=revision+1,updated_at=now() where id=p_room_id;
 return jsonb_build_object('room_id',p_room_id,'state',v_state,'extended',true);
end; $$;

create or replace function public.expire_room_challenge_turn(p_room_id uuid,p_expected_seat smallint)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_user uuid:=auth.uid(); v_room public.game_rooms%rowtype; v_state jsonb; v_seat integer; v_next integer; v_owner uuid; v_passed jsonb; v_humans integer;
begin
 if v_user is null then raise exception 'authentication_required'; end if;
 select * into v_room from public.game_rooms where id=p_room_id for update;
 if not found or v_room.status<>'playing' then raise exception 'room_not_playing'; end if;
 if not exists(select 1 from public.room_members where room_id=p_room_id and user_id=v_user) then raise exception 'not_a_room_member'; end if;
 v_state:=v_room.public_state;
 if v_state->>'phase'<>'challenge_decision' then return jsonb_build_object('expired',false,'state',v_state); end if;
 v_seat:=(v_state->>'challengeTurn')::integer;
 if v_seat<>p_expected_seat then return jsonb_build_object('expired',false,'state',v_state); end if;
 if extract(epoch from clock_timestamp())<=(v_state->>'challengeDeadline')::numeric then return jsonb_build_object('expired',false,'state',v_state); end if;
 v_passed:=coalesce(v_state->'challengePassed','[]'::jsonb)||jsonb_build_array(v_seat);
 select count(*) into v_humans from public.room_game_hands where room_id=p_room_id and owner_user_id is not null;
 v_next:=v_seat;
 loop
   v_next:=(v_next+1)%4;
   exit when v_next=v_seat;
   select owner_user_id into v_owner from public.room_game_hands where room_id=p_room_id and seat=v_next;
   if v_owner is not null and not (v_passed @> jsonb_build_array(v_next)) then exit; end if;
 end loop;
 v_state:=jsonb_set(v_state,'{challengePassed}',v_passed,true);
 if v_next=v_seat or jsonb_array_length(v_passed)>=v_humans then
   v_state:=jsonb_set(v_state,'{phase}','"playing"'::jsonb,true);
   v_state:=jsonb_set(v_state,'{challengeTeam}','null'::jsonb,true);
   v_state:=jsonb_set(v_state,'{turn}',to_jsonb(0),true);
   v_state:=jsonb_set(v_state,'{message}',to_jsonb('زمان انتخاب همه بازیکنان تمام شد؛ بازی عادی آغاز شد'::text),true);
 else
   v_state:=jsonb_set(v_state,'{challengeTurn}',to_jsonb(v_next),true);
   v_state:=jsonb_set(v_state,'{challengeDeadline}',to_jsonb(extract(epoch from clock_timestamp())+7),true);
   v_state:=jsonb_set(v_state,'{challengeExtended}','false'::jsonb,true);
   v_state:=jsonb_set(v_state,'{message}',to_jsonb('مهلت بازیکن تمام شد؛ نوبت انتخاب به بازیکن بعدی رسید'::text),true);
 end if;
 update public.game_rooms set public_state=v_state,revision=revision+1,updated_at=now() where id=p_room_id;
 return jsonb_build_object('expired',true,'state',v_state);
end; $$;

revoke all on function public.submit_room_challenge_choice(uuid,text) from public;
revoke all on function public.extend_room_challenge_time(uuid) from public;
revoke all on function public.expire_room_challenge_turn(uuid,smallint) from public;
grant execute on function public.submit_room_challenge_choice(uuid,text) to authenticated;
grant execute on function public.extend_room_challenge_time(uuid) to authenticated;
grant execute on function public.expire_room_challenge_turn(uuid,smallint) to authenticated;
