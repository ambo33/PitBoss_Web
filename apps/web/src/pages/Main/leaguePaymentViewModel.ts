import type { LeagueDetail, LeagueEvent, LeagueMember, LeaguePayment } from '../../api/client';

export type LeaguePaymentStatus = 'paid' | 'partial' | 'unpaid' | 'not_due' | 'credit';
export type LeaguePaymentStatusFilter = 'all' | 'outstanding' | LeaguePaymentStatus;
export type LeaguePaymentSort =
  | 'outstanding-desc'
  | 'outstanding-asc'
  | 'name-asc'
  | 'name-desc'
  | 'paid-desc'
  | 'paid-asc'
  | 'completion-desc'
  | 'completion-asc';

export interface LeaguePlayerIdentity {
  full: string;
  name: string;
  nickname: string | null;
  initials: string;
  searchText: string;
}

export interface LeaguePaymentCharge {
  id: string;
  kind: 'season' | 'event';
  label: string;
  event: LeagueEvent | null;
  billedCents: number;
  paidCents: number;
  outstandingCents: number;
  creditCents: number;
  balanceCents: number;
  completionBasisPoints: number;
  status: LeaguePaymentStatus;
}

export interface LeaguePlayerPaymentRow {
  member: LeagueMember;
  userid: string;
  identity: LeaguePlayerIdentity;
  payments: LeaguePayment[];
  paymentCount: number;
  billedCents: number;
  paidCents: number;
  outstandingCents: number;
  creditCents: number;
  balanceCents: number;
  allocatedPaymentCents: number;
  unallocatedPaymentCents: number;
  completionBasisPoints: number;
  status: LeaguePaymentStatus;
  seasonCharge: LeaguePaymentCharge;
  eventCharges: LeaguePaymentCharge[];
  applicableEventCount: number;
  paidEventCount: number;
  partialEventCount: number;
}

export interface LeagueEventPaymentSummary {
  event: LeagueEvent;
  charges: Array<{ userid: string; identity: LeaguePlayerIdentity; charge: LeaguePaymentCharge }>;
  billedCents: number;
  collectedCents: number;
  outstandingCents: number;
  creditCents: number;
  paidCount: number;
  partialCount: number;
  unpaidCount: number;
  notDueCount: number;
  creditCount: number;
}

export interface LeaguePaymentSummary {
  totalBilledCents: number;
  totalCollectedCents: number;
  totalOutstandingCents: number;
  totalCreditsCents: number;
  leagueFeeBilledCents: number;
  gameFeeBilledCents: number;
  leagueFeeCollectedCents: number;
  gameFeeCollectedCents: number;
  otherCollectedCents: number;
  leagueFeeOutstandingCents: number;
  gameFeeOutstandingCents: number;
  leagueFeeCollectionRateBasisPoints: number;
  gameFeeCollectionRateBasisPoints: number;
  collectionRateBasisPoints: number;
  paidInFullCount: number;
  partialCount: number;
  unpaidCount: number;
  notDueCount: number;
  creditCount: number;
}

export interface LeaguePaymentViewModel {
  summary: LeaguePaymentSummary;
  players: LeaguePlayerPaymentRow[];
  events: LeagueEventPaymentSummary[];
}

export function moneyToCents(value: unknown): number {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? Math.round(numeric * 100) : 0;
}

export function centsToMoney(cents: number): number {
  return Math.round(Number(cents || 0)) / 100;
}

export function calculateCompletionBasisPoints(paidCents: number, billedCents: number): number {
  const billed = Math.max(0, Math.round(billedCents));
  const paid = Math.max(0, Math.round(paidCents));
  if (!billed) return 0;
  return Math.min(10_000, Math.round((paid * 10_000) / billed));
}

export function calculateCollectionRateBasisPoints(collectedCents: number, billedCents: number): number {
  const billed = Math.max(0, Math.round(billedCents));
  const collected = Math.max(0, Math.round(collectedCents));
  if (!billed) return 0;
  return Math.round((collected * 10_000) / billed);
}

