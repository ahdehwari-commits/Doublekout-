-- Briefly expose the fourth card, then let resolve_room_trick settle the hand.
CREATE OR REPLACE FUNCTION public.apply_room_card(p_room_id uuid, p_seat smallint, p_card_id text, p_is_ai boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  v_rank_order text[];
  v_i integer;
  v_trump text;
  v_card_suit text;
  v_card_rank text;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  select * into v_room from public.game_rooms where id=p_room_id for update;
  if not found or v_room.status <> 'playing' then raise exception 'room_not_playing'; end if;
  v_state := v_room.public_state;
  if v_state ? 'trickPendingUntil' then raise exception 'trick_display_pending'; end if;
  v_rank_order := public.room_contract_rank_order(v_state->>'contract');
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
  end if;
  v_cards := v_hand.cards;
  if p_is_ai then
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
    -- Keep all four cards visible briefly, then resolve through resolve_room_trick.
    v_state := jsonb_set(v_state,'{plays}',v_plays,true);
    v_state := jsonb_set(v_state,'{trickPendingUntil}',
      to_jsonb(extract(epoch from clock_timestamp())+0.85),true);
    v_state := v_state-'turnDeadline';
    update public.game_rooms set public_state=v_state,status='playing',
      revision=revision+1,updated_at=now() where id=p_room_id;
    return jsonb_build_object('room_id',p_room_id,'state',v_state,
      'revision',v_room.revision+1,'done',false,'trick_pending',true);
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
$function$

