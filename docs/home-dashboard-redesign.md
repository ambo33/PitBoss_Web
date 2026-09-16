# Home dashboard and single navigation

Implementation handoff for the supplied Home dashboard brief, September 4, 2026.

## Navigation audit and migration

The former `Layout` mounted desktop global navigation and a separate global sidebar, while `Main/index.tsx` also supplied an account menu with those destinations. The desktop rail reserved 224–244px of width. The redesign gives `Layout` one shared navigation configuration and removes the Home rail and its offset.

| Destination                 | Compatible route                                             | Navigation owner               |
| --------------------------- | ------------------------------------------------------------ | ------------------------------ |
| Home                        | `/` or `/?section=upcoming&schedule=home`                    | Global Home                    |
| Upcoming games              | `/?section=upcoming&schedule=games`                          | Global Games, local Upcoming   |
| Past games / legacy History | `/?section=history`                                          | Global Games, local Past       |
| Leagues                     | `/?section=leagues`                                          | Global Leagues                 |
| Groups                      | `/?section=groups`                                           | Global Groups                  |
| Combined communities        | `/?section=communities`                                      | Compatible combined directory  |
| Account                     | `/?view=profile`                                             | Utility menu                   |
| Admin                       | `/?view=admin`                                               | Utility menu, superadmins only |
| Selected league             | Existing `league`, `season`, `leagueTab`, `event` parameters | League contextual navigation   |
| Selected group              | Existing `group`, `groupTab`, `post` parameters              | Group contextual navigation    |

History was already the past tournament, cash-game, and league-event schedule, including its community filter and pagination. Its records and route remain available as Games → Past.

Creation reuses the existing tournament/cash-game composer and its group picker, account limits, and server checks. League and group creation reuse their existing directory handlers. Navigation uses client-side links; creation remains an action.

Bare league/group links retain their entity ownership even when accompanied by `schedule=games`; an explicit `section=upcoming` wins over stale entity parameters. Legacy `section=past` and `schedule=past` still open Games/Past. Hosting works from Home, Games, Account Settings, and Admin without losing or replaying a pending creation request.

## Data and permissions

Home uses existing React Query sources for the current account, accessible tournaments, games, league schedule, groups, and leagues. The page is mounted once for all viewport sizes. Existing query invalidation and focus refresh are retained.

The existing tournament list and league-schedule responses gain optional read-only `running` and `hasstarted` projections from the saved tournament clock. The league schedule also exposes `seasonid` and `seasonname` from its existing season join. These are additive fields; no schema migration, new endpoint, timer subscription, or polling loop is introduced.

`running` uses the saved clock state. `hasstarted` conservatively recognizes a running clock, progress beyond the first blind level, or a positive remaining time below the first level's duration. There is no durable historical start flag in the current data model. A clock paused at its exact initial setting cannot be distinguished from an unused clock; the UI must not invent that distinction from a scheduled date. Non-tournament league events have no authoritative live state. Missing fields on an older API are supported.

Game destinations retain their original source identity: tournament management/lobby, permission-aware cash-game page, or the precise league/season/event. Linked tournament/event records are deduplicated before selecting the hero and upcoming preview. The featured game is excluded from the additional upcoming rows.

Memberships and role badges use existing permission-filtered responses. Event fees remain labeled as event fees, separately from tournament buy-ins. No general authorized activity feed exists without additional per-entity requests, so Recent Activity is omitted. No illustrative activity, counts, notifications, dates, or identities are shipped as application data.

## Responsive design

Desktop uses one compact horizontal header and a centered Home content area up to 1280px. Tablet keeps the same four top-level destinations. Below 768px, the top bar contains branding and utilities while the four global destinations move to a full-width bottom bar. The shell owns the bottom-navigation height and safe-area clearance.

Home uses a hero/quick-action split on desktop, stacked sections on portrait tablet, and a single column on phones. Quick actions become a readable 2×2 grid. Existing league/group contextual navigation and focused tournament workspaces are preserved.

| CSS width        | Header               | Primary navigation                   | Home layout                                         |
| ---------------- | -------------------- | ------------------------------------ | --------------------------------------------------- |
| 1024px and above | 64px                 | Four links in the header             | Two-column hero/actions, compact upcoming rows      |
| 768–1023px       | 60px                 | Same four links in a compact header  | Stacked hero/actions; no rail                       |
| Below 768px      | 56px, utilities only | 60px bottom bar plus safe-area inset | Single column, 16px side gutters, 2×2 quick actions |

