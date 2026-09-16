import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  LeagueDetail,
  LeagueEvent,
  LeaguePayment,
  LeagueResult,
} from "../../api/client";
import {
  buildEventRosterModel,
  getCompletedLeagueEventIds,
  getEventRosterStatus,
  getEventTimestamp,
  getRosterDefaultMode,
  selectEventRosterRows,
  selectLeagueRosterEvent,
  sortLeagueRosterEvents,
} from "./eventRosterModel";

const selectedEvent = event("event-1", "2026-09-04", "19:30:00");
const now = new Date("2026-09-04T12:00:00");

test("roster uses exact season membership, RSVP, and DNF eligibility from Payments", () => {
  const detail = fixture({
    members: [
      ...fixture().members,
      {
        userid: "pending",
        displayname: "Pending",
        approved: false,
        participating: true,
        isadmin: false,
      },
      {
        userid: "inactive",
        displayname: "Inactive",
        approved: true,
        participating: false,
        isadmin: false,
      },
    ],
    rsvps: [
      rsvp("alice", "going"),
      rsvp("bob", "not_going"),
      rsvp("cara", "going"),
    ],
    results: [result("cara", null, true)],
  });
  const model = buildEventRosterModel(detail, selectedEvent);
  assert.equal(model.rows.length, 3);
  assert.deepEqual(
    model.rows.map((row) => [
      row.userid,
      row.eventCharge.billedCents,
      row.canMarkPaid,
    ]),
    [
      ["alice", 5025, true],
      ["bob", 0, false],
      ["cara", 0, false],
    ],
  );
  assert.equal(model.summary.billedCents, 5025);
  assert.equal(model.summary.goingCount, 2);
  assert.equal(model.summary.declinedCount, 1);
  assert.equal(model.summary.awaitingCount, 0);
});

test("partial event transactions remain payable and accounting uses integer cents", () => {
  const detail = fixture({
    rsvps: [rsvp("alice", "going"), rsvp("bob", "going")],
    payments: [
      payment("alice", 20.1),
      payment("alice", 0.2),
      payment("alice", 100, "league"),
      payment("bob", 50.25),
      payment("cara", 7, "other"),
    ],
  });
  const { rows, summary } = buildEventRosterModel(detail, selectedEvent);
  assert.equal(rows[0].eventCharge.paidCents, 2030);
  assert.equal(rows[0].eventCharge.outstandingCents, 2995);
  assert.equal(rows[0].eventCharge.status, "partial");
  assert.equal(rows[0].canMarkPaid, true);
  assert.equal(rows[0].leagueCharge.paidCents, 10000);
  assert.equal(rows[0].leagueCharge.outstandingCents, 90000);
  assert.equal(rows[0].paidDate, "2026-09-04");
  assert.equal(rows[1].canMarkPaid, false);
  assert.equal(summary.collectedCents, 7055);
  assert.equal(summary.outstandingCents, 2995);
  assert.equal(summary.partialCount, 1);
  assert.equal(summary.unpaidCount, 1);
  assert.equal(summary.paidCount, 1);
  assert.equal(summary.collectionBasisPoints, 7020);
});

test("no fee is N/A, while unallocated credits stay visible instead of becoming a fake paid charge", () => {
  const detail = fixture({
    rsvps: [rsvp("alice", "going")],
    payments: [payment("bob", 10)],
  });
  detail.seasons[0].pereventfee = 0;
  const { rows, summary } = buildEventRosterModel(detail, selectedEvent);
  assert.equal(rows[0].eventCharge.status, "not_due");
  assert.equal(rows[0].canMarkPaid, false);
  assert.equal(rows[1].eventCharge.status, "credit");
  assert.equal(rows[1].eventCharge.creditCents, 1000);
  assert.equal(summary.creditCents, 1000);
  assert.equal(summary.collectionBasisPoints, 0);
  assert.equal(summary.paidCount, 0);
  assert.deepEqual(selectEventRosterRows(rows, { filter: "paid" }), []);
});

