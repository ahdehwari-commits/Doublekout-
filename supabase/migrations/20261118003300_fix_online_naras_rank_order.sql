-- Fix online rank strength for Naras and Tak Naras.
-- array_position() is compared with "greater = stronger" and sorted ascending
-- by the AI to choose the weakest legal card first.

create or replace function public.room_contract_rank_order(p_contract text)
returns text[]
language sql
immutable
parallel safe
set search_path = public, pg_temp
as $$
  select case
    -- Weakest to strongest: 2 is strongest, Ace is weakest.
    when p_contract = 'naras'
      then array['A','K','Q','J','10','9','8','7','6','5','4','3','2']::text[]
    -- Weakest to strongest: Ace is strongest, 2 is weakest.
    when p_contract = 'tak_naras'
      then array['K','Q','J','10','9','8','7','6','5','4','3','2','A']::text[]
    -- Hokm and Saras retain their existing order.
    else array['2','3','4','5','6','7','8','9','10','J','Q','K','A']::text[]
  end;
$$;

revoke all on function public.room_contract_rank_order(text) from public;
grant execute on function public.room_contract_rank_order(text) to authenticated;

do $$
declare
  v_def text;
  v_decl text;
  v_state_line text;
  v_fn regprocedure;
  v_count integer := 0;
  r record;
begin
  for r in
    select *
    from (values
      (
        'public.apply_room_card(uuid,smallint,text,boolean)'::regprocedure,
        'v_rank_order text[] := array[''2'',''3'',''4'',''5'',''6'',''7'',''8'',''9'',''10'',''J'',''Q'',''K'',''A''];',
        'v_state := v_room.public_state;'
      ),
      (
        'public.resolve_room_trick(uuid)'::regprocedure,
        'v_rank_order text[] := array[''2'',''3'',''4'',''5'',''6'',''7'',''8'',''9'',''10'',''J'',''Q'',''K'',''A''];',
        'v_state:=v_room.public_state;'
      ),
      (
        'public.play_room_ai_turn(uuid)'::regprocedure,
        'v_rank_order text[]:=array[''2'',''3'',''4'',''5'',''6'',''7'',''8'',''9'',''10'',''J'',''Q'',''K'',''A''];',
        'v_state:=v_room.public_state;'
      )
    ) as f(fn, declaration, state_line)
  loop
    v_fn := r.fn;
    v_decl := r.declaration;
    v_state_line := r.state_line;
    v_def := pg_get_functiondef(v_fn);

    if position(v_decl in v_def) = 0 then
      raise exception 'rank_order_declaration_not_found_in %', v_fn;
    end if;
    if position(v_state_line in v_def) = 0 then
      raise exception 'state_assignment_not_found_in %', v_fn;
    end if;

    v_def := replace(v_def, v_decl, 'v_rank_order text[];');
    v_def := replace(
      v_def,
      v_state_line,
      v_state_line || E'\n  v_rank_order := public.room_contract_rank_order(v_state->>''contract'');'
    );

    if position('v_rank_order := public.room_contract_rank_order' in v_def) = 0 then
      raise exception 'contract_rank_assignment_failed_in %', v_fn;
    end if;

    execute v_def;
    v_count := v_count + 1;
  end loop;

  if v_count <> 3 then
    raise exception 'expected_3_functions_updated_but_updated_%', v_count;
  end if;
end;
$$;

-- Guard the exact ordering expected by the online engine.
do $$
declare
  v_naras text[] := public.room_contract_rank_order('naras');
  v_tak_naras text[] := public.room_contract_rank_order('tak_naras');
  v_normal text[] := public.room_contract_rank_order('hokm_spades');
begin
  if array_position(v_naras,'2') <= array_position(v_naras,'A') then
    raise exception 'naras_rank_order_test_failed';
  end if;
  if array_position(v_tak_naras,'A') <= array_position(v_tak_naras,'2') then
    raise exception 'tak_naras_rank_order_test_failed';
  end if;
  if array_position(v_normal,'A') <= array_position(v_normal,'2') then
    raise exception 'normal_rank_order_changed';
  end if;
end;
$$;

notify pgrst, 'reload schema';
