import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Coins,
  DollarSign,
  LayoutList,
  Pencil,
  Plus,
  ReceiptText,
  Search,
  Table2,
  Trash2,
  X,
} from 'lucide-react';
import type { LeagueDetail, LeaguePayment } from '../../api/client';
import {
  buildLeaguePaymentViewModel,
  getSeasonEventFeeCents,
  getSeasonFeeCents,
  selectPlayerPaymentRows,
  type LeagueEventPaymentSummary,
  type LeaguePaymentCharge,
  type LeaguePaymentSort,
  type LeaguePaymentStatus,
  type LeaguePaymentStatusFilter,
  type LeaguePlayerPaymentRow,
} from './leaguePaymentViewModel';

type PaymentView = 'balances' | 'events';

interface LeaguePaymentsPanelProps {
  detail: LeagueDetail;
  onSeasonChange: (seasonId: string) => void;
  onOpenSettings: () => void;
  onAddPayment: (userId?: string) => void;
  onEditPayment: (payment: LeaguePayment) => void;
  onDeletePayment: (paymentId: string) => void;
  deleteLoading: boolean;
  deleteError?: string;
}

const FILTER_OPTIONS: Array<{ id: LeaguePaymentStatusFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'outstanding', label: 'Outstanding' },
  { id: 'partial', label: 'Partial' },
  { id: 'paid', label: 'Paid' },
];

const SORT_OPTIONS: Array<{ id: LeaguePaymentSort; label: string }> = [
  { id: 'outstanding-desc', label: 'Sort: Balance ↓' },
  { id: 'outstanding-asc', label: 'Sort: Balance ↑' },
  { id: 'name-asc', label: 'Player: A to Z' },
  { id: 'name-desc', label: 'Player: Z to A' },
  { id: 'paid-desc', label: 'Amount paid: high to low' },
  { id: 'completion-desc', label: 'Completion: high to low' },
];

