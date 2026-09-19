# Super Bet Admin Integration Handoff

**Project:** Super Bet sportsbook UI  
**Document purpose:** Describe the implemented Admin Centre, the dedicated Super Admin Centre, the match-fetch and match-ID correction, the operational safeguards, and the deployment procedure.

## Executive summary

The application now contains two separate protected operational surfaces. The regular Admin Centre is available to approved `ADMIN` users and provides sportsbook operations, booking-code tools, affiliate operations, withdrawal workflows, upgrade chats, payout workflows, user administration, and audit tools. The dedicated Super Bet Super Admin Centre is available only to the exact `SUPER_ADMIN` authority and provides platform-wide controls, finance queues, commission analytics, administrator management, user lifecycle operations, upgrade conversations, and audit history.

Both panels now include a clear **Back to user side** action. The regular Admin Centre places this action in its sidebar. The Super Admin Centre places it in the top bar. Both actions return to `/`, which is the user-facing sportsbook home.

The application also includes **How to use** guides in both operational surfaces. These guides explain what each icon opens, which actions are available in each tab, and the safe order for reviewing and changing financial or account records.

## Protected access model

The application uses the session object and the shared role helpers in `client/src/lib/session.tsx`. The regular Admin Centre checks `isAdminUser`, which permits approved administrator roles. The Super Admin Centre checks `isSuperAdminUser`, which requires the `SUPER_ADMIN` role.

The `/admin` route has an additional routing boundary. When the current session is a `SUPER_ADMIN`, the route renders the dedicated Super Admin Centre rather than the regular Admin Centre. This prevents a Super Admin session from accidentally loading regular-admin endpoints that may be rejected by a backend configured for a narrower role policy.

The account page exposes the normal **Admin Centre** link to administrator users and exposes **Super Bet Super Admin** to Super Admin users. Role extraction supports direct roles and common nested backend session shapes, including `user`, `data`, `profile`, `account`, `result`, `roles`, and `authorities`.

> The frontend role guard improves usability and protects the UI boundary. The backend must still enforce authorization on every endpoint. The UI is not a replacement for server-side authorization.

## Regular Admin Centre

The regular Admin Centre is implemented in `client/src/pages/AdminPanelPage.tsx`. Its tabs are filtered by the current role. Super-only tabs are not displayed to ordinary administrators.

| Tab or icon | Purpose | Main operations |
|---|---|---|
| Overview | Operational summary | View platform health, reporting range, affiliate summary, and protected API status. |
| Matches | Sportsbook operations | Create manual matches, schedule matches, upload team and league images, update scores, change status, inspect schedules, and cancel schedule automation. |
| Booking codes | Bet-slip code operations | Create and inspect booking codes used by customers. |
| Affiliate | Affiliate operations | Review referral links, referred users, commission insights, country deposits, payout history, and affiliate balances. |
| Withdrawals | Withdrawal operations | Review and process withdrawal requests exposed to the regular admin role. |
| Upgrade chats | Administrator upgrade support | Super Admin-only conversation workflow for upgrade requests. |
| Payouts | Administrator payout workflow | Super Admin-only payout approval and settlement actions. |
| Users and admins | Account operations | Super Admin-only user and administrator management. |
| Audit and predictions | Governance and prediction records | Super Admin-only audit events and prediction records. |
| How to use | Built-in guide | Explains every icon, tab, permission boundary, and safe workflow. |

### Match administration

The Matches tab supports both manual match creation and scheduled match creation. It validates team names, prevents identical home and away teams, validates scores as non-negative integers, requires a future kickoff for scheduled matches, and submits uploaded image files as data-URL payloads through the existing logo fields when the backend does not expose a separate media endpoint.

The match form accepts PNG, JPEG, WEBP, and SVG files up to 2 MB per image. It previews the selected image and allows the operator to remove it before submission. This means administrators select real files rather than typing logo URLs.

## Super Bet Super Admin Centre

The dedicated Super Admin Centre is implemented in `client/src/pages/SuperAdminPage.tsx`. It is branded as **Super Bet** and is available at `/super-admin`.

