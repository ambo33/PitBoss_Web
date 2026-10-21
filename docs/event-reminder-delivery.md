# Scheduled event email delivery

The shared notification job handles both tournaments and league events. Its
tournament recipient/start queries previously referenced `t.active`, a column
that is not present in the tournaments schema. That query failure prevented
the combined job from reaching league sends as well. The invalid predicates
are removed; no database migration or new column is required.

Existing delivery behavior is preserved:

- At 8:00–8:14 a.m. America/New_York: day-of emails for registered/Going players,
  and RSVP nudges for nonresponders today or two calendar days ahead.
- At 45–75 minutes before the scheduled start: one-hour emails for registered/
  Going players. The "48-hour" nudge is calendar-day based, not an exact 48 hours.
- At event start: the existing email and push alerts.
- Completed-event recaps: the existing 30-day lookback, explicitly retained in
  this release. No manual production job invocation is required or performed.
- Account/community opt-outs, guest exclusions and delivery deduplication remain.

The cron service must exist in Render, run every five minutes, point APP_URL to
the production API and share JOB_SECRET with the web/API service. A manifest
entry alone does not prove that the live service is provisioned or configured.
Use cron run logs and scheduled-delivery/provider records to confirm operation.
The public health response includes the non-secret Render commit SHA when set,
so backend-only deployments can be identified without sending messages.

Checks:

`npm.cmd exec -w apps/api -- tsx --test tests/event-reminder-job.test.ts tests/event-start-job.test.ts tests/event-notification-timing.test.ts tests/health-release.test.ts`

For schema validation, set `REMINDER_SCHEMA_CHECK=1` and run the reminder-job
test. It plans the actual SELECTs using EXPLAIN (without ANALYZE) in a read-only
transaction. Synthetic recipients, email transports and delivery writes stay in
memory. No live messages, recipient data exports or database writes occur.
