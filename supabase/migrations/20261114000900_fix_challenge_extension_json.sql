-- Fix polymorphic JSON conversion in the individual challenge-time extension.
create or replace function public.extend_room_challenge_time(p_room_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
 v_user uuid:=auth.uid(); v_room public.game_rooms%rowtype; v_state jsonb;
 v_seat integer; v_deadline numeric; v_extended jsonb;
begin
 if v_user is null then raise exception 'authentication_required'; end if;
 select * into v_room from public.game_rooms where id=p_room_id for update;
 if not found or v_room.status<>'playing' then raise exception 'room_not_playing'; end if;
 v_state:=v_room.public_state;
 if v_state->>'phase'<>'challenge_decision' then raise exception 'challenge_decision_not_pending'; end if;
 select seat into v_seat from public.room_game_hands where room_id=p_room_id and owner_user_id=v_user;
 if v_seat is null then raise exception 'not_your_seat'; end if;
 if coalesce(v_state->'challengePassed','[]'::jsonb) @> jsonb_build_array(v_seat) then raise exception 'choice_already_recorded'; end if;
 v_extended:=coalesce(v_state->'challengeExtendedSeats','[]'::jsonb);
 if v_extended @> jsonb_build_array(v_seat) then raise exception 'challenge_time_already_extended'; end if;
 v_deadline:=(v_state->'challengeDeadlines'->>v_seat::text)::numeric;
 if extract(epoch from clock_timestamp())>v_deadline then raise exception 'challenge_turn_expired'; end if;
 v_state:=jsonb_set(v_state,array['challengeDeadlines',v_seat::text],to_jsonb(v_deadline+15),true);
 v_state:=jsonb_set(v_state,'{challengeExtendedSeats}',v_extended||jsonb_build_array(v_seat),true);
 v_state:=jsonb_set(v_state,'{message}',to_jsonb('۱۵ ثانیه زمان بیشتر برای شما ثبت شد'::text),true);
 update public.game_rooms set public_state=v_state,revision=revision+1,updated_at=now() where id=p_room_id;
 return jsonb_build_object('room_id',p_room_id,'state',v_state,'extended',true);
end; $$;

revoke all on function public.extend_room_challenge_time(uuid) from public;
grant execute on function public.extend_room_challenge_time(uuid) to authenticated;
