# League fee tracking by event

The season league fee is divided across all active season events. Calculations
use integer cents; any remaining cents are assigned to the earliest events by
event number, date, time, creation timestamp, and event ID. The UI and API use
the same pure allocation function in `apps/api/src/leagues/payments.ts`.

An event-linked league payment covers that event's installment. Unlinked season
payments cover unpaid installments in event order. Payments linked to removed
events remain in the ledger and become available season credit. Attendance does
not waive the season league fee; it affects only the event fee.

Fee or event-count changes recalculate obligations, including completed events,
but do not rewrite amounts already recorded. For example, $100 across ten events
requires $10 per event. Raising the season fee to $200 changes each installment
to $20. An event with $10 logged then shows $10 outstanding. Recording the
difference updates the event's existing payment and records the previous amount,
new amount, amount added, current fee, and event count in the audit log.

Admins must acknowledge responsibility for correcting existing tracking before
changing the league fee or adding/removing events if positive league payments
exist. The API enforces acknowledgement as well as the UI. Removing an event
archives the event and preserves its payment and audit history. At least one
event must remain. A running linked tournament must first be paused; the linked
tournament is retained under Games.

The quick fee action records only the missing amount, capped by the remaining
season balance. When prior overpayments leave a category allocation mismatch,
the admin must review or adjust payments. Whole-season payments cannot be
removed through an individual event's toggle; use Payments to adjust those.
Event-linked payments can be removed from the roster, with an audit entry.

When an admin changes a paid player's attendance to Can't go, confirmation offers
keeping or removing the recorded event-fee payment. Keeping is selected by
default, and cancellation changes nothing. The RSVP API preserves payments unless
an admin explicitly sends `removeEventFeePayment: true`; self-service attendance
changes cannot remove payments. Removal affects only that player's event-fee
records for that event, not league-fee installments. Both the choice and any
removed total are audited. Linked tournament paid flags are synchronized when
payments are removed. Removing a payment record does not issue a refund.

Checks:

- `npm.cmd run test:league-workflows`
- `npm.cmd run test:league-payments`
- `npm.cmd exec -w apps/api -- tsx tests/league-fee-routes.test.ts`
- `npm.cmd exec -w apps/api -- tsx tests/league-attendance-payments.test.ts`
- `npm.cmd exec -w apps/api -- tsx ../web/src/pages/Main/eventRosterModel.test.ts`

Route tests replace the database adapter and never connect to a real database.
