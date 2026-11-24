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

The web and Android UI now include a 60-image avatar gallery in the store, category filters, image previews, and calls to `get_avatar_store_catalog`, `purchase_avatar`, and `equip_avatar`. If the database RPCs are not yet active, all 60 images still display from the static catalog and free avatars can be selected locally on that device; paid purchases and account-level equipment remain disabled until backend activation. With the RPCs active, paid purchases require a permanent account. The selected image is shown on the local player's online seat. Existing card-back store behavior remains separate.

**Backend activation is complete:** migration `supabase/migrations/20261124052627_add_avatar_store.sql` was applied to the Doublekout Supabase project. It creates the 60-item catalog, ownership table, `equipped_avatar_id`, and guarded catalog/purchase/equip RPCs. Existing player balances and ownership rows were not changed. The new tables have RLS enabled and direct client table privileges revoked; access is intended to go only through the guarded RPCs. Runtime UI tests and a paid-purchase test have not been run.
