# Avatar asset import status

The initial avatar import is complete. All 60 validated WebP files are committed under `assets/avatars/` on `feature/shadows-cell-theme`; the temporary ZIP was removed.

To repeat the import in the future, upload a new `DoubleKout_Avatars_for_GitHub.zip` into this folder on the same branch and commit it. The workflow `.github/workflows/import-avatar-assets.yml` validates file signatures, filenames, duplicates, and the exact file count before extracting into `assets/avatars/`.

If repository Actions are disabled or the workflow token is read-only, the import job will not be able to push; the workflow run will show the specific failure. No production database operation is part of this import.
