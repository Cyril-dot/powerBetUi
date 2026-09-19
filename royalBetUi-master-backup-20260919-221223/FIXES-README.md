# PowerBet UUID game-fetch fix

## What was verified

The backend was tested one endpoint at a time. The following endpoints return records whose nested `match.id` is the backend UUID used by detail, odds, and bet-placement APIs:

```text
/api/public/football/matches/live
/api/public/football/matches/upcoming
/api/public/football/matches/today
```

Their `externalId` values are ESPN/provider references and must not replace `match.id`.

The livescore endpoints return numeric ESPN event IDs in their raw payloads. They are therefore no longer merged into the canonical sportsbook row list.

## Updated files

| File | Change |
|---|---|
| `client/src/lib/sportsbook.ts` | `fetchFootball()` now uses UUID-bearing football match feeds as canonical sources, removes raw livescore feeds from the sportsbook list aggregation, filters the final list to backend UUIDs, and correctly unwraps the API client's already-unwrapped `{ match, odds }` items. |
| `client/src/lib/sportsbook.ts` | Match details now try the direct UUID endpoint first, fetch basic odds/H2H concurrently, and load extra markets through direct per-match routes without scanning the slow `with-all-odds` bulk feed on every click. |
| `tsconfig.json` | Adds `target: ES2020`, allowing the existing `Set` iteration in `refreshReset.ts` to compile cleanly. |
| `scripts/test-game-fetch.sh` | Keeps the backend probe available for diagnostics and future endpoint checks. |

## Validation completed

```text
pnpm check   PASS
pnpm build   PASS
```

The build reports only the existing Vite large-chunk warning.

## PowerShell installation

Copy the ZIP into Downloads, then run this in PowerShell. It creates a backup before replacing the project files.

```powershell
$Zip = Join-Path $env:USERPROFILE "Downloads\powerBetUi-fixed.zip"
$Project = Join-Path $env:USERPROFILE "Downloads\powerbet-ui\royalBetUi-master"
$Backup = "$Project-backup-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
$Stage = Join-Path $env:TEMP "powerbet-ui-fixed"

if (-not (Test-Path $Zip)) { throw "ZIP not found: $Zip" }
if (-not (Test-Path $Project)) { throw "Project folder not found: $Project" }

& robocopy $Project $Backup /E /XD "$Project\node_modules" "$Project\dist" "$Project\.git" /R:1 /W:1 /NFL /NDL /NJH /NJS
if ($LASTEXITCODE -gt 7) { throw "Backup failed with robocopy exit code $LASTEXITCODE" }
Remove-Item $Stage -Recurse -Force -ErrorAction SilentlyContinue
Expand-Archive -Path $Zip -DestinationPath $Stage -Force
Copy-Item (Join-Path $Stage "powerBetUi-main\*") $Project -Recurse -Force

Set-Location $Project
pnpm install --frozen-lockfile
pnpm check
pnpm build

Write-Host "Fixed project installed: $Project" -ForegroundColor Green
Write-Host "Backup created: $Backup" -ForegroundColor Cyan
```

If the local project folder has a different name, change only the `$Project` line.
