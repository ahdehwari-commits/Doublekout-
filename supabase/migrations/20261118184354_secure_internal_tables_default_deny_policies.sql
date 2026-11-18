-- Secure-by-default API posture for internal tables accessed only through vetted
-- SECURITY DEFINER RPCs or service_role.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'admin_roles',
    'anonymous_learning_events',
    'player_card_back_ownership',
    'player_game_wins',
    'point_ledger',
    'point_payment_orders',
    'room_game_action_log',
    'room_game_pending_decks'
  ] LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'deny_direct_api_access', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)',
      'deny_direct_api_access', t
    );
  END LOOP;
END $$;
