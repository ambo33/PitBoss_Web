import type {
  LeagueDetail,
  LeagueEvent,
  LeagueEventRsvp,
  LeagueMember,
  LeagueResult,
} from "../../api/client";
import {
  buildLeaguePaymentViewModel,
  calculateCompletionBasisPoints,
  getSeasonEventFeeCents,
  type LeaguePaymentCharge,
  type LeaguePlayerIdentity,
  type LeaguePlayerPaymentRow,
} from "./leaguePaymentViewModel";

export type EventRosterMode = "attendance" | "fees" | "results";
export type EventRosterFilter =
  | "all"
  | "going"
  | "declined"
  | "awaiting"
  | "unpaid"
  | "paid"
  | "partial"
  | "missing"
  | "finished"
  | "dnf";
export type EventRosterSort = "name" | "rsvp" | "fee" | "balance" | "finish";
export type EventRosterStatus =
  | "upcoming"
  | "current"
  | "completed"
  | "past"
  | "unscheduled"
  | "unavailable";
export type EventRosterRsvpStatus = "going" | "not_going" | "awaiting";

export interface EventRosterRow {
  userid: string;
  member: LeagueMember;
  identity: LeaguePlayerIdentity;
  rsvpStatus: EventRosterRsvpStatus;
  result: LeagueResult | null;
  finish: "missing" | "placed" | "dnf";
  placed: number | null;
  points: number | null;
  eventCharge: LeaguePaymentCharge;
  leagueCharge: LeaguePaymentCharge;
  paymentRow: LeaguePlayerPaymentRow;
  paidDate: string | null;
  canMarkPaid: boolean;
  availablePlaces: number[];
}

export interface EventRosterSummary {
  playerCount: number;
  goingCount: number;
  declinedCount: number;
  awaitingCount: number;
  eventFeeCents: number;
  billedCents: number;
  collectedCents: number;
  outstandingCents: number;
  creditCents: number;
  collectionBasisPoints: number;
  paidCount: number;
  partialCount: number;
  unpaidCount: number;
  recordedCount: number;
  missingCount: number;
  goingRecordedCount: number;
  winnerRecorded: boolean;
}

export interface EventRosterModel {
  event: LeagueEvent;
  rows: EventRosterRow[];
  summary: EventRosterSummary;
}