test("event fee overrides do not create a second source of truth beside season Payments", () => {
  const detail = fixture({
    events: [{ ...selectedEvent, eventfee: 999 }],
    rsvps: [rsvp("alice", "going")],
  });
  const { rows, summary } = buildEventRosterModel(detail, detail.events[0]);
  assert.equal(summary.eventFeeCents, 5025);
  assert.equal(rows[0].eventCharge.billedCents, 5025);
});

test("finish options match server Going field, exclude other DNF, disallow ties, preserve own place", () => {
  const detail = fixture({
    rsvps: [
      rsvp("alice", "going"),
      rsvp("bob", "going"),
      rsvp("cara", "going"),
    ],
    results: [result("alice", 1), result("cara", null, true)],
  });
  const { rows } = buildEventRosterModel(detail, selectedEvent);
  assert.deepEqual(rows[0].availablePlaces, [1, 2]);
  assert.deepEqual(rows[1].availablePlaces, [2]);
  assert.deepEqual(rows[2].availablePlaces, [2, 3]);
  assert.equal(rows[0].points, 110);
  assert.equal(rows[1].points, null);
  assert.equal(rows[2].finish, "dnf");
  assert.equal(rows[2].points, 0);
  detail.rsvps[2].status = "not_going";
  const updated = buildEventRosterModel(detail, selectedEvent);
  assert.deepEqual(updated.rows[1].availablePlaces, [2]);
  assert.deepEqual(updated.rows[2].availablePlaces, []);
});

test("unrecognized/missing RSVP remains Awaiting without fabricating a result", () => {
  const detail = fixture({
    rsvps: [rsvp("alice", "unknown")],
    results: [result("bob", null)],
  });
  const { rows, summary } = buildEventRosterModel(detail, selectedEvent);
  assert.equal(summary.awaitingCount, 3);
  assert.equal(summary.recordedCount, 0);
  assert.equal(summary.missingCount, 3);
  assert.equal(rows[1].finish, "missing");
  assert.equal(rows[1].points, null);
  assert.deepEqual(
    selectEventRosterRows(rows, { filter: "awaiting" }).map(
      (row) => row.userid,
    ),
    ["alice", "bob", "cara"],
  );
});

test("League balance sort follows displayed season debt rather than unrelated event debt", () => {
  const detail = fixture({
    rsvps: [rsvp("bob", "going")],
    payments: [
      payment("alice", 990, "league"),
      payment("bob", 1000, "league"),
      payment("cara", 1000, "league"),
    ],
  });
  const { rows } = buildEventRosterModel(detail, selectedEvent);
  assert.equal(rows[0].leagueCharge.outstandingCents, 1000);
  assert.equal(rows[1].leagueCharge.outstandingCents, 0);
  assert.equal(rows[1].paymentRow.outstandingCents, 5025);
  assert.deepEqual(
    selectEventRosterRows(rows, { sort: "balance" }).map((row) => row.userid),
    ["alice", "bob", "cara"],
  );
});

test("search normalizes accents and nicknames; filters and sorts never mutate source rows", () => {
  const detail = fixture({
    rsvps: [rsvp("alice", "going"), rsvp("bob", "going")],
    payments: [payment("alice", 50.25)],
  });
  detail.members[2].displayname = "Cára Guest (River Queen)";
  const { rows } = buildEventRosterModel(detail, selectedEvent);
  assert.deepEqual(
    selectEventRosterRows(rows, { search: "  river queen " }).map(
      (row) => row.userid,
    ),
    ["cara"],
  );
  assert.deepEqual(
    selectEventRosterRows(rows, { search: "cara" }).map((row) => row.userid),
    ["cara"],
  );
  assert.deepEqual(
    selectEventRosterRows(rows, { filter: "unpaid" }).map((row) => row.userid),
    ["bob"],
  );
  assert.deepEqual(
    selectEventRosterRows(rows, { sort: "fee" }).map((row) => row.userid),
    ["bob", "alice", "cara"],
  );
  assert.deepEqual(
    rows.map((row) => row.userid),
    ["alice", "bob", "cara"],
  );
});

