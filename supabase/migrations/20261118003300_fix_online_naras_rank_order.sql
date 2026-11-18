-- Migration 33: Fix online Naras and Tak Naras card strength.
-- Weakest-to-strongest order is used because greater array_position means stronger.

create or replace function public.room_contract_rank_order(p_contract text)
returns text[]
language sql
immutable
parallel safe
set search_path = public, pg_temp
as $$
  select case
    when p_contract = 'naras'
      then array['A','K','Q','J','10','9','8','7','6','5','4','3','2']::text[]
    when p_contract = 'tak_naras'
      then array['K','Q','J','10','9','8','7','6','5','4','3','2','A']::text[]
    else
      array['2','3','4','5','6','7','8','9','10','J','Q','K','A']::text[]
  end;
$$;

revoke all on function public.room_contract_rank_order(text) from public;
grant execute on function public.room_contract_rank_order(text) to authenticated;

do $$
declare
  v_def text;
  v_new text;
  v_fn regprocedure;
  r record;
begin
  for r in
    select *
    from (values
      ('public.apply_room_card(uuid,smallint,text,boolean)'::regprocedure),
      ('public.resolve_room_trick(uuid)'::regprocedure),
      ('public.play_room_ai_turn(uuid)'::regprocedure)
    ) as f(fn)
  loop
    v_fn := r.fn;
    v_def := pg_get_functiondef(v_fn);

    -- Replace the old fixed rank-order declaration.
    v_new := regexp_replace(
      v_def,
      'v_rank_order[[:space:]]+text[[:space:]]*\[\][[:space:]]*:=[[:space:]]*array\[[^;]*\];',
      'v_rank_order text[];',
      'gi'
    );

    if v_new = v_def then
      raise exception 'Could not update rank declaration in %', v_fn;
    end if;

    v_def := v_new;

    -- Set the rank order from the active game's contract.
    v_new := regexp_replace(
      v_def,
      '(v_state[[:space:]]*:=[[:space:]]*v_room\.public_state;)',
      E'\\1\n  v_rank_order := public.room_contract_rank_order(v_state->>''contract'');',
      'gi'
    );

    if v_new = v_def then
      raise exception 'Could not insert contract rank assignment in %', v_fn;
    end if;

    if position(
      'v_rank_order := public.room_contract_rank_order'
      in v_new
    ) = 0 then
      raise exception 'Rank assignment verification failed in %', v_fn;
    end if;

    execute v_new;
  end loop;
end;
$$;

-- Verify the required ordering.
do $$
declare
  n text[] := public.room_contract_rank_order('naras');
  t text[] := public.room_contract_rank_order('tak_naras');
  h text[] := public.room_contract_rank_order('hokm_spades');
begin
  if array_position(n,'2') <= array_position(n,'A') then
    raise exception 'Naras ordering test failed';
  end if;

  if array_position(t,'A') <= array_position(t,'2') then
    raise exception 'Tak Naras ordering test failed';
  end if;

  if array_position(h,'A') <= array_position(h,'2') then
    raise exception 'Hokm ordering test failed';
  end if;
end;
$$;

notify pgrst, 'reload schema';
