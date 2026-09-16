import assert from 'node:assert/strict';
import type { LeagueDetail, LeagueEvent, LeaguePayment } from '../../api/client';
import {
  buildLeaguePaymentViewModel,
  calculateCollectionRateBasisPoints,
  centsToMoney,
  filterPlayerPaymentRows,
  getPaymentStatus,
  moneyToCents,
  selectPlayerPaymentRows,
  sortPlayerPaymentRows,
  splitPlayerIdentity,
} from './leaguePaymentViewModel';

type TestCase = { name: string; run: () => void };

const eventOne = makeEvent('event-1', 'Opening Night', 1);
const eventTwo = makeEvent('event-2', 'Second Chance', 2);

const tests: TestCase[] = [
  {
    name: 'currency is rounded once to integer cents',
    run: () => {
      assert.equal(moneyToCents(10.005), 1001);
      assert.equal(moneyToCents(0.1 + 0.2), 30);
      assert.equal(moneyToCents(Number.NaN), 0);
      assert.equal(centsToMoney(1001), 10.01);
    },
  },
  {
    name: 'player identity separates the API full-name and nickname format',
    run: () => {
      assert.deepEqual(splitPlayerIdentity('  Brandon   Clark (RandomBrandon) '), {
        full: 'Brandon Clark (RandomBrandon)',
        name: 'Brandon Clark',
        nickname: 'RandomBrandon',
        initials: 'BC',
        searchText: 'brandon clark (randombrandon) brandon clark randombrandon',
      });
      assert.equal(splitPlayerIdentity('Cher').initials, 'CH');
      assert.equal(splitPlayerIdentity(null).name, 'Player');
    },
  },
  {
    name: 'status rules distinguish not due, unpaid, partial, paid, and credit',
    run: () => {
      assert.equal(getPaymentStatus(0, 0), 'not_due');
      assert.equal(getPaymentStatus(10_000, 0), 'unpaid');
      assert.equal(getPaymentStatus(10_000, 1), 'partial');
      assert.equal(getPaymentStatus(10_000, 10_000), 'paid');
      assert.equal(getPaymentStatus(10_000, 10_001), 'credit');
      assert.equal(getPaymentStatus(0, 1), 'credit');
    },
  },
  {
    name: 'RSVP going creates an event obligation while DNF and no RSVP do not',
    run: () => {
      const detail = makeDetail({
        events: [eventOne, eventTwo],
        rsvps: [
          makeRsvp('alice', eventOne.eventid),
          makeRsvp('alice', eventTwo.eventid),
        ],
        results: [makeDnfResult('alice', eventTwo.eventid)],
      });
      const model = buildLeaguePaymentViewModel(detail);
      const alice = model.players.find((player) => player.userid === 'alice');
      const bob = model.players.find((player) => player.userid === 'bob');
      assert.ok(alice);
      assert.ok(bob);
      assert.deepEqual(alice.eventCharges.map((charge) => charge.billedCents), [5_000, 0]);
      assert.deepEqual(bob.eventCharges.map((charge) => charge.billedCents), [0, 0]);
      assert.equal(alice.billedCents, 15_000);
      assert.equal(alice.applicableEventCount, 1);
      assert.equal(bob.billedCents, 10_000);
    },
  },
  {
    name: 'summary reconciles account-level collection, outstanding balances, and credits',
    run: () => {
      const detail = makeDetail({
        events: [eventOne],
        rsvps: [makeRsvp('alice', eventOne.eventid)],
        payments: [
          makePayment('alice-league', 'alice', 'league', 25),
          makePayment('alice-event', 'alice', 'event', 10, eventOne.eventid),
          makePayment('alice-other', 'alice', 'other', 5),
          makePayment('bob-credit', 'bob', 'league', 110),
        ],
      });
      const model = buildLeaguePaymentViewModel(detail);
      const alice = model.players.find((player) => player.userid === 'alice');
      const bob = model.players.find((player) => player.userid === 'bob');
      assert.ok(alice);
      assert.ok(bob);
      assert.equal(alice.status, 'partial');
      assert.equal(alice.paidCents, 4_000);
      assert.equal(alice.allocatedPaymentCents, 3_500);
      assert.equal(alice.unallocatedPaymentCents, 500);
      assert.equal(bob.status, 'credit');
      assert.deepEqual(model.summary, {
        totalBilledCents: 25_000,
        totalCollectedCents: 15_000,
        totalOutstandingCents: 11_000,
        totalCreditsCents: 1_000,
        collectionRateBasisPoints: 6_000,
        paidInFullCount: 0,
        partialCount: 1,
        unpaidCount: 0,
        notDueCount: 0,
        creditCount: 1,
      });
      assert.equal(
        model.summary.totalBilledCents,
        model.summary.totalCollectedCents + model.summary.totalOutstandingCents - model.summary.totalCreditsCents,
      );
    },
  },
  {
    name: 'only event-type payments linked to an event reconcile that event charge',
    run: () => {
      const detail = makeDetail({
        events: [eventOne],
        rsvps: [makeRsvp('alice', eventOne.eventid)],
        payments: [
          makePayment('unallocated-event', 'alice', 'event', 20),
          makePayment('linked-other', 'alice', 'other', 10, eventOne.eventid),
          makePayment('linked-league', 'alice', 'league', 25, eventOne.eventid),
          makePayment('linked-event', 'alice', 'event', 15, eventOne.eventid),
        ],
      });
      const model = buildLeaguePaymentViewModel(detail);
      const alice = model.players.find((player) => player.userid === 'alice');
      assert.ok(alice);
      assert.equal(alice.paidCents, 7_000);
      assert.equal(alice.eventCharges[0].paidCents, 1_500);
      assert.equal(alice.eventCharges[0].status, 'partial');
      assert.equal(model.events[0].collectedCents, 1_500);
    },
  },
  {
    name: 'non-positive legacy records do not reduce account collection',
    run: () => {
      const detail = makeDetail({
        payments: [
          makePayment('positive', 'alice', 'other', 12.34),
          makePayment('zero', 'alice', 'other', 0),
          makePayment('negative', 'alice', 'other', -5),
        ],
      });
      const alice = buildLeaguePaymentViewModel(detail).players.find((player) => player.userid === 'alice');
      assert.ok(alice);
      assert.equal(alice.paidCents, 1_234);
      assert.equal(alice.paymentCount, 1);
    },
  },
  {
    name: 'zero-fee seasons remain not due until a payment creates a credit',
    run: () => {
      const empty = makeDetail({
        league: { ...makeDetail().league, leaguefee: 0, pereventfee: 0 },
        seasons: [{ ...makeDetail().seasons[0], leaguefee: 0, pereventfee: 0 }],
      });
      const emptyModel = buildLeaguePaymentViewModel(empty);
      assert.equal(emptyModel.players[0].status, 'not_due');
      assert.equal(emptyModel.summary.collectionRateBasisPoints, 0);

      const creditedModel = buildLeaguePaymentViewModel({
        ...empty,
        payments: [makePayment('credit', 'alice', 'other', 1)],
      });
      assert.equal(creditedModel.players[0].status, 'credit');
      assert.equal(creditedModel.players[0].creditCents, 100);
    },
  },
  {
    name: 'collection rate retains overpayment information',
    run: () => {
      assert.equal(calculateCollectionRateBasisPoints(11_000, 10_000), 11_000);
    },
  },
  {
    name: 'search, status filters, and stable sorts use both real name and nickname',
    run: () => {
      const detail = makeDetail({
        payments: [
          makePayment('alice-partial', 'alice', 'league', 25),
          makePayment('bob-paid', 'bob', 'league', 100),
        ],
      });
      const players = buildLeaguePaymentViewModel(detail).players;
      assert.deepEqual(filterPlayerPaymentRows(players, 'partial').map((row) => row.userid), ['alice']);
      assert.deepEqual(filterPlayerPaymentRows(players, 'outstanding').map((row) => row.userid), ['alice']);
      assert.deepEqual(filterPlayerPaymentRows(players, 'all', 'ace high').map((row) => row.userid), ['alice']);
      assert.deepEqual(sortPlayerPaymentRows(players, 'paid-desc').map((row) => row.userid), ['bob', 'alice']);
      assert.deepEqual(selectPlayerPaymentRows(players, { search: 'brandon', sort: 'name-asc' }).map((row) => row.userid), ['bob']);
    },
  },
];

