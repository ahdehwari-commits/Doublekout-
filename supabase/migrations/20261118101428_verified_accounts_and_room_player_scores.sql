-- Require permanent, verified accounts to create or join online rooms.
-- Supabase Apple identities are accepted when the verified provider metadata is present.
create or replace function public.require_verified_player()
returns void
language plpgsql
security definer
set search_path=public,auth,pg_temp
as $$
declare
  v_user uuid:=auth.uid();
  v_confirmed_at timestamptz;
  v_app_metadata jsonb;
begin
  if v_user is null then raise exception 'authentication_required'; end if;
  select email_confirmed_at,raw_app_meta_data
    into v_confirmed_at,v_app_metadata
  from auth.users where id=v_user;
  if not found then raise exception 'authentication_required'; end if;
  if v_confirmed_at is null and coalesce(v_app_metadata->>'provider','')<>'apple' then
    raise exception 'verified_account_required';
  end if;
end;
$$;
revoke all on function public.require_verified_player() from public,anon;
grant execute on function public.require_verified_player() to authenticated;

-- Keep the existing room creation/join logic intact and insert the account gate
-- immediately after its authentication check. The patch is idempotent.
do $$
declare
  r record;
  v_def text;
  v_new text;
begin
  for r in
    select fn from (values
      ('public.create_game_room(text,smallint,text)'::regprocedure),
      ('public.join_game_room(text,text)'::regprocedure),
      ('public.join_game_room(text,text,smallint)'::regprocedure)
    ) as f(fn)
  loop
    v_def:=pg_get_functiondef(r.fn);
    if position('perform public.require_verified_player()' in lower(v_def))=0 then
      v_new:=regexp_replace(
        v_def,
        '(if[[:space:]]+v_user[[:space:]]+is[[:space:]]+null[[:space:]]+then[[:space:]]+raise[[:space:]]+exception[[:space:]]+''authentication_required'';[[:space:]]+end if;)',
        E'\\1\n  perform public.require_verified_player();',
        'gi'
      );
      if v_new=v_def then
        raise exception 'Could not add verified-account gate to %',r.fn;
      end if;
      execute v_new;
    end if;
  end loop;
end;
$$;
notify pgrst,'reload schema';
