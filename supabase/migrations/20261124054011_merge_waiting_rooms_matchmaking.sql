-- Automatically merge two active, ready two-player waiting rooms of the same game.
-- The two original rooms become opposing teams; remaining six-player seats are AI-filled at start.

alter table public.room_members
  add column if not exists last_seen_at timestamptz;

update public.room_members m
set last_seen_at = coalesce(m.last_seen_at, r.updated_at, m.joined_at, now())
from public.game_rooms r
where r.id = m.room_id
  and m.last_seen_at is null;

alter table public.room_members
  alter column last_seen_at set default now(),
  alter column last_seen_at set not null;

create index if not exists room_members_room_last_seen_idx
  on public.room_members(room_id, last_seen_at desc);

create table if not exists public.room_merge_redirects (
  old_room_id uuid not null references public.game_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  target_room_id uuid not null references public.game_rooms(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (old_room_id, user_id)
);

alter table public.room_merge_redirects enable row level security;
revoke all on table public.room_merge_redirects from public, anon, authenticated;

create or replace function public.try_merge_waiting_rooms(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user uuid := auth.uid();
  v_current public.game_rooms%rowtype;
  v_other public.game_rooms%rowtype;
  v_target public.game_rooms%rowtype;
  v_source public.game_rooms%rowtype;
  v_redirect uuid;
  v_count integer;
  v_ready integer;
  v_active integer;
begin
  if v_user is null then
    raise exception 'authentication_required';
  end if;

  select target_room_id into v_redirect
  from public.room_merge_redirects
  where old_room_id = p_room_id and user_id = v_user;

  if found then
    select * into v_target from public.game_rooms where id = v_redirect;
    if found then
      return jsonb_build_object(
        'merged', true, 'redirected', true,
        'room_id', v_target.id, 'code', v_target.code,
        'game_mode', v_target.game_mode, 'player_count', v_target.player_count
      );
    end if;
  end if;

  select * into v_current
  from public.game_rooms
  where id = p_room_id
  for update;

  if not found then raise exception 'room_not_found'; end if;

  if not exists (
    select 1 from public.room_members
    where room_id = p_room_id and user_id = v_user
  ) then
    raise exception 'not_a_room_member';
  end if;

  update public.room_members
  set last_seen_at = clock_timestamp()
  where room_id = p_room_id and user_id = v_user;

  if v_current.status <> 'waiting' then
    return jsonb_build_object('merged', false, 'reason', 'room_not_waiting');
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'doublekout-match:' || v_current.game_mode || ':' || v_current.player_count::text, 0
    )
  );

  select * into v_current
  from public.game_rooms
  where id = p_room_id
  for update;

  if v_current.status <> 'waiting' then
    return jsonb_build_object('merged', false, 'reason', 'room_not_waiting');
  end if;

  select count(*),
         count(*) filter (where ready),
         count(*) filter (where last_seen_at > now() - interval '45 seconds')
  into v_count, v_ready, v_active
  from public.room_members
  where room_id = p_room_id;

  if v_count <> 2 or v_ready <> 2 or v_active <> 2 then
    return jsonb_build_object('merged', false, 'reason', 'room_not_matchable');
  end if;

  select r.* into v_other
  from public.game_rooms r
  where r.id <> p_room_id
    and r.game_mode = v_current.game_mode
    and r.player_count = v_current.player_count
    and r.status = 'waiting'
    and (select count(*) from public.room_members m where m.room_id = r.id) = 2
    and (
      select count(*) filter (
        where m.ready and m.last_seen_at > now() - interval '45 seconds'
      )
      from public.room_members m where m.room_id = r.id
    ) = 2
  order by r.created_at, r.id
  for update skip locked
  limit 1;

  if not found then
    return jsonb_build_object('merged', false, 'reason', 'no_compatible_room');
  end if;

  if (v_current.created_at, v_current.id) <= (v_other.created_at, v_other.id) then
    v_target := v_current;
    v_source := v_other;
  else
    v_target := v_other;
    v_source := v_current;
  end if;

  insert into public.room_merge_redirects(old_room_id, user_id, target_room_id)
  select v_source.id, m.user_id, v_target.id
  from public.room_members m
  where m.room_id = v_source.id
  on conflict (old_room_id, user_id) do update
    set target_room_id = excluded.target_room_id,
        created_at = now();

  update public.room_members set seat = seat + 1000 where room_id = v_target.id;
  update public.room_members set seat = seat + 2000 where room_id = v_source.id;

  with ranked_source as (
    select user_id,
           row_number() over (order by is_host desc, joined_at, seat) as rn
    from public.room_members
    where room_id = v_source.id
  )
  update public.room_members m
  set room_id = v_target.id,
      seat = case ranked_source.rn when 1 then 1 else 3 end,
      is_host = false,
      last_seen_at = clock_timestamp()
  from ranked_source
  where m.room_id = v_source.id
    and m.user_id = ranked_source.user_id;

  with ranked_target as (
    select user_id,
           row_number() over (order by is_host desc, joined_at, seat) as rn
    from public.room_members
    where room_id = v_target.id and seat >= 1000
  )
  update public.room_members m
  set seat = case ranked_target.rn when 1 then 0 else 2 end
  from ranked_target
  where m.room_id = v_target.id
    and m.user_id = ranked_target.user_id;

  update public.game_rooms
  set revision = revision + 1, updated_at = now()
  where id = v_target.id;

  update public.game_rooms
  set status = 'cancelled',
      public_state = coalesce(public_state, '{}'::jsonb) ||
        jsonb_build_object('phase','merged','mergedInto',v_target.id,'mergedCode',v_target.code),
      revision = revision + 1, updated_at = now()
  where id = v_source.id;

  return jsonb_build_object(
    'merged', true, 'redirected', (p_room_id = v_source.id),
    'room_id', v_target.id, 'code', v_target.code,
    'game_mode', v_target.game_mode, 'player_count', v_target.player_count,
    'human_players', 4
  );
