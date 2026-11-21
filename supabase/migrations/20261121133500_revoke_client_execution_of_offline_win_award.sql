-- The client no longer submits local wins; remove this RPC from client roles.
revoke execute on function public.award_local_game_win(text,text) from public, anon, authenticated;
grant execute on function public.award_local_game_win(text,text) to service_role;
comment on function public.award_local_game_win(text,text)
is 'Disabled for client roles: unverified offline game results cannot award points.';
