-- Make the six-player start RPC idempotent so a retry after a successful deal resumes the existing auction.
CREATE OR REPLACE FUNCTION public.kuwaiti_online_start_with_ai(p_room_id uuid, p_match_limit integer DEFAULT 54, p_fill_ai boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_user uuid := auth.uid();
  v_room public.game_rooms%rowtype;
  v_total integer;
  v_ready integer;
  v_ai_seats jsonb := '[]'::jsonb;
  v_owner uuid;
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
  if not exists(select 1 from public.room_members where room_id=p_room_id and user_id=v_user and is_host) then
    raise exception 'host_membership_required';
  end if;

  -- A repeated start request must return the already-dealt game, never deal again.
  if v_room.status='playing'
     and coalesce(v_room.public_state->>'engine','')='kuwaiti-six-player-v1' then
    return jsonb_build_object(
      'room_id',p_room_id,
      'status',v_room.status,
      'revision',v_room.revision,
      'state',coalesce(v_room.public_state,'{}'::jsonb),
      'phase',coalesce(v_room.public_state->>'phase','auction')
    );
  end if;
  if v_room.status<>'waiting' then raise exception 'room_not_waiting'; end if;

  select count(*),count(*) filter(where ready) into v_total,v_ready
  from public.room_members where room_id=p_room_id;
  if p_fill_ai then
    if v_total<1 or v_total>6 then raise exception 'at_least_one_human_required'; end if;
    if v_ready<>v_total then raise exception 'all_joined_humans_must_be_ready'; end if;
  else
    if v_total<>6 then raise exception 'room_not_full'; end if;
    if v_ready<>6 then raise exception 'all_six_players_must_be_ready'; end if;
  end if;

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

  v_starter:=null;
  for v_seat in 0..5 loop
    if exists(select 1 from jsonb_array_elements(v_hands[v_seat+1]) c where c->>'id'='2C') then
      v_starter:=v_seat; exit;
    end if;
  end loop;
  if v_starter is null then raise exception 'opening_two_of_clubs_not_dealt'; end if;

  for v_seat in 0..5 loop
    select user_id into v_owner from public.room_members where room_id=p_room_id and seat=v_seat;
    if v_owner is not null then
      select jsonb_build_object('name',display_name,'human',true,'user_id',user_id)
        into v_card from public.room_members where room_id=p_room_id and seat=v_seat;
      insert into public.kuwaiti_online_hands(room_id,seat,owner_user_id,cards)
        values(p_room_id,v_seat,v_owner,v_hands[v_seat+1])
      on conflict(room_id,seat) do update
        set owner_user_id=excluded.owner_user_id,cards=excluded.cards,updated_at=now();
    else
      if not p_fill_ai then raise exception 'missing_room_seat'; end if;
      v_card:=jsonb_build_object('name','هوش مصنوعی '||(v_seat+1),'human',false,'user_id',null);
      v_ai_seats:=v_ai_seats||jsonb_build_array(v_seat);
      insert into public.kuwaiti_online_hands(room_id,seat,owner_user_id,cards)
        values(p_room_id,v_seat,null,v_hands[v_seat+1])
      on conflict(room_id,seat) do update
        set owner_user_id=null,cards=excluded.cards,updated_at=now();
    end if;
    v_names:=v_names||jsonb_build_object(v_seat::text,v_card);
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
    'seatPlayers',v_names,'aiSeats',v_ai_seats,'aiEnabled',jsonb_array_length(v_ai_seats)>0,'done',false,'matchOver',false,
    'message','۵۴ کارت پخش شد؛ مزایده از دارنده ۲ خاج آغاز می‌شود'
  );

  update public.game_rooms set status='playing',public_state=v_state,
    revision=revision+1,updated_at=now() where id=p_room_id;
  return jsonb_build_object('room_id',p_room_id,'status','playing',
    'revision',v_room.revision+1,'state',v_state,'phase','auction');
end;
$function$;
revoke all on function public.kuwaiti_online_start_with_ai(uuid,integer,boolean) from public, anon;
grant execute on function public.kuwaiti_online_start_with_ai(uuid,integer,boolean) to authenticated;