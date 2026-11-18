-- Cover foreign keys used in room, inventory, payments and audit joins.
create index if not exists game_rooms_host_user_id_idx on public.game_rooms(host_user_id);
create index if not exists player_card_back_ownership_card_back_id_idx on public.player_card_back_ownership(card_back_id);
create index if not exists point_ledger_actor_id_idx on public.point_ledger(actor_id);
create index if not exists point_payment_orders_package_id_idx on public.point_payment_orders(package_id);
create index if not exists point_payment_orders_reviewed_by_idx on public.point_payment_orders(reviewed_by);
create index if not exists private_hands_user_id_idx on public.private_hands(user_id);
create index if not exists room_game_action_log_actor_user_id_idx on public.room_game_action_log(actor_user_id);
create index if not exists room_game_action_log_room_id_idx on public.room_game_action_log(room_id);
create index if not exists room_game_hands_owner_user_id_idx on public.room_game_hands(owner_user_id);

-- Evaluate auth.uid() once per statement rather than once per candidate row.
alter policy "players can read only their own hand" on public.private_hands
 using ((user_id=(select auth.uid())) and is_room_member(room_id));
alter policy "players can read their own game hand" on public.room_game_hands
 using (owner_user_id=(select auth.uid()));
alter policy "players read own profile" on public.player_profiles
 using (user_id=(select auth.uid()));
notify pgrst,'reload schema';
