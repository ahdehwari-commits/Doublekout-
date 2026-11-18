-- Restrict authenticated game RPCs and internal trigger helpers from the anon role.
-- Public read/learning endpoints intentionally remain available to anon.
do $revoke$
declare
  v_signature text;
  v_function regprocedure;
begin
  foreach v_signature in array array[
    'public.advance_room_turn_timeout(uuid)',
    'public.apply_room_card(uuid,smallint,text,boolean)',
    'public.create_game_room(text,smallint,text)',
    'public.expire_room_challenge_turn(uuid,smallint)',
    'public.extend_room_challenge_time(uuid)',
    'public.extend_room_rematch_time(uuid)',
    'public.get_room_roster(uuid)',
    'public.get_room_snapshot(uuid)',
    'public.host_decide_room_start(uuid,text)',
    'public.is_room_member(uuid)',
    'public.join_game_room(text,text)',
    'public.join_game_room(text,text,smallint)',
    'public.leave_game_room(uuid)',
    'public.play_room_ai_turn(uuid)',
    'public.play_room_card(uuid,text)',
    'public.require_verified_player()',
    'public.resolve_room_trick(uuid)',
    'public.select_room_trump(uuid,text)',
    'public.set_room_game_decision(uuid,text)',
    'public.set_room_ready(uuid,boolean)',
    'public.start_game_room(uuid)',
    'public.start_initial_room_game_staged(uuid)',
    'public.start_next_room_game(uuid)',
    'public.start_room_game(uuid,boolean,text)',
    'public.start_room_game(uuid,boolean,text,text)',
    'public.submit_room_challenge_choice(uuid,text)'
  ] loop
    v_function:=to_regprocedure(v_signature);
    if v_function is not null then
      execute format('revoke execute on function %s from anon',v_function);
    end if;
  end loop;
end;
$revoke$;

do $internal$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke all on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end;
$internal$;

revoke all on function public.sync_player_profile() from public, anon, authenticated;
notify pgrst,'reload schema';