export function buildEventRosterModel(
  detail: LeagueDetail,
  event: LeagueEvent,
): EventRosterModel {
  const payments = buildLeaguePaymentViewModel(detail);
  const rsvpByUser = new Map(
    detail.rsvps
      .filter((rsvp) => rsvp.eventid === event.eventid)
      .map((rsvp) => [rsvp.userid, rsvp]),
  );
  const resultsByUser = new Map(
    detail.results
      .filter((result) => result.eventid === event.eventid)
      .map((result) => [result.userid, result]),
  );
  const goingIds = new Set(
    payments.players
      .filter((player) => rsvpByUser.get(player.userid)?.status === "going")
      .map((player) => player.userid),
  );
  const placementResults = [...resultsByUser.values()].filter((result) =>
    goingIds.has(result.userid),
  );
  const rows: EventRosterRow[] = payments.players.map((paymentRow) => {
    // Event obligations and all balances come from the same ledger as Payments.
    const eventCharge = paymentRow.eventCharges.find(
      (charge) => charge.event?.eventid === event.eventid,
    );
    if (!eventCharge)
      throw new Error("The selected event is not in the loaded league season.");
    const result = resultsByUser.get(paymentRow.userid) ?? null;
    const placed = validPlace(result?.placed);
    const finish = result?.dnf ? "dnf" : placed === null ? "missing" : "placed";
    const rsvpStatus = normalizeRsvp(rsvpByUser.get(paymentRow.userid));
    const otherResults = placementResults.filter(
      (item) => item.userid !== paymentRow.userid,
    );
    const placementLimit = Math.max(
      0,
      goingIds.size - otherResults.filter((item) => item.dnf).length,
    );
    const usedPlaces = new Set(
      otherResults
        .filter((item) => !item.dnf)
        .map((item) => validPlace(item.placed))
        .filter((place) => place !== null),
    );
    const availablePlaces =
      rsvpStatus === "going"
        ? Array.from(
            { length: placementLimit },
            (_, index) => index + 1,
          ).filter((place) => !usedPlaces.has(place))
        : [];
    const paidDates = paymentRow.payments
      .filter(
        (payment) =>
          payment.paymenttype === "event" &&
          payment.eventid === event.eventid &&
          Number(payment.amount) > 0,
      )
      .map((payment) => payment.paidat)
      .filter(Boolean)
      .sort();
    return {
      userid: paymentRow.userid,
      member: paymentRow.member,
      identity: paymentRow.identity,
      rsvpStatus,
      result,
      finish,
      placed,
      points:
        finish === "missing"
          ? null
          : finiteNumber(result?.points) +
            finiteNumber(result?.showupbonuspoints),
      eventCharge,
      leagueCharge: paymentRow.seasonCharge,
      paymentRow,
      paidDate: paidDates[paidDates.length - 1] ?? null,
      canMarkPaid:
        event.active !== false &&
        eventCharge.billedCents > 0 &&
        eventCharge.outstandingCents > 0,
      availablePlaces,
    };
  });
  const goingCount = rows.filter((row) => row.rsvpStatus === "going").length;
  const declinedCount = rows.filter(
    (row) => row.rsvpStatus === "not_going",
  ).length;
  const billedCents = sumCharges(rows, "billedCents");
  const collectedCents = sumCharges(rows, "paidCents");
  const recordedCount = rows.filter((row) => row.finish !== "missing").length;
  return {
    event,
    rows,
    summary: {
      playerCount: rows.length,
      goingCount,
      declinedCount,
      awaitingCount: rows.length - goingCount - declinedCount,
      eventFeeCents: getSeasonEventFeeCents(detail),
      billedCents,
      collectedCents,
      outstandingCents: sumCharges(rows, "outstandingCents"),
      creditCents: sumCharges(rows, "creditCents"),
      collectionBasisPoints: calculateCompletionBasisPoints(
        collectedCents,
        billedCents,
      ),
      paidCount: rows.filter(
        (row) =>
          row.eventCharge.billedCents > 0 &&
          row.eventCharge.outstandingCents === 0,
      ).length,
      partialCount: rows.filter((row) => row.eventCharge.status === "partial")
        .length,
      unpaidCount: rows.filter((row) => row.eventCharge.outstandingCents > 0)
        .length,
      recordedCount,
      missingCount: rows.length - recordedCount,
      goingRecordedCount: rows.filter(
        (row) => row.rsvpStatus === "going" && row.finish !== "missing",
      ).length,
      winnerRecorded: rows.some(
        (row) => row.finish === "placed" && row.placed === 1,
      ),
    },
  };
}

export function selectEventRosterRows(
  rows: readonly EventRosterRow[],
  options: {
    filter?: EventRosterFilter;
    search?: string;
    sort?: EventRosterSort;
  } = {},
): EventRosterRow[] {
  const search = normalizeSearch(options.search ?? "");
  const selected = rows.filter(
    (row) =>
      (!search || row.identity.searchText.includes(search)) &&
      matchesFilter(row, options.filter ?? "all"),
  );
  const rsvpOrder = { going: 0, awaiting: 1, not_going: 2 };
  const feeOrder = { unpaid: 0, partial: 1, paid: 2, credit: 3, not_due: 4 };
  return selected.sort((left, right) => {
    let order = 0;
    switch (options.sort ?? "name") {
      case "rsvp":
        order = rsvpOrder[left.rsvpStatus] - rsvpOrder[right.rsvpStatus];
        break;
      case "fee":
        order =
          feeOrder[left.eventCharge.status] -
          feeOrder[right.eventCharge.status];
        break;
      case "balance":
        order =
          right.leagueCharge.outstandingCents -
          left.leagueCharge.outstandingCents;
        break;
      case "finish":
        order = finishSortValue(left) - finishSortValue(right);
        break;
      case "name":
        break;
    }
    return (
      order ||
      left.identity.name.localeCompare(right.identity.name, undefined, {
        sensitivity: "base",
      }) ||
      left.userid.localeCompare(right.userid)
    );
  });
}