export function getPaymentStatus(billedCents: number, paidCents: number): LeaguePaymentStatus {
  const billed = Math.max(0, Math.round(billedCents));
  const paid = Math.max(0, Math.round(paidCents));
  const balance = billed - paid;
  if (balance < 0) return 'credit';
  if (billed === 0) return 'not_due';
  if (paid <= 0) return 'unpaid';
  if (balance > 0) return 'partial';
  return 'paid';
}

export function splitPlayerIdentity(displayname: string | null | undefined): LeaguePlayerIdentity {
  const full = String(displayname ?? '').trim().replace(/\s+/g, ' ') || 'Player';
  const match = full.match(/^(.*?)\s+\(([^()]+)\)$/);
  const name = match?.[1]?.trim() || full;
  const nickname = match?.[2]?.trim() || null;
  const initialsSource = name === 'Player' && nickname ? nickname : name;
  const words = initialsSource.split(/\s+/).filter(Boolean);
  const initials = words.length > 1
    ? `${words[0][0] ?? ''}${words[words.length - 1][0] ?? ''}`.toUpperCase()
    : (words[0]?.slice(0, 2) || 'P').toUpperCase();
  return {
    full,
    name,
    nickname,
    initials,
    searchText: normalizeSearchText([full, name, nickname].filter(Boolean).join(' ')),
  };
}

export function getSelectedLeagueSeason(detail: LeagueDetail) {
  return detail.seasons.find((season) => season.seasonid === detail.selectedseasonid) ?? detail.seasons[0] ?? null;
}

export function getSeasonFeeCents(detail: LeagueDetail): number {
  const selectedSeason = getSelectedLeagueSeason(detail);
  return Math.max(0, moneyToCents(selectedSeason?.leaguefee ?? detail.league.leaguefee));
}

export function getSeasonEventFeeCents(detail: LeagueDetail): number {
  const selectedSeason = getSelectedLeagueSeason(detail);
  return Math.max(0, moneyToCents(selectedSeason?.pereventfee ?? detail.league.pereventfee));
}

export function isPlayerChargedForEvent(detail: LeagueDetail, event: LeagueEvent, userId: string): boolean {
  const result = detail.results.find((item) => item.eventid === event.eventid && item.userid === userId);
  if (result?.dnf) return false;
  return detail.rsvps.some((item) => item.eventid === event.eventid && item.userid === userId && item.status === 'going');
}

export function buildLeaguePaymentViewModel(detail: LeagueDetail): LeaguePaymentViewModel {
  const players = detail.members
    .filter((member) => member.approved && member.participating)
    .map((member) => buildPlayerPaymentRow(detail, member));
  const summary = summarizePlayers(players);
  const events = detail.events.map((event, eventIndex) => summarizeEvent(event, eventIndex, players));
  return { summary, players, events };
}

export function matchesPlayerPaymentSearch(row: LeaguePlayerPaymentRow, query: string): boolean {
  const needle = normalizeSearchText(query);
  return !needle || row.identity.searchText.includes(needle);
}

export function filterPlayerPaymentRows(
  rows: readonly LeaguePlayerPaymentRow[],
  filter: LeaguePaymentStatusFilter = 'all',
  search = '',
): LeaguePlayerPaymentRow[] {
  return rows.filter((row) => {
    if (!matchesPlayerPaymentSearch(row, search)) return false;
    if (filter === 'all') return true;
    if (filter === 'outstanding') return row.outstandingCents > 0;
    return row.status === filter;
  });
}

export function sortPlayerPaymentRows(
  rows: readonly LeaguePlayerPaymentRow[],
  sort: LeaguePaymentSort = 'outstanding-desc',
): LeaguePlayerPaymentRow[] {
  return rows
    .map((row, index) => ({ row, index }))
    .sort((left, right) => {
      const comparison = comparePlayerPaymentRows(left.row, right.row, sort);
      return comparison || comparePlayerNames(left.row, right.row) || left.index - right.index;
    })
    .map(({ row }) => row);
}

