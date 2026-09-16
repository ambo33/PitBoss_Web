# League Event Roster redesign

Implementation and audit handoff, September 4, 2026. This is a frontend redesign of the existing League Events workflow, not a new accounting or tournament service. The local build, domain tests, responsive browser workflows, and existing League Settings regressions passed. No deployment or real-data mutation was performed.

## Scope and affected files

- `apps/web/src/pages/Main/LeaguesPanel.tsx`: existing route owner, season/event selection, query/mutation bindings, and preserved League navigation.
- `apps/web/src/pages/Main/LeagueEventRoster.tsx`: responsive roster workspace, event picker, modes, controls, selection/confirmation, and player details.
- `apps/web/src/pages/Main/eventRoster.css`: scoped responsive roster styling.
- `apps/web/src/pages/Main/eventRosterModel.ts`: roster derivation, selection defaults, lifecycle presentation, search/filter/sort, and finish options.
- `apps/web/src/pages/Main/eventRosterModel.test.ts`: 13 domain tests.
- `apps/web/src/components/Layout.tsx`: a nonvisual `data-app-mobile-nav` marker for measuring an existing bottom navigation when present.
- `docs/event-roster-redesign.md`: this handoff.
- `tmp/event-roster-qa-20260904.cjs` and its output folder: isolated browser harness, summary, and screenshots. The existing league-workflow HTML test report was regenerated.

The existing payment model, API client, query cache, modal/focus infrastructure, and application shell are reused. No new component framework, backend handler, database migration, or production-data change is part of this redesign.

## Route and selection behavior

The existing main route continues to use `section=leagues`, `league`, `season`, and `leagueTab=events`. Roster-specific URL state uses `event`, `eventMode`, `rosterFilter`, `rosterSearch`, `rosterSort`, and `rosterPlayer`.

- An accessible event switcher replaces the permanent tall event rail; previous/next navigation and an event list remain available in the workspace.
- A valid explicit event is respected. An absent, deleted, or inaccessible event falls back to the nearest upcoming event, then the most recently completed event, then the first chronological available event.
- The automatically resolved season and event are canonicalized with history replacement. Explicit event changes add history entries, preserving browser Back/Forward.
- Event changes preserve meaningful mode/filter/search/sort state and close the old player drawer. Season changes clear event/player IDs before choosing an event in the newly loaded season.
- URL repair waits until the URL league/season and loaded data agree, preventing old-season data from rewriting a Back/Forward destination.
- Existing League sections and Payments deep links remain intact. Leaving Events removes roster-only URL state.

Dates use the application's existing local wall-clock convention. Date-only events sort at the end of their day; malformed/unscheduled dates do not outrank dated upcoming events. Without an explicit mode, Attendance remains the default before and during the event day. Earlier calendar dates with incomplete Going-player finishes default to Results. An explicit mode is not repeatedly overridden.

## Responsive workspace

The layout keeps existing global and League navigation, then presents the event selector, compact RSVP/collection summaries, Attendance / Event Fees / Results modes, filters/search/sort, contextual bulk actions, and dense player rows.

- Desktop: compact table-oriented rows and a right-side player detail surface.
- Tablet: reduced columns or compact list rows rather than a horizontally squeezed desktop table.
- Mobile: purpose-built identity/status rows, a full-width event switcher, and modal player/event sheets. Bulk controls clear any real bottom navigation and safe-area inset; the final row remains reachable. The current main-page shell uses its existing hamburger and League sections instead of a fixed bottom navigation, so the redesign does not invent a new navigation bar. Search expands additional sort and selection controls to keep the initial roster compact.

Overlays reuse focus trapping, Escape behavior, and focus return. Visible status text accompanies colors. No player-note editor is added because there is no persistence model for one.

## Existing data and API contracts

`api.getLeague(leagueId, seasonId)` already returns season members, events, RSVPs, results, payments, standings, and authorized audit entries. The redesign derives local rows and summaries from that existing payload; it does not prefetch a separate full roster for every event or add per-player N+1 requests.

