-- Anonymous strategy-learning dataset. No player names, auth IDs, device IDs,
-- IP addresses, room IDs or stable player/session identifiers are stored.
create table if not exists public.anonymous_learning_events (
 id bigint generated always as identity primary key,
 created_at timestamptz not null default now(),
 game_mode text not null check(game_mode in ('double-kout','standard-hokm','kuwaiti')),
 player_count smallint not null check(player_count in (4,6)),
 contract text not null,
 pattern_key text not null check(char_length(pattern_key) between 1 and 160),
 decision_state jsonb not null, chosen_action jsonb not null, outcome jsonb not null,
 check(octet_length(decision_state::text)<=6000),
 check(octet_length(chosen_action::text)<=300),
 check(octet_length(outcome::text)<=1200)
);
alter table public.anonymous_learning_events enable row level security;
revoke all on public.anonymous_learning_events from anon,authenticated;
create index if not exists anonymous_learning_pattern_idx on public.anonymous_learning_events(pattern_key,created_at desc);
create or replace function public.record_anonymous_learning_batch(p_events jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare e jsonb; n integer:=0;
begin
 if jsonb_typeof(p_events)<>'array' or jsonb_array_length(p_events)<1 or jsonb_array_length(p_events)>6 then raise exception 'invalid_learning_batch'; end if;
 for e in select value from jsonb_array_elements(p_events) loop
  if e ?| array['name','display_name','user_id','player_id','device_id','email','phone','room_id','session_id'] then raise exception 'identity_fields_not_allowed'; end if;
  if e->>'mode' not in ('double-kout','standard-hokm','kuwaiti') then raise exception 'invalid_mode'; end if;
  if (e->>'players')::integer not in (4,6) then raise exception 'invalid_player_count'; end if;
  if length(coalesce(e->>'pattern','')) not between 1 and 160 then raise exception 'invalid_pattern'; end if;
  if not(e ? 'state' and e ? 'action' and e ? 'outcome') then raise exception 'invalid_event'; end if;
  if (e->'state') ?| array['name','display_name','user_id','player_id','device_id','email','phone','room_id','session_id'] then raise exception 'identity_fields_not_allowed'; end if;
  if octet_length((e->'state')::text)>6000 then raise exception 'state_too_large'; end if;
  insert into public.anonymous_learning_events(game_mode,player_count,contract,pattern_key,decision_state,chosen_action,outcome)
  values(e->>'mode',(e->>'players')::smallint,coalesce(e->>'contract','unknown'),e->>'pattern',e->'state',e->'action',e->'outcome');
  n:=n+1;
 end loop;
 return jsonb_build_object('stored',n);
end; $$;
revoke all on function public.record_anonymous_learning_batch(jsonb) from public;
grant execute on function public.record_anonymous_learning_batch(jsonb) to anon,authenticated;
create or replace function public.get_anonymous_learning_summary(p_limit integer default 80)
returns jsonb language sql stable security definer set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) from (
  select pattern_key,chosen_action->>'rank' action_rank,chosen_action->>'suit' action_suit,
   count(*)::integer samples,
   round(avg(case when (outcome->>'trickWon')::boolean then 1.0 else 0.0 end)::numeric,3) win_rate
  from public.anonymous_learning_events group by pattern_key,chosen_action->>'rank',chosen_action->>'suit'
  having count(*)>=5 order by count(*) desc limit greatest(1,least(coalesce(p_limit,80),200))
 ) x;
$$;
revoke all on function public.get_anonymous_learning_summary(integer) from public;
grant execute on function public.get_anonymous_learning_summary(integer) to anon,authenticated;