/** Existing events contain local wall-clock date/time, not a timestamp with a zone. */
export function getEventTimestamp(event: LeagueEvent): number | null {
  const date = String(event.eventdate ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const time = String(event.eventtime ?? "23:59:59").slice(0, 8);
  if (!/^\d{2}:\d{2}(:\d{2})?$/.test(time)) return null;
  const timestamp = new Date(`${date}T${time}`).getTime();
  if (!Number.isFinite(timestamp)) return null;
  const parsed = new Date(timestamp);
  // Date accepts impossible calendar dates by rolling them into the next month.
  if (
    parsed.getFullYear() !== Number(date.slice(0, 4)) ||
    parsed.getMonth() + 1 !== Number(date.slice(5, 7)) ||
    parsed.getDate() !== Number(date.slice(8, 10))
  )
    return null;
  return timestamp;
}

export function sortLeagueRosterEvents(
  events: readonly LeagueEvent[],
): LeagueEvent[] {
  return [...events].sort((left, right) => {
    const dateOrder =
      (getEventTimestamp(left) ?? Number.POSITIVE_INFINITY) -
      (getEventTimestamp(right) ?? Number.POSITIVE_INFINITY);
    return (
      (Number.isNaN(dateOrder) ? 0 : dateOrder) ||
      (left.eventnumber ?? Number.MAX_SAFE_INTEGER) -
        (right.eventnumber ?? Number.MAX_SAFE_INTEGER) ||
      left.name.localeCompare(right.name) ||
      left.eventid.localeCompare(right.eventid)
    );
  });
}

export function selectLeagueRosterEvent(
  events: readonly LeagueEvent[],
  requestedEventId?: string | null,
  now: Date | number = new Date(),
  completedEventIds: ReadonlySet<string> = new Set(),
): LeagueEvent | null {
  const available = sortLeagueRosterEvents(
    events.filter((event) => event.active !== false),
  );
  const requested = available.find(
    (event) => event.eventid === requestedEventId,
  );
  if (requested) return requested;
  const timestamp = Number(now);
  const upcoming = available.find((event) => {
    const start = getEventTimestamp(event);
    return (
      start !== null &&
      start >= timestamp &&
      !completedEventIds.has(event.eventid)
    );
  });
  const completed = available.filter((event) =>
    completedEventIds.has(event.eventid),
  );
  // An undated event cannot outrank the most recently dated completion.
  const datedCompleted = completed.filter(
    (event) => getEventTimestamp(event) !== null,
  );
  return (
    upcoming ??
    datedCompleted[datedCompleted.length - 1] ??
    completed[completed.length - 1] ??
    available[0] ??
    null
  );
}

/** Uses already-loaded results; no speculative completion date or new fetch. */
export function getCompletedLeagueEventIds(detail: LeagueDetail): Set<string> {
  const participantIds = new Set(
    detail.members
      .filter((member) => member.approved && member.participating)
      .map((member) => member.userid),
  );
  const goingByEvent = new Map<string, Set<string>>();
  const resultsByEvent = new Map<string, LeagueResult[]>();
  for (const rsvp of detail.rsvps) {
    if (rsvp.status !== "going" || !participantIds.has(rsvp.userid)) continue;
    const ids = goingByEvent.get(rsvp.eventid) ?? new Set<string>();
    ids.add(rsvp.userid);
    goingByEvent.set(rsvp.eventid, ids);
  }
  for (const result of detail.results) {
    if (!participantIds.has(result.userid) || !hasRecordedFinish(result))
      continue;
    const results = resultsByEvent.get(result.eventid) ?? [];
    results.push(result);
    resultsByEvent.set(result.eventid, results);
  }
  return new Set(
    detail.events
      .filter((event) => {
        const results = resultsByEvent.get(event.eventid) ?? [];
        if (event.tournamentid)
          return results.some(
            (result) => !result.dnf && validPlace(result.placed) === 1,
          );
        const going = goingByEvent.get(event.eventid);
        return Boolean(
          going?.size &&
            [...going].every((userid) =>
              results.some((result) => result.userid === userid),
            ),
        );
      })
      .map((event) => event.eventid),
  );
}

export function getEventRosterStatus(
  event: LeagueEvent,
  summary?: EventRosterSummary,
  now: Date | number = new Date(),
): EventRosterStatus {
  if (event.active === false) return "unavailable";
  const complete = event.tournamentid
    ? summary?.winnerRecorded
    : summary &&
      summary.goingCount > 0 &&
      summary.goingRecordedCount === summary.goingCount;
  if (complete) return "completed";
  const timestamp = getEventTimestamp(event);
  if (timestamp !== null && timestamp > Number(now)) return "upcoming";
  if (event.hasstarted || (summary?.goingRecordedCount ?? 0) > 0)
    return "current";
  return timestamp === null ? "unscheduled" : "past";
}

export function getRosterDefaultMode(
  event: LeagueEvent,
  summary: EventRosterSummary,
  now: Date | number = new Date(),
): EventRosterMode {
  const timestamp = getEventTimestamp(event);
  const currentDate = new Date(Number(now));
  const startOfToday = new Date(
    currentDate.getFullYear(),
    currentDate.getMonth(),
    currentDate.getDate(),
  ).getTime();
  // No event end timestamp is exposed. A start earlier today is not proof the
  // event has ended, so keep live operations on Attendance unless URL state wins.
  const pastDay = timestamp !== null && timestamp < startOfToday;
  return pastDay && summary.goingCount > summary.goingRecordedCount
    ? "results"
    : "attendance";
}

function normalizeRsvp(rsvp?: LeagueEventRsvp): EventRosterRsvpStatus {
  return rsvp?.status === "going" || rsvp?.status === "not_going"
    ? rsvp.status
    : "awaiting";
}

function validPlace(value: unknown): number | null {
  const placed = Number(value);
  return Number.isInteger(placed) && placed > 0 ? placed : null;
}

function hasRecordedFinish(result: LeagueResult): boolean {
  return result.dnf || validPlace(result.placed) !== null;
}

function finiteNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sumCharges(
  rows: readonly EventRosterRow[],
  field: "billedCents" | "paidCents" | "outstandingCents" | "creditCents",
): number {
  return rows.reduce((sum, row) => sum + row.eventCharge[field], 0);
}

function normalizeSearch(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

function matchesFilter(
  row: EventRosterRow,
  filter: EventRosterFilter,
): boolean {
  switch (filter) {
    case "going":
      return row.rsvpStatus === "going";
    case "declined":
      return row.rsvpStatus === "not_going";
    case "awaiting":
      return row.rsvpStatus === "awaiting";
    case "unpaid":
      return row.eventCharge.outstandingCents > 0;
    case "partial":
      return row.eventCharge.status === "partial";
    case "paid":
      return (
        row.eventCharge.billedCents > 0 &&
        row.eventCharge.outstandingCents === 0
      );
    case "missing":
      return row.finish === "missing";
    case "finished":
      return row.finish === "placed";
    case "dnf":
      return row.finish === "dnf";
    case "all":
      return true;
  }
}

function finishSortValue(row: EventRosterRow): number {
  if (row.finish === "missing") return -1;
  if (row.finish === "dnf") return Number.MAX_SAFE_INTEGER;
  return row.placed ?? Number.MAX_SAFE_INTEGER;
}