for (const test of tests) {
  test.run();
  console.log(`PASS ${test.name}`);
}

console.log(`\n${tests.length} league payment view-model tests passed.`);

function makeDetail(overrides: Partial<LeagueDetail> = {}): LeagueDetail {
  return {
    league: {
      leagueid: 'league-1',
      ownerid: 'owner',
      name: 'Test League',
      invitecode: 'TEST',
      approvalneeded: false,
      expectedplayercount: 2,
      leaguefee: 100,
      pereventfee: 50,
      showupbonuspoints: 0,
      bestfinishcount: 1,
      pointslookup: [],
      finalenabled: false,
      finalmultiplierlookup: [],
      finalchiprounding: 100,
      finalstartingbigblind: 100,
      memberledgervisible: false,
      active: true,
      createdat: '2026-01-01T00:00:00Z',
      isadmin: true,
    },
    seasons: [{
      seasonid: 'season-1',
      leagueid: 'league-1',
      name: 'Season 2027',
      begindate: '2026-08-01',
      enddate: '2027-05-31',
      leaguefee: null,
      pereventfee: 50,
      active: true,
      createdat: '2026-01-01T00:00:00Z',
    }],
    selectedseasonid: 'season-1',
    members: [
      { userid: 'alice', displayname: 'Alice Adams (Ace High)', isadmin: false, approved: true, participating: true },
      { userid: 'bob', displayname: 'Brandon Clark (RandomBrandon)', isadmin: false, approved: true, participating: true },
    ],
    events: [],
    results: [],
    payments: [],
    rsvps: [],
    auditlog: [],
    standings: [],
    finalstacks: [],
    ...overrides,
  };
}

