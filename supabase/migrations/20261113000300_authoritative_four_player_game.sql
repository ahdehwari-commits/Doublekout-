-- Authoritative four-seat online game state.
-- Human hands are visible only to their owner; AI hands stay server-side.
create table if not exists public.room_game_hands (
  room_id uuid not null references public.game_rooms(id) on delete cascade,
  seat smallint not null check (seat between 0 and 3),
  owner_user_id uuid references auth.users(id) on delete cascade,
  cards jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (room_id, seat),
  unique (room_id, owner_user_id)
);
alter table public.room_game_hands enable row level security;
revoke all on public.room_game_hands from anon, authenticated;
grant select on public.room_game_hands to authenticated;
drop policy if exists "players can read their own game hand" on public.room_game_hands;
create policy "players can read their own game hand"
on public.room_game_hands for select to authenticated
using (owner_user_id = auth.uid());

create or replace function public.start_room_game(
  p_room_id uuid,
  p_start_with_present boolean default false,
  p_trump text default 'S'
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_room public.game_rooms%rowtype;
  v_total integer;
  v_ready integer;
  v_deck jsonb[];
  v_shuffled jsonb[];
  v_card jsonb;
  v_seat integer;
  v_suit text;
  v_rank text;
  v_owner uuid;
  v_hands jsonb[];
  v_state jsonb;
  v_names jsonb := '{}'::jsonb;
  i integer;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  select * into v_room from public.game_rooms where id=p_room_id for update;
  if not found then raise exception 'room_not_found'; end if;
  if v_room.host_user_id <> v_user then raise exception 'host_only'; end if;
  if v_room.status <> 'waiting' then raise exception 'room_not_waiting'; end if;
  if v_room.game_mode not in ('double-kout','standard-hokm') or v_room.player_count <> 4 then
    raise exception 'online_engine_currently_supports_four_players_only';
  end if;
  if p_trump not in ('S','H','D','C') then raise exception 'invalid_trump'; end if;
  select count(*),count(*) filter(where ready) into v_total,v_ready
    from public.room_members where room_id=p_room_id;
  if v_total < 2 then raise exception 'at_least_two_human_players_required'; end if;
  if v_ready <> v_total then raise exception 'all_joined_players_must_be_ready'; end if;
  if not coalesce(p_start_with_present,false) and v_total <> 4 then raise exception 'room_not_full'; end if;

  delete from public.room_game_hands where room_id=p_room_id;
  for i in 0..3 loop v_hands[i+1] := '[]'::jsonb; end loop;
  for v_suit in select unnest(array['S','H','D','C']) loop
    for v_rank in select unnest(array['2','3','4','5','6','7','8','9','10','J','Q','K','A']) loop
      v_deck := array_append(v_deck,jsonb_build_object(
        'id',v_rank||v_suit,'rank',v_rank,'suit',v_suit,'kind','normal'));
    end loop;
  end loop;
  select array_agg(x order by random()) into v_shuffled from unnest(v_deck) x;
  for i in 1..52 loop
    v_seat := (i-1)%4;
    v_hands[v_seat+1] := v_hands[v_seat+1] || jsonb_build_array(v_shuffled[i]);
  end loop;

  for v_seat in 0..3 loop
    select user_id into v_owner from public.room_members
      where room_id=p_room_id and seat=v_seat;
    if v_owner is not null then
      select display_name into v_rank from public.room_members
        where room_id=p_room_id and seat=v_seat;
      v_names := v_names || jsonb_build_object(v_seat::text,jsonb_build_object(
        'name',v_rank,'human',true));
    else
      v_names := v_names || jsonb_build_object(v_seat::text,jsonb_build_object(
        'name','هوش مصنوعی','human',false));
    end if;
    insert into public.room_game_hands(room_id,seat,owner_user_id,cards)
      values(p_room_id,v_seat,v_owner,v_hands[v_seat+1]);
  end loop;

  v_state := jsonb_build_object(
    'phase','playing','turn',0,'leader',0,'trickNo',1,'plays','[]'::jsonb,
    'trickWinners','[]'::jsonb,'trump',p_trump,'contract','hokm',
    'seatPlayers',v_names,'startedWithPresent',v_total<4,
    'humanCount',v_total,'message','بازی آنلاین چهار نفره آغاز شد');
  update public.game_rooms set status='playing',public_state=v_state,
    revision=revision+1,updated_at=now() where id=p_room_id;
  return jsonb_build_object('room_id',p_room_id,'status','playing',
    'revision',v_room.revision+1,'state',v_state);
end;
$$;

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
    if jsonb_array_length(v_state->'trickWinners')=13 then
      v_state := jsonb_set(v_state,'{phase}','"finished"'::jsonb,true);
      v_done := true;
    end if;
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

create or replace function public.play_room_card(
  p_room_id uuid,p_card_id text
) returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_seat integer;
begin
  select seat into v_seat from public.room_game_hands
    where room_id=p_room_id and owner_user_id=auth.uid();
  if v_seat is null then raise exception 'not_a_room_player'; end if;
  return public.apply_room_card(p_room_id,v_seat::smallint,p_card_id,false);
end;
$$;

create or replace function public.play_room_ai_turn(p_room_id uuid)
returns jsonb
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_seat integer; v_card text;
begin
  if not exists(select 1 from public.game_rooms
    where id=p_room_id and host_user_id=auth.uid() and status='playing')
    then raise exception 'host_only'; end if;
  select h.seat,(select x->>'id' from jsonb_array_elements(h.cards) x
    where (r.public_state->'plays'='[]'::jsonb or
      x->>'suit'=r.public_state->'plays'->0->'card'->>'suit')
    order by random() limit 1)
    into v_seat,v_card
  from public.game_rooms r join public.room_game_hands h on h.room_id=r.id
  where r.id=p_room_id and h.owner_user_id is null
    and h.seat=(r.public_state->>'turn')::integer;
  if v_seat is null then raise exception 'current_turn_is_not_ai'; end if;
  return public.apply_room_card(p_room_id,v_seat::smallint,v_card,true);
end;
$$;

revoke all on function public.start_room_game(uuid,boolean,text) from public;
revoke all on function public.apply_room_card(uuid,smallint,text,boolean) from public;
revoke all on function public.play_room_card(uuid,text) from public;
revoke all on function public.play_room_ai_turn(uuid) from public;
grant execute on function public.start_room_game(uuid,boolean,text) to authenticated;
grant execute on function public.play_room_card(uuid,text) to authenticated;
grant execute on function public.play_room_ai_turn(uuid) to authenticated;
