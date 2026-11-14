-- The human who declares the challenge becomes the opening leader.
-- Ordinary games (all players pass) keep the existing default opening seat.
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
   -- The challenger leads the first trick; subsequent leads follow trick winners.
   v_state:=jsonb_set(v_state,'{leader}',to_jsonb(v_seat),true);
   v_state:=jsonb_set(v_state,'{turn}',to_jsonb(v_seat),true);
   v_state:=jsonb_set(v_state,'{message}',to_jsonb((case when v_team='A' then 'بازیکن هم‌تیمی شما وارد چالش شد و شروع‌کننده بازی است' else 'حریف علیه شما اعلام چالش کرد و شروع‌کننده بازی است' end)::text),true);
 else
   v_passed:=coalesce(v_state->'challengePassed','[]'::jsonb)||jsonb_build_array(v_seat);
   select count(*) into v_humans from public.room_game_hands where room_id=p_room_id and owner_user_id is not null;
   v_state:=jsonb_set(v_state,'{challengePassed}',v_passed,true);
   if jsonb_array_length(v_passed)>=v_humans then
     v_state:=jsonb_set(v_state,'{phase}','"playing"'::jsonb,true);
     v_state:=jsonb_set(v_state,'{challengeTeam}','null'::jsonb,true);
     v_state:=jsonb_set(v_state,'{message}',to_jsonb('همه بازیکنان از چالش عبور کردند؛ بازی عادی آغاز شد'::text),true);
   else
     v_state:=jsonb_set(v_state,'{message}',to_jsonb('انتخاب شما ثبت شد؛ منتظر تصمیم سایر بازیکنان هستیم'::text),true);
   end if;
 end if;
 update public.game_rooms set public_state=v_state,revision=revision+1,updated_at=now() where id=p_room_id;
 return jsonb_build_object('room_id',p_room_id,'state',v_state,'choice_recorded',true);
end; $$;

revoke all on function public.submit_room_challenge_choice(uuid,text) from public;
grant execute on function public.submit_room_challenge_choice(uuid,text) to authenticated;
