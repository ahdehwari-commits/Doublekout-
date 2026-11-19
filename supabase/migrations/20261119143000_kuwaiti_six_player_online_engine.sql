-- Dedicated server-authoritative six-player Kuwaiti Kout engine.
-- Existing four-player RPCs and their 0..3 seat constraints remain untouched.

create table if not exists public.kuwaiti_online_hands (
  room_id uuid not null references public.game_rooms(id) on delete cascade,
  seat smallint not null check (seat between 0 and 5),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  cards jsonb not null default '[]'::jsonb check (jsonb_typeof(cards)='array'),
  updated_at timestamptz not null default now(),
  primary key (room_id, seat),
  unique (room_id, owner_user_id)
);

create table if not exists public.kuwaiti_online_secrets (
  room_id uuid primary key references public.game_rooms(id) on delete cascade,
  trump_suit text check (trump_suit is null or trump_suit in ('S','H','D','C')),
  updated_at timestamptz not null default now()
);

alter table public.kuwaiti_online_hands enable row level security;
alter table public.kuwaiti_online_secrets enable row level security;
revoke all on public.kuwaiti_online_hands from anon, authenticated;
revoke all on public.kuwaiti_online_secrets from anon, authenticated;
drop policy if exists kuwaiti_online_hands_deny_api on public.kuwaiti_online_hands;
create policy kuwaiti_online_hands_deny_api on public.kuwaiti_online_hands
  for all to anon, authenticated using (false) with check (false);
drop policy if exists kuwaiti_online_secrets_deny_api on public.kuwaiti_online_secrets;
create policy kuwaiti_online_secrets_deny_api on public.kuwaiti_online_secrets
  for all to anon, authenticated using (false) with check (false);

create or replace function public.kuwaiti_online_normal_power(p_card jsonb,p_contract text)
returns integer
language plpgsql immutable
set search_path to 'public','pg_temp'
as $$
declare
  v_idx integer;
  v_rank text := p_card->>'rank';
begin
  v_idx := array_position(array['2','3','4','5','6','7','8','9','10','J','Q','K','A'],v_rank);
  if v_idx is null then raise exception 'invalid_card_rank'; end if;
  if p_contract='naras' then return 14-v_idx; end if;
  if p_contract='tak_naras' then
    if v_rank='A' then return 13; end if;
    return 13-v_idx;
  end if;
  return v_idx;
end;
$$;

create or replace function public.kuwaiti_online_card_power(
  p_card jsonb,p_contract text,p_trick_no integer,p_is_lead boolean,
  p_is_malzoom boolean,p_trump_announced boolean
)
returns integer
language plpgsql immutable
set search_path to 'public','pg_temp'
as $$
declare
  v_color text := p_card->>'color';
begin
  if p_card->>'kind'='normal' then
    return public.kuwaiti_online_normal_power(p_card,p_contract);
  end if;
  if p_card->>'kind'<>'joker' or v_color not in ('red','black') then
    raise exception 'invalid_card_kind';
  end if;
  if p_trick_no=9 and p_is_lead then return 0; end if;
  if v_color='black' and p_trick_no>=5 then return 0; end if;
  if v_color='black' and p_is_malzoom and not p_trump_announced then return 0; end if;
  if v_color='red' then return 10000; end if;
  return 8000;
end;
$$;

create or replace function public.kuwaiti_online_legal_card_ids(
  p_hand jsonb,p_plays jsonb,p_trick_no integer,p_trump_suit text,
  p_player integer,p_auction_winner integer
)
returns text[]
language plpgsql immutable
set search_path to 'public','pg_temp'
as $$
declare
  v_lead text := null;
  v_trump text := null;
  v_first jsonb;
  v_second jsonb;
  v_card jsonb;
  v_result text[] := array[]::text[];
  v_follow_count integer := 0;
  v_count integer := coalesce(jsonb_array_length(p_plays),0);
