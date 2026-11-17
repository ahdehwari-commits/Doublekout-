-- Persist the host's AI difficulty selection for the waiting-room start and rematches.
alter table public.game_rooms
  add column if not exists ai_difficulty text not null default 'expert';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='game_rooms_ai_difficulty_check'
      and conrelid='public.game_rooms'::regclass
  ) then
    alter table public.game_rooms
      add constraint game_rooms_ai_difficulty_check
      check (ai_difficulty in ('easy','normal','hard','expert'));
  end if;
end $$;

drop function if exists public.host_decide_room_start(uuid,text);
create function public.host_decide_room_start(
  p_room_id uuid,
  p_choice text,
  p_ai_difficulty text default 'expert'
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_room public.game_rooms%rowtype;
  v_guest uuid;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  if p_choice is null or p_choice not in ('human','ai') then raise exception 'invalid_lobby_choice'; end if;
  if p_ai_difficulty is null or p_ai_difficulty not in ('easy','normal','hard','expert') then raise exception 'invalid_ai_difficulty'; end if;
  select * into v_room from public.game_rooms where id=p_room_id for update;
  if not found then raise exception 'room_not_found'; end if;
  if v_room.host_user_id is distinct from v_user then raise exception 'host_only'; end if;
  if v_room.status<>'waiting' then raise exception 'room_not_waiting'; end if;
  if v_room.game_mode not in ('double-kout','standard-hokm') or v_room.player_count<>4 then
    raise exception 'online_engine_currently_supports_four_players_only';
  end if;

  if p_choice='human' then
    select user_id into v_guest from public.room_members
      where room_id=p_room_id and user_id<>v_user
      order by joined_at,seat limit 1;
    if v_guest is null then raise exception 'no_human_guest_to_accept'; end if;
    update public.room_members set ready=true where room_id=p_room_id and user_id=v_guest;
    delete from public.room_members where room_id=p_room_id
      and user_id not in (v_user,v_guest);
  else
    delete from public.room_members where room_id=p_room_id and user_id<>v_user;
  end if;
  update public.game_rooms set ai_difficulty=p_ai_difficulty,revision=revision+1,updated_at=now()
    where id=p_room_id;
  return public.start_room_game(p_room_id,true,'S',null)
    || jsonb_build_object('lobby_choice',p_choice,'human_guest',v_guest,'ai_difficulty',p_ai_difficulty);
end;
$$;
revoke all on function public.host_decide_room_start(uuid,text,text) from public;
grant execute on function public.host_decide_room_start(uuid,text,text) to authenticated;

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
  v_hand_count integer;
  v_legal_count integer;
  v_reason text;
  v_result jsonb;
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
  v_difficulty text:='expert';
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  select * into v_room from public.game_rooms
    where id=p_room_id and host_user_id=v_user and status='playing' for update;
  if not found then raise exception 'host_only'; end if;
  v_state:=v_room.public_state;
  v_difficulty:=coalesce(v_room.ai_difficulty,'expert');
  select h.seat,h.cards into v_seat,v_cards
    from public.room_game_hands h
    where h.room_id=p_room_id and h.owner_user_id is null
      and h.seat=(v_state->>'turn')::integer for update;
  if v_seat is null then raise exception 'current_turn_is_not_ai'; end if;
  v_hand_count:=jsonb_array_length(v_cards);

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
  v_legal_count:=jsonb_array_length(v_cards);

  if v_difficulty='easy' then
    v_reason:='easy_random_legal_card';
    select c into v_card from jsonb_array_elements(v_cards) c order by random() limit 1;
  elsif v_difficulty='normal' then
    v_reason:='normal_lowest_legal_card';
    select c into v_card from jsonb_array_elements(v_cards) c
      order by array_position(v_rank_order,c->>'rank') asc limit 1;
  elsif v_lead is null and v_difficulty='expert'
    and jsonb_array_length(coalesce(v_state->'trickWinners','[]'::jsonb))>0
    and (v_state->'trickWinners'->>(jsonb_array_length(v_state->'trickWinners')-1))=v_seat::text then
    v_reason:='expert_secure_second_consecutive_trick';
    select c into v_card from jsonb_array_elements(v_cards) c
      order by (select count(*) from jsonb_array_elements(v_cards) x where x->>'suit'=c->>'suit') desc,
        array_position(v_rank_order,c->>'rank') desc limit 1;
  elsif v_lead is null then
    v_reason:='lead_long_suit_low_card';
    -- Lead from a long suit, using a low card first while retaining its controls.
    select c into v_card from jsonb_array_elements(v_cards) c
      order by (select count(*) from jsonb_array_elements(v_cards) x where x->>'suit'=c->>'suit') desc,
        array_position(v_rank_order,c->>'rank') asc limit 1;
  elsif v_partner_winning then
    v_reason:='partner_winning_preserve_off_suit_ace';
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
      v_reason:='opponent_winning_play_cheapest_overtake';
      select c into v_card from jsonb_array_elements(v_cards) c where
        ((c->>'suit')=v_trump and v_best_suit<>v_trump)
        or ((c->>'suit')=v_best_suit and array_position(v_rank_order,c->>'rank')>array_position(v_rank_order,v_best_rank))
        or ((c->>'suit')=v_lead and v_best_suit<>v_trump and v_best_suit<>v_lead)
        order by array_position(v_rank_order,c->>'rank') asc,
          case when c->>'suit'=v_trump then 1 else 0 end limit 1;
    else
      v_reason:='cannot_overtake_preserve_off_suit_ace';
      select c into v_card from jsonb_array_elements(v_cards) c
        order by case when c->>'rank'='A' and c->>'suit'<>v_lead and c->>'suit'<>coalesce(v_trump,'') then 1 else 0 end,
          array_position(v_rank_order,c->>'rank') asc limit 1;
    end if;
  end if;

  if v_card is null then raise exception 'ai_no_legal_card'; end if;
  v_result:=public.apply_room_card(p_room_id,v_seat::smallint,v_card->>'id',true);
  insert into public.room_game_action_log(
    room_id,actor_user_id,seat,action_type,card_id,outcome,state_revision,turn,phase,
    hand_count,plays,decision_reason,legal_move_count
  ) values(
    p_room_id,v_user,v_seat,'ai_play_card',v_card->>'id','accepted',
    coalesce((v_result->>'revision')::bigint,v_room.revision+1),
    nullif(v_room.public_state->>'turn','')::integer,v_room.public_state->>'phase',
    v_hand_count,coalesce(v_result->'state'->'plays','[]'::jsonb),v_reason,v_legal_count
  );
  return v_result;
end;
$$;

notify pgrst,'reload schema';
