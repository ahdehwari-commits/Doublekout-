-- Cosmetic store smoke test; run after the central store migration.
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',false);
update public.player_profiles set points=100 where user_id='10000000-0000-4000-8000-000000000001';
do $$
declare first_buy jsonb; duplicate_buy jsonb; equipped jsonb; catalog jsonb; balance bigint;
begin
 catalog:=public.get_store_catalog();
 if jsonb_array_length(catalog->'items')<5 then raise exception 'store catalog is incomplete'; end if;
 first_buy:=public.purchase_card_back('black-gold');
 if first_buy->>'purchased'<>'true' then raise exception 'first purchase failed: %',first_buy; end if;
 if (first_buy->>'points')::integer<>75 then raise exception 'wrong balance after purchase: %',first_buy; end if;
 duplicate_buy:=public.purchase_card_back('black-gold');
 if duplicate_buy->>'already_owned'<>'true' then raise exception 'duplicate purchase was not detected: %',duplicate_buy; end if;
 if (duplicate_buy->>'points')::integer<>75 then raise exception 'duplicate purchase charged points'; end if;
 equipped:=public.equip_card_back('black-gold');
 if equipped->>'equipped'<>'black-gold' then raise exception 'equipping card back failed'; end if;
 if (select equipped_card_back from public.player_profiles where user_id=auth.uid())<>'black-gold' then
  raise exception 'equipped card back was not persisted';
 end if;
end $$;
