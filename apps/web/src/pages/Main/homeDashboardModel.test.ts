import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  GameListItem,
  LeagueScheduleEvent,
  Tournament,
} from "../../api/client";
import {
  buildHomeSchedule,
  cashDateTime,
  dashboardDate,
  dashboardDisplayName,
  dashboardWallTime,
  getAppScheduleSortKey,
} from "./homeDashboardModel";

const now = new Date("2026-09-04T16:00:00Z");
const tournament = (patch: Partial<Tournament> = {}): Tournament => ({
  tournamentid: "t-1",
  ownerid: "host",
  name: "Friday Poker",
  tourneydate: "2026-09-05",
  tourneytime: "19:30:00",
  buyin: 40,
  rebuyprice: 0,
  rebuychips: 0,
  addonprice: 0,
  addonchips: 0,
  maxplayers: 12,
  playerselftracking: false,
  active: true,
  createdat: "",
  playercount: 4,
  canmanage: true,
  ...patch,
});
const league = (
  patch: Partial<LeagueScheduleEvent> = {},
): LeagueScheduleEvent => ({
  leagueid: "league-1",
  leaguename: "QA Coastal League",
  eventid: "event-1",
  name: "Event #2",
  eventdate: "2026-09-05",
  eventtime: "19:30:00",
  eventfee: 50,
  isadmin: true,
  goingcount: 5,
  seasonplayercount: 30,
  seasonid: "season-27",
  seasonname: "Season 2027",
  ...patch,
});
const cash = (patch: Partial<GameListItem> = {}): GameListItem => ({
  id: "cash-1",
  groupid: "group-1",
  createdbyuserid: "host",
  gametype: "cash",
  title: "Cash Night",
  status: "scheduled",
  visibility: "group_public",
  startsat: "2026-09-06T23:30:00Z",
  createdat: "",
  updatedat: "",
  canmanage: true,
  stakeslabel: "$1 / $2",
  minbuyin: 40,
  maxbuyin: 200,
  seatsavailable: 8,
  playercount: 3,
  ...patch,
});
const sources = (
  tournaments: Tournament[] = [],
  leagueEvents: LeagueScheduleEvent[] = [],
  games: GameListItem[] = [],
) => ({ tournaments, leagueEvents, games });

test("canonical linked identity keeps league season and event context once across three sources", () => {
  const result = buildHomeSchedule(
    sources(
      [tournament()],
      [league({ tournamentid: "t-1" })],
      [cash({ gametype: "tournament", tournamentid: "t-1" })],
    ),
    now,
  );
  assert.equal(result.all.length, 1);
  assert.equal(result.next?.kind, "league");
  assert.equal(
    result.next?.href,
    "/?section=leagues&league=league-1&leagueTab=events&event=event-1&season=season-27",
  );
  assert.equal(result.next?.detailsHref, "/lobby/t-1");
  assert.equal(result.next?.cost, "$50 event fee");
  assert.equal(result.next?.attendance, "5 / 30 going");
  assert.equal(result.upcoming.length, 0);
});

test("authoritative running beats a nearer upcoming record; scheduled clock alone is never live", () => {
  const result = buildHomeSchedule(
    sources([
      tournament({ tournamentid: "future" }),
      tournament({
        tournamentid: "running",
        tourneydate: "2026-09-01",
        running: true,
        hasstarted: true,
      }),
      tournament({
        tournamentid: "passed-clock",
        tourneydate: "2026-09-04",
        tourneytime: "11:00:00",
      }),
    ]),
    now,
  );
  assert.equal(result.next?.id, "tournament-running");
  assert.equal(result.next?.status, "live");
  assert.equal(result.next?.action, "Run Game");
  assert.deepEqual(result.next?.state, { tab: "run" });
  assert.deepEqual(
    result.upcoming.map((item) => item.id),
    ["tournament-future"],
  );
});

test("paused started tournaments stay resumable, and unstarted future clocks remain upcoming", () => {
  const result = buildHomeSchedule(
    sources([
      tournament({
        tournamentid: "paused",
        tourneydate: "2026-09-02",
        running: false,
        hasstarted: true,
      }),
      tournament({
        tournamentid: "unstarted",
        running: false,
        hasstarted: false,
      }),
    ]),
    now,
  );
  assert.equal(result.next?.status, "paused");
  assert.equal(result.next?.action, "Resume Game");
  assert.equal(result.upcoming[0]?.status, "upcoming");
});

test("completed and cancelled games never populate hero, including linked completed tournament fallbacks", () => {
  const result = buildHomeSchedule(
    sources(
      [tournament({ completed: true })],
      [league({ tournamentid: "t-1" })],
      [
        cash({ status: "cancelled" }),
        cash({ id: "completed", status: "completed" }),
      ],
    ),
    now,
  );
  assert.equal(result.next, null);
  assert.deepEqual(result.upcoming, []);
});

test("members receive actual player routes and no management action", () => {
  const tournamentResult = buildHomeSchedule(
    sources([tournament({ canmanage: false })]),
    now,
  ).next!;
  assert.equal(tournamentResult.href, "/lobby/t-1");
  assert.equal(tournamentResult.action, "Open Lobby");
  assert.equal(tournamentResult.detailsHref, undefined);
  assert.equal(tournamentResult.state, undefined);
  const leagueResult = buildHomeSchedule(
    sources([], [league({ isadmin: false })]),
    now,
  ).next!;
  assert.equal(leagueResult.href, "/league/league-1/event/event-1");
  const cashResult = buildHomeSchedule(
    sources([], [], [cash({ canmanage: false })]),
    now,
  ).next!;
  assert.equal(cashResult.href, "/cash-games/cash-1/admin");
  assert.equal(cashResult.action, "View Game");
});

