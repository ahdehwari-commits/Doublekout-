-- Set the initial simultaneous challenge decision window to ten seconds.
create or replace function public.start_room_game(
 p_room_id uuid,p_start_with_present boolean default false,p_trump text default 'S',p_challenge_team text default null
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
 v_state jsonb; v_revision bigint; v_now numeric:=extract(epoch from clock_timestamp());
 v_deadlines jsonb:='{}'::jsonb; v_hand record;
begin
 perform public.start_room_game_before_decision(p_room_id,p_start_with_present,p_trump,null);
 select public_state,revision into v_state,v_revision from public.game_rooms where id=p_room_id;
 if (select game_mode from public.game_rooms where id=p_room_id)='double-kout' then
   for v_hand in select seat from public.room_game_hands where room_id=p_room_id and owner_user_id is not null loop
     v_deadlines:=jsonb_set(v_deadlines,array[v_hand.seat::text],to_jsonb(v_now+10),true);
   end loop;
   v_state:=jsonb_set(v_state,'{phase}','"challenge_decision"'::jsonb,true);
   v_state:=jsonb_set(v_state,'{challengeStartedAt}',to_jsonb(v_now),true);
   v_state:=jsonb_set(v_state,'{challengeDeadlines}',v_deadlines,true);
   v_state:=jsonb_set(v_state,'{challengeExtendedSeats}','[]'::jsonb,true);
   v_state:=jsonb_set(v_state,'{challengePassed}','[]'::jsonb,true);
   v_state:=jsonb_set(v_state,'{challengeInitiator}','null'::jsonb,true);
   v_state:=jsonb_set(v_state,'{challengeTeam}','null'::jsonb,true);
   v_state:=jsonb_set(v_state,'{message}',to_jsonb('کارت‌ها پخش شد؛ ۱۰ ثانیه فرصت انتخاب چالش برای همه بازیکنان هم‌زمان آغاز شد'::text),true);
 else
   v_state:=jsonb_set(v_state,'{phase}','"playing"'::jsonb,true);
   v_state:=jsonb_set(v_state,'{challengeTeam}','null'::jsonb,true);
   v_state:=jsonb_set(v_state,'{message}',to_jsonb('بازی عادی آغاز شد'::text),true);
 end if;
 update public.game_rooms set public_state=v_state,revision=revision+1,updated_at=now() where id=p_room_id;
 return jsonb_build_object('room_id',p_room_id,'status','playing','revision',v_revision+1,'state',v_state,'decision_required',(v_state->>'phase'='challenge_decision'));
end; $$;