No requested navigation breakpoint was shifted. Existing entity contextual navigation retains its 1200px breakpoint. The full-screen mobile game composer temporarily hides both global navigation surfaces and retains its own Close/Back controls; desktop/tablet navigation can leave the composer normally.

The design uses scoped dark/teal semantic colors from the supplied brief and the existing font/icon/brand assets. No suitable approved cards-and-chips background is available in the repository; the hero uses the brief's permitted gradient fallback.

| Semantic role                     | Home token / value                                                                   |
| --------------------------------- | ------------------------------------------------------------------------------------ |
| Canvas / surface / raised surface | `--dash-canvas` #080f14 / `--dash-surface` #101b23 / `--dash-surface-raised` #14232d |
| Inset / border                    | `--dash-inset` #0b161d / `--dash-border` #253b47                                     |
| Primary / secondary / muted text  | `--dash-text` #f5f8fb / `--dash-secondary` #b9c9d4 / `--dash-muted` #94aab9          |
| Primary action / keyboard focus   | `--dash-teal` #0ed6d2 / `--dash-focus` #78f2e9                                       |

The shell shares these text, border, and teal values through scoped `--app-nav-*` tokens, with #091218 for its header surface. Motion is limited to small interaction transitions and respects reduced-motion preferences.

## Changed implementation files

These are the files changed for this redesign, not a claim that all current working-tree changes belong to it.

- Shell, shared route ownership, and tests: [Layout.tsx](C:/Users/EricA/Projects/PokerPlanner/apps/web/src/components/Layout.tsx), [appNavigation.ts](C:/Users/EricA/Projects/PokerPlanner/apps/web/src/components/appNavigation.ts), [appNavigation.css](C:/Users/EricA/Projects/PokerPlanner/apps/web/src/components/appNavigation.css), [appNavigation.test.ts](C:/Users/EricA/Projects/PokerPlanner/apps/web/src/components/appNavigation.test.ts).
- Home, data adapter, and tests: [HomeDashboard.tsx](C:/Users/EricA/Projects/PokerPlanner/apps/web/src/pages/Main/HomeDashboard.tsx), [homeDashboard.css](C:/Users/EricA/Projects/PokerPlanner/apps/web/src/pages/Main/homeDashboard.css), [homeDashboardModel.ts](C:/Users/EricA/Projects/PokerPlanner/apps/web/src/pages/Main/homeDashboardModel.ts), [homeDashboardModel.test.ts](C:/Users/EricA/Projects/PokerPlanner/apps/web/src/pages/Main/homeDashboardModel.test.ts).
- Existing route/composer integration: [Main/index.tsx](C:/Users/EricA/Projects/PokerPlanner/apps/web/src/pages/Main/index.tsx), [TournamentsPanel.tsx](C:/Users/EricA/Projects/PokerPlanner/apps/web/src/pages/Main/TournamentsPanel.tsx), [App.tsx](C:/Users/EricA/Projects/PokerPlanner/apps/web/src/App.tsx).
- Focused/standalone shell integration: [PreTournament/index.tsx](C:/Users/EricA/Projects/PokerPlanner/apps/web/src/pages/PreTournament/index.tsx), [LeagueEventLobby/index.tsx](C:/Users/EricA/Projects/PokerPlanner/apps/web/src/pages/LeagueEventLobby/index.tsx), [VoiceLab/index.tsx](C:/Users/EricA/Projects/PokerPlanner/apps/web/src/pages/VoiceLab/index.tsx).
- Additive list fields: [client.ts](C:/Users/EricA/Projects/PokerPlanner/apps/web/src/api/client.ts), [tournaments.ts](C:/Users/EricA/Projects/PokerPlanner/apps/api/src/routes/tournaments.ts), [leagues.ts](C:/Users/EricA/Projects/PokerPlanner/apps/api/src/routes/leagues.ts).
- Isolated browser regression harness: [home-dashboard-qa-20260904.cjs](C:/Users/EricA/Projects/PokerPlanner/tmp/home-dashboard-qa-20260904.cjs), its screenshots/JSON results, and this handoff document.

## Verification

Commands were run from `C:\Users\EricA\Projects\PokerPlanner`:

