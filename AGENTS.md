# RONNY — repository editing safeguards
All development must take place on the `dev` branch. Never commit, push, or merge changes into `main` unless explicitly authorized by the user. Verify the active branch before making changes.
These instructions apply to all edits in this repository, including Codex-driven edits.

## Mandatory backup before modifying an existing file
1. **Before changing or replacing any existing tracked file**, preserve the exact previous contents in `backups/`. This includes the production entrypoint, currently `index.html` (lowercase; respect case).
2. Use a unique, immutable archive path, such as `backups/2026-10-28_1243/index.html` or `backups/<UTC timestamp>/<original relative path>`. Include a timestamp and, when practical, the prior commit SHA. Never overwrite or delete an existing backup.
3. Make the backup from the actual current repository version **before** editing; do not regenerate it from memory or from the revised version. Verify the archived contents match the original byte-for-byte when practical.
4. Save the backup to GitHub in the same change set or in an earlier commit, then replace the working file at its existing path. Never rename the production entrypoint unintentionally.
5. If the backup fails, **do not replace the production file**. Stop and report the problem.
6. Include in each change summary: which files changed, the backup paths, and how to restore them.
7. Keep all archives unless the repository owner explicitly authorizes pruning. Git's commit history is an additional recovery mechanism, not a replacement for the requested `backups/` copies.
8. with every time the file are edited by and agent, there should be a short explenation of the edit in the patch note file


## Restoring a version
Copy the desired archived file back to its original production path, review/test, and commit to the deployment branch (`main`). Netlify can then redeploy it.

## Safety
Never archive credentials, API tokens, keys, or other secrets into the repository. If an existing tracked file seems to contain secrets, stop and ask the owner how to proceed. Remember this is a public repository, and Netlify may publish files within the deploy directory.

## Mandatory context review before EVERY development task
1. Read the latest `AGENTS.md`, `PROJECT_CONTEXT.md`, and `index.html` directly from the current GitHub `dev` branch **at the start of each task**, even when they were read in a previous conversation or task. Review `PROJECT_CONTEXT.md` in full for product behavior, architectural decisions, compatibility and unresolved risks. Never rely only on memory, chat attachments or stale local copies.
2. Confirm the current `dev` HEAD and file SHAs. The actual HTML entrypoint is **`index.html` (lowercase)**. Do not read or change `main` when working on `dev`.
3. Before changing any existing file, create and verify an immutable GitHub backup under `backups/` from that exact `dev` revision. Stop if access, freshness verification, or backup fails.
4. Preserve existing features, and test JavaScript syntax, patch-note loading, and relevant regressions when possible. Report which checks were actually run and which require a deployed browser.
5. Update `PROJECT_CONTEXT.md` for material product/architecture decisions; do not replace the context with patch notes.

## Mandatory sequential patch notes — source of the Versions UI
1. `PATCH NOTES/` is the source of truth for the **גרסאות** section in the About menu; never maintain release descriptions hard-coded in `index.html`.
2. **For every agent edit batch / development task that changes repository files**, create exactly one NEW immutable numbered release note file `PATCH NOTES/<N>.json`, where N is one greater than the highest existing numbered patch-note file. Do not overwrite previous notes or reuse their numbers. The last baseline version was 38, so the first new file is `39.json`.
3. Each JSON note must include `version` (numeric string), `date` (YYYY-MM-DD), `notes` (short Hebrew user-facing change descriptions), and optionally `technical` (internal details). List real edits only; do not claim untested features work.
4. Update `PATCH NOTES/index.json` to list all available numbered files, newest first, whenever adding a patch. The application reads this manifest, fetches the corresponding JSON files, and renders the Versions panel from them; a static host cannot list GitHub directories automatically.
5. Add the release file, manifest update and code/documentation edits in the same commit, after making backups. For rollback, restore backed-up files and create a NEW release note describing the rollback; never rewrite historical notes.
6. Ensure `PATCH NOTES/` is included in the Netlify publish directory (same directory as `index.html`), accessible at runtime. If the manifest cannot be fetched, show a clear loading error rather than a misleading hard-coded history.
7. Report patch number, updated files, test scope, Git commit, and backup location. Do not merge or publish `main` without explicit authorization.
