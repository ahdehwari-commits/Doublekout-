# Secure first-admin bootstrap
1. Create and verify your permanent player account in the game.
2. In Supabase Dashboard → Authentication → Users, locate that account and copy its UUID.
3. Open SQL Editor for the correct Supabase project and run the statement below, replacing the UUID with the copied UUID:
```sql
insert into public.admin_roles(user_id,role,active)
values ('YOUR_AUTH_USER_UUID'::uuid,'super_admin',true)
on conflict(user_id) do update set role='super_admin',active=true;
```
4. Sign out and back into the game, then open the account/progress area. The Central Admin panel appears only for authorized admin accounts.
5. Keep only one super_admin initially. Use the panel to add finance/support roles later. Never share the service-role key or gateway merchant secret in chat or browser code.

Required Supabase Edge Function secrets:
- ZARINPAL_MERCHANT_ID = merchant ID from the ZarinPal merchant panel (keep private).
- ZARINPAL_SANDBOX = true while sandbox testing; false for live.
- APP_RETURN_URL = https://ahdehwari-commits.github.io/Doublekout-/
Supabase provides SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY to Edge Functions. Deploy function `zarinpal` after setting secrets. The callback verifies amount against the stored order before crediting points.