| Check                   | Actual command / outcome                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Formatter               | Cached Prettier 3.6.2, via `npm.cmd exec --offline --yes --package=prettier@3.6.2 -- prettier --write ...`; passed for new/reworked Home and navigation files, tests, and this report. Main was range-formatted above `ProfilePanel` to avoid unrelated churn. Small integration changes retain their existing surrounding style.                                                                          |
| Web lint and type check | `npm.cmd run lint -w apps/web`; passed. This repository's lint script is `tsc --noEmit`, not a separate ESLint run.                                                                                                                                                                                                                                                                                        |
| API type check/build    | `npm.cmd run build -w apps/api`; passed (`tsc`).                                                                                                                                                                                                                                                                                                                                                           |
| Web production build    | `npm.cmd run build -w apps/web`; passed, including `tsc` and Vite. Existing Vite CJS, PostCSS module-type, and large-chunk warnings remain.                                                                                                                                                                                                                                                                |
| Unit regressions        | `node --import tsx --test apps/web/src/components/appNavigation.test.ts apps/web/src/pages/Main/homeDashboardModel.test.ts apps/web/src/pages/Main/eventRosterModel.test.ts apps/web/src/pages/Main/leaguePaymentViewModel.test.ts`; all passed: 4 navigation, 13 Home, 13 roster, and 10 payment model cases. Node reports 31 top-level tests because the payment file runs its 10 assertions internally. |
| Whitespace              | `git -c core.safecrlf=false diff --check`; passed across the tracked working tree.                                                                                                                                                                                                                                                                                                                         |
| Browser                 | `node tmp/home-dashboard-qa-20260904.cjs`; isolated Playwright/Edge regression suite, with final combined findings recorded below.                                                                                                                                                                                                                                                                         |

The final settled-source browser run passed **13 viewport checks, 110 grouped checks, and 62 captures**, with zero failures, browser/console errors, unknown API requests, or unexpected mutation attempts. Three existing Run-screen music-settings autosaves and one automatic report triggered by the intentional 503 error fixture were blocked with 405 and recorded separately. No request was forwarded to the real API.

The exact requested eleven viewports were checked, plus 767px and 1023px to cover the opposite sides of navigation breakpoints. Checks cover actual element bounds and visible root overflow, not a hidden-overflow workaround. The 375×667 hero CTA and final page action clear bottom navigation; increased text, missing images, long names/counts, loading, retry, empty/one/many, and player-only states are covered.

Route/action checks include refresh, Back/Forward, Games Upcoming/Past, entity context, permission-aware tournament/cash/league destinations, UTC-to-New-York cash times across Home and Games, creation from utility pages, account modal focus/escape/return, Admin visibility, Feedback, and the existing Sign Out handler. Creation tests open and navigate the real forms but do not submit a game.

Focused-workspace regressions confirm one primary navigation on tournament Details/Players, no added bottom navigation on Run or blind generation, and usable local controls. At 375px the league event roster's selected-player bulk bar and final row clear the shared navigation; its player drawer remains visible, traps focus, and restores focus on close.

### Screenshots

All populated captures below use clearly synthetic development fixtures, not production records.

- [Desktop 1440×900](C:/Users/EricA/Projects/PokerPlanner/tmp/home-dashboard-qa-20260904/1440x900.png).
- [Tablet landscape 1024×768](C:/Users/EricA/Projects/PokerPlanner/tmp/home-dashboard-qa-20260904/1024x768.png).
- [Tablet portrait 768×1024](C:/Users/EricA/Projects/PokerPlanner/tmp/home-dashboard-qa-20260904/768x1024.png).
- [Mobile 375×667 first viewport](C:/Users/EricA/Projects/PokerPlanner/tmp/home-dashboard-qa-20260904/375x667.png) and [full page](C:/Users/EricA/Projects/PokerPlanner/tmp/home-dashboard-qa-20260904/375x667-full.png).
- [Machine-readable browser evidence](C:/Users/EricA/Projects/PokerPlanner/tmp/home-dashboard-qa-20260904/summary.json).

## Delivery

These are local working-tree changes. No commit, push, deployment, or real payment/account mutation is included. Browser verification uses explicitly synthetic fixtures with intercepted API traffic; it does not establish live-database persistence or a deployed release.

Refresh [local Home](http://127.0.0.1:5173/?section=upcoming&schedule=home) in the running app to see the changes with your existing session. Real live/paused indicators require the matching additive API build; those read-only SQL projections were compiled and reviewed but not exercised against a live database in this task. No environment variables or migrations are needed. Gradient artwork and omitted Recent Activity are intentional fallbacks, not missing wiring.