end;
$function$;

revoke all on function public.try_merge_waiting_rooms(uuid) from public, anon;
grant execute on function public.try_merge_waiting_rooms(uuid) to authenticated;

create or replace function public.host_decide_room_start(p_room_id uuid, p_choice text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user uuid := auth.uid();
  v_room public.game_rooms%rowtype;
  v_guest uuid;
  v_total integer;
  v_result jsonb;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  if p_choice is null or p_choice not in ('human','ai') then raise exception 'invalid_lobby_choice'; end if;

  select * into v_room from public.game_rooms where id = p_room_id for update;
  if not found then raise exception 'room_not_found'; end if;
  if v_room.host_user_id is distinct from v_user then raise exception 'host_only'; end if;
  if v_room.status <> 'waiting' then raise exception 'room_not_waiting'; end if;
  if v_room.game_mode not in ('double-kout','standard-hokm') or v_room.player_count <> 4 then
    raise exception 'online_engine_currently_supports_four_players_only';
  end if;

  select count(*) into v_total from public.room_members where room_id = p_room_id;

  if p_choice = 'human' then
    select user_id into v_guest
    from public.room_members
    where room_id = p_room_id and user_id <> v_user
    order by joined_at, seat
    limit 1;

    if v_guest is null then raise exception 'no_human_guest_to_accept'; end if;

    if v_total <= 2 then
      update public.room_members set ready = true
      where room_id = p_room_id and user_id = v_guest;

      delete from public.room_members
      where room_id = p_room_id and user_id not in (v_user, v_guest);
    end if;
  else
    delete from public.room_members where room_id = p_room_id and user_id <> v_user;
  end if;

  update public.game_rooms set revision = revision + 1, updated_at = now()
  where id = p_room_id;

  v_result := public.start_initial_room_game_staged(p_room_id);
  return v_result || jsonb_build_object(
    'lobby_choice', p_choice,
    'human_guest', v_guest,
    'human_players', case when p_choice = 'human' then v_total else 1 end
  );
end;
$function$;
