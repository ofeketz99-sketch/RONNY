# RONNY — repository editing safeguards

These instructions apply to all edits in this repository, including Codex-driven edits.

## Mandatory backup before modifying an existing file
1. **Before changing or replacing any existing tracked file**, preserve the exact previous contents in `backups/`. This includes the production entrypoint, currently `Index.html` (respect case).
2. Use a unique, immutable archive path, such as `backups/2026-10-28_1243/Index.html` or `backups/<UTC timestamp>/<original relative path>`. Include a timestamp and, when practical, the prior commit SHA. Never overwrite or delete an existing backup.
3. Make the backup from the actual current repository version **before** editing; do not regenerate it from memory or from the revised version. Verify the archived contents match the original byte-for-byte when practical.
4. Save the backup to GitHub in the same change set or in an earlier commit, then replace the working file at its existing path. Never rename the production entrypoint unintentionally.
5. If the backup fails, **do not replace the production file**. Stop and report the problem.
6. Include in each change summary: which files changed, the backup paths, and how to restore them.
7. Keep all archives unless the repository owner explicitly authorizes pruning. Git's commit history is an additional recovery mechanism, not a replacement for the requested `backups/` copies.

## Restoring a version
Copy the desired archived file back to its original production path, review/test, and commit to the deployment branch (`main`). Netlify can then redeploy it.

## Safety
Never archive credentials, API tokens, keys, or other secrets into the repository. If an existing tracked file seems to contain secrets, stop and ask the owner how to proceed. Remember this is a public repository, and Netlify may publish files within the deploy directory.
