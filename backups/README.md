# RONNY version backups

This folder stores immutable copies of files **before** each replacement.

Format: `backups/YYYY-MM-DD_HHMMSS/<original-path>` (UTC time). Do not overwrite old backup files. The repository's `AGENTS.md` documents the required editing and restore workflow.

Note: This is a public repository. Archive only public-safe files, and do not put secrets here. If Netlify publishes the repository root, these backup files may also be publicly accessible by URL.
