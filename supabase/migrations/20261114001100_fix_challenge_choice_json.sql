-- Fix polymorphic JSON text literals in simultaneous challenge choice/expiry RPCs.
create or replace function public.submit_room_challenge_choice(p_room_id uuid,p_choice text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
 v_user uuid:=auth.uid(); v_room public.game_rooms%rowtype; v_state jsonb;
 v_seat integer; v_team text; v_passed jsonb; v_humans integer;
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
 if p_choice='challenge' then
   v_team:=case when mod(v_seat,2)=0 then 'A' else 'B' end;
   v_state:=jsonb_set(v_state,'{challengeTeam}',to_jsonb(v_team),true);
   v_state:=jsonb_set(v_state,'{challengeInitiator}',to_jsonb(v_seat),true);
   v_state:=jsonb_set(v_state,'{phase}','"playing"'::jsonb,true);
   v_state:=jsonb_set(v_state,'{turn}',to_jsonb(0),true);
   v_state:=jsonb_set(v_state,'{message}',to_jsonb((case when v_team='A' then 'بازیکن هم‌تیمی شما وارد چالش شد؛ بازی آغاز شد' else 'حریف علیه شما اعلام چالش کرد؛ بازی آغاز شد' end)::text),true);
 else
   v_passed:=coalesce(v_state->'challengePassed','[]'::jsonb)||jsonb_build_array(v_seat);
   select count(*) into v_humans from public.room_game_hands where room_id=p_room_id and owner_user_id is not null;
   v_state:=jsonb_set(v_state,'{challengePassed}',v_passed,true);
   if jsonb_array_length(v_passed)>=v_humans then
     v_state:=jsonb_set(v_state,'{phase}','"playing"'::jsonb,true);
     v_state:=jsonb_set(v_state,'{challengeTeam}','null'::jsonb,true);
     v_state:=jsonb_set(v_state,'{turn}',to_jsonb(0),true);
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
 v_passed jsonb; v_humans integer;
begin
 if v_user is null then raise exception 'authentication_required'; end if;
 select * into v_room from public.game_rooms where id=p_room_id for update;
 if not found or v_room.status<>'playing' then raise exception 'room_not_playing'; end if;
 if not exists(select 1 from public.room_members where room_id=p_room_id and user_id=v_user) then raise exception 'not_a_room_member'; end if;
 v_state:=v_room.public_state;
 if v_state->>'phase'<>'challenge_decision' then return jsonb_build_object('expired',false,'state',v_state); end if;
 if not (v_state->'challengeDeadlines' ? p_expected_seat::text) then return jsonb_build_object('expired',false,'state',v_state); end if;
 if extract(epoch from clock_timestamp())<=(v_state->'challengeDeadlines'->>p_expected_seat::text)::numeric then return jsonb_build_object('expired',false,'state',v_state); end if;
 v_passed:=coalesce(v_state->'challengePassed','[]'::jsonb);
 if v_passed @> jsonb_build_array(p_expected_seat) then return jsonb_build_object('expired',false,'state',v_state); end if;
 v_passed:=v_passed||jsonb_build_array(p_expected_seat);
 select count(*) into v_humans from public.room_game_hands where room_id=p_room_id and owner_user_id is not null;
 v_state:=jsonb_set(v_state,'{challengePassed}',v_passed,true);
 if jsonb_array_length(v_passed)>=v_humans then
   v_state:=jsonb_set(v_state,'{phase}','"playing"'::jsonb,true);
   v_state:=jsonb_set(v_state,'{challengeTeam}','null'::jsonb,true);
   v_state:=jsonb_set(v_state,'{turn}',to_jsonb(0),true);
   v_state:=jsonb_set(v_state,'{message}',to_jsonb('مهلت همه بازیکنان تمام شد؛ بازی عادی آغاز شد'::text),true);
 else
   v_state:=jsonb_set(v_state,'{message}',to_jsonb('مهلت یک بازیکن تمام شد؛ سایر بازیکنان همچنان فرصت انتخاب دارند'::text),true);
 end if;
 update public.game_rooms set public_state=v_state,revision=revision+1,updated_at=now() where id=p_room_id;
 return jsonb_build_object('expired',true,'state',v_state);
end; $$;

revoke all on function public.submit_room_challenge_choice(uuid,text) from public;
revoke all on function public.expire_room_challenge_turn(uuid,smallint) from public;
grant execute on function public.submit_room_challenge_choice(uuid,text) to authenticated;
grant execute on function public.expire_room_challenge_turn(uuid,smallint) to authenticated;
