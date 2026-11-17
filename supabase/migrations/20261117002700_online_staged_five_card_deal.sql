-- Online rematches: deal five cards to every seat, let the winning side's
-- last player choose the contract, then deal the remaining eight cards.
-- Challenge rights remain per-human-seat and are never host-exclusive.

create table if not exists public.room_game_pending_decks (
  room_id uuid primary key references public.game_rooms(id) on delete cascade,
  cards jsonb not null,
  created_at timestamptz not null default now(),
  constraint room_game_pending_decks_cards_array check (jsonb_typeof(cards)='array')
);
alter table public.room_game_pending_decks enable row level security;
revoke all on public.room_game_pending_decks from anon, authenticated;

create or replace function public.start_next_room_game(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_user uuid:=auth.uid();
  v_room public.game_rooms%rowtype;
  v_old jsonb;
  v_winners jsonb;
  v_winner_team text;
  v_picker integer;
  v_i integer;
  v_suit text;
  v_rank text;
  v_owner uuid;
  v_name text;
  v_deck jsonb[]:='{}'::jsonb[];
  v_shuffled jsonb[];
  v_hands jsonb[]:='{}'::jsonb[];
  v_pending jsonb:='[]'::jsonb;
  v_names jsonb:='{}'::jsonb;
  v_state jsonb;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  select * into v_room from public.game_rooms where id=p_room_id for update;
  if not found then raise exception 'room_not_found'; end if;
  if v_room.host_user_id is distinct from v_user then raise exception 'host_only'; end if;
  if v_room.game_mode not in ('double-kout','standard-hokm') or v_room.player_count<>4 then
    raise exception 'rematch_engine_not_supported_for_this_mode';
  end if;
  if v_room.status<>'finished' or v_room.public_state->>'phase'<>'finished' then
    raise exception 'game_not_finished';
  end if;

  v_old:=v_room.public_state;
  v_winners:=coalesce(v_old->'trickWinners','[]'::jsonb);
  v_winner_team:=case
    when v_old->'challengeResult'->>'status'='success' then coalesce(v_old->>'challengeTeam','A')
    when v_old->'challengeResult'->>'status' like 'failed%' then
      case when v_old->>'challengeTeam'='A' then 'B' else 'A' end
    when coalesce((v_old->>'scoreA')::integer,0)>coalesce((v_old->>'scoreB')::integer,0) then 'A'
    when coalesce((v_old->>'scoreB')::integer,0)>coalesce((v_old->>'scoreA')::integer,0) then 'B'
    when jsonb_array_length(v_winners)>0 then
      case when mod((v_winners->>(jsonb_array_length(v_winners)-1))::integer,2)=0 then 'A' else 'B' end
    else 'A'
  end;
  v_picker:=coalesce(nullif(v_old->>'leader','')::integer,0);
  if jsonb_array_length(v_winners)>0 then
    for v_i in reverse (jsonb_array_length(v_winners)-1)..0 loop
      if (case when mod((v_winners->>v_i)::integer,2)=0 then 'A' else 'B' end)=v_winner_team then
        v_picker:=(v_winners->>v_i)::integer;
        exit;
      end if;
    end loop;
  end if;

  delete from public.room_game_hands where room_id=p_room_id;
  delete from public.room_game_pending_decks where room_id=p_room_id;
  for v_i in 1..4 loop v_hands[v_i]:='[]'::jsonb; end loop;
  for v_suit in select unnest(array['S','H','D','C']) loop
    for v_rank in select unnest(array['2','3','4','5','6','7','8','9','10','J','Q','K','A']) loop
      v_deck:=array_append(v_deck,jsonb_build_object(
        'id',v_rank||v_suit,'rank',v_rank,'suit',v_suit,'kind','normal'));
    end loop;
  end loop;
  select array_agg(x order by random()) into v_shuffled from unnest(v_deck) x;
  for v_i in 1..52 loop
    if v_i<=20 then
      v_hands[((v_i-1)%4)+1]:=v_hands[((v_i-1)%4)+1]||jsonb_build_array(v_shuffled[v_i]);
    else
      v_pending:=v_pending||jsonb_build_array(v_shuffled[v_i]);
    end if;
  end loop;

  for v_i in 0..3 loop
    select user_id,display_name into v_owner,v_name
      from public.room_members where room_id=p_room_id and seat=v_i;
    if v_owner is null then
      v_names:=v_names||jsonb_build_object(v_i::text,jsonb_build_object('name','هوش مصنوعی','human',false));
    else
      v_names:=v_names||jsonb_build_object(v_i::text,jsonb_build_object('name',v_name,'human',true));
    end if;
    insert into public.room_game_hands(room_id,seat,owner_user_id,cards)
      values(p_room_id,v_i,v_owner,v_hands[v_i+1]);
  end loop;
  insert into public.room_game_pending_decks(room_id,cards)
    values(p_room_id,v_pending);

  v_state:=jsonb_build_object(
    'phase','trump_selection','turn',v_picker,'leader',v_picker,'trumpPickerSeat',v_picker,
    'trickNo',1,'plays','[]'::jsonb,'trickWinners','[]'::jsonb,
    'groupCards','[]'::jsonb,'groupStartIndex',0,'trump',null,'contract',null,
    'seatPlayers',v_names,'startedWithPresent',false,
    'humanCount',(select count(*) from public.room_members where room_id=p_room_id),
    'challengeTeam',null,'challengeResult',null,'scoreA',0,'scoreB',0,
    'handSizes',jsonb_build_object('0',5,'1',5,'2',5,'3',5),
    'message','پنج کارت به هر بازیکن داده شد؛ حاکم باید قرارداد را انتخاب کند');
  update public.game_rooms set status='playing',public_state=v_state,
    revision=revision+1,updated_at=now() where id=p_room_id;
  return jsonb_build_object('room_id',p_room_id,'status','playing',
    'revision',v_room.revision+1,'state',v_state,'phase','trump_selection');
end;
$$;

create or replace function public.select_room_trump(p_room_id uuid,p_contract text default null)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  v_user uuid:=auth.uid();
  v_room public.game_rooms%rowtype;
  v_state jsonb;
  v_picker integer;
  v_owner uuid;
  v_hand jsonb;
  v_pending jsonb;
  v_contract text:=p_contract;
  v_suit text;
  v_best_suit text:='S';
  v_best_score numeric:=-1;
  v_score numeric;
  v_count integer;
  v_high integer;
  v_card jsonb;
  v_i integer;
  v_seat integer;
  v_now numeric:=extract(epoch from clock_timestamp());
  v_deadlines jsonb:='{}'::jsonb;
  v_human record;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  select * into v_room from public.game_rooms where id=p_room_id for update;
  if not found or v_room.status<>'playing' then raise exception 'room_not_playing'; end if;
  v_state:=v_room.public_state;
  if v_state->>'phase'<>'trump_selection' then raise exception 'trump_selection_not_pending'; end if;
  v_picker:=(v_state->>'trumpPickerSeat')::integer;
  select owner_user_id,cards into v_owner,v_hand from public.room_game_hands
    where room_id=p_room_id and seat=v_picker for update;
  if v_owner is null then
    if v_room.host_user_id is distinct from v_user then raise exception 'ai_trump_selection_host_only'; end if;
    if v_contract is not null then raise exception 'ai_contract_is_server_selected'; end if;
    for v_suit in select unnest(array['S','H','D','C']) loop
      select count(*),
        count(*) filter(where rank in ('A','K','Q','J'))
        into v_count,v_high
        from jsonb_to_recordset(v_hand) as c(rank text,suit text)
        where suit=v_suit;
      v_score:=v_count*1.7+v_high*1.4;
      if v_score>v_best_score then v_best_score:=v_score;v_best_suit:=v_suit;end if;
    end loop;
    v_contract:='hokm_'||case v_best_suit when 'S' then 'spades' when 'H' then 'hearts' when 'D' then 'diamonds' else 'clubs' end;
  elsif v_owner is distinct from v_user then
    raise exception 'not_trump_picker';
  end if;

  if v_contract not in ('hokm_spades','hokm_hearts','hokm_diamonds','hokm_clubs',
                        'naras','tak_naras','saras','partner_middle') then
    raise exception 'invalid_contract';
  end if;
  v_suit:=case v_contract
    when 'hokm_spades' then 'S' when 'hokm_hearts' then 'H'
    when 'hokm_diamonds' then 'D' when 'hokm_clubs' then 'C'
    when 'partner_middle' then null else null end;
  if v_contract='partner_middle' then
    select cards->2->>'suit' into v_suit from public.room_game_hands
      where room_id=p_room_id and seat=((v_picker+2)%4);
    if v_suit not in ('S','H','D','C') then raise exception 'partner_middle_card_missing'; end if;
  end if;

  select cards into v_pending from public.room_game_pending_decks
    where room_id=p_room_id for update;
  if v_pending is null or jsonb_array_length(v_pending)<>32 then
    raise exception 'pending_deck_missing_or_invalid';
  end if;
  for v_i in 0..31 loop
    v_seat:=v_i%4;
    v_card:=v_pending->v_i;
    update public.room_game_hands
      set cards=cards||jsonb_build_array(v_card),updated_at=now()
      where room_id=p_room_id and seat=v_seat;
  end loop;
  delete from public.room_game_pending_decks where room_id=p_room_id;

  v_state:=jsonb_set(v_state,'{contract}',to_jsonb(v_contract),true);
  if v_suit is null then v_state:=jsonb_set(v_state,'{trump}','null'::jsonb,true);
  else v_state:=jsonb_set(v_state,'{trump}',to_jsonb(v_suit),true); end if;
  v_state:=jsonb_set(v_state,'{handSizes}',jsonb_build_object('0',13,'1',13,'2',13,'3',13),true);
  v_state:=jsonb_set(v_state,'{turn}',to_jsonb(v_picker),true);
  v_state:=jsonb_set(v_state,'{leader}',to_jsonb(v_picker),true);
  if v_room.game_mode='double-kout' then
    for v_human in select seat from public.room_game_hands where room_id=p_room_id and owner_user_id is not null loop
      v_deadlines:=jsonb_set(v_deadlines,array[v_human.seat::text],to_jsonb(v_now+10),true);
    end loop;
    v_state:=jsonb_set(v_state,'{phase}','"challenge_decision"'::jsonb,true);
    v_state:=jsonb_set(v_state,'{challengeStartedAt}',to_jsonb(v_now),true);
    v_state:=jsonb_set(v_state,'{challengeDeadlines}',v_deadlines,true);
    v_state:=jsonb_set(v_state,'{challengeExtendedSeats}','[]'::jsonb,true);
    v_state:=jsonb_set(v_state,'{challengePassed}','[]'::jsonb,true);
    v_state:=jsonb_set(v_state,'{challengeInitiator}','null'::jsonb,true);
    v_state:=jsonb_set(v_state,'{challengeTeam}','null'::jsonb,true);
    v_state:=jsonb_set(v_state,'{message}',to_jsonb('قرارداد انتخاب شد؛ همه بازیکنان انسانی ۱۰ ثانیه فرصت مستقل برای اعلام چالش دارند'::text),true);
  else
    v_state:=jsonb_set(v_state,'{phase}','"playing"'::jsonb,true);
    v_state:=jsonb_set(v_state,'{turnDeadline}',to_jsonb(v_now+10),true);
    v_state:=jsonb_set(v_state,'{message}',to_jsonb('قرارداد انتخاب شد؛ بازی آغاز شد'),true);
  end if;
  update public.game_rooms set public_state=v_state,revision=revision+1,updated_at=now()
    where id=p_room_id;
  return jsonb_build_object('room_id',p_room_id,'state',v_state,
    'revision',v_room.revision+1,'contract',v_contract,'cards_dealt',52);
end;
$$;

-- All human seats may independently challenge or pass; the host has no special right.
create or replace function public.submit_room_challenge_choice(p_room_id uuid,p_choice text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_user uuid:=auth.uid(); v_room public.game_rooms%rowtype; v_state jsonb;
  v_seat integer; v_team text; v_passed jsonb; v_humans integer; v_first_turn integer;
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
  v_first_turn:=coalesce(nullif(v_state->>'trumpPickerSeat','')::integer,0);
  if p_choice='challenge' then
    v_team:=case when mod(v_seat,2)=0 then 'A' else 'B' end;
    v_state:=jsonb_set(v_state,'{challengeTeam}',to_jsonb(v_team),true);
    v_state:=jsonb_set(v_state,'{challengeInitiator}',to_jsonb(v_seat),true);
    v_state:=jsonb_set(v_state,'{phase}','"playing"'::jsonb,true);
    v_state:=jsonb_set(v_state,'{turn}',to_jsonb(v_first_turn),true);
    v_state:=jsonb_set(v_state,'{turnDeadline}',to_jsonb(extract(epoch from clock_timestamp())+10),true);
    v_state:=jsonb_set(v_state,'{message}',to_jsonb('بازیکن اعلام‌کننده چالش مشخص شد؛ بازی آغاز شد'),true);
  else
    v_passed:=coalesce(v_state->'challengePassed','[]'::jsonb)||jsonb_build_array(v_seat);
    select count(*) into v_humans from public.room_game_hands where room_id=p_room_id and owner_user_id is not null;
    v_state:=jsonb_set(v_state,'{challengePassed}',v_passed,true);
    if jsonb_array_length(v_passed)>=v_humans then
      v_state:=jsonb_set(v_state,'{phase}','"playing"'::jsonb,true);
      v_state:=jsonb_set(v_state,'{challengeTeam}','null'::jsonb,true);
      v_state:=jsonb_set(v_state,'{turn}',to_jsonb(v_first_turn),true);
      v_state:=jsonb_set(v_state,'{turnDeadline}',to_jsonb(extract(epoch from clock_timestamp())+10),true);
      v_state:=jsonb_set(v_state,'{message}',to_jsonb('همه بازیکنان از چالش عبور کردند؛ بازی عادی آغاز شد'),true);
    else
      v_state:=jsonb_set(v_state,'{message}',to_jsonb('انتخاب شما ثبت شد؛ منتظر تصمیم سایر بازیکنان هستیم'),true);
    end if;
  end if;
  update public.game_rooms set public_state=v_state,revision=revision+1,updated_at=now() where id=p_room_id;
  return jsonb_build_object('room_id',p_room_id,'state',v_state,'choice_recorded',true);
end; $$;

create or replace function public.expire_room_challenge_turn(p_room_id uuid,p_expected_seat smallint)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_user uuid:=auth.uid(); v_room public.game_rooms%rowtype; v_state jsonb;
  v_passed jsonb; v_humans integer; v_first_turn integer;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  select * into v_room from public.game_rooms where id=p_room_id for update;
  if not found or v_room.status<>'playing' then raise exception 'room_not_playing'; end if;
  if not exists(select 1 from public.room_members where room_id=p_room_id and user_id=v_user) then
    raise exception 'not_a_room_member';
  end if;
  v_state:=v_room.public_state;
  if v_state->>'phase'<>'challenge_decision' then
    return jsonb_build_object('expired',false,'state',v_state);
  end if;
  if not (v_state->'challengeDeadlines' ? p_expected_seat::text) then
    return jsonb_build_object('expired',false,'state',v_state);
  end if;
  if extract(epoch from clock_timestamp())<=(v_state->'challengeDeadlines'->>p_expected_seat::text)::numeric then
    return jsonb_build_object('expired',false,'state',v_state);
  end if;
  v_passed:=coalesce(v_state->'challengePassed','[]'::jsonb);
  if v_passed @> jsonb_build_array(p_expected_seat) then
    return jsonb_build_object('expired',false,'state',v_state);
  end if;
  v_passed:=v_passed||jsonb_build_array(p_expected_seat);
  select count(*) into v_humans from public.room_game_hands where room_id=p_room_id and owner_user_id is not null;
  v_first_turn:=coalesce(nullif(v_state->>'trumpPickerSeat','')::integer,0);
  v_state:=jsonb_set(v_state,'{challengePassed}',v_passed,true);
  if jsonb_array_length(v_passed)>=v_humans then
    v_state:=jsonb_set(v_state,'{phase}','"playing"'::jsonb,true);
    v_state:=jsonb_set(v_state,'{challengeTeam}','null'::jsonb,true);
    v_state:=jsonb_set(v_state,'{turn}',to_jsonb(v_first_turn),true);
    v_state:=jsonb_set(v_state,'{turnDeadline}',to_jsonb(extract(epoch from clock_timestamp())+10),true);
    v_state:=jsonb_set(v_state,'{message}',to_jsonb('مهلت همه بازیکنان تمام شد؛ بازی عادی آغاز شد'),true);
  else
    v_state:=jsonb_set(v_state,'{message}',to_jsonb('مهلت یک بازیکن تمام شد؛ سایر بازیکنان همچنان فرصت انتخاب دارند'),true);
  end if;
  update public.game_rooms set public_state=v_state,revision=revision+1,updated_at=now() where id=p_room_id;
  return jsonb_build_object('expired',true,'state',v_state);
end; $$;

revoke all on function public.select_room_trump(uuid,text) from public;
revoke all on function public.submit_room_challenge_choice(uuid,text) from public;
revoke all on function public.expire_room_challenge_turn(uuid,smallint) from public;
grant execute on function public.select_room_trump(uuid,text) to authenticated;
grant execute on function public.submit_room_challenge_choice(uuid,text) to authenticated;
grant execute on function public.expire_room_challenge_turn(uuid,smallint) to authenticated;

notify pgrst,'reload schema';
