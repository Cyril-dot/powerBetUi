# powerBetUi update and push instructions

This source archive updates the embedded `/admin` panel. It extracts into `powerBetUi-main`.

## Extract from Downloads on Windows PowerShell

```powershell
$Zip = Join-Path $env:USERPROFILE "Downloads\powerBetUi-fixed.zip"
$Project = Join-Path $env:USERPROFILE "Downloads\powerBetUi-main"
$Backup = "$Project-backup-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
$Stage = Join-Path $env:TEMP "powerBetUi-fixed"

if (-not (Test-Path $Zip)) { throw "ZIP not found: $Zip" }
if (-not (Test-Path $Project)) { throw "Project folder not found: $Project" }
robocopy $Project $Backup /E /XD "$Project\node_modules" "$Project\dist" "$Project\.git" /R:1 /W:1 /NFL /NDL /NJH /NJS
if ($LASTEXITCODE -gt 7) { throw "Backup failed with robocopy exit code $LASTEXITCODE" }
Remove-Item $Stage -Recurse -Force -ErrorAction SilentlyContinue
Expand-Archive -Path $Zip -DestinationPath $Stage -Force
Copy-Item (Join-Path $Stage "powerBetUi-main\*") $Project -Recurse -Force
Set-Location $Project
pnpm install --frozen-lockfile
pnpm check
pnpm build
```

## Extract on Linux or macOS

```bash
ZIP="$HOME/Downloads/powerBetUi-fixed.zip"
PROJECT="$HOME/Downloads/powerBetUi-main"
BACKUP="${PROJECT}-backup-$(date +%Y%m%d-%H%M%S)"
STAGE="$(mktemp -d)"

[ -f "$ZIP" ] || { echo "ZIP not found: $ZIP"; exit 1; }
[ -d "$PROJECT" ] || { echo "Project folder not found: $PROJECT"; exit 1; }
rsync -a --exclude node_modules --exclude dist --exclude .git "$PROJECT/" "$BACKUP/"
unzip -q "$ZIP" -d "$STAGE"
rsync -a --delete --exclude node_modules --exclude dist --exclude .git "$STAGE/powerBetUi-main/" "$PROJECT/"
rm -rf "$STAGE"
cd "$PROJECT"
pnpm install --frozen-lockfile
pnpm check
pnpm build
```

## Push only the updated files

From the existing clone of <https://github.com/Cyril-dot/powerBetUi.git>:

```bash
cd /path/to/your/powerBetUi
git fetch origin
git switch -c fix/admin-scheduler-commission-overview

git diff -- client/src/pages/AdminPanelPage.tsx client/src/lib/api.ts ADMIN-INTEGRATION-HANDOFF.md UPDATE_AND_PUSH.md
git add client/src/pages/AdminPanelPage.tsx \
        client/src/lib/api.ts \
        ADMIN-INTEGRATION-HANDOFF.md \
        UPDATE_AND_PUSH.md
git diff --cached --check
git commit -m "Fix admin scheduler and commission overview"
git push -u origin fix/admin-scheduler-commission-overview
```

Use `git add` with the explicit file list above rather than `git add .`. If a direct default-branch push is required, use `git push origin HEAD` after committing instead.

The GitHub connector was disabled in this session, so no remote push was performed automatically.

## Included fixes

- Corrected automated match create, timeline lookup, and cancellation routes to `/api/admin/matches/auto`.
- Added protected-session token fallback lookup.
- Removed manual match creation; the admin panel now exposes automated scheduled fixtures only.
- Replaced the operations overview with referred users, total referred deposits, total commission earned, commission rate, available payout, paid out amount, referral link, and latest payout.
- Replaced free-text league entry with a top-10 league dropdown.
- Updated the admin handoff documentation.

## Validation

The updated source passed:

```text
pnpm check
pnpm build
```

The build may print Vite’s non-fatal large-chunk warning. Generated `node_modules` and `dist` directories are intentionally excluded from the source ZIP.

## Backend note

A direct unauthenticated request to the corrected backend route returns HTTP 403, confirming the route is protected. Verify a successful create request in the browser with an authenticated admin account.

Do not commit `.env` files, access tokens, `node_modules`, or `dist`.

## Rollback

Use the timestamped backup created during extraction, or run `git revert <commit>` after pushing.

## Scope

The uploaded project did not include backend source, so this deliverable updates the supplied frontend/admin integration only. The scheduler payload remains `finalScoreHome` and `finalScoreAway`, matching the documented backend contract.

## Verification checklist

- [ ] Extract the ZIP and keep the generated backup.
- [ ] Run `pnpm install --frozen-lockfile`.
- [ ] Run `pnpm check` and `pnpm build`.
- [ ] Review `git diff --cached`.
- [ ] Open `/admin` with an authenticated admin account.
- [ ] Create one scheduled match and inspect its automation timeline.
- [ ] Confirm the commission overview cards and referral link.
- [ ] Push only the listed files.

## End

No production deployment or remote repository mutation was performed in this session.
