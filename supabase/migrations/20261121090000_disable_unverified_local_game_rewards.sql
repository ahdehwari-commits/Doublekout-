-- Offline games are local-only and cannot award leaderboard points.
-- Keep the RPC signature for backward compatibility, but make it non-awarding.
create or replace function public.award_local_game_win(p_game_id text, p_game_mode text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'account_login_required'; end if;
  if coalesce((auth.jwt()->>'is_anonymous')::boolean, false) then
    raise exception 'permanent_account_required';
  end if;
  if p_game_mode not in ('double-kout','standard-hokm','kuwaiti') then
    raise exception 'invalid_game_mode';
  end if;
  return jsonb_build_object('awarded', false, 'points_added', 0, 'status', 'local_games_not_ranked');
end;
$function$;

comment on function public.award_local_game_win(text,text)
is 'Compatibility RPC: offline/local game results are not trusted and never award leaderboard points.';