export default function LeaguePaymentsPanel({
  detail,
  onSeasonChange,
  onOpenSettings,
  onAddPayment,
  onEditPayment,
  onDeletePayment,
  deleteLoading,
  deleteError,
}: LeaguePaymentsPanelProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const dockedDetails = useDesktopPaymentDetails();
  const [pendingPlayerAction, setPendingPlayerAction] = useState<
    { type: 'record'; userId: string } | { type: 'edit'; payment: LeaguePayment } | null
  >(null);
  const playerTriggerRef = useRef<HTMLElement | null>(null);
  const model = useMemo(() => buildLeaguePaymentViewModel(detail), [detail]);
  const view = parsePaymentView(searchParams.get('paymentView'));
  const statusFilter = parsePaymentFilter(searchParams.get('paymentStatus'));
  const sort = parsePaymentSort(searchParams.get('paymentSort'));
  const search = searchParams.get('paymentSearch') ?? '';
  const selectedPlayerId = searchParams.get('paymentPlayer');
  const selectedPlayer = useMemo(
    () => model.players.find((player) => player.userid === selectedPlayerId) ?? null,
    [model.players, selectedPlayerId],
  );
  const visiblePlayers = useMemo(
    () => selectPlayerPaymentRows(model.players, { filter: statusFilter, search, sort }),
    [model.players, search, sort, statusFilter],
  );
  const selectedEventId = searchParams.get('paymentEvent') ?? model.events[0]?.event.eventid ?? '';
  const selectedEvent = model.events.find((event) => event.event.eventid === selectedEventId) ?? model.events[0] ?? null;
  const seasonFeeCents = getSeasonFeeCents(detail);
  const eventFeeCents = getSeasonEventFeeCents(detail);
  const noFeesConfigured = seasonFeeCents === 0 && eventFeeCents === 0;

  const updatePaymentQuery = (
    updates: Record<string, string | null>,
    options: { replace?: boolean } = {},
  ) => {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(updates)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setSearchParams(next, { replace: options.replace });
  };

  useEffect(() => {
    if (!selectedPlayerId || selectedPlayer) return;
    const next = new URLSearchParams(searchParams);
    next.delete('paymentPlayer');
    setSearchParams(next, { replace: true });
  }, [searchParams, selectedPlayer, selectedPlayerId, setSearchParams]);

  const openPlayer = (userId: string, eventId?: string) => {
    const replacingOpenPlayer = Boolean(selectedPlayerId);
    if (document.activeElement instanceof HTMLElement) {
      playerTriggerRef.current = document.activeElement;
    }
    updatePaymentQuery({
      paymentPlayer: userId,
      paymentEvent: eventId ?? searchParams.get('paymentEvent'),
    }, { replace: replacingOpenPlayer });
  };

  const closePlayer = () => {
    const panel = document.querySelector<HTMLElement>('[data-player-details]');
    const restoreFocus = Boolean(panel?.contains(document.activeElement)) && !hasOtherModal(panel);
    const closingPlayerId = selectedPlayerId;
    // The dock leaves filters and event navigation usable; close only the
    // selected-player query instead of undoing the latest workspace action.
    updatePaymentQuery({ paymentPlayer: null }, { replace: true });
    if (restoreFocus) {
      window.requestAnimationFrame(() => {
        if (hasOtherModal()) return;
        const originalTrigger = playerTriggerRef.current;
        const matchingTrigger = Array.from(document.querySelectorAll<HTMLElement>('[data-payment-player-trigger]'))
          .find((element) => element.dataset.paymentPlayerTrigger === closingPlayerId && isVisibleFocusable(element));
        const target = originalTrigger && isVisibleFocusable(originalTrigger)
          ? originalTrigger
          : matchingTrigger ?? document.querySelector<HTMLElement>('[data-payment-search]');
        target?.focus({ preventScroll: true });
      });
    }
  };
  const recordPayment = (userId: string) => {
    if (selectedPlayerId && !dockedDetails) {
      setPendingPlayerAction({ type: 'record', userId });
      closePlayer();
      return;
    }
    onAddPayment(userId);
  };
  const editPayment = (payment: LeaguePayment) => {
    if (dockedDetails) {
      onEditPayment(payment);
      return;
    }
    setPendingPlayerAction({ type: 'edit', payment });
    closePlayer();
  };

  useEffect(() => {
    if (selectedPlayerId || !pendingPlayerAction) return;
    const action = pendingPlayerAction;
    setPendingPlayerAction(null);
    if (action.type === 'record') onAddPayment(action.userId);
    else onEditPayment(action.payment);
  }, [onAddPayment, onEditPayment, pendingPlayerAction, selectedPlayerId]);

  const summary = model.summary;
  const ratePercent = summary.collectionRateBasisPoints / 100;
  const statusCounts: Record<LeaguePaymentStatusFilter, number> = {
    all: model.players.length,
    outstanding: model.players.filter((player) => player.outstandingCents > 0).length,
    paid: summary.paidInFullCount,
    partial: summary.partialCount,
    unpaid: summary.unpaidCount,
    not_due: summary.notDueCount,
    credit: summary.creditCount,
  };

  return (
    <div data-payment-workspace className={`payment-page min-w-0 text-white min-[1200px]:min-h-[calc(100dvh-70px)] min-[1200px]:bg-[#080f13] ${selectedPlayer ? 'min-[1280px]:grid min-[1280px]:grid-cols-[minmax(0,1fr)_310px] min-[1440px]:grid-cols-[minmax(0,1fr)_330px]' : ''}`}>
      <div className="min-w-0 space-y-4 pb-4 sm:space-y-5 min-[1200px]:px-5 min-[1200px]:pb-8 min-[1200px]:pt-7 min-[1440px]:px-6">
      <section className="min-w-0 rounded-xl border border-pit-border bg-[#0b1217] p-4 sm:p-5 min-[1200px]:rounded-none min-[1200px]:border-0 min-[1200px]:bg-transparent min-[1200px]:p-0">
        <div className="flex min-w-0 flex-col gap-4 min-[900px]:flex-row min-[900px]:items-start min-[900px]:justify-between">
          <div className="min-w-0">
            <h2 className="text-2xl font-bold tracking-tight text-white sm:text-[2rem] sm:leading-9">Payments</h2>
            <p className="mt-1 text-sm leading-5 text-pit-text">Manage league fees and track player payments.</p>
          </div>
          <div className="grid min-w-0 grid-cols-1 gap-2 sm:flex sm:justify-end">
            <label className="relative min-w-0 sm:w-40 min-[1200px]:w-36">
              <span className="sr-only">Select season</span>
              <select
                className="input h-11 appearance-none !rounded-lg !border-[#293641] !bg-[#090f14] pr-9 text-sm !text-white [color-scheme:dark]"
                value={detail.selectedseasonid}
                onChange={(event) => onSeasonChange(event.target.value)}
              >
                {detail.seasons.map((season) => (
                  <option key={season.seasonid} value={season.seasonid} className="bg-[#090f14] text-white">{normalizeSeasonLabel(season.name)}</option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-pit-muted" size={16} aria-hidden="true" />
            </label>
            <button
              type="button"
              className="btn-primary h-11 min-w-0 justify-center gap-2 px-3 text-[#041312] sm:px-4 min-[1200px]:hidden"
              onClick={() => onAddPayment()}
            >
              <Plus size={16} aria-hidden="true" />
              <span className="hidden min-[390px]:inline">Record Payment</span>
              <span className="min-[390px]:hidden">Payment</span>
            </button>
          </div>
        </div>

        <div className="mt-6 grid min-w-0 grid-cols-1 gap-2.5 min-[350px]:grid-cols-2 lg:grid-cols-4 lg:gap-3">
          <PaymentKpiCard
            label="Collected"
            value={formatMoney(summary.totalCollectedCents)}
            icon={<Coins size={30} strokeWidth={1.6} />}
            tone="teal"
            breakdown={[
              { label: 'League fees', value: formatMoney(summary.leagueFeeCollectedCents) },
              { label: 'Game fees', value: formatMoney(summary.gameFeeCollectedCents) },
              ...(summary.otherCollectedCents > 0
                ? [{ label: 'Other', value: formatMoney(summary.otherCollectedCents) }]
                : []),
            ]}
          />
          <PaymentKpiCard
            label="Outstanding"
            value={formatMoney(summary.totalOutstandingCents)}
            icon={<Clock3 size={30} strokeWidth={1.6} />}
            tone="amber"
            breakdown={[
              { label: 'League fees', value: formatMoney(summary.leagueFeeOutstandingCents) },
              { label: 'Game fees', value: formatMoney(summary.gameFeeOutstandingCents) },
            ]}
          />
          <PaymentKpiCard
            label="Total Billed"
            value={formatMoney(summary.totalBilledCents)}
            icon={<ReceiptText size={30} strokeWidth={1.6} />}
            tone="neutral"
            breakdown={[
              { label: 'League fees', value: formatMoney(summary.leagueFeeBilledCents) },
              { label: 'Game fees', value: formatMoney(summary.gameFeeBilledCents) },
            ]}
          />
          <CollectionRateCard
            basisPoints={summary.collectionRateBasisPoints}
            leagueFeeBasisPoints={summary.leagueFeeCollectionRateBasisPoints}
            gameFeeBasisPoints={summary.gameFeeCollectionRateBasisPoints}
          />
        </div>

        <div className="mt-6 flex items-center gap-3">
          <PaymentProgressBar
            basisPoints={summary.collectionRateBasisPoints}
            label={`${formatPercent(ratePercent)} of league charges collected`}
            className="!h-[18px] flex-1 !rounded-md border border-[#14414a] !bg-[#0b1c22]"
          />
          <span className="shrink-0 text-sm font-semibold tabular-nums text-white">{formatPercent(ratePercent)}</span>
        </div>

        <div className="mt-4 flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-2 text-xs text-pit-text min-[1500px]:text-sm">
          <span className="font-medium text-white">Fees:</span>
          <span className="tabular-nums">{formatMoney(seasonFeeCents)} season fee</span>
          <span className="h-1 w-1 rounded-full bg-pit-teal" aria-hidden="true" />
          <span className="tabular-nums">{formatMoney(eventFeeCents)} per event</span>
          <span className="ml-auto hidden h-4 w-px bg-pit-border lg:block" aria-hidden="true" />
          <span>{summary.paidInFullCount} paid in full</span>
          <span className="h-1 w-1 rounded-full bg-pit-teal" aria-hidden="true" />
          <span>{summary.partialCount} partially paid</span>
          <span className="h-1 w-1 rounded-full bg-pit-teal" aria-hidden="true" />
          <span>{summary.unpaidCount} unpaid</span>
          {summary.creditCount > 0 ? (
            <>
              <span className="h-1 w-1 rounded-full bg-pit-teal" aria-hidden="true" />
              <span>{summary.creditCount} with credit</span>
            </>
          ) : null}
        </div>

        {noFeesConfigured ? (
          <div className="mt-4 flex flex-col gap-3 rounded-xl border border-pit-teal/25 bg-pit-teal/[0.06] p-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-white">No league fees configured</p>
              <p className="mt-1 text-xs leading-5 text-pit-text">Set fees in League Settings before using balances to reconcile this season.</p>
            </div>
            <button type="button" className="btn-ghost shrink-0 text-sm text-pit-teal" onClick={onOpenSettings}>Open League Settings</button>
          </div>
        ) : null}
      </section>

      <section className="min-w-0">
        <div className="mb-4 space-y-4">
          <div className="flex min-w-0 items-center justify-between gap-3">
            <div className="inline-flex h-10 w-full rounded-lg border border-[#29343e] bg-[#0c141a] sm:w-fit" aria-label="Payment views">
              <ViewButton active={view === 'balances'} icon={<LayoutList size={15} />} onClick={() => updatePaymentQuery({ paymentView: null })}>
                Balances
              </ViewButton>
              <ViewButton active={view === 'events'} icon={<Table2 size={15} />} onClick={() => updatePaymentQuery({ paymentView: 'events' })}>
                Event breakdown
              </ViewButton>
            </div>
            <button type="button" className="hidden min-h-10 shrink-0 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-[#02d9df] hover:bg-[#00c6cf]/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#00c6cf] min-[1200px]:inline-flex" onClick={() => onAddPayment()}>
              <Plus size={15} aria-hidden="true" /> Record Payment
            </button>
          </div>
          <div className="flex min-w-0 flex-col gap-3 min-[1200px]:flex-row min-[1200px]:flex-wrap min-[1200px]:items-center min-[1200px]:justify-between">
            <div className="grid grid-cols-4 gap-1.5 sm:flex sm:w-fit" aria-label="Payment status filters">
              {FILTER_OPTIONS.map((filter) => (
                <button
                  key={filter.id}
                  type="button"
                  aria-pressed={statusFilter === filter.id}
                  className={`min-h-10 min-w-0 rounded-lg border px-2 text-[11px] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#00c6cf] sm:px-2.5 ${
                    statusFilter === filter.id
                      ? 'border-[#00c6cf] bg-[#00c6cf]/10 text-white'
                      : 'border-[#26333e] bg-[#10181e] text-pit-text hover:border-[#00c6cf]/45 hover:text-white'
                  }`}
                  onClick={() => updatePaymentQuery({ paymentStatus: filter.id === 'outstanding' ? null : filter.id })}
                >
                  {filter.id === 'outstanding' ? (
                    <><span className="min-[350px]:hidden">Open</span><span className="hidden min-[350px]:inline">Outstanding</span></>
                  ) : <span>{filter.label}</span>}
                  <span className="ml-1 hidden tabular-nums min-[430px]:inline">({statusCounts[filter.id]})</span>
                </button>
              ))}
            </div>
            <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-[minmax(150px,1fr)_155px] min-[1200px]:ml-auto min-[1200px]:flex-1 min-[1200px]:basis-[320px] min-[1200px]:max-w-[410px]">
              <label className="relative min-w-0">
                <span className="sr-only">Search players</span>
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-pit-muted" size={16} aria-hidden="true" />
                <input
                  data-payment-search
                  className="input h-10 !rounded-lg !border-[#293641] !bg-transparent pl-9 !text-xs"
                  value={search}
                  onChange={(event) => updatePaymentQuery({ paymentSearch: event.target.value || null }, { replace: true })}
                  placeholder="Search players..."
                />
              </label>
              <label className="relative min-w-0">
                <span className="sr-only">Sort player balances</span>
                <select
                  className="input h-10 appearance-none !rounded-lg !border-[#293641] !bg-[#090f14] pl-3 pr-8 !text-xs !text-white [color-scheme:dark]"
                  value={sort}
                  onChange={(event) => updatePaymentQuery({ paymentSort: event.target.value === 'outstanding-desc' ? null : event.target.value })}
                >
                  {SORT_OPTIONS.map((option) => <option key={option.id} value={option.id} className="bg-[#090f14] text-white">{option.label}</option>)}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-pit-muted" size={15} aria-hidden="true" />
              </label>
            </div>
          </div>

        </div>

        {model.players.length === 0 ? (
          <PaymentEmptyState
            title="No players in this season"
            message="Add players to the season before balances can be calculated."
          />
        ) : visiblePlayers.length === 0 ? (
          <PaymentEmptyState
            title={statusFilter === 'outstanding' && !search ? 'Everyone is settled' : 'No matching players'}
            message={statusFilter === 'outstanding' && !search
              ? 'There are no outstanding balances for this season.'
              : 'Try another search or payment-status filter.'}
            actionLabel="View all players"
            onAction={() => updatePaymentQuery({ paymentStatus: 'all', paymentSearch: null })}
          />
        ) : view === 'balances' ? (
          <PlayerBalances
            players={visiblePlayers}
            selectedPlayerId={selectedPlayerId}
            onOpen={openPlayer}
            onRecord={recordPayment}
          />
        ) : (
          <EventBreakdown
            players={visiblePlayers}
            events={model.events}
            selectedEvent={selectedEvent}
            onSelectEvent={(eventId) => updatePaymentQuery({ paymentEvent: eventId }, { replace: true })}
            onOpen={openPlayer}
          />
        )}
      </section>

      <RecentPayments detail={detail} players={model.players} onOpen={openPlayer} />
      </div>

      {selectedPlayer ? (
        <PlayerPaymentDetails
          player={selectedPlayer}
          docked={dockedDetails}
          deleteLoading={deleteLoading}
          deleteError={deleteError}
          onClose={closePlayer}
          onRecord={() => recordPayment(selectedPlayer.userid)}
          onEdit={editPayment}
          onDelete={onDeletePayment}
        />
      ) : null}
    </div>
  );
}

function PaymentKpiCard({
  label,
  value,
  icon,
  tone,
  breakdown,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone: 'teal' | 'amber' | 'neutral';
  breakdown: Array<{ label: string; value: string }>;
}) {
  const toneClass = tone === 'teal'
    ? 'border-[#00c6cf]/70 bg-[#00c6cf]/[0.075] text-[#00d4de]'
    : tone === 'amber'
      ? 'border-[#e5aa26]/60 bg-[#e5aa26]/[0.06] text-[#ffbe38]'
      : 'border-[#26333e] bg-[#0b1318] text-pit-muted';
  return (
    <div className={`flex min-h-[126px] min-w-0 flex-col rounded-lg border p-3 min-[1500px]:p-4 ${toneClass}`}>
      <div className="flex min-w-0 items-center gap-2.5 min-[1500px]:gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center" aria-hidden="true">{icon}</span>
        <div className="min-w-0">
          <p className={`truncate text-lg font-bold leading-tight tabular-nums sm:text-xl min-[1440px]:text-2xl min-[1600px]:text-[28px] ${tone === 'neutral' ? 'text-white' : ''}`} title={value}>{value}</p>
          <p className={`mt-1 text-xs min-[1440px]:text-sm ${tone === 'neutral' ? 'text-pit-text' : ''}`}>{label}</p>
        </div>
      </div>
      <FeeBreakdown items={breakdown} />
    </div>
  );
}

function CollectionRateCard({
  basisPoints,
  leagueFeeBasisPoints,
  gameFeeBasisPoints,
}: {
  basisPoints: number;
  leagueFeeBasisPoints: number;
  gameFeeBasisPoints: number;
}) {
  const percent = basisPoints / 100;
  const visualPercent = Math.max(0, Math.min(100, percent));
  return (
    <div className="flex min-h-[126px] min-w-0 flex-col rounded-lg border border-[#26333e] bg-[#0b1318] p-3 min-[1500px]:p-4">
      <div className="flex min-w-0 items-center gap-2.5 min-[1500px]:gap-3">
        <div
          className="relative h-9 w-9 shrink-0 rounded-full min-[1440px]:h-10 min-[1440px]:w-10"
          style={{ background: `conic-gradient(#00cbd2 ${visualPercent * 3.6}deg, #303845 0deg)` }}
          aria-hidden="true"
        >
          <div className="absolute inset-[6px] rounded-full bg-[#0b1318]" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-lg font-bold tabular-nums text-white sm:text-xl min-[1440px]:text-2xl">{formatPercent(percent)}</p>
          <p className="mt-1 text-xs text-pit-text min-[1440px]:text-sm">Collected</p>
        </div>
      </div>
      <FeeBreakdown items={[
        { label: 'League fees', value: formatPercent(leagueFeeBasisPoints / 100) },
        { label: 'Game fees', value: formatPercent(gameFeeBasisPoints / 100) },
      ]} />
    </div>
  );
}

function FeeBreakdown({ items }: { items: Array<{ label: string; value: string }> }) {
  return (
    <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 border-t border-current/15 pt-2 text-[10px] leading-tight text-pit-text min-[1440px]:text-[11px]">
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="truncate">{item.label}</dt>
          <dd className="mt-0.5 truncate font-semibold tabular-nums text-white" title={`${item.label}: ${item.value}`}>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function ViewButton({ active, icon, children, onClick }: { active: boolean; icon: React.ReactNode; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={`flex min-w-0 flex-1 items-center justify-center gap-2 rounded-lg px-3 text-xs font-semibold transition sm:flex-none sm:px-4 ${
        active ? 'bg-pit-teal/15 text-white shadow-[inset_0_0_0_1px_rgba(14,165,165,0.75)]' : 'text-pit-text hover:text-white'
      }`}
      onClick={onClick}
    >
      <span className="min-[1200px]:hidden">{icon}</span>
      {children}
    </button>
  );
}

function PlayerBalances({
  players,
  selectedPlayerId,
  onOpen,
  onRecord,
}: {
  players: LeaguePlayerPaymentRow[];
  selectedPlayerId: string | null;
  onOpen: (userId: string) => void;
  onRecord: (userId: string) => void;
}) {
  return (
    <>
      <div data-payment-ledger className="hidden overflow-hidden rounded-lg border border-[#26333e] min-[900px]:block">
        <table className="w-full table-fixed text-left text-sm">
          <thead className="border-b border-[#26333e] bg-[#0e171d] text-[11px] font-medium text-pit-text">
            <tr>
              <th className="w-[26%] px-3 py-2.5">Player</th>
              <th className="w-[26%] px-2 py-2.5">Payment Progress</th>
              <th className="w-[14%] px-2 py-2.5">Outstanding</th>
              <th className="w-[9%] px-1 py-2.5 text-center">Events</th>
              <th className="w-[12%] px-1 py-2.5 text-center">Status</th>
              <th className="w-[13%] px-2 py-2.5 text-center">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#26333e]/70">
            {players.map((player) => (
              <tr key={player.userid} className={`transition hover:bg-[#00c6cf]/[0.04] ${selectedPlayerId === player.userid ? 'bg-[#00c6cf]/[0.055]' : 'bg-[#0c1419]'}`}>
                <td className="px-3 py-2.5">
                  <button type="button" data-payment-player-trigger={player.userid} className="flex min-h-10 w-full min-w-0 items-center gap-2 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-pit-teal/60" aria-expanded={selectedPlayerId === player.userid} onClick={() => onOpen(player.userid)}>
                    <PlayerAvatar player={player} />
                    <PlayerIdentity player={player} />
                  </button>
                </td>
                <td className="px-2 py-2.5">
                  <PaymentProgress player={player} />
                </td>
                <td className={`px-2 py-2.5 font-bold tabular-nums ${balanceTone(player)}`}>
                  {balanceLabel(player)}
                </td>
                <td className="px-1 py-2.5 text-center text-xs tabular-nums text-pit-text">
                  <span aria-label={`${player.paidEventCount} of ${player.applicableEventCount} applicable event fees paid`}>
                    {player.paidEventCount} of {player.applicableEventCount}
                  </span>
                </td>
                <td className="px-1 py-2.5 text-center"><PaymentStatusBadge status={player.status} /></td>
                <td className="px-2 py-2.5 text-center">
                  {player.outstandingCents > 0 ? (
                    <button type="button" className="inline-flex min-h-9 w-full items-center justify-center gap-1 rounded-md border border-[#00c6cf]/35 bg-[#00c6cf]/[0.045] px-1.5 text-[11px] text-[#02d9df] hover:border-[#00c6cf] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#00c6cf]" onClick={() => onRecord(player.userid)} aria-label={`Record payment for ${player.identity.name}`}>
                      <Plus size={13} /> Payment
                    </button>
                  ) : (
                    <button type="button" data-payment-player-trigger={player.userid} className="min-h-9 w-full rounded-md border border-[#00c6cf]/35 bg-[#00c6cf]/[0.045] px-2 text-[11px] text-[#02d9df] hover:border-[#00c6cf] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#00c6cf]" onClick={() => onOpen(player.userid)} aria-label={`View payment details for ${player.identity.name}`}>View</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-2.5 p-2.5 min-[900px]:hidden sm:p-3">
        {players.map((player) => (
          <article key={player.userid} className="min-w-0 rounded-xl border border-pit-border bg-pit-bg/45 p-3 shadow-[0_8px_20px_rgba(0,0,0,0.12)] sm:p-4">
            <div className="flex min-w-0 items-start gap-2.5">
              <PlayerAvatar player={player} large />
              <div className="min-w-0 flex-1">
                <PlayerIdentity player={player} />
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <PaymentStatusBadge status={player.status} />
                  <span className="text-[11px] tabular-nums text-pit-muted" aria-label={`${player.paidEventCount} of ${player.applicableEventCount} applicable event fees paid`}>
                    {player.paidEventCount} of {player.applicableEventCount} events
                  </span>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <p className={`text-lg font-bold tabular-nums ${balanceTone(player)}`}>{balanceLabel(player)}</p>
                <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-pit-muted">{player.creditCents > 0 ? 'Credit' : 'Outstanding'}</p>
              </div>
            </div>
            <div className="mt-3"><PaymentProgress player={player} /></div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {player.outstandingCents > 0 ? (
                <button type="button" className="btn-primary min-h-11 justify-center gap-1.5 px-2 text-xs text-[#041312]" onClick={() => onRecord(player.userid)}>
                  <Plus size={14} /> Record Payment
                </button>
              ) : (
                <button type="button" className="btn-ghost min-h-11 justify-center px-2 text-xs text-pit-muted" disabled>
                  {player.status === 'credit' ? 'Credit on account' : player.status === 'not_due' ? 'No charges due' : 'Paid in full'}
                </button>
              )}
              <button type="button" data-payment-player-trigger={player.userid} className="btn-ghost min-h-11 justify-center gap-1 px-2 text-xs" onClick={() => onOpen(player.userid)}>
                Details <ChevronRight size={14} />
              </button>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}

function EventBreakdown({
  players,
  events,
  selectedEvent,
  onSelectEvent,
  onOpen,
}: {
  players: LeaguePlayerPaymentRow[];
  events: LeagueEventPaymentSummary[];
  selectedEvent: LeagueEventPaymentSummary | null;
  onSelectEvent: (eventId: string) => void;
  onOpen: (userId: string, eventId?: string) => void;
}) {
  if (!events.length) {
    return <PaymentEmptyState title="No season events yet" message="Event fee obligations will appear after events and RSVPs exist." />;
  }
  return (
    <>
      <div className="hidden max-w-full overflow-x-auto min-[1100px]:block">
        <table className="min-w-max border-separate border-spacing-0 text-left text-xs">
          <thead className="sticky top-0 z-20 bg-[#171a20] text-[10px] font-semibold uppercase tracking-[0.08em] text-pit-muted">
            <tr>
              <th className="sticky left-0 z-30 w-56 border-b border-r border-pit-border bg-[#171a20] px-4 py-3">Player</th>
              <th className="w-32 border-b border-pit-border px-3 py-3 text-center">Season fee</th>
              {events.map(({ event }) => (
                <th key={event.eventid} className="w-32 border-b border-pit-border px-3 py-3 text-center" title={`${event.name}${event.eventdate ? ` — ${String(event.eventdate).slice(0, 10)}` : ''}`}>
                  <span className="block max-w-28 truncate normal-case text-xs text-pit-text">{event.name}</span>
                  {event.eventdate ? <span className="mt-1 block font-normal normal-case text-pit-muted">{formatShortDate(event.eventdate)}</span> : null}
                </th>
              ))}
              <th className="sticky right-0 z-30 w-36 border-b border-l border-pit-border bg-[#171a20] px-4 py-3 text-right">Outstanding</th>
            </tr>
          </thead>
          <tbody>
            {players.map((player) => (
              <tr key={player.userid} className="group">
                <td className="sticky left-0 z-10 border-b border-r border-pit-border/60 bg-[#181b21] px-4 py-3 group-hover:bg-[#1b2027]">
                  <button type="button" data-payment-player-trigger={player.userid} className="flex min-w-0 items-center gap-2 text-left" onClick={() => onOpen(player.userid)}>
                    <PlayerAvatar player={player} />
                    <PlayerIdentity player={player} compact />
                  </button>
                </td>
                <td className="border-b border-pit-border/60 bg-pit-bg/25 px-3 py-3 text-center"><ChargeStatus charge={player.seasonCharge} /></td>
                {player.eventCharges.map((charge) => (
                  <td key={charge.id} className="border-b border-pit-border/60 bg-pit-bg/25 px-3 py-3 text-center">
                    <button type="button" className="rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-pit-teal/60" onClick={() => onOpen(player.userid, charge.event?.eventid)} aria-label={`${player.identity.full}, ${charge.label}: ${statusLabel(charge.status)}`}>
                      <ChargeStatus charge={charge} />
                    </button>
                  </td>
                ))}
                <td className={`sticky right-0 z-10 border-b border-l border-pit-border/60 bg-[#181b21] px-4 py-3 text-right font-bold tabular-nums group-hover:bg-[#1b2027] ${balanceTone(player)}`}>
                  {balanceLabel(player)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 p-3 min-[1100px]:hidden">
        <label className="relative block">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-pit-muted">Event</span>
          <select className="input h-11 appearance-none !bg-[#090f14] pr-9 !text-white [color-scheme:dark]" value={selectedEvent?.event.eventid ?? ''} onChange={(event) => onSelectEvent(event.target.value)}>
            {events.map(({ event }) => <option key={event.eventid} value={event.eventid} className="bg-[#090f14] text-white">{event.name}</option>)}
          </select>
          <ChevronDown className="pointer-events-none absolute bottom-3.5 right-3 text-pit-muted" size={15} aria-hidden="true" />
        </label>
        {selectedEvent ? (
          <div className="grid grid-cols-3 gap-2 rounded-xl border border-pit-border bg-pit-bg/45 p-3 text-center text-xs">
            <EventMetric label="Billed" value={formatMoney(selectedEvent.billedCents)} />
            <EventMetric label="Collected" value={formatMoney(selectedEvent.collectedCents)} tone="teal" />
            <EventMetric label="Open" value={formatMoney(selectedEvent.outstandingCents)} tone="amber" />
          </div>
        ) : null}
        <div className="divide-y divide-pit-border/60 overflow-hidden rounded-xl border border-pit-border bg-pit-bg/35">
          {players.map((player) => {
            const charge = selectedEvent ? player.eventCharges.find((item) => item.event?.eventid === selectedEvent.event.eventid) : null;
            return (
              <button key={player.userid} type="button" data-payment-player-trigger={player.userid} className="flex min-h-16 w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-white/[0.025]" onClick={() => onOpen(player.userid, selectedEvent?.event.eventid)}>
                <PlayerAvatar player={player} />
                <PlayerIdentity player={player} compact />
                <span className="ml-auto shrink-0">{charge ? <ChargeStatus charge={charge} /> : null}</span>
                <ChevronRight size={15} className="shrink-0 text-pit-muted" aria-hidden="true" />
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}

function PlayerPaymentDetails({
  player,
  docked,
  deleteLoading,
  deleteError,
  onClose,
  onRecord,
  onEdit,
  onDelete,
}: {
  player: LeaguePlayerPaymentRow;
  docked: boolean;
  deleteLoading: boolean;
  deleteError?: string;
  onClose: () => void;
  onRecord: () => void;
  onEdit: (payment: LeaguePayment) => void;
  onDelete: (paymentId: string) => void;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  useDialogFocus(panelRef, onClose, !docked);
  const charges = [player.seasonCharge, ...player.eventCharges].filter((charge) => charge.billedCents > 0 || charge.paidCents > 0);
  const requestDelete = (payment: LeaguePayment) => {
    const amount = formatMoney(Math.max(0, Math.round(Number(payment.amount || 0) * 100)));
    if (window.confirm(`Delete the ${amount} payment recorded on ${String(payment.paidat).slice(0, 10)}? This action is written to the audit trail.`)) {
      onDelete(payment.paymentid);
    }
  };
  return (
    <div className={docked ? 'sticky top-[70px] min-w-0 self-start border-l border-[#26333e] bg-[#0d151b]' : 'fixed inset-0 z-40 flex bg-black/70 backdrop-blur-sm md:justify-end'} onMouseDown={(event) => !docked && event.currentTarget === event.target && onClose()}>
      <div
        ref={panelRef}
        data-player-details
        data-payment-detail-mode={docked ? 'docked' : 'modal'}
        role={docked ? 'complementary' : 'dialog'}
        aria-modal={docked ? undefined : true}
        aria-labelledby="player-payment-detail-title"
        tabIndex={-1}
        onKeyDown={(event) => {
          if (docked && event.key === 'Escape') {
            event.stopPropagation();
            onClose();
          }
        }}
        className={docked ? 'flex h-[calc(100dvh-70px)] min-w-0 flex-col overflow-y-auto outline-none' : 'mt-auto flex max-h-[90dvh] w-full min-w-0 flex-col rounded-t-2xl border border-pit-border bg-[#0d151b] shadow-[0_-18px_48px_rgba(0,0,0,0.5)] outline-none md:mt-0 md:h-full md:max-h-none md:max-w-[440px] md:rounded-none md:border-y-0 md:border-r-0 md:shadow-[-18px_0_48px_rgba(0,0,0,0.48)]'}
      >
        <div className="flex justify-center py-2 md:hidden" aria-hidden="true"><span className="h-1 w-14 rounded-full bg-pit-muted/45" /></div>
        <header className={`flex min-w-0 shrink-0 items-start gap-3 px-4 pb-4 ${docked ? 'pt-5' : 'border-b border-pit-border pt-2 md:p-5'}`}>
          {!docked ? <PlayerAvatar player={player} large /> : null}
          <div className="min-w-0 flex-1">
            <h2 id="player-payment-detail-title" className="truncate text-lg font-bold text-white" title={player.identity.name}>{player.identity.name}</h2>
            {player.identity.nickname ? <p className="truncate text-sm text-pit-text" title={player.identity.nickname}>{player.identity.nickname}</p> : null}
          </div>
          {!docked ? <PaymentStatusBadge status={player.status} /> : null}
          <button type="button" className="-mr-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-pit-muted hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-pit-teal/60" onClick={onClose} aria-label="Close player payment details">
            <X size={19} />
          </button>
        </header>

        <div className={docked ? 'px-4 pb-4' : 'min-h-0 flex-1 overflow-y-auto px-4 py-4 md:px-5'}>
          <section>
            <p className={`text-[40px] font-bold leading-tight tabular-nums ${balanceTone(player)}`}>{balanceLabel(player)}</p>
            <p className="mt-1 text-sm text-pit-text">{player.creditCents > 0 ? 'Credit on account' : 'Outstanding'}</p>
            <div className="mt-4"><PaymentProgress player={player} /></div>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="chip" aria-label={`${player.paidEventCount} of ${player.applicableEventCount} applicable event fees paid`}>{player.paidEventCount} of {player.applicableEventCount} events</span>
              {docked ? <PaymentStatusBadge status={player.status} /> : null}
              {player.unallocatedPaymentCents > 0 ? <span className="chip text-pit-teal">{formatMoney(player.unallocatedPaymentCents)} unallocated</span> : null}
            </div>
          </section>

          <section className="mt-5 rounded-lg border border-[#26333e] bg-white/[0.015] p-3.5">
            <h3 className="text-sm font-semibold text-white">Charges</h3>
            <div className="mt-3 space-y-2">
              {charges.map((charge) => (
                <div key={charge.id} className="flex min-w-0 items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs text-pit-text" title={charge.label}>{charge.kind === 'season' ? 'Season fee' : charge.label}</p>
                    {!docked ? <p className="mt-0.5 text-[11px] text-pit-muted">{statusLabel(charge.status)}</p> : null}
                  </div>
                  <span className="text-sm tabular-nums text-pit-text">{formatMoney(charge.billedCents)}</span>
                </div>
              ))}
              {charges.length === 0 ? <p className="py-3 text-sm text-pit-text">No charges apply to this player yet.</p> : null}
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-pit-border pt-3 text-sm font-bold text-white">
              <span>Total billed</span><span className="tabular-nums">{formatMoney(player.billedCents)}</span>
            </div>
          </section>

          <section className="mt-3 rounded-lg border border-[#26333e] bg-white/[0.015] p-3.5">
            <h3 className="text-sm font-semibold text-white">Payments</h3>
            <div className="mt-3 divide-y divide-pit-border/60">
              {player.payments.map((payment) => (
                <div key={payment.paymentid} className="py-2.5 first:pt-0 last:pb-0">
                  <div className="flex min-w-0 items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-pit-text">{formatShortDate(payment.paidat)}</p>
                      <p className="mt-0.5 truncate text-[11px] text-pit-muted" title={payment.eventname ?? undefined}>{paymentTypeLabel(payment)}{payment.eventname ? ` · ${payment.eventname}` : ''}</p>
                    </div>
                    <span className="shrink-0 text-sm tabular-nums text-white">{formatMoney(Math.max(0, Math.round(Number(payment.amount || 0) * 100)))}</span>
                    <button type="button" className={`flex shrink-0 items-center justify-center rounded-lg text-pit-muted hover:bg-white/10 hover:text-pit-teal focus:outline-none focus-visible:ring-2 focus-visible:ring-pit-teal/60 ${docked ? 'h-8 w-8' : 'h-11 w-11'}`} onClick={() => onEdit(payment)} aria-label={`Edit ${formatMoney(Math.max(0, Math.round(Number(payment.amount || 0) * 100)))} payment`}>
                      <Pencil size={14} />
                    </button>
                    <button type="button" className={`flex shrink-0 items-center justify-center rounded-lg text-pit-muted hover:bg-red-400/10 hover:text-red-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400/60 ${docked ? 'h-8 w-8' : 'h-11 w-11'}`} disabled={deleteLoading} onClick={() => requestDelete(payment)} aria-label={`Delete ${formatMoney(Math.max(0, Math.round(Number(payment.amount || 0) * 100)))} payment`}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                  {payment.note ? <p className="mt-1 break-words text-xs leading-5 text-pit-text">{payment.note}</p> : null}
                </div>
              ))}
              {player.payments.length === 0 ? <p className="py-3 text-sm text-pit-text">No payments recorded yet.</p> : null}
            </div>
            <div className="mt-3 flex items-center justify-between border-t border-pit-border pt-3 text-sm font-bold text-white">
              <span>Total paid</span><span className="tabular-nums">{formatMoney(player.paidCents)}</span>
            </div>
          </section>
          {deleteError ? <p className="mt-3 rounded-lg border border-red-400/25 bg-red-400/10 p-3 text-sm text-red-200">{deleteError}</p> : null}
        </div>

        <footer className={`shrink-0 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] ${docked ? '' : 'border-t border-pit-border bg-[#0d151b] pt-3 md:px-5 md:pb-5'}`}>
          <button type="button" className="btn-primary min-h-11 w-full justify-center gap-2 !rounded-lg !border-[#00c6cf] !bg-gradient-to-r !from-[#00bcca] !to-[#00aeb9] !text-white" onClick={onRecord}>
            <Plus size={17} /> Record Payment
          </button>
        </footer>
      </div>
    </div>
  );
}

function RecentPayments({ detail, players, onOpen }: { detail: LeagueDetail; players: LeaguePlayerPaymentRow[]; onOpen: (userId: string) => void }) {
  const rows = detail.payments.slice(0, 6);
  if (!rows.length) return null;
  const playerMap = new Map(players.map((player) => [player.userid, player]));
  return (
    <section className="rounded-lg border border-[#26333e] bg-[#0c1419] p-4 min-[1200px]:border-x-0 min-[1200px]:border-b-0 min-[1200px]:bg-transparent min-[1200px]:px-0">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-white">Latest payments</h3>
        </div>
        <span className="chip"><ReceiptText size={13} /> {detail.payments.length} records</span>
      </div>
      <div className="mt-3 divide-y divide-pit-border/60">
        {rows.map((payment) => {
          const player = playerMap.get(payment.userid);
          return (
            <button key={payment.paymentid} type="button" className="flex min-h-14 w-full min-w-0 items-center gap-3 py-2 text-left hover:text-white" onClick={() => onOpen(payment.userid)}>
              {player ? <PlayerAvatar player={player} /> : <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-pit-border text-xs font-bold text-pit-text">?</span>}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-white">{player?.identity.name ?? payment.displayname ?? 'Player'}</span>
                <span className="mt-0.5 block truncate text-xs text-pit-muted">{paymentTypeLabel(payment)} · {formatShortDate(payment.paidat)}{payment.eventname ? ` · ${payment.eventname}` : ''}</span>
              </span>
              <span className="shrink-0 font-semibold tabular-nums text-pit-teal">{formatMoney(Math.max(0, Math.round(Number(payment.amount || 0) * 100)))}</span>
              <ChevronRight size={15} className="shrink-0 text-pit-muted" />
            </button>
          );
        })}
      </div>
    </section>
  );
}

function PaymentProgress({ player }: { player: LeaguePlayerPaymentRow }) {
  const percent = player.completionBasisPoints / 100;
  return (
    <div className="min-w-0">
      <div className="flex min-w-0 items-baseline justify-between gap-2 text-xs">
        <span className="min-w-0 truncate tabular-nums text-pit-text" title={`${formatMoney(player.paidCents)} of ${formatMoney(player.billedCents)} paid`}>
          <strong className="font-semibold text-white">{formatMoney(player.paidCents)}</strong> of {formatMoney(player.billedCents)}
        </span>
        <span className="shrink-0 tabular-nums text-pit-muted">{formatPercent(percent)}</span>
      </div>
      <PaymentProgressBar basisPoints={player.completionBasisPoints} label={`${player.identity.full}: ${formatPercent(percent)} paid`} className="mt-2" />
    </div>
  );
}

function PaymentProgressBar({ basisPoints, label, className = '' }: { basisPoints: number; label: string; className?: string }) {
  const visualPercent = Math.max(0, Math.min(100, basisPoints / 100));
  return (
    <div
      className={`h-2 overflow-hidden rounded-full bg-[#333b48] ${className}`}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(visualPercent)}
    >
      <span className="block h-full rounded-full bg-gradient-to-r from-[#00bccb] to-[#00d0d6] transition-[width] motion-reduce:transition-none" style={{ width: `${visualPercent}%` }} />
    </div>
  );
}

function PlayerAvatar({ player, large = false }: { player: LeaguePlayerPaymentRow; large?: boolean }) {
  const sizeClass = large ? 'h-12 w-12 text-sm' : 'h-9 w-9 text-xs';
  if (player.member.avatarimagedata) {
    return <img className={`${sizeClass} shrink-0 rounded-full border border-pit-border object-cover`} src={player.member.avatarimagedata} alt="" />;
  }
  return <span className={`flex ${sizeClass} shrink-0 items-center justify-center rounded-full border border-pit-border bg-gradient-to-br from-[#354052] to-[#202734] font-bold text-pit-text`} aria-hidden="true">{player.identity.initials}</span>;
}

function PlayerIdentity({ player, compact = false }: { player: LeaguePlayerPaymentRow; compact?: boolean }) {
  return (
    <span className="block min-w-0 flex-1">
      <span className={`block truncate font-semibold text-white ${compact ? 'text-xs' : 'text-sm'}`} title={player.identity.name}>{player.identity.name}</span>
      {player.identity.nickname ? <span className="mt-0.5 block truncate text-[11px] text-pit-muted" title={player.identity.nickname}>{player.identity.nickname}</span> : null}
    </span>
  );
}

function PaymentStatusBadge({ status }: { status: LeaguePaymentStatus }) {
  const className = status === 'paid'
    ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300'
    : status === 'partial'
      ? 'border-[#e5aa26]/50 bg-[#e5aa26]/10 text-[#ffbe38]'
      : status === 'unpaid'
        ? 'border-red-400/45 bg-red-400/10 text-red-300'
        : status === 'credit'
          ? 'border-blue-400/45 bg-blue-400/10 text-blue-300'
          : 'border-pit-border bg-white/[0.04] text-pit-text';
  return (
    <span className={`inline-flex min-h-7 shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold ${className}`}>
      {status === 'paid' ? <CheckCircle2 size={12} aria-hidden="true" /> : status === 'partial' ? <Clock3 size={12} aria-hidden="true" /> : status === 'credit' ? <CircleDollarSign size={12} aria-hidden="true" /> : null}
      {statusLabel(status)}
    </span>
  );
}

function ChargeStatus({ charge }: { charge: LeaguePaymentCharge }) {
  if (charge.status === 'not_due') return <span className="text-[11px] text-pit-muted">N/A</span>;
  if (charge.status === 'paid') return <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-300"><CheckCircle2 size={12} /> Paid</span>;
  if (charge.status === 'credit') return <span className="text-[11px] font-semibold text-blue-300">{formatMoney(charge.creditCents)} credit</span>;
  return (
    <span className={`text-[11px] font-semibold tabular-nums ${charge.status === 'partial' ? 'text-pit-gold' : 'text-red-300'}`}>
      {charge.status === 'partial' ? `${formatMoney(charge.outstandingCents)} open` : `${formatMoney(charge.billedCents)} due`}
    </span>
  );
}

function EventMetric({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: 'neutral' | 'teal' | 'amber' }) {
  return <div><p className={`font-bold tabular-nums ${tone === 'teal' ? 'text-pit-teal' : tone === 'amber' ? 'text-pit-gold' : 'text-white'}`}>{value}</p><p className="mt-1 text-[10px] uppercase tracking-wide text-pit-muted">{label}</p></div>;
}

function PaymentEmptyState({ title, message, actionLabel, onAction }: { title: string; message: string; actionLabel?: string; onAction?: () => void }) {
  return (
    <div className="px-4 py-12 text-center">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-pit-border bg-pit-bg/70 text-pit-muted"><DollarSign size={20} /></span>
      <h3 className="mt-3 font-semibold text-white">{title}</h3>
      <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-pit-text">{message}</p>
      {actionLabel && onAction ? <button type="button" className="btn-ghost mt-4 text-sm text-pit-teal" onClick={onAction}>{actionLabel}</button> : null}
    </div>
  );
}

function useDesktopPaymentDetails() {
  const [docked, setDocked] = useState(() => window.matchMedia('(min-width: 1280px)').matches);
  useEffect(() => {
    const media = window.matchMedia('(min-width: 1280px)');
    const update = () => setDocked(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return docked;
}

function useDialogFocus(panelRef: React.RefObject<HTMLDivElement>, onClose: () => void, enabled: boolean) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (!enabled) return undefined;
    const panel = panelRef.current;
    if (!panel) return undefined;
    // A payment/settings modal can already own focus when a desktop dock
    // becomes a mobile drawer. Dismiss the drawer before acquiring its own
    // scroll lock or trap; the shared Modal remains the only active overlay.
    if (hasOtherModal(panel)) {
      onCloseRef.current();
      return undefined;
    }
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusFrame = window.requestAnimationFrame(() => {
      if (!hasOtherModal(panel)) (getFocusableElements(panel)[0] ?? panel).focus({ preventScroll: true });
    });
    const handleKeyDown = (event: KeyboardEvent) => {
      if (hasOtherModal(panel)) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = getFocusableElements(panel);
      if (!focusable.length) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!panel.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    const handleFocusIn = (event: FocusEvent) => {
      if (hasOtherModal(panel) || panel.contains(event.target as Node)) return;
      (getFocusableElements(panel)[0] ?? panel).focus();
    };
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('focusin', handleFocusIn);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('focusin', handleFocusIn);
      if (document.body.style.overflow === 'hidden' && !hasOtherModal(panel)) {
        document.body.style.overflow = previousOverflow;
      }
      if (previousFocus && isVisibleFocusable(previousFocus) && !hasOtherModal(panel)) {
        previousFocus.focus({ preventScroll: true });
      }
    };
  }, [enabled, panelRef]);
}

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'))
    .filter(isVisibleFocusable);
}

function isVisibleFocusable(element: HTMLElement): boolean {
  return element.isConnected && element.getAttribute('aria-hidden') !== 'true'
    && (element.offsetWidth > 0 || element.offsetHeight > 0 || element.getClientRects().length > 0);
}

function hasOtherModal(panel?: HTMLElement | null): boolean {
  return Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]'))
    .some((dialog) => dialog !== panel && isVisibleFocusable(dialog));
}

function balanceLabel(player: LeaguePlayerPaymentRow) {
  return player.creditCents > 0 ? `${formatMoney(player.creditCents)} credit` : formatMoney(player.outstandingCents);
}

function balanceTone(player: LeaguePlayerPaymentRow) {
  if (player.creditCents > 0) return 'text-blue-300';
  if (player.outstandingCents > 0) return 'text-[#ffbe38]';
  return 'text-emerald-300';
}

function statusLabel(status: LeaguePaymentStatus) {
  if (status === 'not_due') return 'Not Due';
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function paymentTypeLabel(payment: LeaguePayment) {
  if (payment.paymenttype === 'event') return 'Event fee';
  if (payment.paymenttype === 'other') return 'Other';
  return 'Season fee';
}

function parsePaymentView(value: string | null): PaymentView {
  return value === 'events' ? 'events' : 'balances';
}

function parsePaymentFilter(value: string | null): LeaguePaymentStatusFilter {
  return value === 'all' || value === 'partial' || value === 'paid' || value === 'unpaid' || value === 'not_due' || value === 'credit'
    ? value
    : 'outstanding';
}

function parsePaymentSort(value: string | null): LeaguePaymentSort {
  return SORT_OPTIONS.some((option) => option.id === value) ? value as LeaguePaymentSort : 'outstanding-desc';
}

function formatMoney(cents: number) {
  const amount = Math.round(Number(cents || 0)) / 100;
  const hasCents = Math.abs(cents) % 100 !== 0;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatPercent(percent: number) {
  return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(Number.isFinite(percent) ? percent : 0)}%`;
}

function formatShortDate(value?: string | null) {
  const raw = String(value ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw || 'Date not set';
  const [year, month, day] = raw.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(year, month - 1, day));
}

function normalizeSeasonLabel(name: string) {
  const trimmed = String(name ?? '').trim();
  if (!trimmed) return 'Current season';
  return /^season\b/i.test(trimmed) ? trimmed : `Season ${trimmed}`;
}