begin
  if v_count>0 then
    v_first := p_plays->0->'card';
    if p_trick_no=9 and v_first->>'kind'='joker' then
      if v_count>1 then
        v_second := p_plays->1->'card';
        if v_second->>'kind'='normal' then v_lead:=v_second->>'suit'; end if;
      end if;
    elsif v_first->>'kind'='normal' then
      v_lead:=v_first->>'suit';
    end if;
  end if;

  if p_trick_no=1 or p_player=p_auction_winner then
    v_trump:=p_trump_suit;
  elsif p_trump_suit is not null then
    -- The caller passes the public trump suit only after it has been announced.
    v_trump:=p_trump_suit;
  end if;

  if v_count=0 and p_trick_no=9 then
    select coalesce(array_agg(x->>'id' order by ord),'{}'::text[])
      into v_result from jsonb_array_elements(p_hand) with ordinality t(x,ord);
    return v_result;
  end if;

  if v_count=0 and p_trick_no<9 then
    select coalesce(array_agg(x->>'id' order by ord),'{}'::text[])
      into v_result from jsonb_array_elements(p_hand) with ordinality t(x,ord)
      where x->>'kind'='normal';
    return v_result;
  end if;

  if v_lead is null then
    select coalesce(array_agg(x->>'id' order by ord),'{}'::text[])
      into v_result from jsonb_array_elements(p_hand) with ordinality t(x,ord)
      where x->>'kind'='normal';
    return v_result;
  end if;

  select count(*) into v_follow_count
  from jsonb_array_elements(p_hand) x
  where x->>'kind'='normal' and x->>'suit'=v_lead;

  if v_follow_count>0 then
    select coalesce(array_agg(x->>'id' order by ord),'{}'::text[])
      into v_result from jsonb_array_elements(p_hand) with ordinality t(x,ord)
      where (x->>'kind'='normal' and x->>'suit'=v_lead)
         or (p_trick_no>1 and x->>'kind'='joker');
    return v_result;
  end if;

  if p_trick_no=1 and v_trump is not null then
    select coalesce(array_agg(x->>'id' order by ord),'{}'::text[])
      into v_result from jsonb_array_elements(p_hand) with ordinality t(x,ord)
      where x->>'kind'='normal' and x->>'suit'<>v_trump;
    if cardinality(v_result)>0 then return v_result; end if;
  end if;

  if v_trump is not null then
    select coalesce(array_agg(x->>'id' order by ord),'{}'::text[])
      into v_result from jsonb_array_elements(p_hand) with ordinality t(x,ord)
      where (x->>'kind'='normal' and x->>'suit'=v_trump)
         or (p_trick_no>1 and x->>'kind'='joker');
    if cardinality(v_result)>0 then return v_result; end if;
  end if;

  select coalesce(array_agg(x->>'id' order by ord),'{}'::text[])
    into v_result from jsonb_array_elements(p_hand) with ordinality t(x,ord)
    where p_trick_no>1 or x->>'kind'='normal';
  return v_result;
end;
$$;

create or replace function public.kuwaiti_online_start(p_room_id uuid,p_match_limit integer default 54)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_user uuid := auth.uid();
  v_room public.game_rooms%rowtype;
  v_total integer;
  v_ready integer;
  v_seat integer;
  v_i integer;
  v_suit text;
  v_rank text;
  v_deck jsonb[] := array[]::jsonb[];
  v_shuffled jsonb[];
  v_hands jsonb[] := array_fill('[]'::jsonb,array[6]);
  v_card jsonb;
  v_starter integer;
  v_names jsonb := '{}'::jsonb;
  v_state jsonb;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  if p_match_limit is null or p_match_limit not in (54,-54,108,-108) then raise exception 'invalid_match_limit'; end if;

  select * into v_room from public.game_rooms where id=p_room_id for update;
  if not found then raise exception 'room_not_found'; end if;
  if v_room.game_mode<>'kuwaiti' or v_room.player_count<>6 then raise exception 'not_a_kuwaiti_six_player_room'; end if;
  if v_room.host_user_id is distinct from v_user then raise exception 'host_only'; end if;
  if v_room.status<>'waiting' then raise exception 'room_not_waiting'; end if;
  if not exists(select 1 from public.room_members where room_id=p_room_id and user_id=v_user and is_host) then
    raise exception 'host_membership_required';
  end if;

  select count(*),count(*) filter(where ready) into v_total,v_ready
  from public.room_members where room_id=p_room_id;
  if v_total<>6 then raise exception 'room_not_full'; end if;
  if v_ready<>6 then raise exception 'all_six_players_must_be_ready'; end if;

  for v_suit in select unnest(array['S','H','D','C']) loop
    for v_rank in select unnest(array['2','3','4','5','6','7','8','9','10','J','Q','K','A']) loop
      v_deck:=array_append(v_deck,jsonb_build_object('id',v_rank||v_suit,'rank',v_rank,'suit',v_suit,'kind','normal'));
    end loop;
  end loop;
  v_deck:=array_append(v_deck,jsonb_build_object('id','JR','kind','joker','color','red'));
  v_deck:=array_append(v_deck,jsonb_build_object('id','JB','kind','joker','color','black'));
  select array_agg(x order by random()) into v_shuffled from unnest(v_deck) x;

  for v_i in 1..54 loop
    v_hands[((v_i-1)%6)+1]:=v_hands[((v_i-1)%6)+1]||jsonb_build_array(v_shuffled[v_i]);
  end loop;

  select m.seat into v_starter
  from public.room_members m
  where m.room_id=p_room_id
    and exists(select 1 from jsonb_array_elements(v_hands[m.seat+1]) c where c->>'id'='2C');
  if v_starter is null then raise exception 'opening_two_of_clubs_not_dealt'; end if;

  for v_seat in 0..5 loop
    select jsonb_build_object('name',display_name,'human',true,'user_id',user_id)
      into v_card from public.room_members where room_id=p_room_id and seat=v_seat;
    if v_card is null then raise exception 'missing_room_seat'; end if;
    v_names:=v_names||jsonb_build_object(v_seat::text,v_card);
    insert into public.kuwaiti_online_hands(room_id,seat,owner_user_id,cards)
      select p_room_id,v_seat,m.user_id,v_hands[v_seat+1]
      from public.room_members m where m.room_id=p_room_id and m.seat=v_seat
    on conflict(room_id,seat) do update
      set owner_user_id=excluded.owner_user_id,cards=excluded.cards,updated_at=now();
  end loop;

  insert into public.kuwaiti_online_secrets(room_id,trump_suit)
  values(p_room_id,null)
  on conflict(room_id) do update set trump_suit=null,updated_at=now();

  v_state:=jsonb_build_object(
    'engine','kuwaiti-six-player-v1','phase','auction','turn',v_starter,
    'auctionStarter',v_starter,'obligatedPlayer',(v_starter+5)%6,
    'highest',null,'highestRank',0,'highestPlayer',null,'passes',0,'bids','[]'::jsonb,
    'auctionWinner',null,'auctionBid',null,'contract',null,'selectedContract',null,
    'trumpSuit',null,'hiddenTrump',false,'trumpAnnounced',true,'isMalzoom',false,
    'trickNo',1,'plays','[]'::jsonb,'lastTrick','[]'::jsonb,'trickWinners','[]'::jsonb,
    'leader',v_starter,'target',null,'scoreA',0,'scoreB',0,'matchLimit',p_match_limit,
    'firstGame',true,'previousAuctionWinner',null,'previousWinningTeam',null,
    'seatPlayers',v_names,'done',false,'matchOver',false,
    'message','۵۴ کارت پخش شد؛ مزایده از دارنده ۲ خاج آغاز می‌شود'
  );

  update public.game_rooms set status='playing',public_state=v_state,
    revision=revision+1,updated_at=now() where id=p_room_id;
  return jsonb_build_object('room_id',p_room_id,'status','playing',
    'revision',v_room.revision+1,'state',v_state,'phase','auction');
