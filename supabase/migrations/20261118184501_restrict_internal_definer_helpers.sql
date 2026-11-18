-- Internal accounting/payment helpers must not be callable as public RPCs.
REVOKE ALL ON FUNCTION public.award_player_win_internal(uuid,text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_zarinpal_payment(uuid,text,text,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_zarinpal_payment(uuid,text,text,boolean) TO service_role;
