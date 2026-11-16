-- Central player progress, local-game rewards, and authoritative online rewards.
create table if not exists public.player_profiles (
 user_id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null default 'بازیکن' check (char_length(display_name) between 1 and 24),
 points bigint not null default 0 check (points >= 0),
 wins bigint not null default 0 check (wins >= 0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table if not exists public.player_game_wins (
 id bigint generated always as identity primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 game_id text not null,
 game_mode text not null check(game_mode in ('double-kout','standard-hokm','kuwaiti')),
 source text not null check(source in ('local','online')),
 points_awarded integer not null default 1 check(points_awarded=1),
 created_at timestamptz not null default now(),
 unique(user_id,game_id)
);
create index if not exists player_game_wins_user_created_idx on public.player_game_wins(user_id,created_at desc);
alter table public.player_profiles enable row level security;
alter table public.player_game_wins enable row level security;
revoke all on public.player_game_wins from anon,authenticated;
grant select on public.player_profiles to authenticated;
drop policy if exists "players read own profile" on public.player_profiles;
create policy "players read own profile" on public.player_profiles for select to authenticated using(user_id=auth.uid());

create or replace function public.sync_player_profile()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare nm text;
begin
 nm:=left(btrim(coalesce(new.raw_user_meta_data->>'display_name',new.raw_user_meta_data->>'full_name','بازیکن')),24);
 if char_length(nm)<1 then nm:='بازیکن'; end if;
 insert into public.player_profiles(user_id,display_name)
 values(new.id,nm)
 on conflict(user_id) do update set display_name=excluded.display_name,updated_at=now();
 return new;
end; $$;
drop trigger if exists on_auth_user_profile_created on auth.users;
create trigger on_auth_user_profile_created after insert or update of raw_user_meta_data on auth.users
for each row execute function public.sync_player_profile();
insert into public.player_profiles(user_id,display_name)
select id,left(coalesce(nullif(btrim(raw_user_meta_data->>'display_name'),''),nullif(btrim(raw_user_meta_data->>'full_name'),''),'بازیکن'),24)
from auth.users on conflict(user_id) do nothing;

create or replace function public.award_player_win_internal(p_user_id uuid,p_game_id text,p_game_mode text,p_source text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare inserted_id bigint;
begin
 if p_user_id is null or p_game_id is null or length(p_game_id)<8 or length(p_game_id)>120 then return false; end if;
 if p_game_mode not in ('double-kout','standard-hokm','kuwaiti') then return false; end if;
 insert into public.player_profiles(user_id,display_name)
 select u.id,left(coalesce(nullif(btrim(u.raw_user_meta_data->>'display_name'),''),nullif(btrim(u.raw_user_meta_data->>'full_name'),''),'بازیکن'),24)
 from auth.users u where u.id=p_user_id on conflict(user_id) do nothing;
 insert into public.player_game_wins(user_id,game_id,game_mode,source)
 values(p_user_id,p_game_id,p_game_mode,p_source)
 on conflict(user_id,game_id) do nothing returning id into inserted_id;
 if inserted_id is null then return false; end if;
 update public.player_profiles set points=points+1,wins=wins+1,updated_at=now() where user_id=p_user_id;
 return true;
end; $$;
revoke all on function public.award_player_win_internal(uuid,text,text,text) from public,anon,authenticated;

create or replace function public.award_local_game_win(p_game_id text,p_game_mode text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid(); added boolean;
begin
 if uid is null then raise exception 'account_login_required'; end if;
 if coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'permanent_account_required'; end if;
 if p_game_mode not in ('double-kout','standard-hokm','kuwaiti') then raise exception 'invalid_game_mode'; end if;
 added:=public.award_player_win_internal(uid,p_game_id,p_game_mode,'local');
 return jsonb_build_object('awarded',added,'points_added',case when added then 1 else 0 end);
end; $$;
revoke all on function public.award_local_game_win(text,text) from public,anon;
grant execute on function public.award_local_game_win(text,text) to authenticated;

create or replace function public.award_finished_online_room()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare st jsonb:=new.public_state; challenge text; result text; winning_team text; mode_name text;
 m record; gid text;
begin
 if new.status<>'finished' or old.status='finished' then return new; end if;
 mode_name:=new.game_mode;
 if mode_name='kuwaiti' then return new; end if;
 challenge:=st->>'challengeTeam';result:=st->'challengeResult'->>'status';
 if challenge is not null then
  if result='success' then winning_team:=challenge;
  elsif result like 'failed%' then winning_team:=case when challenge='A' then 'B' else 'A' end;
  end if;
 else
  if coalesce((st->>'scoreA')::integer,0)>coalesce((st->>'scoreB')::integer,0) then winning_team:='A';
  elsif coalesce((st->>'scoreB')::integer,0)>coalesce((st->>'scoreA')::integer,0) then winning_team:='B';
  end if;
 end if;
 if winning_team is null then return new; end if;
 gid:=new.id::text||':'||new.revision::text;
 for m in
  select rm.user_id from public.room_members rm
  join auth.users u on u.id=rm.user_id
  where rm.room_id=new.id and mod(rm.seat,2)=case when winning_team='A' then 0 else 1 end
    and coalesce(u.is_anonymous,false)=false
 loop
  perform public.award_player_win_internal(m.user_id,gid,mode_name,'online');
 end loop;
 return new;
end; $$;
drop trigger if exists award_online_room_win on public.game_rooms;
create trigger award_online_room_win after update of status on public.game_rooms
for each row when (new.status='finished' and old.status is distinct from new.status)
execute function public.award_finished_online_room();
revoke all on function public.award_finished_online_room() from public,anon,authenticated;

create or replace function public.get_my_progress()
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select case when auth.uid() is null then null else
  (select jsonb_build_object('display_name',display_name,'points',points,'wins',wins)
   from public.player_profiles where user_id=auth.uid()) end;
$$;
revoke all on function public.get_my_progress() from public,anon;
grant execute on function public.get_my_progress() to authenticated;

create or replace function public.get_player_leaderboard(p_limit integer default 50)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(to_jsonb(x) order by x.points desc,x.wins desc,x.display_name),'[]'::jsonb)
 from (
  select display_name,points,wins from public.player_profiles
  where points>0 order by points desc,wins desc,display_name limit greatest(1,least(coalesce(p_limit,50),100))
 ) x;
$$;
revoke all on function public.get_player_leaderboard(integer) from public;
grant execute on function public.get_player_leaderboard(integer) to anon,authenticated;
