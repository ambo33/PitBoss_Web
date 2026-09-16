import type {
  AuthProfile,
  GameListItem,
  LeagueScheduleEvent,
  Tournament,
} from "../../api/client";
import { isEnabledFlag } from "../../utils/flags";

export const DASHBOARD_TIMEZONE = "America/New_York";

type LiveFields = { running?: boolean; hasstarted?: boolean };
type ScheduleLeague = LeagueScheduleEvent &
  LiveFields & { seasonid?: string | null; seasonname?: string | null };

export interface HomeGame {
  id: string;
  canonicalId: string;
  kind: "tournament" | "cash" | "league";
  title: string;
  context?: string | null;
  date: string | null;
  time: string | null;
  season?: string | null;
  attendance: string | null;
  cost: string | null;
  status: "upcoming" | "live" | "paused";
  canManage: boolean;
  href: string;
  action: string;
  state?: { tab: "run"; demoCoach?: "start" };
  detailsHref?: string;
}

export function dashboardDisplayName(
  profile?: Pick<AuthProfile, "tablename" | "displayname" | "emailaddress">,
): string | null {
  const value = profile?.tablename?.trim() || profile?.displayname?.trim();
  return value && value !== profile?.emailaddress && !value.includes("@")
    ? value
    : null;
}

export function dashboardWallTime(now = new Date()): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: DASHBOARD_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
}

export function dashboardDate(date: string | null, long = false): string {
  if (!date) return "Date to be announced";
  const value = new Date(`${date.slice(0, 10)}T12:00:00`);
  if (!Number.isFinite(value.getTime())) return "Date to be announced";
  return new Intl.DateTimeFormat("en-US", {
    ...(long ? { weekday: "short" as const } : {}),
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(value);
}

export function dashboardTime(time: string | null): string | null {
  const match = time?.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hour = Number(match[1]);
  return `${hour % 12 || 12}:${match[2]} ${hour >= 12 ? "PM" : "AM"}`;
}

export function cashDateTime(value?: string | null) {
  if (!value) return { date: null, time: null };
  // Explicit offsets are instants; offset-free values already use the app's wall clock.
  const normalized =
    /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value) &&
    Number.isFinite(new Date(value).getTime())
      ? dashboardWallTime(new Date(value))
      : value;
  return {
    date: normalized.slice(0, 10),
    time: normalized.length >= 16 ? normalized.slice(11, 19) : null,
  };
}

export function getAppScheduleSortKey(
  date?: string | null,
  time?: string | null,
): string {
  return `${date?.slice(0, 10) || "9999-12-31"}T${(time || "23:59:59").slice(0, 8).padEnd(8, ":00")}`;
}

function money(value: unknown): string | null {
  if (value == null || value === "") return null;
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: amount % 1 ? 2 : 0,
  }).format(amount);
}