export function selectPlayerPaymentRows(
  rows: readonly LeaguePlayerPaymentRow[],
  options: { filter?: LeaguePaymentStatusFilter; search?: string; sort?: LeaguePaymentSort } = {},
): LeaguePlayerPaymentRow[] {
  return sortPlayerPaymentRows(
    filterPlayerPaymentRows(rows, options.filter ?? 'all', options.search ?? ''),
    options.sort ?? 'outstanding-desc',
  );
}

function buildPlayerPaymentRow(detail: LeagueDetail, member: LeagueMember): LeaguePlayerPaymentRow {
  const payments = detail.payments.filter((payment) => payment.userid === member.userid);
  const seasonCharge = buildCharge({
    id: `season:${detail.selectedseasonid}`,
    kind: 'season',
    label: getSelectedLeagueSeason(detail)?.name ?? 'Season fee',
    event: null,
    billedCents: getSeasonFeeCents(detail),
    paidCents: sumPayments(payments, (payment) => payment.paymenttype === 'league'),
  });
  const eventCharges = detail.events.map((event) => buildCharge({
    id: `event:${event.eventid}`,
    kind: 'event',
    label: event.name,
    event,
    billedCents: isPlayerChargedForEvent(detail, event, member.userid) ? getSeasonEventFeeCents(detail) : 0,
    paidCents: sumPayments(
      payments,
      (payment) => payment.paymenttype === 'event' && payment.eventid === event.eventid,
    ),
  }));
  const billedCents = seasonCharge.billedCents + eventCharges.reduce((sum, charge) => sum + charge.billedCents, 0);
  // The existing ledger treats every positive record, including "other" and unallocated
  // event credits, as money collected against the player's account.
  const paidCents = sumPayments(payments);
  const balanceCents = billedCents - paidCents;
  const allocatedPaymentCents = seasonCharge.paidCents + eventCharges.reduce((sum, charge) => sum + charge.paidCents, 0);
  const applicableEventCharges = eventCharges.filter((charge) => charge.billedCents > 0);
  return {
    member,
    userid: member.userid,
    identity: splitPlayerIdentity(member.displayname),
    payments,
    paymentCount: payments.filter((payment) => positivePaymentCents(payment) > 0).length,
    billedCents,
    paidCents,
    outstandingCents: Math.max(0, balanceCents),
    creditCents: Math.max(0, -balanceCents),
    balanceCents,
    allocatedPaymentCents,
    unallocatedPaymentCents: Math.max(0, paidCents - allocatedPaymentCents),
    completionBasisPoints: calculateCompletionBasisPoints(paidCents, billedCents),
    status: getPaymentStatus(billedCents, paidCents),
    seasonCharge,
    eventCharges,
    applicableEventCount: applicableEventCharges.length,
    paidEventCount: applicableEventCharges.filter((charge) => charge.outstandingCents === 0).length,
    partialEventCount: applicableEventCharges.filter((charge) => charge.status === 'partial').length,
  };
}

function buildCharge(input: {
  id: string;
  kind: LeaguePaymentCharge['kind'];
  label: string;
  event: LeagueEvent | null;
  billedCents: number;
  paidCents: number;
}): LeaguePaymentCharge {
  const billedCents = Math.max(0, Math.round(input.billedCents));
  const paidCents = Math.max(0, Math.round(input.paidCents));
  const balanceCents = billedCents - paidCents;
  return {
    ...input,
    billedCents,
    paidCents,
    outstandingCents: Math.max(0, balanceCents),
    creditCents: Math.max(0, -balanceCents),
    balanceCents,
    completionBasisPoints: calculateCompletionBasisPoints(paidCents, billedCents),
    status: getPaymentStatus(billedCents, paidCents),
  };
}