| Workflow | Existing authoritative operation | Important behavior |
| --- | --- | --- |
| RSVP | `PUT /leagues/:id/events/:eventId/rsvp` | Supports only `going` and `not_going`; participant/self and admin-override checks remain server-side. |
| Mark event fee paid | `POST /leagues/:id/events/:eventId/payments/mark-paid` | Creates payment transactions for the remaining event amount, not a boolean paid flag. |
| Payment removal | `DELETE /leagues/:id/payments/:paymentId` | Existing audited record removal; not a fabricated refund or UI-only reversal. |
| Record finish / DNF | `PUT /leagues/:id/events/:eventId/results/:userId` | Existing validation, event locking, scoring, audit, and automatic-winner behavior. |
| Clear finish | `DELETE /leagues/:id/events/:eventId/results/:userId` | Existing audited removal, used only in the supported non-runner workflow. |
| Add / edit event | Existing create and patch event APIs | Existing event forms and permissions remain in use. |

Refresh, Player Lobby, Knockout QR, Export RSVP CSV, Add Event, Edit Event, and League invite/share/navigation remain available in the redesigned hierarchy. Selected-event socket subscriptions continue invalidating relevant League data; no full-page reload is introduced for mutations.

## Permissions and accounting safeguards

The admin roster stays behind the existing `league.isadmin` gate. Members retain their existing self-RSVP experience, without receiving admin payment, roster, or result controls. Server authorization remains authoritative.

Event amounts and League balances reuse `leaguePaymentViewModel.ts`:

- Only approved, participating season members enter the roster.
- An event obligation requires Going RSVP and no DNF result.
- The selected season's per-event fee is authoritative; the redesign does not independently reinterpret the event's legacy fee field.
- Arithmetic uses integer cents. Partial payments remain partial; mark-paid records only the outstanding event amount.
- N/A, paid, partial, unpaid, and credit remain distinguishable. Zero obligation is not reported as a paid fee, and old credits do not create fake obligations.
- League accounting is read-only context in the roster and links to the authoritative Payments tab with the player selected.

Bulk fee collection requires explicit player selection and confirmation of the selected event and total remaining amount. The existing endpoint accepts one user or a global `all` flag, not a selected-user array. The redesign uses individual selected-player calls rather than the unsafe global flag, prevents duplicate submission while pending, and reports per-player failures/partial success rather than claiming a transaction-wide success. No new transactional bulk API or speculative Undo is introduced.

The existing backend has consequential RSVP/result behavior that must be disclosed before confirmation:

- Changing to Can't Go marks DNF and can remove the player's event-fee payment records.
- Changing to Going clears an existing DNF or placement.
- Recording DNF removes event-fee payment records.
- Explicit removal of paid event records requires confirmation and retains existing audit behavior. This is record removal, not payment-provider refund processing.

## Result and tournament ownership

Finish controls unify not-entered, DNF, and supported placements. The client derives available places from the Going field and other Going-player DNFs/results; the backend still locks the event and rejects duplicate placements with `409`. There is no supported tie configuration to invent. Points, show-up bonuses, standings, and automatic winner recording remain server-derived.

Events linked to a tournament retain tournament-runner ownership of operational payments/check-ins/placements. The roster keeps the existing guidance and Manage Game handoff rather than exposing a second manual runner. In particular, the League clear-result API does not itself clear the tournament-player placement; the runner's restore workflow remains required there.

## Unsupported or deliberately constrained behavior

- **Awaiting response is display-only.** No RSVP-reset endpoint exists, and sending an unknown status to the existing endpoint becomes Going. The redesign must not present a functional reset option or silently send an invented value.
- **Cancellation is not exposed by the current event contract.** Inactive events are unavailable/soft-deleted; they are not labeled canceled without a real cancellation state.
- **Completion is derived, not stored by this UI.** Non-runner events require a nonempty Going field with recorded finishes; linked tournaments require a winner result. A past date alone is not completion.
- **No end timestamp is available.** Same-day operations conservatively default to Attendance, not a claim that the event has ended.
- **No payment method/refund/waiver model is invented.** Controls and confirmation fields use only supported API semantics.

