-- Ten-second server-authoritative turn deadline and host-driven timeout play.
create or replace function public.apply_room_card(
  p_room_id uuid,p_seat smallint,p_card_id text,p_is_ai boolean default false
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_room public.game_rooms%rowtype;
  v_hand public.room_game_hands%rowtype;
  v_state jsonb;
  v_cards jsonb;
  v_card jsonb;
  v_plays jsonb;
  v_play jsonb;
  v_lead text;
  v_best_suit text;
  v_best_rank text;
  v_best_power integer;
  v_power integer;
  v_winner integer;
  v_turn integer;
  v_next integer;
  v_done boolean := false;
  v_winners jsonb;
  v_challenge text;
  v_opponent text;
  v_fail_at integer;
  v_score_a integer := 0;
  v_score_b integer := 0;
  v_group_start integer;
  v_search_from integer;
  v_close_at integer;
  v_group_team integer;
  v_group_end integer;
  v_count integer;
  v_rank_order text[] := array['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
  v_i integer;
  v_trump text;
  v_card_suit text;
  v_card_rank text;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  select * into v_room from public.game_rooms where id=p_room_id for update;
  if not found or v_room.status <> 'playing' then raise exception 'room_not_playing'; end if;
  v_state := v_room.public_state;
  v_turn := (v_state->>'turn')::integer;
  if v_turn <> p_seat then raise exception 'not_your_turn'; end if;
  select * into v_hand from public.room_game_hands
    where room_id=p_room_id and seat=p_seat for update;
  if not found then raise exception 'hand_not_found'; end if;
  if p_is_ai then
    if v_room.host_user_id <> v_user then raise exception 'ai_turn_not_authorized'; end if;
    if v_hand.owner_user_id is not null and
       (v_state->>'turnDeadline' is null or extract(epoch from clock_timestamp()) < (v_state->>'turnDeadline')::numeric) then
      raise exception 'human_turn_not_expired';
    end if;
  else
    if v_hand.owner_user_id is distinct from v_user then raise exception 'not_your_seat'; end if;
    if v_state->>'turnDeadline' is not null and extract(epoch from clock_timestamp()) > (v_state->>'turnDeadline')::numeric then
      raise exception 'turn_time_expired';
    end if;
  end if;
  v_cards := v_hand.cards;
  if p_is_ai then
    v_card := (select x from jsonb_array_elements(v_cards) x
      where (v_state->'plays'='[]'::jsonb or
        x->>'suit' = (v_state->'plays'->0->'card'->>'suit'))
      order by random() limit 1);
    if v_card is null then
      v_card := (select x from jsonb_array_elements(v_cards) x order by random() limit 1);
    end if;
  else
    select x into v_card from jsonb_array_elements(v_cards) x where x->>'id'=p_card_id;
  end if;
  if v_card is null then raise exception 'card_not_in_hand'; end if;
  v_card_suit := v_card->>'suit'; v_card_rank := v_card->>'rank';
  v_plays := coalesce(v_state->'plays','[]'::jsonb);
  if jsonb_array_length(v_plays)>0 then
    v_lead := v_plays->0->'card'->>'suit';
    if exists(select 1 from jsonb_array_elements(v_cards) x where x->>'suit'=v_lead)
       and v_card_suit <> v_lead then raise exception 'must_follow_suit'; end if;
  end if;
  v_cards := (select coalesce(jsonb_agg(x),'[]'::jsonb)
    from jsonb_array_elements(v_cards) x where x->>'id' <> v_card->>'id');
  update public.room_game_hands set cards=v_cards,updated_at=now()
    where room_id=p_room_id and seat=p_seat;
  v_play := jsonb_build_object('seat',p_seat,'card',v_card);
  v_plays := v_plays || jsonb_build_array(v_play);
  v_count := jsonb_array_length(v_plays);
  if v_count=4 then
    v_lead := v_plays->0->'card'->>'suit';
    v_best_suit := v_lead;
    v_best_rank := v_plays->0->'card'->>'rank';
    v_winner := (v_plays->0->>'seat')::integer;
    v_trump := v_state->>'trump';
    for v_i in 1..3 loop
      v_card_suit := v_plays->v_i->'card'->>'suit';
      v_card_rank := v_plays->v_i->'card'->>'rank';
      v_power := array_position(v_rank_order,v_card_rank);
      v_best_power := array_position(v_rank_order,v_best_rank);
      if (v_card_suit=v_trump and v_best_suit<>v_trump)
        or (v_card_suit=v_best_suit and v_power>v_best_power)
        or (v_card_suit=v_lead and v_best_suit<>v_trump and v_best_suit<>v_lead) then
        v_winner := (v_plays->v_i->>'seat')::integer;
        v_best_suit := v_card_suit; v_best_rank := v_card_rank;
      end if;
    end loop;
    v_state := jsonb_set(v_state,'{trickWinners}',
      coalesce(v_state->'trickWinners','[]'::jsonb)||jsonb_build_array(v_winner),true);
    v_state := jsonb_set(v_state,'{plays}','[]'::jsonb,true);
    v_state := jsonb_set(v_state,'{leader}',to_jsonb(v_winner),true);
    v_state := jsonb_set(v_state,'{turn}',to_jsonb(v_winner),true);
    v_state := jsonb_set(v_state,'{trickNo}',to_jsonb((v_state->>'trickNo')::integer+1),true);
    v_winners := v_state->'trickWinners';
    v_challenge := v_state->>'challengeTeam';
    if v_challenge is not null then
      v_opponent := case when v_challenge='A' then 'B' else 'A' end;
      v_fail_at := null;
      for v_i in 3..jsonb_array_length(v_winners)-1 loop
        if mod((v_winners->>v_i)::integer,2)::text = (case when v_opponent='A' then '0' else '1' end)
           and (v_winners->>v_i)=(v_winners->>(v_i-1)) then
          v_fail_at := v_i+1; exit;
        end if;
      end loop;
      if v_fail_at is not null then
        v_state := jsonb_set(v_state,'{challengeResult}',jsonb_build_object('status','failed-opponent-sequence','endedAtTrick',v_fail_at),true);
        v_done := true;
      elsif jsonb_array_length(v_winners)=13 then
        if (case when mod((v_winners->>12)::integer,2)=0 then 'A' else 'B' end)=v_challenge then
          v_state := jsonb_set(v_state,'{challengeResult}',jsonb_build_object('status','success','endedAtTrick',13),true);
        else
          v_state := jsonb_set(v_state,'{challengeResult}',jsonb_build_object('status','failed-last-trick','endedAtTrick',13),true);
        end if;
        v_done := true;
      end if;
    elsif jsonb_array_length(v_winners)=13 then
      if v_room.game_mode='double-kout' then
        v_group_start:=0; v_search_from:=3;
        while v_group_start<13 loop
          v_close_at:=null;
          for v_i in v_search_from..12 loop
            if (v_winners->>v_i)=(v_winners->>(v_i-1)) then v_close_at:=v_i; exit; end if;
          end loop;
          if v_close_at is not null then
            v_group_team:=mod((v_winners->>v_close_at)::integer,2);
            v_group_end:=v_close_at;
            if v_group_team=0 then v_score_a:=v_score_a+(v_group_end-v_group_start+1);
            else v_score_b:=v_score_b+(v_group_end-v_group_start+1); end if;
            v_group_start:=v_close_at+1; v_search_from:=v_group_start+1;
          else
            v_group_team:=mod((v_winners->>12)::integer,2);
            if v_group_team=0 then v_score_a:=v_score_a+(13-v_group_start);
            else v_score_b:=v_score_b+(13-v_group_start); end if;
            v_group_start:=13;
          end if;
        end loop;
      else
        for v_i in 0..12 loop
          if mod((v_winners->>v_i)::integer,2)=0 then v_score_a:=v_score_a+1; else v_score_b:=v_score_b+1; end if;
        end loop;
      end if;
      v_state := jsonb_set(v_state,'{scoreA}',to_jsonb(v_score_a),true);
      v_state := jsonb_set(v_state,'{scoreB}',to_jsonb(v_score_b),true);
      v_done := true;
    end if;
    if v_done then v_state := jsonb_set(v_state,'{phase}','"finished"'::jsonb,true); end if;
  else
    v_next := (p_seat+1)%4;
    v_state := jsonb_set(v_state,'{plays}',v_plays,true);
    v_state := jsonb_set(v_state,'{turn}',to_jsonb(v_next),true);
  end if;
  if not v_done then
    v_state:=jsonb_set(v_state,'{turnDeadline}',to_jsonb(extract(epoch from clock_timestamp())+10),true);
  else
    v_state:=v_state-'turnDeadline';
  end if;
  update public.game_rooms set public_state=v_state,
    status=case when v_done then 'finished' else 'playing' end,
    revision=revision+1,updated_at=now() where id=p_room_id;
  return jsonb_build_object('room_id',p_room_id,'state',v_state,
    'revision',v_room.revision+1,'done',v_done);
end;
$$;


create or replace function public.advance_room_turn_timeout(p_room_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
 v_room public.game_rooms%rowtype;
 v_seat smallint;
 v_deadline numeric;
begin
 if auth.uid() is null then raise exception 'authentication_required'; end if;
 select * into v_room from public.game_rooms where id=p_room_id for update;
 if not found or v_room.status<>'playing' then raise exception 'room_not_playing'; end if;
 if v_room.host_user_id<>auth.uid() then raise exception 'host_only'; end if;
 if v_room.public_state->>'phase'='challenge_decision' then
   return jsonb_build_object('advanced',false,'reason','challenge_decision_pending');
 end if;
 v_deadline:=nullif(v_room.public_state->>'turnDeadline','')::numeric;
 if v_deadline is null then
   update public.game_rooms
     set public_state=jsonb_set(public_state,'{turnDeadline}',to_jsonb(extract(epoch from clock_timestamp())+10),true),
         revision=revision+1,updated_at=now()
     where id=p_room_id;
   return jsonb_build_object('advanced',false,'reason','deadline_initialized');
 end if;
 if extract(epoch from clock_timestamp())<v_deadline then
   return jsonb_build_object('advanced',false,'reason','time_remaining');
 end if;
 v_seat:=((v_room.public_state->>'turn')::integer)::smallint;
 return public.apply_room_card(p_room_id,v_seat,null,true);
end; $$;
revoke all on function public.advance_room_turn_timeout(uuid) from public;
grant execute on function public.advance_room_turn_timeout(uuid) to authenticated;