function summarizePlayers(players: readonly LeaguePlayerPaymentRow[]): LeaguePaymentSummary {
  const totalBilledCents = players.reduce((sum, player) => sum + player.billedCents, 0);
  const totalCollectedCents = players.reduce((sum, player) => sum + player.paidCents, 0);
  const totalOutstandingCents = players.reduce((sum, player) => sum + player.outstandingCents, 0);
  const totalCreditsCents = players.reduce((sum, player) => sum + player.creditCents, 0);
  const leagueFeeBilledCents = players.reduce((sum, player) => sum + player.seasonCharge.billedCents, 0);
  const gameFeeBilledCents = players.reduce(
    (sum, player) => sum + player.eventCharges.reduce((eventSum, charge) => eventSum + charge.billedCents, 0),
    0,
  );
  const leagueFeeCollectedCents = players.reduce(
    (sum, player) => sum + sumPayments(player.payments, (payment) => payment.paymenttype === 'league'),
    0,
  );
  const gameFeeCollectedCents = players.reduce(
    (sum, player) => sum + sumPayments(player.payments, (payment) => payment.paymenttype === 'event'),
    0,
  );
  const otherCollectedCents = Math.max(0, totalCollectedCents - leagueFeeCollectedCents - gameFeeCollectedCents);
  const outstandingBreakdown = players.reduce(
    (totals, player) => {
      const playerBreakdown = calculatePlayerOutstandingBreakdown(player);
      totals.leagueFeeOutstandingCents += playerBreakdown.leagueFeeOutstandingCents;
      totals.gameFeeOutstandingCents += playerBreakdown.gameFeeOutstandingCents;
      return totals;
    },
    { leagueFeeOutstandingCents: 0, gameFeeOutstandingCents: 0 },
  );
  const statusCounts = countStatuses(players.map((player) => player.status));
  return {
    totalBilledCents,
    totalCollectedCents,
    totalOutstandingCents,
    totalCreditsCents,
    leagueFeeBilledCents,
    gameFeeBilledCents,
    leagueFeeCollectedCents,
    gameFeeCollectedCents,
    otherCollectedCents,
    ...outstandingBreakdown,
    leagueFeeCollectionRateBasisPoints: calculateCollectionRateBasisPoints(leagueFeeCollectedCents, leagueFeeBilledCents),
    gameFeeCollectionRateBasisPoints: calculateCollectionRateBasisPoints(gameFeeCollectedCents, gameFeeBilledCents),
    collectionRateBasisPoints: calculateCollectionRateBasisPoints(totalCollectedCents, totalBilledCents),
    paidInFullCount: statusCounts.paid,
    partialCount: statusCounts.partial,
    unpaidCount: statusCounts.unpaid,
    notDueCount: statusCounts.not_due,
    creditCount: statusCounts.credit,
  };
}

