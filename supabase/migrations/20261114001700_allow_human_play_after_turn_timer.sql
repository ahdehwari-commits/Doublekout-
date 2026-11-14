-- Let a human play after the 10-second display timer if the server has not
-- already advanced that turn for the AI. Row locking serializes this against
-- advance_room_turn_timeout: whichever valid action reaches the room first wins.
do $migration$
declare
  v_definition text;
  v_old text := $old$
    if v_state->>'turnDeadline' is not null and extract(epoch from clock_timestamp()) > (v_state->>'turnDeadline')::numeric then
      raise exception 'turn_time_expired';
    end if;
$old$;
begin
  select pg_get_functiondef('public.apply_room_card(uuid,smallint,text,boolean)'::regprocedure)
    into v_definition;
  if position(v_old in v_definition)=0 then
    raise exception 'Expected human turn deadline guard was not found in apply_room_card';
  end if;
  v_definition := replace(v_definition, v_old, $new$
    -- A human may still play after the displayed deadline while this seat
    -- remains current. If AI timeout already advanced the turn, the normal
    -- turn/hand checks below reject this stale action safely.
$new$);
  execute v_definition;
end;
$migration$;

notify pgrst, 'reload schema';
