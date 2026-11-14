-- Let a human play after the 10-second display timer if the server has not
-- already advanced that turn for the AI. Row locking serializes this against
-- advance_room_turn_timeout: whichever valid action reaches the room first wins.
do $migration$
declare
  v_definition text;
  v_old text := $old$raise exception 'turn_time_expired';$old$;
begin
  select pg_get_functiondef('public.apply_room_card(uuid,smallint,text,boolean)'::regprocedure)
    into v_definition;
  if position(v_old in v_definition)=0 then
    raise exception 'Expected human turn deadline guard was not found in apply_room_card';
  end if;
  -- Keep the surrounding IF check harmless; it no longer rejects a late human play.
  v_definition := replace(v_definition, v_old, 'null; -- human may still play if this turn is current');
  execute v_definition;
end;
$migration$;

notify pgrst, 'reload schema';