| Area | Purpose | Main operations |
|---|---|---|
| Dashboard | Platform overview | Display users, administrators, deposits, withdrawals, deposit counts, reporting totals, and direct finance-queue shortcuts. |
| Administrators | Administrator management | List administrators, create administrators, set commission rates, and add operational funds. |
| Users | Account lifecycle | Search users, inspect details, inspect deposits, add funds, activate, deactivate, and toggle status. |
| Transactions | Finance ledger | Review platform-wide transaction records. |
| Binance deposits | Crypto queue | View pending or all records, approve, and reject with a reason. |
| Bank deposits | Bank-transfer queue | View pending or all records, approve, and reject with a reason. |
| Simple deposits | Mobile-money queue | View pending or all records, approve, and reject with a reason. |
| User deposits | User history | Load deposits for a specific user ID. |
| Affiliate withdrawals | Affiliate finance | Process or reject affiliate withdrawal requests. |
| Payout requests | Affiliate payout workflow | Approve, reject, and mark payouts as paid. |
| Wallet withdrawals | Wallet finance | Approve, reject, settle, or mark withdrawals as failed. |
| Commission analytics | Reporting | View daily or weekly country commission and deposit reports. |
| Upgrade chats | Administrator support | Load conversations, read messages, send messages, and set commission rates. |
| Audit log | Governance | Review sensitive administrative actions. |
| How to use | Built-in guide | Explains every icon, tab, group, action, and safe operating sequence. |

The dashboard maps the backend response keys instead of assuming generic names. For example, `totalDepositsAllTime`, `totalDepositsThisMonth`, `totalDepositsToday`, `totalDepositCount`, `totalWithdrawalsAllTime`, and `totalWithdrawalCount` are displayed as formatted Super Bet summary values.

## Super Admin API integration

The typed client in `client/src/lib/api.ts` contains the Super Admin resource groups. The groups cover the following contracts:

| Resource group | Coverage |
|---|---|
| `api.superAdmin` | Metrics, deposit metrics, administrators, administrator commission and funds, users, user details, user deposits, user status, transactions, audit log, predictions, and commission reports. |
| `api.superAdminDeposits` | Binance, bank, and simple deposit listing, pending queues, approval, and rejection. |
| `api.superAdminWithdrawals` | Wallet withdrawal listing, approval, rejection, settlement, and failure marking. |
| Existing affiliate and payout groups | Affiliate withdrawal processing, payout approval, rejection, and payment completion. |
| Existing upgrade-chat group | Upgrade conversation listing, message retrieval, message sending, and commission updates. |

The administrator list includes a compatibility fallback. The application first tries `/api/super-admin/admins/with-commission`. If an older or partially deployed backend returns HTTP 500 for that optional projection, the client falls back to `/api/super-admin/admins`. The Administrators tab therefore remains usable while the dedicated commission-rate action continues to use its own endpoint.

## Match-fetch and match-ID correction

The original match problem had two related causes. First, raw livescore objects did not always contain the UUID required by the betting and detail endpoints. Second, the response envelope could contain a nested `{ match, odds }` object that the normalizer did not unwrap correctly.

The corrected flow is implemented in `client/src/lib/sportsbook.ts`.

1. The sportsbook uses UUID-backed football match feeds as the canonical betting sources.
2. Raw provider-only livescore IDs are not merged into betting rows when they cannot be resolved to the backend UUID.
3. The normalizer unwraps nested match-and-odds response shapes.
4. The returned match object keeps the UUID used by details, odds, links, and bet placement.
5. The details page receives the sport hint so it can use the correct sport-specific endpoint instead of guessing across endpoints.
6. The direct UUID detail lookup is preferred over a slow bulk scan.
7. Extra-market loading no longer performs a slow bulk request on every details-page visit.

This keeps one canonical ID throughout the user journey:

```text
canonical backend UUID
        ↓
sportsbook row
        ↓
match link
        ↓
details lookup
        ↓
odds and markets
        ↓
bet placement
```

A provider event ID may still be retained as metadata for diagnostics, but it must not replace the canonical backend UUID used by the betting APIs.

## Match loading performance

Football loading is staged so live fixtures are requested first. Upcoming and today fixtures are requested next. Finished and supplementary feeds are requested after the first useful data is available. The Sportsbook component accepts progressive batches and renders the live batch before broader data arrives.