function calculatePlayerOutstandingBreakdown(player: LeaguePlayerPaymentRow): {
  leagueFeeOutstandingCents: number;
  gameFeeOutstandingCents: number;
} {
  const leagueFeeBilledCents = player.seasonCharge.billedCents;
  const gameFeeBilledCents = player.eventCharges.reduce((sum, charge) => sum + charge.billedCents, 0);
  const leagueFeeCollectedCents = sumPayments(player.payments, (payment) => payment.paymenttype === 'league');
  const gameFeeCollectedCents = sumPayments(player.payments, (payment) => payment.paymenttype === 'event');
  const otherCollectedCents = Math.max(0, player.paidCents - leagueFeeCollectedCents - gameFeeCollectedCents);

  let leagueFeeOutstandingCents = Math.max(0, leagueFeeBilledCents - leagueFeeCollectedCents);
  let gameFeeOutstandingCents = Math.max(0, gameFeeBilledCents - gameFeeCollectedCents);

  // Preserve explicitly categorized payments first, then let overpayments and
  // legacy "other" payments cover the player's remaining account balance.
  const leagueFeeOverpaymentCents = Math.max(0, leagueFeeCollectedCents - leagueFeeBilledCents);
  const gameFeeOverpaymentCents = Math.max(0, gameFeeCollectedCents - gameFeeBilledCents);
  gameFeeOutstandingCents = Math.max(0, gameFeeOutstandingCents - leagueFeeOverpaymentCents);
  leagueFeeOutstandingCents = Math.max(0, leagueFeeOutstandingCents - gameFeeOverpaymentCents);

  const otherAppliedToLeagueCents = Math.min(otherCollectedCents, leagueFeeOutstandingCents);
  leagueFeeOutstandingCents -= otherAppliedToLeagueCents;
  gameFeeOutstandingCents = Math.max(0, gameFeeOutstandingCents - (otherCollectedCents - otherAppliedToLeagueCents));

  return { leagueFeeOutstandingCents, gameFeeOutstandingCents };
}

function summarizeEvent(
  event: LeagueEvent,
  eventIndex: number,
  players: readonly LeaguePlayerPaymentRow[],
): LeagueEventPaymentSummary {
  const charges = players.map((player) => ({
    userid: player.userid,
    identity: player.identity,
    charge: player.eventCharges[eventIndex],
  }));
  const statusCounts = countStatuses(charges.map(({ charge }) => charge.status));
  return {
    event,
    charges,
    billedCents: charges.reduce((sum, { charge }) => sum + charge.billedCents, 0),
    collectedCents: charges.reduce((sum, { charge }) => sum + charge.paidCents, 0),
    outstandingCents: charges.reduce((sum, { charge }) => sum + charge.outstandingCents, 0),
    creditCents: charges.reduce((sum, { charge }) => sum + charge.creditCents, 0),
    paidCount: statusCounts.paid,
    partialCount: statusCounts.partial,
    unpaidCount: statusCounts.unpaid,
    notDueCount: statusCounts.not_due,
    creditCount: statusCounts.credit,
  };
}

function sumPayments(payments: readonly LeaguePayment[], predicate: (payment: LeaguePayment) => boolean = () => true): number {
  return payments.reduce((sum, payment) => predicate(payment) ? sum + positivePaymentCents(payment) : sum, 0);
}

function positivePaymentCents(payment: LeaguePayment): number {
  return Math.max(0, moneyToCents(payment.amount));
}

function countStatuses(statuses: readonly LeaguePaymentStatus[]): Record<LeaguePaymentStatus, number> {
  const counts: Record<LeaguePaymentStatus, number> = { paid: 0, partial: 0, unpaid: 0, not_due: 0, credit: 0 };
  for (const status of statuses) counts[status] += 1;
  return counts;
}

function comparePlayerPaymentRows(a: LeaguePlayerPaymentRow, b: LeaguePlayerPaymentRow, sort: LeaguePaymentSort): number {
  switch (sort) {
    case 'outstanding-desc': return b.outstandingCents - a.outstandingCents;
    case 'outstanding-asc': return a.outstandingCents - b.outstandingCents;
    case 'name-asc': return comparePlayerNames(a, b);
    case 'name-desc': return comparePlayerNames(b, a);
    case 'paid-desc': return b.paidCents - a.paidCents;
    case 'paid-asc': return a.paidCents - b.paidCents;
    case 'completion-desc': return b.completionBasisPoints - a.completionBasisPoints;
    case 'completion-asc': return a.completionBasisPoints - b.completionBasisPoints;
  }
}

function comparePlayerNames(a: LeaguePlayerPaymentRow, b: LeaguePlayerPaymentRow): number {
  return a.identity.name.localeCompare(b.identity.name, undefined, { sensitivity: 'base' })
    || a.userid.localeCompare(b.userid);
}

function normalizeSearchText(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}
