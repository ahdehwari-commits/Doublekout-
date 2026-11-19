create or replace function public.award_kuwaiti_online_result()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_winner_team text;
  v_game_id text;
  v_user_id uuid;
  v_parity integer;
begin
  if new.game_mode<>'kuwaiti' or new.player_count<>6 then return new; end if;
  if coalesce(new.public_state->>'engine','')<>'kuwaiti-six-player-v1' then return new; end if;
  if coalesce(new.public_state->>'phase','')<>'finished' then return new; end if;
  if coalesce(old.public_state->>'phase','')='finished' then return new; end if;

  v_winner_team:=new.public_state->'result'->>'winnerTeam';
  if v_winner_team is null or v_winner_team not in ('A','B') then return new; end if;
  v_parity:=case when v_winner_team='A' then 0 else 1 end;
  v_game_id:=coalesce(nullif(new.public_state->>'gameId',''),gen_random_uuid()::text);
  new.public_state:=jsonb_set(new.public_state,'{gameId}',to_jsonb(v_game_id),true);

  for v_user_id in
    select user_id from public.room_members
    where room_id=new.id and mod(seat,2)=v_parity
    order by seat
  loop
    perform public.award_player_win_internal(v_user_id,v_game_id,'kuwaiti','online');
  end loop;
  return new;
end;
$$;