test("cash instant dates sort in the app timezone, with real stakes and buy-in range", () => {
  const result = buildHomeSchedule(
    sources(
      [tournament({ tourneydate: "2026-09-05", tourneytime: "20:30:00" })],
      [],
      [cash({ startsat: "2026-09-06T00:00:00Z" })],
    ),
    now,
  );
  assert.equal(result.next?.id, "cash-cash-1");
  assert.equal(result.next?.date, "2026-09-05");
  assert.equal(result.next?.time, "20:00:00");
  assert.equal(result.next?.cost, "$1 / $2 stakes · $40–$200 buy-in");
  assert.equal(result.next?.attendance, "3 / 8 players");
});

test("cash active state stays live regardless of its scheduled time and missing metrics are omitted", () => {
  const result = buildHomeSchedule(
    sources(
      [],
      [],
      [
        cash({
          status: "active",
          startsat: "2026-08-01T19:30:00",
          playercount: undefined,
          minbuyin: undefined,
          maxbuyin: undefined,
          stakeslabel: null,
        }),
      ],
    ),
    now,
  );
  assert.equal(result.next?.status, "live");
  assert.equal(result.next?.attendance, null);
  assert.equal(result.next?.cost, null);
});

test("dates without a time remain eligible on their local day and undated games follow dated ones", () => {
  const result = buildHomeSchedule(
    sources([
      tournament({
        tournamentid: "undated",
        tourneydate: null,
        tourneytime: null,
      }),
      tournament({
        tournamentid: "today",
        tourneydate: "2026-09-04",
        tourneytime: null,
      }),
    ]),
    now,
  );
  assert.equal(result.next?.id, "tournament-today");
  assert.equal(result.upcoming[0]?.id, "tournament-undated");
  assert.equal(dashboardDate("2026-09-05"), "Sep 5, 2026");
});

test("zero, one, and many games never duplicate Next Up in the bounded preview source", () => {
  assert.equal(buildHomeSchedule(sources(), now).next, null);
  assert.equal(
    buildHomeSchedule(sources([tournament()]), now).upcoming.length,
    0,
  );
  const result = buildHomeSchedule(
    sources(
      Array.from({ length: 8 }, (_, index) =>
        tournament({
          tournamentid: `t-${index}`,
          tourneydate: `2026-09-${String(index + 5).padStart(2, "0")}`,
        }),
      ),
    ),
    now,
  );
  assert.equal(result.all.length, 8);
  assert.equal(result.upcoming.length, 7);
  assert.ok(
    !result.upcoming.some(
      (item) => item.canonicalId === result.next?.canonicalId,
    ),
  );
});

test("second live game is not labeled as an additional upcoming game", () => {
  const result = buildHomeSchedule(
    sources(
      [tournament({ running: true, hasstarted: true })],
      [],
      [cash({ status: "active" })],
    ),
    now,
  );
  assert.equal(result.all.length, 2);
  assert.equal(result.upcoming.length, 0);
});

test("Home and Games share local cash dates and preserve seconds at the eligibility boundary", () => {
  const instant = cashDateTime("2026-09-06T00:00:30Z");
  const offset = cashDateTime("2026-09-05T20:00:30-04:00");
  const local = cashDateTime("2026-09-05T20:00:30");
  assert.deepEqual(instant, { date: "2026-09-05", time: "20:00:30" });
  assert.deepEqual(offset, instant);
  assert.deepEqual(local, instant);
  assert.equal(
    getAppScheduleSortKey(instant.date, instant.time),
    "2026-09-05T20:00:30",
  );
  assert.equal(
    getAppScheduleSortKey("2026-09-05", "20:00"),
    "2026-09-05T20:00:00",
  );
  assert.equal(
    getAppScheduleSortKey("2026-09-05", null),
    "2026-09-05T23:59:59",
  );
  const fixture = sources([], [], [cash({ startsat: "2026-09-06T00:00:30Z" })]);
  assert.equal(
    buildHomeSchedule(fixture, new Date("2026-09-06T00:00:15Z")).next?.status,
    "upcoming",
  );
  assert.equal(
    buildHomeSchedule(fixture, new Date("2026-09-06T00:00:30Z")).next?.status,
    "upcoming",
  );
  assert.equal(
    buildHomeSchedule(fixture, new Date("2026-09-06T00:00:31Z")).next,
    null,
  );
});

test("generic tournament references keep their real route without cash-player metrics", () => {
  const result = buildHomeSchedule(
    sources(
      [],
      [],
      [
        cash({
          gametype: "tournament",
          tournamentid: "linked-tournament",
          canmanage: false,
        }),
      ],
    ),
    now,
  );
  assert.equal(result.next?.href, "/lobby/linked-tournament");
  assert.equal(result.next?.kind, "tournament");
  assert.equal(result.next?.attendance, null);
  assert.equal(result.next?.cost, null);
});

test("greeting respects nickname and never falls back to email identity", () => {
  assert.equal(
    dashboardDisplayName({
      tablename: " Ace ",
      displayname: "Alex Morgan",
      emailaddress: "person@example.test",
    }),
    "Ace",
  );
  assert.equal(
    dashboardDisplayName({
      displayname: "Alex Morgan",
      emailaddress: "person@example.test",
    }),
    "Alex Morgan",
  );
  assert.equal(
    dashboardDisplayName({
      displayname: "person@example.test",
      emailaddress: "person@example.test",
    }),
    null,
  );
  assert.equal(dashboardDisplayName(undefined), null);
  assert.equal(
    dashboardWallTime(new Date("2026-09-05T01:00:00Z")),
    "2026-09-04T21:00:00",
  );
});
