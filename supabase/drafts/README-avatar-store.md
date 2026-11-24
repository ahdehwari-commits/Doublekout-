# Avatar store preparation (not production-enabled)

This branch contains a **draft** database design at `supabase/drafts/avatar-store.sql`.
It is deliberately outside `supabase/migrations`: it has not been generated through the Supabase CLI, applied to any database, or tested against a disposable database.

## Catalog extracted from the supplied WebP archive

- 60 images total
- 27 `fantasy_free` avatars: 0 points
- 15 `gulf_paid` avatars: 100 points each
- 18 `regional_paid` avatars: 100 points each
- expected static path: `assets/avatars/<image_file>`
- source archive: `DoubleKout_Avatars_60_WebP.zip`

The SQL draft creates separate `store_avatars` and `player_avatar_ownership` tables, adds `player_profiles.equipped_avatar_id`, and defines authenticated RPCs for catalog, purchase and equip. Paid purchases lock the player's profile row before checking/debiting points, so simultaneous duplicate purchases cannot spend the same balance twice. Free avatars can be equipped without a paid ownership record. Direct table access is revoked; clients use the RPCs.

## Still blocked

The 60 WebP binaries are now committed under `assets/avatars/` on branch `feature/shadows-cell-theme`. The import workflow validated the archive and extracted exactly 60 images: 27 `fantasy_free`, 15 `gulf_paid`, and 18 `regional_paid`. The temporary ZIP was removed after extraction.

The web and Android UI now include an avatar gallery in the store, category filters, image previews, permanent-account gating for paid purchases, and calls to `get_avatar_store_catalog`, `purchase_avatar`, and `equip_avatar`. The currently equipped image is also shown on the local player's online seat. Existing card-back store behavior remains separate.

**Backend activation is still pending:** `avatar-store.sql` remains a draft outside `supabase/migrations`; it has not been applied to any database. Until the draft is reviewed and applied through an explicitly approved migration, the gallery will report that the avatar service is not active and purchase/equip operations will not complete. No production database or player balance has been changed. Runtime UI and database tests have not been run.
