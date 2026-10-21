# Knockout push details

League and tournament knockout pushes include the eliminated player's ordinal
placement. For example: "Alex was knocked out of Event #2 in 4th place."

For tournaments, including league-linked tournaments, the push also identifies
the next elimination's current prize when it pays a positive
amount: "Next knockout payout: $100." The next placement comes from the
remaining checked-in, unplaced field, not simply the reported place minus one.
Completed tournaments and unpaid/zero-dollar finishes do not get a payout notice.

Amounts follow the live runner: entered field, configured count/percentage,
default splits, buy-ins, player and generic rebuys/add-ons, rake, bounty-pool
deductions and payout-denomination rounding. A failed or malformed payout lookup
does not suppress the placement push. League-only events do not invent cash prizes.

Admin-run knockouts, player self-knockouts and linked league results all use the
formatter. Existing recipients, notification categories, opt-outs, tags, deep
links and duplicate protection are unchanged. Credited knockout players also see
the placement and next-payout notice in their personal message.

Isolated checks (no live DB writes or device pushes):

`npm.cmd exec -w apps/api -- tsx --test tests/knockout-notification-details.test.ts tests/knockout-notification-dispatch.test.ts tests/league-knockout-notification.test.ts`
