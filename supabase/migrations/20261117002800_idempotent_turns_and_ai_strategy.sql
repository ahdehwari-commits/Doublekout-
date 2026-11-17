-- Idempotent online card actions, server-side AI card ranking, and audit trail.
create table if not exists public.room_game_action_log (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.game_rooms(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  seat smallint not null check(seat between 0 and 3),
  action_type text not null,
  card_id text,
  outcome text not null,
  state_revision bigint not null,
  turn integer,
  phase text,
  hand_count integer,
  plays jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.room_game_action_log enable row level security;
revoke all on public.room_game_action_log from anon,authenticated;

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
    if v_hand.owner_user_id is not null or v_room.host_user_id <> v_user then
      raise exception 'ai_turn_not_authorized';
    end if;
  else
    if v_hand.owner_user_id is distinct from v_user then raise exception 'not_your_seat'; end if;
  end if;
  v_cards := v_hand.cards;
  if p_is_ai then
    -- The host-side AI selector now supplies a strategy-ranked card id.
    -- Keep a legal random fallback only for older callers.
    if p_card_id is not null then
      select x into v_card from jsonb_array_elements(v_cards) x where x->>'id'=p_card_id;
    end if;
    if v_card is null then
      v_card := (select x from jsonb_array_elements(v_cards) x
        where (v_state->'plays'='[]'::jsonb or
          x->>'suit' = (v_state->'plays'->0->'card'->>'suit'))
        order by random() limit 1);
    end if;
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
  update public.game_rooms set public_state=v_state,
    status=case when v_done then 'finished' else 'playing' end,
    revision=revision+1,updated_at=now() where id=p_room_id;
  return jsonb_build_object('room_id',p_room_id,'state',v_state,
    'revision',v_room.revision+1,'done',v_done);
end;
$$;


create or replace function public.play_room_card(p_room_id uuid,p_card_id text)
returns jsonb
language plpgsql security definer
set search_path=public,pg_temp
as $$
declare
  v_user uuid:=auth.uid();
  v_room public.game_rooms%rowtype;
  v_hand public.room_game_hands%rowtype;
  v_seat integer;
  v_result jsonb;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  select * into v_room from public.game_rooms where id=p_room_id for update;
  if not found or v_room.status<>'playing' then raise exception 'room_not_playing'; end if;
  select * into v_hand from public.room_game_hands
    where room_id=p_room_id and owner_user_id=v_user for update;
  if not found then raise exception 'not_a_room_player'; end if;
  v_seat:=v_hand.seat;

  if not exists(select 1 from jsonb_array_elements(v_hand.cards) c where c->>'id'=p_card_id) then
    -- A second tap/retried request for a card already accepted in this trick
    -- is idempotent; it must not become card_not_in_hand.
    if exists(select 1 from jsonb_array_elements(coalesce(v_room.public_state->'plays','[]'::jsonb)) p
      where (p->>'seat')::integer=v_seat and p->'card'->>'id'=p_card_id) then
      insert into public.room_game_action_log(room_id,actor_user_id,seat,action_type,card_id,outcome,state_revision,turn,phase,hand_count,plays)
      values(p_room_id,v_user,v_seat,'play_card',p_card_id,'duplicate_accepted',v_room.revision,
        nullif(v_room.public_state->>'turn','')::integer,v_room.public_state->>'phase',
        jsonb_array_length(v_hand.cards),coalesce(v_room.public_state->'plays','[]'::jsonb));
      return jsonb_build_object('duplicate',true,'state',v_room.public_state,
        'revision',v_room.revision,'done',false);
    end if;
    insert into public.room_game_action_log(room_id,actor_user_id,seat,action_type,card_id,outcome,state_revision,turn,phase,hand_count,plays)
    values(p_room_id,v_user,v_seat,'play_card',p_card_id,'rejected_card_not_in_hand',v_room.revision,
      nullif(v_room.public_state->>'turn','')::integer,v_room.public_state->>'phase',
      jsonb_array_length(v_hand.cards),coalesce(v_room.public_state->'plays','[]'::jsonb));
    return jsonb_build_object('error','card_not_in_hand','state',v_room.public_state,
      'revision',v_room.revision,'done',false);
  end if;

  v_result:=public.apply_room_card(p_room_id,v_seat::smallint,p_card_id,false);
  insert into public.room_game_action_log(room_id,actor_user_id,seat,action_type,card_id,outcome,state_revision,turn,phase,hand_count,plays)
  values(p_room_id,v_user,v_seat,'play_card',p_card_id,'accepted',
    coalesce((v_result->>'revision')::bigint,v_room.revision+1),
    nullif(v_room.public_state->>'turn','')::integer,v_room.public_state->>'phase',
    jsonb_array_length(v_hand.cards),coalesce(v_result->'state'->'plays','[]'::jsonb));
  return v_result;
end;
$$;

create or replace function public.play_room_ai_turn(p_room_id uuid)
returns jsonb
language plpgsql security definer
set search_path=public,pg_temp
as $$
declare
  v_user uuid:=auth.uid();
  v_room public.game_rooms%rowtype;
  v_seat integer;
  v_cards jsonb;
  v_state jsonb;
  v_lead text;
  v_trump text;
  v_card jsonb;
  v_winner integer;
  v_best_suit text;
  v_best_rank text;
  v_power integer;
  v_best_power integer;
  v_i integer;
  v_can_beat boolean:=false;
  v_partner_winning boolean:=false;
  v_rank_order text[]:=array['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  select * into v_room from public.game_rooms
    where id=p_room_id and host_user_id=v_user and status='playing' for update;
  if not found then raise exception 'host_only'; end if;
  v_state:=v_room.public_state;
  select h.seat,h.cards into v_seat,v_cards
    from public.room_game_hands h
    where h.room_id=p_room_id and h.owner_user_id is null
      and h.seat=(v_state->>'turn')::integer for update;
  if v_seat is null then raise exception 'current_turn_is_not_ai'; end if;

  v_lead:=v_state->'plays'->0->'card'->>'suit';
  v_trump:=v_state->>'trump';

  if jsonb_array_length(coalesce(v_state->'plays','[]'::jsonb))>0 then
    v_best_suit:=v_lead;
    v_best_rank:=v_state->'plays'->0->'card'->>'rank';
    v_winner:=(v_state->'plays'->0->>'seat')::integer;
    for v_i in 1..jsonb_array_length(v_state->'plays')-1 loop
      v_best_power:=array_position(v_rank_order,v_best_rank);
      v_power:=array_position(v_rank_order,v_state->'plays'->v_i->'card'->>'rank');
      if ((v_state->'plays'->v_i->'card'->>'suit')=v_trump and v_best_suit<>v_trump)
        or ((v_state->'plays'->v_i->'card'->>'suit')=v_best_suit and v_power>v_best_power)
        or ((v_state->'plays'->v_i->'card'->>'suit')=v_lead and v_best_suit<>v_trump and v_best_suit<>v_lead) then
        v_winner:=(v_state->'plays'->v_i->>'seat')::integer;
        v_best_suit:=v_state->'plays'->v_i->'card'->>'suit';
        v_best_rank:=v_state->'plays'->v_i->'card'->>'rank';
      end if;
    end loop;
    v_partner_winning:=mod(v_winner,2)=mod(v_seat,2);
  end if;

  -- Follow suit whenever possible. Only void players may discard or trump.
  if v_lead is not null and exists(
    select 1 from jsonb_array_elements(v_cards) c where c->>'suit'=v_lead
  ) then
    select coalesce(jsonb_agg(c),'[]'::jsonb) into v_cards
      from jsonb_array_elements(v_cards) c where c->>'suit'=v_lead;
  end if;

  if v_lead is null then
    -- Lead from a long suit, using a low card first while retaining its controls.
    select c into v_card from jsonb_array_elements(v_cards) c
      order by (select count(*) from jsonb_array_elements(v_cards) x where x->>'suit'=c->>'suit') desc,
        array_position(v_rank_order,c->>'rank') asc limit 1;
  elsif v_partner_winning then
    -- Do not throw away an off-suit ace when partner already controls the trick.
    select c into v_card from jsonb_array_elements(v_cards) c
      order by case when c->>'rank'='A' and c->>'suit'<>v_lead and c->>'suit'<>coalesce(v_trump,'') then 1 else 0 end,
        array_position(v_rank_order,c->>'rank') asc,
        case when c->>'suit'=v_trump then 1 else 0 end limit 1;
  else
    select exists(select 1 from jsonb_array_elements(v_cards) c where
      ((c->>'suit')=v_trump and v_best_suit<>v_trump)
      or ((c->>'suit')=v_best_suit and array_position(v_rank_order,c->>'rank')>array_position(v_rank_order,v_best_rank))
      or ((c->>'suit')=v_lead and v_best_suit<>v_trump and v_best_suit<>v_lead)
    ) into v_can_beat;
    if v_can_beat then
      select c into v_card from jsonb_array_elements(v_cards) c where
        ((c->>'suit')=v_trump and v_best_suit<>v_trump)
        or ((c->>'suit')=v_best_suit and array_position(v_rank_order,c->>'rank')>array_position(v_rank_order,v_best_rank))
        or ((c->>'suit')=v_lead and v_best_suit<>v_trump and v_best_suit<>v_lead)
        order by array_position(v_rank_order,c->>'rank') asc,
          case when c->>'suit'=v_trump then 1 else 0 end limit 1;
    else
      select c into v_card from jsonb_array_elements(v_cards) c
        order by case when c->>'rank'='A' and c->>'suit'<>v_lead and c->>'suit'<>coalesce(v_trump,'') then 1 else 0 end,
          array_position(v_rank_order,c->>'rank') asc limit 1;
    end if;
  end if;

  if v_card is null then raise exception 'ai_no_legal_card'; end if;
  return public.apply_room_card(p_room_id,v_seat::smallint,v_card->>'id',true);
end;
$$;

revoke all on function public.play_room_card(uuid,text) from public;
revoke all on function public.play_room_ai_turn(uuid) from public;
grant execute on function public.play_room_card(uuid,text) to authenticated;
grant execute on function public.play_room_ai_turn(uuid) to authenticated;

notify pgrst,'reload schema';