test("event selector respects valid URL, nearest future, and excludes inactive events", () => {
  const yesterday = event("yesterday", "2026-09-03");
  const today = event("today", "2026-09-04", "13:00");
  const tomorrow = event("tomorrow", "2026-09-05");
  const disabled = {
    ...event("disabled", "2026-09-04", "12:30"),
    active: false,
  };
  const events = [tomorrow, disabled, yesterday, today];
  assert.equal(
    selectLeagueRosterEvent(events, undefined, now)?.eventid,
    "today",
  );
  assert.equal(
    selectLeagueRosterEvent(events, "yesterday", now)?.eventid,
    "yesterday",
  );
  assert.equal(
    selectLeagueRosterEvent(events, "deleted", now)?.eventid,
    "today",
  );
  assert.equal(
    selectLeagueRosterEvent(events, "disabled", now)?.eventid,
    "today",
  );
  assert.equal(selectLeagueRosterEvent([], undefined, now), null);
});

test("event fallback prefers latest completed to newer unfinished past, otherwise first chronological", () => {
  const events = [
    event("newer", "2026-09-03"),
    event("old", "2026-09-01"),
    event("middle", "2026-09-02"),
  ];
  assert.equal(
    selectLeagueRosterEvent(events, "deleted", now, new Set(["old", "middle"]))
      ?.eventid,
    "middle",
  );
  assert.equal(selectLeagueRosterEvent(events, undefined, now)?.eventid, "old");
  const undated = event("undated", null);
  assert.equal(
    selectLeagueRosterEvent(
      [undated, ...events],
      undefined,
      now,
      new Set(["old", "undated"]),
    )?.eventid,
    "old",
  );
  assert.equal(
    selectLeagueRosterEvent([undated], undefined, now)?.eventid,
    "undated",
  );
});

test("calendar dates, explicit times, and unscheduled ordering are deterministic", () => {
  assert.equal(
    getEventTimestamp(selectedEvent),
    new Date("2026-09-04T19:30:00").getTime(),
  );
  assert.equal(getEventTimestamp(event("no-date", null)), null);
  assert.equal(getEventTimestamp(event("invalid", "2026-02-30")), null);
  assert.equal(
    getEventTimestamp(event("bad-time", "2026-09-04", "99:99")),
    null,
  );
  assert.equal(
    getEventTimestamp(event("no-time", "2026-09-04")),
    new Date("2026-09-04T23:59:59").getTime(),
  );
  assert.deepEqual(
    sortLeagueRosterEvents([event("undated", null), selectedEvent]).map(
      (item) => item.eventid,
    ),
    ["event-1", "undated"],
  );
});

test("completion uses recorded Going finishes, not all roster players or declines", () => {
  const detail = fixture({
    rsvps: [rsvp("alice", "going"), rsvp("bob", "not_going")],
    results: [result("alice", 1), result("bob", null, true)],
  });
  const { summary } = buildEventRosterModel(detail, selectedEvent);
  assert.deepEqual([...getCompletedLeagueEventIds(detail)], ["event-1"]);
  assert.equal(summary.recordedCount, 2);
  assert.equal(summary.missingCount, 1);
  assert.equal(summary.goingRecordedCount, 1);
  assert.equal(getEventRosterStatus(selectedEvent, summary, now), "completed");
  detail.rsvps[0].status = "not_going";
  assert.equal(getCompletedLeagueEventIds(detail).size, 0);
});