function makeEvent(eventid: string, name: string, eventnumber: number): LeagueEvent {
  return {
    eventid,
    leagueid: 'league-1',
    seasonid: 'season-1',
    name,
    eventnumber,
    eventdate: `2026-0${eventnumber + 7}-01`,
    active: true,
    createdat: '2026-01-01T00:00:00Z',
  };
}

function makePayment(
  paymentid: string,
  userid: string,
  paymenttype: LeaguePayment['paymenttype'],
  amount: number,
  eventid: string | null = null,
): LeaguePayment {
  return {
    paymentid,
    leagueid: 'league-1',
    seasonid: 'season-1',
    userid,
    eventid,
    paymenttype,
    amount,
    paidat: '2026-08-01',
    createdat: '2026-08-01T00:00:00Z',
  };
}

function makeRsvp(userid: string, eventid: string) {
  return {
    rsvpid: `rsvp-${userid}-${eventid}`,
    eventid,
    leagueid: 'league-1',
    userid,
    status: 'going',
    createdat: '2026-08-01T00:00:00Z',
    updatedat: '2026-08-01T00:00:00Z',
  };
}

function makeDnfResult(userid: string, eventid: string) {
  return {
    resultid: `result-${userid}-${eventid}`,
    eventid,
    leagueid: 'league-1',
    userid,
    dnf: true,
    points: 0,
    showupbonuspoints: 0,
    createdat: '2026-08-01T00:00:00Z',
    updatedat: '2026-08-01T00:00:00Z',
  };
}
