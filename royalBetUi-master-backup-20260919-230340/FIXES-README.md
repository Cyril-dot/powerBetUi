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
| `client/src/components/BetslipPage.tsx` | After a successful bet, clears all selections and immediately navigates to `/open-bets`; the success confirmation label is removed. Error notices remain visible. |
| `client/src/components/Sportsbook.tsx` | Renders progressive football batches as they arrive instead of waiting for every source. |
| `client/src/pages/AdminPanelPage.tsx` | Adds the protected admin centre with overview, matches, booking codes, affiliate, withdrawals, upgrade chats, payouts, users/admins, audit, and prediction views. It uses the existing typed admin and super-admin API clients. |
| `client/src/pages/AdminPanelPage.tsx` | The Matches section now has complete manual-match and automated-schedule forms with team, sport, league, kickoff, logos, featured flag, and score fields; validation; success/error states; status and score controls; schedule timeline inspection; and automation cancellation. |
| `client/src/lib/api.ts` | Adds typed `adminMatchSchedule` methods for `POST /admin/matches/auto`, schedule inspection, and automation cancellation, matching the reference admin backend contract. |
| `client/src/pages/AdminPanelPage.tsx` | Completes Affiliate Centre with labelled referral-link creation, optional expiry, link/code viewing and clipboard copy, referred-user table, lifetime metrics, daily/weekly/monthly commission views, country deposit reporting, and affiliate payout history. |
| `client/src/lib/api.ts` | Adds `adminAffiliateInsights` for daily/weekly/monthly commission and country-deposit reporting plus yearly deposit totals. |
| `client/src/components/AccountCenter.tsx` | Adds an Admin Centre link only when the session role is `ADMIN` or `SUPER_ADMIN`. |
| `client/src/App.tsx` | Registers the `/admin` route. The page independently checks the session role before rendering protected data. |
| `tsconfig.json` | Adds `target: ES2020`, allowing the existing `Set` iteration in `refreshReset.ts` to compile cleanly. |
| `scripts/test-game-fetch.sh` | Keeps the backend probe available for diagnostics and future endpoint checks. |

## Validation completed

```text
pnpm check   PASS
pnpm build   PASS
```

The build reports only the existing Vite large-chunk warning.

## Fetch and response-time strategy

Football requests now run in priority order: live first, upcoming/today next, and finished results plus the large odds index last. The sportsbook receives live and then broader batches through a progress callback, so the first useful content can render before the slower feeds finish.

Further safe improvements recommended for a later pass are route-level code splitting for the large JavaScript bundle, server-side caching for the public match feeds with a short TTL, conditional requests using ETags, request cancellation when the sport tab changes, and moving heavyweight logo assets behind lazy loading. The current UI already avoids refresh polling while the tab is hidden, lazy-loads team crest images, caps individual odds fallbacks, and caches cross-page search results.

## Admin panel

The admin panel is available at `/admin` and from Account → Admin Centre. Normal users receive an access-denied screen and the protected API calls are never made. `ADMIN` users receive operational sections; `SUPER_ADMIN` users additionally receive upgrade chats, payout requests, users/admins, and audit/prediction sections. The UI is wired to the existing `/api/admin/*` and `/api/super-admin/*` endpoint groups rather than using mock data.

### Match operations

The **Create manual match** form calls `POST /api/admin/matches` with the administrator-created source, fixture metadata, kickoff, status, scores, optional logos, and featured flag. The **Schedule automated match** form calls `POST /admin/matches/auto` with the reference scheduler payload: fixture metadata, ISO kickoff time, and final home/away scores. Existing managed matches can be refreshed, moved to `LIVE` or `FINISHED`, scored, inspected for their automation timeline, or cancelled without deleting the match.

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