end;
$$;

create or replace function public.kuwaiti_online_snapshot(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_user uuid := auth.uid();
  v_room public.game_rooms%rowtype;
  v_seat integer;
  v_hand jsonb := '[]'::jsonb;
  v_state jsonb;
  v_secret text;
  v_legal text[] := array[]::text[];
  v_lead text;
  v_hand_counts jsonb;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  select * into v_room from public.game_rooms where id=p_room_id;
  if not found then raise exception 'room_not_found'; end if;
  if v_room.game_mode<>'kuwaiti' or v_room.player_count<>6 then raise exception 'not_a_kuwaiti_six_player_room'; end if;
  select seat into v_seat from public.room_members where room_id=p_room_id and user_id=v_user;
  if v_seat is null then raise exception 'not_a_room_member'; end if;
  v_state:=coalesce(v_room.public_state,'{}'::jsonb);

  select cards into v_hand from public.kuwaiti_online_hands
  where room_id=p_room_id and owner_user_id=v_user;
  if v_hand is null then v_hand:='[]'::jsonb; end if;
  select trump_suit into v_secret from public.kuwaiti_online_secrets where room_id=p_room_id;
  select coalesce(jsonb_agg(jsonb_array_length(cards) order by seat),'[0,0,0,0,0,0]'::jsonb)
    into v_hand_counts from public.kuwaiti_online_hands where room_id=p_room_id;

  if v_state->>'phase'='playing' and (v_state->>'turn')::integer=v_seat then
    if jsonb_array_length(coalesce(v_state->'plays','[]'::jsonb))>0 then
      if (v_state->>'trickNo')::integer=9 and v_state->'plays'->0->'card'->>'kind'='joker' then
        if jsonb_array_length(v_state->'plays')>1 and v_state->'plays'->1->'card'->>'kind'='normal' then
          v_lead:=v_state->'plays'->1->'card'->>'suit';
        end if;
      elsif v_state->'plays'->0->'card'->>'kind'='normal' then
        v_lead:=v_state->'plays'->0->'card'->>'suit';
      end if;
    end if;
    v_legal:=public.kuwaiti_online_legal_card_ids(
      v_hand,coalesce(v_state->'plays','[]'::jsonb),
      (v_state->>'trickNo')::integer,
      case when (v_state->>'trickNo')::integer=1
             or not coalesce((v_state->>'hiddenTrump')::boolean,false)
             or coalesce((v_state->>'trumpAnnounced')::boolean,false)
             or v_seat=(v_state->>'auctionWinner')::integer
           then v_secret else null end,
      v_seat,(v_state->>'auctionWinner')::integer
    );
  end if;

  return jsonb_build_object(
    'room_id',p_room_id,'status',v_room.status,'revision',v_room.revision,
    'game_mode',v_room.game_mode,'player_count',v_room.player_count,'seat',v_seat,
    'state',v_state,'hand',v_hand,'hand_counts',v_hand_counts,'legal_card_ids',to_jsonb(v_legal),
    'trump_suit',case when not coalesce((v_state->>'hiddenTrump')::boolean,false)
                           or coalesce((v_state->>'trumpAnnounced')::boolean,false)
                           or v_seat=coalesce(nullif(v_state->>'auctionWinner','')::integer,-1)
                      then v_secret else null end
  );
end;
$$;

create or replace function public.kuwaiti_online_action(p_room_id uuid,p_action jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_user uuid := auth.uid();
  v_room public.game_rooms%rowtype;
  v_state jsonb;
  v_secret text;
  v_seat integer;
  v_type text := p_action->>'type';
  v_kind text;
  v_rank integer;
  v_target integer;
  v_passes integer;
  v_highest jsonb;
  v_highest_rank integer;
  v_highest_player integer;
  v_winner integer;
  v_contract text;
  v_trump text;
  v_hidden boolean;
  v_hand jsonb;
  v_new_hand jsonb;
  v_card jsonb;
  v_plays jsonb;
  v_play jsonb;
  v_lead text;
  v_has_trump boolean := false;
  v_eligible boolean;
  v_power integer;
  v_best_power integer := -1;
  v_best_seat integer;
  v_trick_no integer;
  v_winners jsonb;
  v_count integer;
  v_bidder_tricks integer;
  v_opponent_tricks integer;
  v_auction_winner integer;
  v_bidder_team text;
  v_other_team text;
  v_success boolean;
  v_score integer;
  v_score_a integer;
  v_score_b integer;
  v_match_limit integer;
  v_match_over boolean;
  v_first_picker integer;
  v_first_game boolean;
  v_previous_winner integer;
  v_obligated integer;
  v_starter integer;
  v_names jsonb;
  v_deck jsonb[] := array[]::jsonb[];
  v_shuffled jsonb[];
  v_hands jsonb[] := array_fill('[]'::jsonb,array[6]);
  v_i integer;
  v_suit text;
  v_card_rank text;
  v_new_state jsonb;
  v_legal text[];
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  if jsonb_typeof(p_action)<>'object' or v_type is null then raise exception 'invalid_action'; end if;
  select * into v_room from public.game_rooms where id=p_room_id for update;
  if not found then raise exception 'room_not_found'; end if;
  if v_room.game_mode<>'kuwaiti' or v_room.player_count<>6 then raise exception 'not_a_kuwaiti_six_player_room'; end if;
  select seat into v_seat from public.room_members where room_id=p_room_id and user_id=v_user;
  if v_seat is null then raise exception 'not_a_room_member'; end if;
  v_state:=coalesce(v_room.public_state,'{}'::jsonb);

  if v_type='next_game' then
    if v_room.status<>'finished' or v_state->>'phase'<>'finished' then raise exception 'game_not_finished'; end if;
    v_score_a:=coalesce((v_state->>'scoreA')::integer,0);
    v_score_b:=coalesce((v_state->>'scoreB')::integer,0);
    v_match_limit:=coalesce((v_state->>'matchLimit')::integer,54);
    v_match_over:=case when v_match_limit>=0 then (v_score_a>=v_match_limit or v_score_b>=v_match_limit)
                       else (v_score_a<=v_match_limit or v_score_b<=v_match_limit) end;
    v_bidder_team:=v_state->>'previousWinningTeam';
    if v_match_over then
      if v_room.host_user_id is distinct from v_user then raise exception 'host_only_new_match'; end if;
      v_first_game:=true; v_previous_winner:=null; v_score_a:=0; v_score_b:=0;
      v_first_picker:=null;
    else
      if v_bidder_team is null or (case when mod(v_seat,2)=0 then 'A' else 'B' end)<>v_bidder_team then
        raise exception 'winning_team_selects_next_auction_player';
      end if;
      v_first_picker:=nullif(p_action->>'first_auction_player','')::integer;
      if v_first_picker is null or v_first_picker<0 or v_first_picker>5 then raise exception 'invalid_first_auction_player'; end if;
      if (case when mod(v_first_picker,2)=0 then 'A' else 'B' end)<>v_bidder_team then raise exception 'picker_must_be_on_winning_team'; end if;
      v_first_game:=false;
      v_previous_winner:=coalesce(nullif(v_state->>'previousAuctionWinner','')::integer,nullif(v_state->>'auctionWinner','')::integer);
    end if;

    for v_suit in select unnest(array['S','H','D','C']) loop
      for v_card_rank in select unnest(array['2','3','4','5','6','7','8','9','10','J','Q','K','A']) loop
        v_deck:=array_append(v_deck,jsonb_build_object('id',v_card_rank||v_suit,'rank',v_card_rank,'suit',v_suit,'kind','normal'));
      end loop;
    end loop;
    v_deck:=array_append(v_deck,jsonb_build_object('id','JR','kind','joker','color','red'));
    v_deck:=array_append(v_deck,jsonb_build_object('id','JB','kind','joker','color','black'));
    select array_agg(x order by random()) into v_shuffled from unnest(v_deck) x;
    for v_i in 1..54 loop v_hands[((v_i-1)%6)+1]:=v_hands[((v_i-1)%6)+1]||jsonb_build_array(v_shuffled[v_i]); end loop;

    if v_first_game then
      select m.seat into v_starter from public.room_members m
      where m.room_id=p_room_id and exists(select 1 from jsonb_array_elements(v_hands[m.seat+1]) c where c->>'id'='2C');
      if v_starter is null then raise exception 'opening_two_of_clubs_not_dealt'; end if;
      v_obligated:=(v_starter+5)%6;
    else
      v_starter:=v_first_picker;
      v_obligated:=(v_previous_winner+5)%6;
    end if;

    delete from public.kuwaiti_online_hands where room_id=p_room_id;
    for v_seat in 0..5 loop
      insert into public.kuwaiti_online_hands(room_id,seat,owner_user_id,cards)
      select p_room_id,v_seat,m.user_id,v_hands[v_seat+1]
      from public.room_members m where m.room_id=p_room_id and m.seat=v_seat;
    end loop;
    insert into public.kuwaiti_online_secrets(room_id,trump_suit) values(p_room_id,null)
      on conflict(room_id) do update set trump_suit=null,updated_at=now();
    select coalesce(jsonb_object_agg(seat::text,jsonb_build_object('name',display_name,'human',true,'user_id',user_id)),'{}'::jsonb)
      into v_names from public.room_members where room_id=p_room_id;
    v_state:=jsonb_build_object(
      'engine','kuwaiti-six-player-v1','phase','auction','turn',v_starter,
      'auctionStarter',v_starter,'obligatedPlayer',v_obligated,
      'highest',null,'highestRank',0,'highestPlayer',null,'passes',0,'bids','[]'::jsonb,
      'auctionWinner',null,'auctionBid',null,'contract',null,'selectedContract',null,
      'trumpSuit',null,'hiddenTrump',false,'trumpAnnounced',true,'isMalzoom',false,
      'trickNo',1,'plays','[]'::jsonb,'lastTrick','[]'::jsonb,'trickWinners','[]'::jsonb,
      'leader',v_starter,'target',null,'scoreA',v_score_a,'scoreB',v_score_b,
      'matchLimit',v_match_limit,'firstGame',v_first_game,
      'previousAuctionWinner',v_previous_winner,'previousWinningTeam',v_bidder_team,
      'seatPlayers',v_names,'done',false,'matchOver',false,
      'message','کارت‌ها پخش شد؛ مزایده آغاز می‌شود'
    );
    update public.game_rooms set status='playing',public_state=v_state,revision=revision+1,updated_at=now()
      where id=p_room_id;
    return jsonb_build_object('room_id',p_room_id,'status','playing','state',v_state,'phase','auction');
  end if;

  if v_room.status<>'playing' then raise exception 'room_not_playing'; end if;

  if v_type='bid' then
    if v_state->>'phase'<>'auction' then raise exception 'auction_not_active'; end if;
    if coalesce((v_state->>'turn')::integer,-1)<>v_seat then raise exception 'not_your_auction_turn'; end if;
    v_kind:=p_action->>'kind';
    v_passes:=coalesce((v_state->>'passes')::integer,0);
    v_highest:=nullif(v_state->'highest','null'::jsonb);
    v_highest_rank:=coalesce((v_state->>'highestRank')::integer,0);
    v_highest_player:=nullif(v_state->>'highestPlayer','')::integer;

    if v_kind='pass' then
      if v_passes>=5 and v_highest is null then raise exception 'forced_bid_cannot_pass'; end if;
      v_passes:=v_passes+1;
      v_state:=jsonb_set(v_state,'{bids}',coalesce(v_state->'bids','[]'::jsonb)||jsonb_build_array(jsonb_build_object('player',v_seat,'label','پاس')),true);
    elsif v_kind='normal' then
      v_rank:=nullif(p_action->>'rank','')::integer;
      if v_rank not between 1 and 4 then raise exception 'invalid_bid_rank'; end if;
      if v_rank<=v_highest_rank then raise exception 'bid_must_raise'; end if;
      v_target:=case v_rank when 1 then 6 when 2 then 7 when 3 then 8 when 4 then 9 end;
      v_highest:=jsonb_build_object('type','normal','rank',v_rank,'label',case when v_target=9 then 'باون · ۹ دست' else v_target::text end,'target',v_target);
      v_highest_rank:=v_rank;v_highest_player:=v_seat;v_passes:=0;
      v_state:=jsonb_set(v_state,'{bids}',coalesce(v_state->'bids','[]'::jsonb)||jsonb_build_array(jsonb_build_object('player',v_seat,'label',case when v_target=9 then 'باون · ۹ دست' else v_target::text end)),true);
    elsif v_kind='malzoom' then
      if v_seat<>coalesce((v_state->>'obligatedPlayer')::integer,-1) or v_highest is not null or v_highest_rank>0 then
        raise exception 'malzoom_only_for_obligated_player_before_any_bid';
      end if;
      v_highest:=jsonb_build_object('type','malzoom','rank',1,'label','ملزوم');
      v_highest_rank:=1;v_highest_player:=v_seat;v_passes:=0;
      v_state:=jsonb_set(v_state,'{bids}',coalesce(v_state->'bids','[]'::jsonb)||jsonb_build_array(jsonb_build_object('player',v_seat,'label','ملزوم')),true);
    else
      raise exception 'invalid_bid_kind';
    end if;

    if v_passes>=5 and v_highest is not null then
      v_state:=v_state||jsonb_build_object(
        'phase',case when v_highest->>'type'='malzoom' then 'malzoom_selection' else 'contract_selection' end,
        'turn',v_highest_player,'highest',v_highest,'highestRank',v_highest_rank,
        'highestPlayer',v_highest_player,'passes',v_passes,
        'auctionWinner',v_highest_player,'auctionBid',v_highest,
        'isMalzoom',(v_highest->>'type'='malzoom'),'message','مزایده پایان یافت؛ برنده قرارداد را تعیین می‌کند'
      );
    else
      v_winner:=case when v_passes>=5 and v_highest is null then (v_seat+1)%6 else (v_seat+1)%6 end;
      v_state:=v_state||jsonb_build_object('turn',v_winner,'highest',v_highest,
        'highestRank',v_highest_rank,'highestPlayer',v_highest_player,'passes',v_passes);
    end if;

  elsif v_type='select_contract' then
    if v_state->>'phase'<>'contract_selection' then raise exception 'contract_selection_not_active'; end if;
    if v_seat<>coalesce((v_state->>'auctionWinner')::integer,-1) then raise exception 'auction_winner_only'; end if;
    v_contract:=p_action->>'contract';
    if v_contract not in ('hokm_spades','hokm_hearts','hokm_diamonds','hokm_clubs','naras','tak_naras','saras') then
      raise exception 'invalid_kuwaiti_contract';
    end if;
    v_trump:=case v_contract when 'hokm_spades' then 'S' when 'hokm_hearts' then 'H'
      when 'hokm_diamonds' then 'D' when 'hokm_clubs' then 'C' else null end;
    update public.kuwaiti_online_secrets set trump_suit=v_trump,updated_at=now() where room_id=p_room_id;
    v_state:=v_state||jsonb_build_object('phase','playing','turn',v_seat,'leader',v_seat,
      'contract',case when v_contract in ('naras','tak_naras','saras') then v_contract else 'hokm' end,
      'selectedContract',v_contract,'trumpSuit',v_trump,'hiddenTrump',false,
      'trumpAnnounced',true,'isMalzoom',false,'target',(v_state->'auctionBid'->>'target')::integer,
      'trickNo',1,'plays','[]'::jsonb,'trickWinners','[]'::jsonb,'lastTrick','[]'::jsonb,
      'done',false,'message','قرارداد ثبت شد؛ نوبت بازی برنده مزایده است');

  elsif v_type='select_malzoom' then
    if v_state->>'phase'<>'malzoom_selection' then raise exception 'malzoom_selection_not_active'; end if;
    if v_seat<>coalesce((v_state->>'auctionWinner')::integer,-1) then raise exception 'auction_winner_only'; end if;
    v_trump:=p_action->>'trump_suit';
    if v_trump not in ('S','H','D','C') then raise exception 'invalid_trump_suit'; end if;
    v_hidden:=coalesce((p_action->>'hidden')::boolean,true);
    update public.kuwaiti_online_secrets set trump_suit=v_trump,updated_at=now() where room_id=p_room_id;
    v_state:=v_state||jsonb_build_object('phase','playing','turn',v_seat,'leader',v_seat,
      'contract','hokm','selectedContract','hokm','trumpSuit',case when v_hidden then null else v_trump end,
      'hiddenTrump',v_hidden,'trumpAnnounced',not v_hidden,'isMalzoom',true,'target',null,
      'trickNo',1,'plays','[]'::jsonb,'trickWinners','[]'::jsonb,'lastTrick','[]'::jsonb,
      'done',false,'message',case when v_hidden then 'ملزوم آغاز شد؛ حکم مخفی است' else 'ملزوم آغاز شد' end);

  elsif v_type='announce_trump' then
    if v_state->>'phase'<>'playing' then raise exception 'game_not_playing'; end if;
    if coalesce((v_state->>'hiddenTrump')::boolean,false)=false or coalesce((v_state->>'trumpAnnounced')::boolean,false) then
      raise exception 'hidden_trump_not_waiting';
    end if;
    if coalesce((v_state->>'turn')::integer,-1)<>v_seat then raise exception 'not_your_turn'; end if;
    if v_seat<>coalesce((v_state->>'auctionWinner')::integer,-1) then
      v_plays:=coalesce(v_state->'plays','[]'::jsonb);
      if jsonb_array_length(v_plays)=0 then raise exception 'hidden_trump_request_requires_a_lead'; end if;
      if (v_state->'trickNo')::integer=9 and v_plays->0->'card'->>'kind'='joker' then
        if jsonb_array_length(v_plays)>1 then v_lead:=v_plays->1->'card'->>'suit'; end if;
      else
        v_lead:=v_plays->0->'card'->>'suit';
      end if;
      select cards into v_hand from public.kuwaiti_online_hands where room_id=p_room_id and seat=v_seat;
      if v_lead is null or exists(select 1 from jsonb_array_elements(v_hand) c where c->>'kind'='normal' and c->>'suit'=v_lead) then
        raise exception 'player_must_be_void_in_lead_to_request_hidden_trump';
      end if;
    end if;
    select trump_suit into v_trump from public.kuwaiti_online_secrets where room_id=p_room_id;
    v_state:=v_state||jsonb_build_object('trumpAnnounced',true,'trumpSuit',v_trump,'message','حکم مخفی اعلام شد');

  elsif v_type='play_card' then
    if v_state->>'phase'<>'playing' then raise exception 'game_not_playing'; end if;
    if coalesce((v_state->>'turn')::integer,-1)<>v_seat then raise exception 'not_your_turn'; end if;
    select cards into v_hand from public.kuwaiti_online_hands where room_id=p_room_id and seat=v_seat for update;
    if not found then raise exception 'hand_not_found'; end if;
    select x into v_card from jsonb_array_elements(v_hand) x where x->>'id'=p_action->>'card_id' limit 1;
    if v_card is null then raise exception 'card_not_in_hand'; end if;
    select trump_suit into v_secret from public.kuwaiti_online_secrets where room_id=p_room_id;
    v_plays:=coalesce(v_state->'plays','[]'::jsonb);
    v_trick_no:=(v_state->>'trickNo')::integer;
    v_legal:=public.kuwaiti_online_legal_card_ids(
      v_hand,v_plays,v_trick_no,case when v_trick_no=1 or not coalesce((v_state->>'hiddenTrump')::boolean,false) or coalesce((v_state->>'trumpAnnounced')::boolean,false) or v_seat=(v_state->>'auctionWinner')::integer then v_secret else null end,v_seat,(v_state->>'auctionWinner')::integer
    );
    if not (v_card->>'id'=any(v_legal)) then raise exception 'illegal_card_for_kuwaiti_rules'; end if;

    select coalesce(jsonb_agg(x order by ord),'[]'::jsonb) into v_new_hand
    from jsonb_array_elements(v_hand) with ordinality t(x,ord)
    where x->>'id'<>v_card->>'id';
    update public.kuwaiti_online_hands set cards=v_new_hand,updated_at=now()
      where room_id=p_room_id and seat=v_seat;

    v_play:=jsonb_build_object('player',v_seat,'card',v_card);
    v_plays:=v_plays||jsonb_build_array(v_play);
    v_count:=jsonb_array_length(v_plays);
    if v_count<6 then
      v_state:=v_state||jsonb_build_object('plays',v_plays,'turn',(v_seat+1)%6,
        'message','کارت ثبت شد؛ نوبت بازیکن بعدی است');
    else
      if v_trick_no=9 and v_plays->0->'card'->>'kind'='joker' then
        v_lead:=case when v_plays->1->'card'->>'kind'='normal' then v_plays->1->'card'->>'suit' else null end;
      else
        v_lead:=case when v_plays->0->'card'->>'kind'='normal' then v_plays->0->'card'->>'suit' else null end;
      end if;
      v_trump:=case when not coalesce((v_state->>'hiddenTrump')::boolean,false)
                         or coalesce((v_state->>'trumpAnnounced')::boolean,false)
                         then v_secret else v_secret end;
      select exists(select 1 from jsonb_array_elements(v_plays) p
        where p->'card'->>'kind'='normal' and p->'card'->>'suit'=v_trump)
        into v_has_trump;
      v_best_power:=-1;v_best_seat:=null;
      for v_i in 0..5 loop
        v_play:=v_plays->v_i;v_card:=v_play->'card';
        if v_card->>'kind'='joker' then
          v_power:=public.kuwaiti_online_card_power(v_card,v_state->>'contract',v_trick_no,v_i=0,
            coalesce((v_state->>'isMalzoom')::boolean,false),coalesce((v_state->>'trumpAnnounced')::boolean,false));
          v_eligible:=v_power>0;
        elsif v_has_trump then
          v_eligible:=v_card->>'suit'=v_trump;
          v_power:=public.kuwaiti_online_normal_power(v_card,v_state->>'contract');
        else
          v_eligible:=v_lead is not null and v_card->>'suit'=v_lead;
          v_power:=public.kuwaiti_online_normal_power(v_card,v_state->>'contract');
        end if;
        if v_eligible and v_power>v_best_power then
          v_best_power:=v_power;v_best_seat:=(v_play->>'player')::integer;
        end if;
      end loop;
      if v_best_seat is null then v_best_seat:=(v_plays->1->>'player')::integer; end if;

      v_winners:=coalesce(v_state->'trickWinners','[]'::jsonb)||jsonb_build_array(v_best_seat);
      v_state:=v_state||jsonb_build_object('plays','[]'::jsonb,'lastTrick',v_plays,
        'trickWinners',v_winners,'leader',v_best_seat,'turn',v_best_seat,
        'trickNo',v_trick_no+1,'message','دست جمع شد؛ برنده دست نوبت بعد را آغاز می‌کند');

      v_count:=jsonb_array_length(v_winners);
      v_auction_winner:=(v_state->>'auctionWinner')::integer;
      v_bidder_team:=case when mod(v_auction_winner,2)=0 then 'A' else 'B' end;
      v_other_team:=case when v_bidder_team='A' then 'B' else 'A' end;
      select count(*) into v_bidder_tricks from jsonb_array_elements_text(v_winners) x
        where mod(x::integer,2)=mod(v_auction_winner,2);
      v_opponent_tricks:=v_count-v_bidder_tricks;

      if coalesce((v_state->>'isMalzoom')::boolean,false) and v_count=9 then
        v_state:=v_state||jsonb_build_object('phase','malzoom_result','done',true,
          'bidderTricks',v_bidder_tricks,'opponentTricks',v_opponent_tricks,
          'message','۹ دست تمام شد؛ نتیجه ملزوم باید ثبت شود');
      elsif not coalesce((v_state->>'isMalzoom')::boolean,false) then
        v_target:=coalesce((v_state->>'target')::integer,9);
        v_success:=null;
        if v_bidder_tricks>=v_target then v_success:=true;
        elsif v_opponent_tricks>9-v_target then v_success:=false;
        elsif v_count=9 then v_success:=v_bidder_tricks>=v_target;
        end if;
        if v_success is not null then
          v_score:=case when v_success then case when v_target=9 then 36 else v_target end
                        else case when v_target=9 then -18 else -2*v_target end end;
          v_score_a:=coalesce((v_state->>'scoreA')::integer,0);
          v_score_b:=coalesce((v_state->>'scoreB')::integer,0);
          if v_bidder_team='A' then v_score_a:=v_score_a+v_score; else v_score_b:=v_score_b+v_score; end if;
          v_match_limit:=coalesce((v_state->>'matchLimit')::integer,54);
          v_match_over:=case when v_match_limit>=0 then (v_score_a>=v_match_limit or v_score_b>=v_match_limit)
                             else (v_score_a<=v_match_limit or v_score_b<=v_match_limit) end;
          v_state:=v_state||jsonb_build_object('phase','finished','done',true,
            'scoreA',v_score_a,'scoreB',v_score_b,'previousAuctionWinner',v_auction_winner,
            'previousWinningTeam',case when v_success then v_bidder_team else v_other_team end,
            'matchOver',v_match_over,'result',jsonb_build_object('success',v_success,
              'bidderTeam',v_bidder_team,'winnerTeam',case when v_success then v_bidder_team else v_other_team end,
              'bidderTricks',v_bidder_tricks,'opponentTricks',v_opponent_tricks,'score',v_score),
            'message',case when v_success then 'قرارداد موفق شد' else 'قرارداد ناموفق شد' end);
          update public.game_rooms set status='finished' where id=p_room_id;
        end if;
      end if;
    end if;

  elsif v_type='score_malzoom' then
    if v_state->>'phase'<>'malzoom_result' then raise exception 'malzoom_result_not_ready'; end if;
    if v_seat<>coalesce((v_state->>'auctionWinner')::integer,-1) then raise exception 'auction_winner_only'; end if;
    if jsonb_typeof(p_action->'success')<>'boolean' then raise exception 'malzoom_success_choice_required'; end if;
    v_success:=(p_action->>'success')::boolean;
    v_auction_winner:=(v_state->>'auctionWinner')::integer;
    v_bidder_team:=case when mod(v_auction_winner,2)=0 then 'A' else 'B' end;
    v_other_team:=case when v_bidder_team='A' then 'B' else 'A' end;
    v_bidder_tricks:=coalesce((v_state->>'bidderTricks')::integer,0);
    v_opponent_tricks:=coalesce((v_state->>'opponentTricks')::integer,0);
    v_score:=case when v_success then 5 else -5 end;
    v_score_a:=coalesce((v_state->>'scoreA')::integer,0);
    v_score_b:=coalesce((v_state->>'scoreB')::integer,0);
    if v_bidder_team='A' then v_score_a:=v_score_a+v_score; else v_score_b:=v_score_b+v_score; end if;
    v_match_limit:=coalesce((v_state->>'matchLimit')::integer,54);
    v_match_over:=case when v_match_limit>=0 then (v_score_a>=v_match_limit or v_score_b>=v_match_limit)
                       else (v_score_a<=v_match_limit or v_score_b<=v_match_limit) end;
    select trump_suit into v_trump from public.kuwaiti_online_secrets where room_id=p_room_id;
    v_state:=v_state||jsonb_build_object('phase','finished','done',true,'trumpSuit',v_trump,
      'trumpAnnounced',true,'scoreA',v_score_a,'scoreB',v_score_b,
      'previousAuctionWinner',v_auction_winner,'previousWinningTeam',case when v_success then v_bidder_team else v_other_team end,
      'matchOver',v_match_over,'result',jsonb_build_object('success',v_success,'bidderTeam',v_bidder_team,
        'winnerTeam',case when v_success then v_bidder_team else v_other_team end,
        'bidderTricks',v_bidder_tricks,'opponentTricks',v_opponent_tricks,'score',v_score),
      'message',case when v_success then 'ملزوم موفق شد' else 'ملزوم ناموفق شد' end);
    update public.game_rooms set status='finished' where id=p_room_id;

  else
    raise exception 'unsupported_kuwaiti_action';
  end if;

  update public.game_rooms set public_state=v_state,revision=revision+1,updated_at=now()
    where id=p_room_id;
  return jsonb_build_object('room_id',p_room_id,'status',
    case when v_state->>'phase'='finished' then 'finished' else 'playing' end,
    'revision',v_room.revision+1,'state',v_state);
end;
$$;

revoke all on function public.kuwaiti_online_normal_power(jsonb,text) from public,anon,authenticated;
revoke all on function public.kuwaiti_online_card_power(jsonb,text,integer,boolean,boolean,boolean) from public,anon,authenticated;
revoke all on function public.kuwaiti_online_legal_card_ids(jsonb,jsonb,integer,text,integer,integer) from public,anon,authenticated;
revoke all on function public.kuwaiti_online_start(uuid,integer) from public,anon;
revoke all on function public.kuwaiti_online_snapshot(uuid) from public,anon;
revoke all on function public.kuwaiti_online_action(uuid,jsonb) from public,anon;
grant execute on function public.kuwaiti_online_start(uuid,integer) to authenticated;
grant execute on function public.kuwaiti_online_snapshot(uuid) to authenticated;
grant execute on function public.kuwaiti_online_action(uuid,jsonb) to authenticated;