function count(value: unknown): number | null {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function attendance(current: unknown, capacity: unknown, noun: string) {
  const currentCount = count(current);
  const maximum = count(capacity);
  if (currentCount == null) return null;
  return `${currentCount.toLocaleString()}${maximum != null && maximum > 0 ? ` / ${maximum.toLocaleString()}` : ""} ${noun}`;
}

function liveStatus(record: LiveFields): HomeGame["status"] {
  return isEnabledFlag(record.running)
    ? "live"
    : isEnabledFlag(record.hasstarted)
      ? "paused"
      : "upcoming";
}

function tournamentGame(tournament: Tournament & LiveFields): HomeGame | null {
  if (isEnabledFlag(tournament.completed) || tournament.active === false)
    return null;
  const canManage = isEnabledFlag(tournament.canmanage);
  const status = liveStatus(tournament);
  const id = encodeURIComponent(tournament.tournamentid);
  const buyIn = money(tournament.buyin);
  return {
    id: `tournament-${tournament.tournamentid}`,
    canonicalId: `tournament:${tournament.tournamentid}`,
    kind: "tournament",
    title: tournament.name,
    context: tournament.groupname,
    date: tournament.tourneydate?.slice(0, 10) ?? null,
    time: tournament.tourneytime ?? null,
    status,
    canManage,
    attendance: attendance(
      tournament.playercount,
      tournament.maxplayers,
      "registered",
    ),
    cost: buyIn == null ? null : `${buyIn} buy-in`,
    href: canManage ? `/tournament/${id}` : `/lobby/${id}`,
    action: canManage
      ? status === "paused"
        ? "Resume Game"
        : status === "live"
          ? "Run Game"
          : "Manage Game"
      : "Open Lobby",
    ...(canManage && status !== "upcoming"
      ? { state: { tab: "run" as const } }
      : {}),
    ...(canManage ? { detailsHref: `/lobby/${id}` } : {}),
  };
}

function leagueGame(
  event: ScheduleLeague,
  linked?: Tournament & LiveFields,
): HomeGame | null {
  if (isEnabledFlag(event.completed) || isEnabledFlag(linked?.completed))
    return null;
  const canManage = isEnabledFlag(event.isadmin);
  const status = liveStatus({
    running: event.running ?? linked?.running,
    hasstarted: event.hasstarted ?? linked?.hasstarted,
  });
  const query = new URLSearchParams({
    section: "leagues",
    league: event.leagueid,
    leagueTab: "events",
    event: event.eventid,
  });
  if (event.seasonid) query.set("season", event.seasonid);
  const playerHref = event.tournamentid
    ? `/lobby/${encodeURIComponent(event.tournamentid)}`
    : `/league/${encodeURIComponent(event.leagueid)}/event/${encodeURIComponent(event.eventid)}`;
  const fee = money(event.eventfee);
  // League-admin authority is not an inference that the tournament route is authorized.
  return {
    id: `league-${event.leagueid}-${event.eventid}`,
    canonicalId: event.tournamentid
      ? `tournament:${event.tournamentid}`
      : `league:${event.leagueid}:${event.eventid}`,
    kind: "league",
    title: event.name,
    context: event.leaguename,
    date: event.eventdate?.slice(0, 10) ?? null,
    time: event.eventtime ?? null,
    season: event.seasonname,
    status,
    canManage,
    attendance: attendance(event.goingcount, event.seasonplayercount, "going"),
    cost: fee == null ? null : `${fee} event fee`,
    href: canManage ? `/?${query}` : playerHref,
    action: canManage ? "Manage Game" : "Open Lobby",
    ...(canManage ? { detailsHref: playerHref } : {}),
  };
}

function gameRecord(game: GameListItem): HomeGame | null {
  if (game.status === "completed" || game.status === "cancelled") return null;
  const canManage = isEnabledFlag(game.canmanage);
  const dateTime = cashDateTime(game.startsat);
  const cash = game.gametype === "cash";
  if (!cash && !game.tournamentid) return null;
  const href = cash
    ? `/cash-games/${encodeURIComponent(game.id)}/admin`
    : `/${canManage ? "tournament" : "lobby"}/${encodeURIComponent(game.tournamentid!)}`;
  const min = money(game.minbuyin);
  const max = money(game.maxbuyin);
  const buyIn =
    min && max
      ? `${min}–${max} buy-in`
      : min
        ? `${min} minimum buy-in`
        : max
          ? `${max} maximum buy-in`
          : null;
  return {
    id: `${cash ? "cash" : "game"}-${game.id}`,
    canonicalId: game.tournamentid
      ? `tournament:${game.tournamentid}`
      : `cash:${game.id}`,
    kind: cash ? "cash" : "tournament",
    title: game.title,
    context: game.groupname,
    ...dateTime,
    status: game.status === "active" ? "live" : "upcoming",
    canManage,
    // This endpoint counts cashgameplayers, not tournament registrations.
    attendance: cash
      ? attendance(game.playercount, game.seatsavailable, "players")
      : null,
    cost: cash
      ? [game.stakeslabel ? `${game.stakeslabel} stakes` : null, buyIn]
          .filter(Boolean)
          .join(" · ") || null
      : null,
    href,
    action: canManage ? "Manage Game" : cash ? "View Game" : "Open Lobby",
  };
}

export function buildHomeSchedule(
  sources: {
    tournaments: Tournament[];
    games: GameListItem[];
    leagueEvents: LeagueScheduleEvent[];
  },
  now = new Date(),
): { next: HomeGame | null; upcoming: HomeGame[]; all: HomeGame[] } {
  const tournaments = new Map(
    sources.tournaments.map((tournament) => [
      tournament.tournamentid,
      tournament,
    ]),
  );
  const linkedIds = new Set(
    sources.leagueEvents.flatMap((event) =>
      event.tournamentid ? [event.tournamentid] : [],
    ),
  );
  const candidates = [
    ...sources.leagueEvents.map((event) =>
      leagueGame(
        event,
        event.tournamentid ? tournaments.get(event.tournamentid) : undefined,
      ),
    ),
    ...sources.tournaments
      .filter((tournament) => !linkedIds.has(tournament.tournamentid))
      .map(tournamentGame),
    ...sources.games
      .filter(
        (game) =>
          !game.tournamentid ||
          (!linkedIds.has(game.tournamentid) &&
            !tournaments.has(game.tournamentid)),
      )
      .map(gameRecord),
  ];
  const wallNow = dashboardWallTime(now);
  const unique = new Map<string, HomeGame>();
  for (const item of candidates) {
    if (!item || unique.has(item.canonicalId)) continue;
    // A passed scheduled time never makes a game live. Date-only records remain upcoming through their local day.
    const scheduled = item.date
      ? getAppScheduleSortKey(item.date, item.time)
      : null;
    if (item.status === "upcoming" && scheduled && scheduled < wallNow)
      continue;
    unique.set(item.canonicalId, item);
  }
  const all = [...unique.values()].sort((a, b) => {
    const aOngoing = a.status !== "upcoming";
    const bOngoing = b.status !== "upcoming";
    if (aOngoing !== bOngoing) return aOngoing ? -1 : 1;
    if (aOngoing && a.canManage !== b.canManage) return a.canManage ? -1 : 1;
    return (
      getAppScheduleSortKey(a.date, a.time).localeCompare(
        getAppScheduleSortKey(b.date, b.time),
      ) || a.canonicalId.localeCompare(b.canonicalId)
    );
  });
  const next = all[0] ?? null;
  return {
    next,
    all,
    upcoming: all.filter(
      (item) =>
        item.status === "upcoming" && item.canonicalId !== next?.canonicalId,
    ),
  };
}
