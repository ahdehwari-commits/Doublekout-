-- Allow a human to play after the displayed 10-second deadline,
-- provided the server has not already advanced this turn.
-- This is serialized with advance_room_turn_timeout by the room row lock
-- inside apply_room_card, so only one action can advance the turn.
do $migration$
declare
  v_definition text;
  v_updated text;
begin
  select pg_get_functiondef(
    'public.apply_room_card(uuid,smallint,text,boolean)'::regprocedure
  ) into v_definition;

  -- Match the RAISE statement independent of PostgreSQL's deparser
  -- capitalization and whitespace formatting.
  v_updated := regexp_replace(
    v_definition,
    '(?i)raise[[:space:]]+exception[[:space:]]+''turn_time_expired''[[:space:]]*;',
    'null; -- human may still play if this turn is current',
    'g'
  );

  if v_updated = v_definition then
    raise exception 'Could not locate turn_time_expired guard in apply_room_card; no function was changed';
  end if;

  execute v_updated;
end;
$migration$;

notify pgrst, 'reload schema';