Match details use the direct UUID lookup as the fast path. This removes the previous bulk-source delay visible in the browser as a long-running request to `with-all-odds`. The remaining polling and data-refresh behavior should be monitored in production because backend response time and connection resets can still affect perceived latency.

## Betslip behavior

After a successful bet placement, the betslip is cleared immediately and the user is redirected to `/open-bets`. The previous success label was removed from the betslip page so the user sees the open-bet record directly instead of waiting on a transient confirmation state.

## Deposit and 403 behavior

The Super Admin dashboard includes explicit deposit queue buttons because summary cards should not be the only way to reach operational queues. The shortcuts open Binance, bank, simple, and user-deposit history pages directly.

A previous `403` was observed for `/api/admin/affiliate/stats` while a Super Admin session was active. The `/admin` route now sends Super Admin sessions to the dedicated Super Admin Centre. This prevents the regular Admin Panel from loading admin-only affiliate requests under a role that the backend may reject. Backend authorization remains authoritative and should be checked if any individual queue still returns 403.

## Operational safeguards

Financial actions display backend errors inside the relevant panel. Rejection actions request a reason. After a successful mutation, the relevant queue is reloaded so the operator can verify the new status. Audit log access is included for review of sensitive administrative activity.

The application does not treat a successful frontend click as proof that a backend action completed. Operators should confirm the refreshed record status after every approval, rejection, settlement, or funds adjustment.

## Deployment procedure

The current distributable ZIP is `powerBetUi-superadmin-integrated.zip`. It excludes `node_modules`, `dist`, the local Git metadata, and diagnostic fetch reports. On Windows, extract it into a staging directory, copy the source with `robocopy` while excluding generated folders, run `pnpm install --frozen-lockfile`, run `pnpm check`, run `pnpm build`, and then commit and push the updated source.

The GitHub repository configured for this project is:

```text
https://github.com/Cyril-dot/powerBetUi.git
```

After deployment, use a hard browser refresh so the new hashed JavaScript bundle is loaded:

```text
Ctrl + Shift + R
```

Then verify the following routes with appropriate accounts:

```text
/
/account
/admin
/super-admin
```

A regular administrator should not see the Super Bet Super Admin link. A `SUPER_ADMIN` user should open the dedicated Super Admin Centre and should not load the regular admin affiliate flow.

## Validation completed

The implementation has been validated with:

```text
pnpm check
pnpm build
```

Both commands pass. The production build still reports a bundle-size warning above 500 kB. That warning does not prevent the build from completing. Future performance work can split the admin panel with dynamic imports and can use route-level chunks for the Super Admin Centre.

## Source map

| File | Responsibility |
|---|---|
| `client/src/pages/AdminPanelPage.tsx` | Regular Admin Centre, match administration, affiliate tools, guides, and user-side return button. |
| `client/src/pages/SuperAdminPage.tsx` | Super Bet Super Admin Centre, finance queues, analytics, guides, and user-side return button. |
| `client/src/lib/api.ts` | Typed backend API client, Super Admin resources, deposit actions, withdrawal actions, and compatibility fallback. |
| `client/src/lib/session.tsx` | Session extraction and role predicates for `ADMIN` and `SUPER_ADMIN`. |
| `client/src/lib/sportsbook.ts` | Canonical match fetching, UUID normalization, progressive loading, details lookup, and odds flow. |
| `client/src/components/AccountCenter.tsx` | Account-page links and session diagnostics. |
| `client/src/App.tsx` | Application routes and Super Admin routing boundary. |
| `FIXES-README.md` | Concise implementation history and handoff notes. |

## References

[1]: ./client/src/pages/AdminPanelPage.tsx "Super Bet Admin Centre source"
[2]: ./client/src/pages/SuperAdminPage.tsx "Super Bet Super Admin Centre source"
[3]: ./client/src/lib/api.ts "Super Bet typed API client"
[4]: ./client/src/lib/session.tsx "Super Bet session and role helpers"
[5]: ./client/src/lib/sportsbook.ts "Super Bet sportsbook fetching and canonical match-ID flow"
[6]: ./client/src/App.tsx "Super Bet application routes and role boundary"
