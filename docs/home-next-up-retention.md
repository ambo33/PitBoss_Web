# Home: Next Up retention

An unfinished tournament or league event remains eligible for Next Up until
12 elapsed hours after its scheduled start, or until its full active field has
recorded finishes, whichever happens first. A scheduled start passing does not
fabricate a live or paused timer. Cash-game behavior remains unchanged.

Next Up shows a LIVE badge once a tournament/league event reaches its scheduled
start and until the same completion/12-hour cutoff. A started timer also marks
the event LIVE, including during pauses. This is event-level display state only:
timer state, management actions, and lobby links are unchanged. Future, date-only,
and undated events do not become LIVE merely by appearing in Next Up.

New York wall-clock schedules use the same pure timing helper as event-start
notifications, including seconds and daylight-saving changes. Generic tournament
game records with explicit timestamp offsets retain their original instant.
Date-only and undated records retain their existing eligibility rules.

`allplayersfinished` is a home-specific read-model field; the legacy `completed`
flag remains unchanged for other screens. Tournament completion checks players
who checked in or already have a placement. Unchecked registrations are not a
playing field. League-only events check approved, participating players marked
Going, each with a positive placement or DNF. An empty field is not completed.

The visible home view refreshes its clock and schedule data every 30 seconds.
Players keep their Open Lobby action; admins have an explicitly labeled Open
Lobby secondary action alongside management. Existing permissions are unchanged.

Checks:

- `npm.cmd exec -w apps/api -- tsx ../web/src/pages/Main/homeDashboardModel.test.ts`
- `npm.cmd exec -w apps/api -- tsx tests/event-notification-timing.test.ts`
- `npm.cmd exec -w apps/api -- tsx tests/home-schedule-completion.test.ts`

The completion-handler test uses an isolated database adapter by default. Its
optional `--read-only-sql` mode opens the configured database, starts a read-only
transaction, evaluates only literal CTE fixtures that shadow the table names,
and rolls back. It does not read or change real player/event records.
