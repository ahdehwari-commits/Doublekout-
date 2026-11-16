-- Award two central points for every newly recorded win.
-- Preserve historical points and ledger rows; only future wins receive +2.
alter table public.player_game_wins
  drop constraint if exists player_game_wins_points_awarded_check;
alter table public.player_game_wins
  alter column points_awarded set default 2;
alter table public.player_game_wins
  add constraint player_game_wins_points_awarded_check check(points_awarded in (1,2));

create or replace function public.award_player_win_internal(p_user_id uuid,p_game_id text,p_game_mode text,p_source text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare inserted_id bigint;
begin
 if p_user_id is null or p_game_id is null or length(p_game_id)<8 or length(p_game_id)>120 then return false; end if;
 if p_game_mode not in ('double-kout','standard-hokm','kuwaiti') then return false; end if;
 insert into public.player_profiles(user_id,display_name)
 select u.id,left(coalesce(nullif(btrim(u.raw_user_meta_data->>'display_name'),''),nullif(btrim(u.raw_user_meta_data->>'full_name'),''),'بازیکن'),24)
 from auth.users u where u.id=p_user_id on conflict(user_id) do nothing;
 insert into public.player_game_wins(user_id,game_id,game_mode,source,points_awarded)
 values(p_user_id,p_game_id,p_game_mode,p_source,2)
 on conflict(user_id,game_id) do nothing returning id into inserted_id;
 if inserted_id is null then return false; end if;
 update public.player_profiles set points=points+2,wins=wins+1,updated_at=now() where user_id=p_user_id;
 return true;
end; $$;

create or replace function public.award_local_game_win(p_game_id text,p_game_mode text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid(); added boolean;
begin
 if uid is null then raise exception 'account_login_required'; end if;
 if coalesce((auth.jwt()->>'is_anonymous')::boolean,false) then raise exception 'permanent_account_required'; end if;
 if p_game_mode not in ('double-kout','standard-hokm','kuwaiti') then raise exception 'invalid_game_mode'; end if;
 added:=public.award_player_win_internal(uid,p_game_id,p_game_mode,'local');
 return jsonb_build_object('awarded',added,'points_added',case when added then 2 else 0 end);
end; $$;
revoke all on function public.award_local_game_win(text,text) from public,anon;
grant execute on function public.award_local_game_win(text,text) to authenticated;
