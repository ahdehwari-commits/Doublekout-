# One-time avatar asset import

To add the 60 avatar images to this branch:

1. Download the prepared archive linked in the ChatGPT conversation: `DoubleKout_Avatars_for_GitHub.zip`.
2. In GitHub, open this folder on branch `feature/shadows-cell-theme`.
3. Choose **Add file → Upload files** and upload that ZIP into `assets/import/`.
4. Commit the ZIP to `feature/shadows-cell-theme`.

The workflow `.github/workflows/import-avatar-assets.yml` will automatically verify all 60 WebP files, extract them into `assets/avatars/`, remove the temporary ZIP, and commit the images back to this same branch. It checks file signatures, filenames, duplicates, and the exact file count.

If repository Actions are disabled or the workflow token is read-only, the import job will not be able to push; the workflow run will show the specific failure. No production database operation is part of this import.
