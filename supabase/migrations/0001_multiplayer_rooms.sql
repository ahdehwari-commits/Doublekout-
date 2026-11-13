-- Double Kout multiplayer foundation
-- Run this migration in the Supabase SQL editor for the project.
-- Card hands are private per seat. Never put all hands in game_rooms.public_state.

create table if not exists public.game_rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-F0-9]{6}$'),
  game_mode text not null check (game_mode in ('double-kout','standard-hokm','kuwaiti')),
  player_count smallint not null check (player_count in (4,6)),
  host_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'waiting' check (status in ('waiting','playing','finished','cancelled')),
  public_state jsonb not null default '{}'::jsonb,
  revision bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((game_mode = 'kuwaiti' and player_count = 6) or
         (game_mode in ('double-kout','standard-hokm') and player_count = 4))
);

create table if not exists public.room_members (
  room_id uuid not null references public.game_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  seat smallint not null,
  display_name text not null check (char_length(display_name) between 2 and 24),
  is_host boolean not null default false,
  ready boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id),
  unique (room_id, seat)
);

create table if not exists public.private_hands (
  room_id uuid not null references public.game_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  cards jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create index if not exists room_members_user_idx on public.room_members(user_id);
create index if not exists game_rooms_code_status_idx on public.game_rooms(code, status);

alter table public.game_rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.private_hands enable row level security;

grant select on public.game_rooms, public.room_members, public.private_hands to authenticated;

drop policy if exists "members can read their room" on public.game_rooms;
create policy "members can read their room"
on public.game_rooms for select to authenticated
using (exists (
  select 1 from public.room_members m
  where m.room_id = game_rooms.id and m.user_id = auth.uid()
));

drop policy if exists "members can read room roster" on public.room_members;
create policy "members can read room roster"
on public.room_members for select to authenticated
using (exists (
  select 1 from public.room_members mine
  where mine.room_id = room_members.room_id and mine.user_id = auth.uid()
));

drop policy if exists "players can read only their own hand" on public.private_hands;
create policy "players can read only their own hand"
on public.private_hands for select to authenticated
using (user_id = auth.uid() and exists (
  select 1 from public.room_members m
  where m.room_id = private_hands.room_id and m.user_id = auth.uid()
));

-- Clients cannot directly write room state, seats, or hands. A trusted Edge
-- Function (service role kept server-side) will validate and apply game actions.
revoke insert, update, delete on public.game_rooms from anon, authenticated;
revoke insert, update, delete on public.room_members from anon, authenticated;
revoke insert, update, delete on public.private_hands from anon, authenticated;

create or replace function public.create_game_room(
  p_game_mode text,
  p_player_count smallint,
  p_display_name text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_room public.game_rooms%rowtype;
  v_code text;
  v_try integer := 0;
  v_name text := btrim(coalesce(p_display_name, ''));
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  if char_length(v_name) < 2 or char_length(v_name) > 24 then
    raise exception 'invalid_display_name';
  end if;
  if not ((p_game_mode = 'kuwaiti' and p_player_count = 6) or
          (p_game_mode in ('double-kout','standard-hokm') and p_player_count = 4)) then
    raise exception 'invalid_mode_or_player_count';
  end if;

  loop
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    v_try := v_try + 1;
    begin
      insert into public.game_rooms(code, game_mode, player_count, host_user_id)
      values (v_code, p_game_mode, p_player_count, v_user)
      returning * into v_room;
      exit;
    exception when unique_violation then
      if v_try >= 10 then raise exception 'room_code_generation_failed'; end if;
    end;
  end loop;

  insert into public.room_members(room_id, user_id, seat, display_name, is_host, ready)
  values (v_room.id, v_user, 0, v_name, true, true);

  return jsonb_build_object(
    'room_id', v_room.id, 'code', v_room.code,
    'game_mode', v_room.game_mode, 'player_count', v_room.player_count,
    'seat', 0, 'status', v_room.status
  );
end;
$$;

create or replace function public.join_game_room(
  p_code text,
  p_display_name text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_room public.game_rooms%rowtype;
  v_seat integer;
  v_name text := btrim(coalesce(p_display_name, ''));
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  if char_length(v_name) < 2 or char_length(v_name) > 24 then
    raise exception 'invalid_display_name';
  end if;

  select * into v_room
  from public.game_rooms
  where code = upper(btrim(coalesce(p_code, '')))
  for update;

  if not found then raise exception 'room_not_found'; end if;
  if v_room.status <> 'waiting' then raise exception 'room_already_started'; end if;

  if exists(select 1 from public.room_members where room_id = v_room.id and user_id = v_user) then
    select seat into v_seat from public.room_members where room_id = v_room.id and user_id = v_user;
    return jsonb_build_object('room_id', v_room.id, 'code', v_room.code,
      'game_mode', v_room.game_mode, 'player_count', v_room.player_count,
      'seat', v_seat, 'status', v_room.status);
  end if;

  select s into v_seat
  from generate_series(0, v_room.player_count - 1) s
  where not exists (
    select 1 from public.room_members m where m.room_id = v_room.id and m.seat = s
  )
  order by s
  limit 1;

  if v_seat is null then raise exception 'room_is_full'; end if;

  insert into public.room_members(room_id, user_id, seat, display_name)
  values (v_room.id, v_user, v_seat, v_name);

  return jsonb_build_object('room_id', v_room.id, 'code', v_room.code,
    'game_mode', v_room.game_mode, 'player_count', v_room.player_count,
    'seat', v_seat, 'status', v_room.status);
end;
$$;

revoke all on function public.create_game_room(text, smallint, text) from public;
revoke all on function public.join_game_room(text, text) from public;
grant execute on function public.create_game_room(text, smallint, text) to authenticated;
grant execute on function public.join_game_room(text, text) to authenticated;

-- Enable row-filtered Realtime updates. Safe to rerun if a table is already published.
do $$
declare
  t text;
begin
  foreach t in array array['game_rooms','room_members','private_hands'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;
