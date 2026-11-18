-- Verify dealer and hakem rotation in all four outcome branches.
do $$
declare
  v_host uuid:='00000000-0000-0000-0000-000000000011';
  v_room jsonb;
  v_room_id uuid;
  v_result jsonb;
  s record;
begin
  insert into auth.users(id,email_confirmed_at,raw_app_meta_data,is_anonymous)
  values(v_host,now(),'{}'::jsonb,false)
  on conflict(id) do update set email_confirmed_at=excluded.email_confirmed_at,
    raw_app_meta_data=excluded.raw_app_meta_data,is_anonymous=false;
  perform set_config('request.jwt.claim.sub',v_host::text,false);

  for s in
    select * from (values
      ('ordinary_hakem_team_win',13,5,null::text,null::text,3,0),
      ('kout',13,0,null::text,null::text,1,2),
      ('challenge_success',0,0,'A'::text,'success'::text,1,2),
      ('challenge_failure',0,0,'A'::text,'failed-opponent-sequence'::text,0,1)
    ) as cases(case_name,score_a,score_b,challenge_team,challenge_status,expected_dealer,expected_picker)
  loop
    v_room:=public.create_game_room('double-kout',4::smallint,'Dealer Test');
    v_room_id:=(v_room->>'room_id')::uuid;

    update public.game_rooms
       set status='playing',
           public_state=jsonb_build_object(
             'phase','finished','trumpPickerSeat',0,'hakemSeat',0,'dealerSeat',3,
             'scoreA',s.score_a,'scoreB',s.score_b,
             'challengeTeam',s.challenge_team,
             'challengeResult',case when s.challenge_status is null then null
               else jsonb_build_object('status',s.challenge_status) end,
             'trickWinners','[]'::jsonb
           ),
           revision=revision+1,updated_at=now()
     where id=v_room_id;

    update public.game_rooms set status='finished',revision=revision+1,updated_at=now()
     where id=v_room_id;

    v_result:=public.start_next_room_game(v_room_id);

    if (v_result->>'dealer_seat')::integer<>s.expected_dealer then
      raise exception '%: expected dealer %, got %',
        s.case_name,s.expected_dealer,v_result->>'dealer_seat';
    end if;
    if (v_result->>'trump_picker_seat')::integer<>s.expected_picker then
      raise exception '%: expected hakem %, got %',
        s.case_name,s.expected_picker,v_result->>'trump_picker_seat';
    end if;
    if v_result->'state'->>'phase'<>'trump_selection' then
      raise exception '%: rematch must return to trump selection',s.case_name;
    end if;
  end loop;

  raise notice 'PASS: ordinary hakem-team win keeps dealer; kout and both challenge outcomes rotate dealer and select hakem from winning team';
end;
$$;
