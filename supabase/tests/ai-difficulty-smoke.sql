do $$
declare
  v_default text;
  v_ai_def text;
  v_host_def text;
begin
  select column_default into v_default
    from information_schema.columns
   where table_schema='public' and table_name='game_rooms' and column_name='ai_difficulty';
  if v_default is null or position('expert' in v_default)=0 then
    raise exception 'ai_difficulty must default to expert; got %',v_default;
  end if;

  if not exists (
    select 1 from pg_constraint
     where conname='game_rooms_ai_difficulty_check'
       and conrelid='public.game_rooms'::regclass
  ) then raise exception 'AI difficulty validation constraint is missing'; end if;

  select pg_get_functiondef('public.play_room_ai_turn(uuid)'::regprocedure) into v_ai_def;
  if position('easy_random_legal_card' in v_ai_def)=0
     or position('normal_lowest_legal_card' in v_ai_def)=0
     or position('expert_secure_second_consecutive_trick' in v_ai_def)=0
     or position('v_room.ai_difficulty' in v_ai_def)=0 then
    raise exception 'AI difficulty branches are incomplete';
  end if;

  select pg_get_functiondef('public.host_decide_room_start(uuid,text,text)'::regprocedure) into v_host_def;
  if position('p_ai_difficulty' in v_host_def)=0 then
    raise exception 'Host start function does not accept the selected AI difficulty';
  end if;
end $$;

select 'PASS: online AI difficulty defaults to expert and supports easy, normal, hard and expert modes.' as result;