These constraints preserve current product behavior rather than manufacturing unsupported controls from the visual reference.

## Verification record

Verified during this implementation:

- 13 Event Roster model tests passed: eligibility, cent arithmetic, partial and zero-fee states, credits, shared fee source, placement uniqueness/DNF, search/filter/sort (including displayed League balance), defaults and invalid selection, date parsing, completion, and same-day versus past-day mode defaults.
- 10 existing League Payments model tests passed.
- 27 existing League workflow tests passed, covering the existing backend domain behavior without production-data changes.

Final integration results:

- Prettier 3.6.2 formatted the four new source files; unrelated existing files were not reformatted.
- `npm.cmd run lint -w apps/web` (TypeScript no-emit check): passed.
- `npm.cmd run build -w apps/web`: passed. Existing Vite CJS, package module-type, and bundle-size warnings remain.
- `node --import tsx --test apps/web/src/pages/Main/leaguePaymentViewModel.test.ts apps/web/src/pages/Main/eventRosterModel.test.ts`: all 13 roster and 10 payment scenarios passed.
- `npm.cmd run test:league-workflows`: all 27 existing domain scenarios passed.
- `node tmp/event-roster-qa-20260904.cjs`: passed across eight sizes and five edge cases, with 34 grouped workflow checks and 89 screenshots. Zero application errors, unexpected console errors, unexpected API requests, or failed assertions.
- Viewports: `1440×900`, `1024×768`, `768×1024`, `390×844`, exactly `375×667`, `1366×768`, `430×932`, and `320×568`. Every captured state passed the document horizontal-overflow assertion.
- Verified event defaults, picker/previous/next, refresh, deep links, cross-season Back/Forward, invalid selection, RSVP side-effect confirmations and error recovery, selected payment totals/partial failure/retry, payment reversal, local calendar dates, placements/DNF/clear, reactive metrics, focus return after reordering/pagination, read-only Payments links, QR/CSV, and Add/Edit form access.
- Edge cases: no events, no players, zero event fee, member permissions, and tournament-backed read-only roster.
- `node tmp/league-settings-qa-20260904.cjs`: existing fee settings, season contrast, and Overview alignment/sticky-scroll regressions passed at 1920, 1600, 1440, and 375 pixels.
- Scoped `git diff --check`: passed.

All browser tests used isolated synthetic fixtures with real API/data mutations blocked. They verify the rendered UI and its request contracts, not real database persistence or physical-device keyboard behavior. Add/Edit forms were opened without submitting real events. No backend or database change was required.

### Screenshot handoff

- [Desktop 1440 × 900](../tmp/event-roster-qa-20260904/1440x900-fees-roster.png)
- [Tablet landscape 1024 × 768](../tmp/event-roster-qa-20260904/1024x768-fees-roster.png)
- [Tablet portrait 768 × 1024](../tmp/event-roster-qa-20260904/768x1024-fees-roster.png)
- [Mobile 390 × 844](../tmp/event-roster-qa-20260904/390x844-fees-roster.png)
- [Mobile exactly 375 × 667](../tmp/event-roster-qa-20260904/375x667-fees-roster.png)
- [Mobile player sheet](../tmp/event-roster-qa-20260904/375x667-player-sheet.png)
- [Full browser summary](../tmp/event-roster-qa-20260904/summary.json)

## Rollback

There are no database or API rollback steps. If needed, revert only the reviewed frontend roster changes and this document, retaining the preexisting shared navigation/payment work. Restore the previous Events rendering and bindings before removing newly added roster components. Do not use a broad worktree reset or overwrite unrelated dirty files.
