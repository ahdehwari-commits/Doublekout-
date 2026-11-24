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

The 60 WebP binaries are **not yet committed**. A one-time import path is now prepared: upload `DoubleKout_Avatars_for_GitHub.zip` into `assets/import/` on branch `feature/shadows-cell-theme`. The workflow `.github/workflows/import-avatar-assets.yml` will validate and extract all 60 files into `assets/avatars/`, then commit them back to the branch. See `assets/import/README.md`. The archive itself is not yet in the repository; it must be uploaded once through GitHub's file-upload UI because the connected GitHub write API available here accepts text blobs, not a local binary file stream.

The current `central-store.js` is still the existing card-back store. The avatar gallery is not wired into the UI yet, to avoid shipping a gallery of broken image URLs. The draft SQL has not been executed. No production database or player balance has been changed.