test("linked tournament completion requires winner, and incomplete past events default to Results", () => {
  const linked = { ...selectedEvent, tournamentid: "tournament-1" };
  const detail = fixture({
    events: [linked],
    rsvps: [rsvp("alice", "going")],
    results: [result("alice", 2)],
  });
  const { summary } = buildEventRosterModel(detail, linked);
  assert.equal(getCompletedLeagueEventIds(detail).size, 0);
  assert.equal(
    getEventRosterStatus(linked, summary, new Date("2026-09-05T12:00")),
    "current",
  );
  detail.results[0].placed = 1;
  assert.equal(getCompletedLeagueEventIds(detail).has(linked.eventid), true);
  const incomplete = buildEventRosterModel(
    fixture({ rsvps: [rsvp("alice", "going")] }),
    selectedEvent,
  );
  assert.equal(
    getRosterDefaultMode(selectedEvent, incomplete.summary, now),
    "attendance",
  );
  assert.equal(
    getRosterDefaultMode(
      selectedEvent,
      incomplete.summary,
      new Date("2026-09-04T20:30"),
    ),
    "attendance",
  );
  assert.equal(
    getRosterDefaultMode(
      { ...selectedEvent, hasstarted: true },
      incomplete.summary,
      new Date("2026-09-04T20:30"),
    ),
    "attendance",
  );
  assert.equal(
    getRosterDefaultMode(
      selectedEvent,
      incomplete.summary,
      new Date("2026-09-05T12:00"),
    ),
    "results",
  );
  assert.equal(
    getEventRosterStatus(
      { ...selectedEvent, active: false },
      incomplete.summary,
      now,
    ),
    "unavailable",
  );
});

function fixture(overrides: Partial<LeagueDetail> = {}): LeagueDetail {
  return {
    league: {
      leagueid: "league-1",
      ownerid: "owner",
      name: "Fixture league",
      invitecode: "FIXTURE",
      approvalneeded: false,
      expectedplayercount: 3,
      leaguefee: 1000,
      pereventfee: 999,
      showupbonuspoints: 10,
      bestfinishcount: 1,
      pointslookup: [{ place: 1, points: 100 }],
      finalenabled: false,
      finalmultiplierlookup: [],
      finalchiprounding: 100,
      finalstartingbigblind: 100,
      memberledgervisible: false,
      active: true,
      createdat: "2026-01-01",
      isadmin: true,
    },
    selectedseasonid: "season-1",
    seasons: [
      {
        seasonid: "season-1",
        leagueid: "league-1",
        name: "Season",
        begindate: "2026-01-01",
        enddate: "2026-12-31",
        pereventfee: 50.25,
        active: true,
        createdat: "2026-01-01",
      },
    ],
    members: [
      {
        userid: "alice",
        displayname: "Alice Adams (Ace High)",
        approved: true,
        participating: true,
        isadmin: false,
      },
      {
        userid: "bob",
        displayname: "Bob Brown",
        approved: true,
        participating: true,
        isadmin: false,
      },
      {
        userid: "cara",
        displayname: "Cara Guest",
        approved: true,
        participating: true,
        isadmin: false,
        isguestuser: true,
      },
    ],
    events: [selectedEvent],
    results: [],
    payments: [],
    rsvps: [],
    auditlog: [],
    standings: [],
    finalstacks: [],
    ...overrides,
  };
}

function event(
  eventid: string,
  eventdate: string | null,
  eventtime: string | null = null,
): LeagueEvent {
  return {
    eventid,
    leagueid: "league-1",
    seasonid: "season-1",
    name: eventid,
    eventdate,
    eventtime,
    active: true,
    createdat: "2026-01-01",
  };
}

function rsvp(userid: string, status: string) {
  return {
    rsvpid: `rsvp-${userid}`,
    userid,
    eventid: selectedEvent.eventid,
    leagueid: "league-1",
    status,
    createdat: "2026-09-01",
    updatedat: "2026-09-01",
  };
}

function result(
  userid: string,
  placed: number | null,
  dnf = false,
): LeagueResult {
  return {
    resultid: `result-${userid}`,
    eventid: selectedEvent.eventid,
    leagueid: "league-1",
    userid,
    placed,
    dnf,
    points: dnf ? 0 : 100,
    showupbonuspoints: dnf ? 0 : 10,
    createdat: "2026-09-04",
    updatedat: "2026-09-04",
  };
}

let paymentIndex = 0;
function payment(
  userid: string,
  amount: number,
  paymenttype: LeaguePayment["paymenttype"] = "event",
): LeaguePayment {
  return {
    paymentid: `payment-${++paymentIndex}`,
    userid,
    eventid: selectedEvent.eventid,
    leagueid: "league-1",
    seasonid: "season-1",
    paymenttype,
    amount,
    paidat: "2026-09-04",
    createdat: "2026-09-04",
  };
}
