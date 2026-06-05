import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { io, Socket } from 'socket.io-client';
import { QRCodeSVG } from 'qrcode.react';
import { api, GroupMember, Tournament, TournamentPlayer } from '../../api/client';
import CoinBadgeStrip from '../../components/CoinBadgeStrip';
import LoadingSpinner from '../../components/LoadingSpinner';
import Modal from '../../components/Modal';
import PlayerTrophyStrip from '../../components/PlayerTrophyStrip';
import { useAuthStore } from '../../store/auth';
import { getConfiguredBountyPool } from '../../utils/bountyMath';
import { playerNameWithMedals } from '../../utils/playerAchievements';

interface Props {
  tournamentId: string;
  isOwner: boolean;
  tournament: Tournament;
}

type QrView = 'checkin' | 'addon';

export default function CheckIn({ tournamentId, isOwner, tournament }: Props) {
  const qc = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const socketRef = useRef<Socket | null>(null);
  const [filter, setFilter] = useState<'all' | 'in' | 'out'>('all');
  const [search, setSearch] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [guestName, setGuestName] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [selected, setSelected] = useState<TournamentPlayer | null>(null);
  const [qrView, setQrView] = useState<QrView>('checkin');
  const [checkinBusyPlayerId, setCheckinBusyPlayerId] = useState<string | null>(null);

  const checkInUrl = `${window.location.origin}/checkin/${tournamentId}`;
  const addOnUrl = `${window.location.origin}/addon/${tournamentId}`;
  const canUseClubFeatures = Boolean(user?.issuperadmin || user?.canuseclubfeatures);

  function refreshTournamentData() {
    qc.invalidateQueries({ queryKey: ['players', tournamentId] });
    qc.invalidateQueries({ queryKey: ['tournament', tournamentId] });
    qc.invalidateQueries({ queryKey: ['seating', tournamentId] });
  }

  useEffect(() => {
    const socket = io('/', { path: '/socket.io' });
    socketRef.current = socket;
    socket.emit('join-tournament', tournamentId);
    socket.on('tournament-updated', () => {
      refreshTournamentData();
    });
    return () => {
      socket.disconnect();
    };
  }, [tournamentId]);

  const { data: groupData } = useQuery({
    queryKey: ['group', tournament.groupid],
    queryFn: () => api.getGroup(tournament.groupid!),
    enabled: isOwner && !!tournament.groupid,
  });

  const { data: players = [], isLoading } = useQuery({
    queryKey: ['players', tournamentId],
    queryFn: () => api.getPlayers(tournamentId),
  });

  const addMutation = useMutation({
    mutationFn: (data: { userid?: string; displayname?: string }) => api.addPlayer(tournamentId, data),
    onSuccess: () => {
      refreshTournamentData();
      setShowAdd(false);
      setSelectedUserId('');
      setGuestName('');
    },
  });
  const checkinMutation = useMutation({
    mutationFn: (uid: string) => api.toggleCheckin(tournamentId, uid),
    onSuccess: () => refreshTournamentData(),
    onMutate: (uid) => setCheckinBusyPlayerId(uid),
    onSettled: () => setCheckinBusyPlayerId(null),
  });
  const rebuyMutation = useMutation({
    mutationFn: (uid: string) => api.addRebuy(tournamentId, uid),
    onSuccess: () => refreshTournamentData(),
  });
  const addonMutation = useMutation({
    mutationFn: (uid: string) => api.addAddon(tournamentId, uid),
    onSuccess: () => refreshTournamentData(),
  });
  const genericRebuyMutation = useMutation({
    mutationFn: () => api.addGenericRebuy(tournamentId),
    onSuccess: () => refreshTournamentData(),
  });
  const genericAddonMutation = useMutation({
    mutationFn: () => api.addGenericAddon(tournamentId),
    onSuccess: () => refreshTournamentData(),
  });
  const removeRebuyMutation = useMutation({
    mutationFn: (uid: string) => api.removeRebuy(tournamentId, uid),
    onSuccess: () => refreshTournamentData(),
  });
  const removeAddonMutation = useMutation({
    mutationFn: (uid: string) => api.removeAddon(tournamentId, uid),
    onSuccess: () => refreshTournamentData(),
  });
  const removeGenericRebuyMutation = useMutation({
    mutationFn: () => api.removeGenericRebuy(tournamentId),
    onSuccess: () => refreshTournamentData(),
  });
  const removeGenericAddonMutation = useMutation({
    mutationFn: () => api.removeGenericAddon(tournamentId),
    onSuccess: () => refreshTournamentData(),
  });
  const knockMutation = useMutation({
    mutationFn: ({ uid, placed }: { uid: string; placed: number | null }) => api.knockPlayer(tournamentId, uid, placed),
    onSuccess: () => {
      refreshTournamentData();
      setSelected(null);
    },
  });
  const removeMutation = useMutation({
    mutationFn: (uid: string) => api.removePlayer(tournamentId, uid),
    onSuccess: () => {
      refreshTournamentData();
      setSelected(null);
    },
  });

  const actionError = checkinMutation.error
    ?? rebuyMutation.error
    ?? addonMutation.error
    ?? genericRebuyMutation.error
    ?? genericAddonMutation.error
    ?? removeRebuyMutation.error
    ?? removeAddonMutation.error
    ?? removeGenericRebuyMutation.error
    ?? removeGenericAddonMutation.error
    ?? knockMutation.error
    ?? removeMutation.error;

  const filtered = [...players].filter((player) => {
    const matchSearch = !search
      || (player.emailaddress?.toLowerCase().includes(search.toLowerCase()) ?? false)
      || (player.displayname?.toLowerCase().includes(search.toLowerCase()) ?? false);
    const matchFilter = filter === 'all' || (filter === 'in' ? player.checkedin : !player.checkedin);
    return matchSearch && matchFilter;
  }).sort((a, b) => playerName(a).localeCompare(playerName(b), undefined, { sensitivity: 'base' }));

  const checkedIn = players.filter((player) => player.checkedin).length;
  const enteredFieldCount = players.filter((player) => player.checkedin || player.placed != null).length;
  const activePlayers = players.filter((player) => player.checkedin && player.placed == null).length;
  const totalRebuys = players.reduce((sum, player) => sum + toNumber(player.rebuys), 0) + toNumber(tournament.genericrebuys);
  const totalAddons = players.filter((player) => Boolean(player.addedon)).length + toNumber(tournament.genericaddons);
  const grossPot = (toNumber(tournament.buyin) * enteredFieldCount)
    + (toNumber(tournament.rebuyprice) * totalRebuys)
    + (toNumber(tournament.addonprice) * totalAddons);
  const bountyTotal = getConfiguredBountyPool(tournament, grossPot, players);
  const bountyClaimed = tournament.bountyenabled
    ? players.filter((player) => Boolean(player.bountyclaimedat)).reduce((sum, player) => sum + toNumber(player.bountyamount), 0)
    : 0;
  const bountyRemaining = tournament.bountyenabled
    ? Math.max(0, bountyTotal - bountyClaimed)
    : 0;

  const registeredIds = new Set(players.map((player) => player.userid));
  const availableGroupMembers = (groupData?.members ?? []).filter(
    (member: GroupMember) => member.approved && !registeredIds.has(member.userid)
  );

  const stats = useMemo(() => ([
    { label: 'Registered', value: players.length },
    { label: 'Checked In', value: checkedIn },
    { label: 'Still Playing', value: activePlayers },
    { label: 'Total Rebuys', value: totalRebuys },
    { label: 'Add-Ons', value: totalAddons },
    ...(tournament.bountyenabled ? [{ label: 'Bounties Left', value: formatMoney(bountyRemaining), accent: true }] : []),
    { label: 'Gross Pot', value: formatMoney(grossPot), accent: true },
  ]), [activePlayers, bountyRemaining, checkedIn, grossPot, players.length, totalAddons, totalRebuys, tournament.bountyenabled]);

  if (isLoading) return <LoadingSpinner className="mt-12" />;

  return (
    <>
      {isOwner && (
        <section className="card mb-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-semibold text-white">Arrival Check-In</h3>
            {canUseClubFeatures && tournament.addonprice > 0 && tournament.addonchips > 0 && (
              <button
                type="button"
                onClick={() => setQrView((current) => current === 'addon' ? 'checkin' : 'addon')}
                className="btn-ghost px-3 py-1.5 text-xs"
              >
                {qrView === 'addon' ? 'Show check-in' : 'Add-On QR'}
              </button>
            )}
          </div>

          <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
            <div className="flex h-full items-center justify-center rounded-xl border border-pit-border bg-pit-bg/50 p-4">
                <div className="text-center">
                  <div className="mb-3 text-white">
                  <p className="font-semibold">
                    {qrView === 'checkin'
                      ? 'AFTER PAYMENT, SCAN HERE TO CHECK IN'
                      : 'AFTER PAYMENT, SCAN HERE TO ADD-ON'}
                  </p>
                  </div>
                  <div className="inline-block rounded-xl bg-white p-2">
                    <QRCodeSVG value={qrView === 'checkin' ? checkInUrl : addOnUrl} size={110} />
                  </div>
                </div>
            </div>

            <div className="flex h-full flex-col rounded-xl border border-pit-border bg-pit-bg/50 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="font-semibold text-white">Field Status</h3>
              </div>
              <div className="grid flex-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {stats.map((stat) => (
                  <StatCard key={stat.label} label={stat.label} value={stat.value} accent={stat.accent} compact />
                ))}
              </div>
            </div>
          </div>

          {isOwner && !canUseClubFeatures && ((tournament.rebuyprice > 0) || (tournament.addonprice > 0)) && (
            <div className="rounded-xl border border-pit-border bg-pit-bg/50 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="font-semibold text-white">Quick Counters</h3>
                <p className="text-xs text-pit-muted">Host tier uses tournament-level counts.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {tournament.rebuyprice > 0 && (
                  <div className="rounded-lg border border-pit-border bg-pit-bg/60 p-3">
                    <p className="text-xs uppercase tracking-wide text-pit-muted">Rebuys</p>
                    <p className="mt-1 text-2xl font-semibold text-white">{toNumber(tournament.genericrebuys)}</p>
                    <div className="mt-3 flex gap-2">
                      <button className="btn-ghost flex-1 justify-center" onClick={() => removeGenericRebuyMutation.mutate()} disabled={removeGenericRebuyMutation.isPending || toNumber(tournament.genericrebuys) <= 0}>-</button>
                      <button className="btn-primary flex-1 justify-center" onClick={() => genericRebuyMutation.mutate()} disabled={genericRebuyMutation.isPending}>+</button>
                    </div>
                  </div>
                )}
                {tournament.addonprice > 0 && (
                  <div className="rounded-lg border border-pit-border bg-pit-bg/60 p-3">
                    <p className="text-xs uppercase tracking-wide text-pit-muted">Add-Ons</p>
                    <p className="mt-1 text-2xl font-semibold text-white">{toNumber(tournament.genericaddons)}</p>
                    <div className="mt-3 flex gap-2">
                      <button className="btn-ghost flex-1 justify-center" onClick={() => removeGenericAddonMutation.mutate()} disabled={removeGenericAddonMutation.isPending || toNumber(tournament.genericaddons) <= 0}>-</button>
                      <button className="btn-primary flex-1 justify-center" onClick={() => genericAddonMutation.mutate()} disabled={genericAddonMutation.isPending}>+</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      )}

      {!isOwner && (
        <section className="mb-4 space-y-3">
          <div><h3 className="font-semibold text-white">Field Status</h3></div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {stats.map((stat) => (
              <StatCard key={stat.label} label={stat.label} value={stat.value} accent={stat.accent} />
            ))}
          </div>
        </section>
      )}

      <div className="card mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="input min-w-[220px] flex-1"
            placeholder="Search players"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="flex gap-1 rounded-lg border border-pit-border bg-pit-bg p-1">
            {(['all', 'in', 'out'] as const).map((value) => (
              <button
                key={value}
                onClick={() => setFilter(value)}
                className={filter === value ? 'btn-primary px-3 py-1.5 text-xs' : 'btn-ghost border-transparent px-3 py-1.5 text-xs'}
              >
                {value === 'all' ? 'All Players' : value === 'in' ? 'Checked In' : 'Not In'}
              </button>
            ))}
          </div>
          {isOwner && <button className="btn-primary" onClick={() => setShowAdd(true)}>Add Player</button>}
        </div>
        {actionError && (
          <p className="mt-3 rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-400">
            {actionError.message}
          </p>
        )}
      </div>

      <div className="space-y-2">
        {filtered.map((player) => (
          <PlayerRow
            key={player.userid}
            player={player}
            isOwner={isOwner}
            onCheckin={() => checkinMutation.mutate(player.userid)}
            onRebuy={() => rebuyMutation.mutate(player.userid)}
            onAddon={() => addonMutation.mutate(player.userid)}
            onRemoveRebuy={() => removeRebuyMutation.mutate(player.userid)}
            onRemoveAddon={() => removeAddonMutation.mutate(player.userid)}
            onKnockout={() => knockMutation.mutate({ uid: player.userid, placed: Math.max(activePlayers, 1) })}
            onRestore={() => knockMutation.mutate({ uid: player.userid, placed: null })}
            onSelect={() => setSelected(player)}
            tournament={tournament}
            canUseClubFeatures={canUseClubFeatures}
            isCheckinBusy={checkinBusyPlayerId === player.userid}
            isBusy={
              checkinMutation.isPending
              || rebuyMutation.isPending
              || addonMutation.isPending
              || genericRebuyMutation.isPending
              || genericAddonMutation.isPending
              || removeRebuyMutation.isPending
              || removeAddonMutation.isPending
              || removeGenericRebuyMutation.isPending
              || removeGenericAddonMutation.isPending
              || knockMutation.isPending
            }
          />
        ))}
        {filtered.length === 0 && <p className="py-8 text-center text-pit-text">No players match.</p>}
      </div>

      <Modal title="Add Player" open={showAdd} onClose={() => setShowAdd(false)}>
        <div className="space-y-5">
          {addMutation.error && <p className="text-sm text-red-400">{addMutation.error.message}</p>}

          {tournament.groupid && (
            <section className="space-y-3 rounded-xl border border-pit-border bg-pit-bg/60 p-4">
              <div>
                <p className="text-sm font-semibold text-white">Add from group</p>
                <p className="mt-1 text-xs text-pit-text">
                  Choose an approved group member who is not already registered.
                </p>
              </div>
              <select
                className="input"
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                disabled={availableGroupMembers.length === 0}
              >
                <option value="">
                  {availableGroupMembers.length > 0 ? 'Select a group member' : 'No group members available to add'}
                </option>
                {availableGroupMembers.map((member) => (
                  <option key={member.userid} value={member.userid}>
                    {playerNameWithMedals(member)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn-primary w-full"
                onClick={() => addMutation.mutate({ userid: selectedUserId })}
                disabled={addMutation.isPending || !selectedUserId}
              >
                {addMutation.isPending ? 'Adding...' : 'Add Selected Member'}
              </button>
            </section>
          )}

          <section className="space-y-3 rounded-xl border border-pit-border bg-pit-bg/60 p-4">
            <div>
              <p className="text-sm font-semibold text-white">Add guest by name</p>
              <p className="mt-1 text-xs text-pit-text">
                Use this when the player is not in the group list yet.
              </p>
            </div>
            <input
              className="input"
              placeholder="Player name"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
            />
            <button
              type="button"
              className="btn-ghost w-full"
              onClick={() => addMutation.mutate({ displayname: guestName.trim() })}
              disabled={addMutation.isPending || !guestName.trim()}
            >
              {addMutation.isPending ? 'Adding...' : 'Add Guest Player'}
            </button>
          </section>
        </div>
      </Modal>

      {selected && isOwner && (
        <PlayerModal
          player={selected}
          onRemove={() => removeMutation.mutate(selected.userid)}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}

function PlayerRow({ player, isOwner, onCheckin, onRebuy, onAddon, onRemoveRebuy, onRemoveAddon, onKnockout, onRestore, onSelect, tournament, canUseClubFeatures, isCheckinBusy, isBusy }: {
  player: TournamentPlayer;
  isOwner: boolean;
  onCheckin: () => void;
  onRebuy: () => void;
  onAddon: () => void;
  onRemoveRebuy: () => void;
  onRemoveAddon: () => void;
  onKnockout: () => void;
  onRestore: () => void;
  onSelect: () => void;
  tournament: Tournament;
  canUseClubFeatures: boolean;
  isCheckinBusy: boolean;
  isBusy: boolean;
}) {
  return (
    <div className={`card flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between ${player.placed != null ? 'opacity-50' : ''}`}>
      <div className="min-w-0 sm:flex-1">
        <p className="truncate text-sm font-medium text-white">{playerName(player)}</p>
        <PlayerTrophyStrip player={player} size="sm" className="mt-1" />
        <CoinBadgeStrip coins={player.awardedcoins} size="sm" limit={4} className="mt-1" />
        <div className="mt-1 flex max-w-full flex-wrap items-center gap-1.5">
          {player.rebuys > 0 && (
            isOwner && canUseClubFeatures ? (
              <button
                type="button"
                className="badge whitespace-nowrap bg-yellow-900/50 text-xs text-yellow-300 transition hover:bg-yellow-800/60"
                onClick={onRemoveRebuy}
                disabled={isBusy}
                title="Remove one rebuy"
              >
                x{player.rebuys} rebuy
              </button>
            ) : (
              <span className="badge whitespace-nowrap bg-yellow-900/50 text-xs text-yellow-300">x{player.rebuys} rebuy</span>
            )
          )}
          {player.addedon && (
            isOwner && canUseClubFeatures ? (
              <button
                type="button"
                className="badge whitespace-nowrap bg-blue-900/50 text-xs text-blue-300 transition hover:bg-blue-800/60"
                onClick={onRemoveAddon}
                disabled={isBusy}
                title="Remove add-on"
              >
                add-on
              </button>
            ) : (
              <span className="badge whitespace-nowrap bg-blue-900/50 text-xs text-blue-300">add-on</span>
            )
          )}
          {player.placed != null && <span className="badge whitespace-nowrap bg-red-900/50 text-xs text-red-300">#{player.placed}</span>}
          {tournament.bountyenabled && tournament.bountymode !== 'mystery' && toNumber(player.bountyamount) > 0 && (
            <span className="badge whitespace-nowrap bg-amber-400/15 text-xs text-amber-200">
              Bounty {formatMoney(toNumber(player.bountyamount))}
            </span>
          )}
          {player.seat != null && <span className="badge whitespace-nowrap bg-pit-teal/20 text-xs text-pit-teal">T{player.tablenumber}.S{player.seat}</span>}
        </div>
      </div>
      {isOwner && (
        <div className="grid w-full grid-cols-2 gap-2 min-[430px]:grid-cols-[repeat(auto-fit,minmax(76px,1fr))] sm:flex sm:w-auto sm:shrink-0 sm:flex-wrap sm:justify-end">
          {canUseClubFeatures && tournament.rebuyprice > 0 && player.checkedin && player.placed == null && (
            <button type="button" className="btn-ghost min-h-9 justify-center px-2 py-1 text-xs" onClick={onRebuy} disabled={isBusy}>Rebuy</button>
          )}
          {canUseClubFeatures && tournament.addonprice > 0 && !player.addedon && (
            <button type="button" className="btn-ghost min-h-9 justify-center px-2 py-1 text-xs" onClick={onAddon} disabled={isBusy}>Add-on</button>
          )}
          <button
            type="button"
            onClick={onCheckin}
            disabled={isBusy}
            className={`btn min-h-9 justify-center px-3 py-1 text-xs ${isCheckinBusy ? 'animate-pulse border border-pit-teal bg-pit-teal/30 text-white' : player.checkedin ? 'border border-pit-teal bg-pit-teal/20 text-pit-teal' : 'btn-ghost'}`}
          >
              {isCheckinBusy ? 'Working...' : player.checkedin ? 'In' : 'Check In'}
          </button>
          {player.placed == null ? (
            <button
              type="button"
              className="btn-danger min-h-9 justify-center px-2 py-1 text-xs"
              onClick={onKnockout}
              disabled={isBusy || !player.checkedin || Boolean(tournament.bountyenabled)}
              title={tournament.bountyenabled ? 'Use Run Tournament player actions so the knockout can be credited.' : undefined}
            >
              Knockout
            </button>
          ) : (
            <button type="button" className="btn-ghost min-h-9 justify-center px-2 py-1 text-xs" onClick={onRestore} disabled={isBusy}>
              Restore to field
            </button>
          )}
          <button type="button" className="btn-ghost min-h-9 justify-center px-2 py-1 text-xs" onClick={onSelect}>...</button>
        </div>
      )}
    </div>
  );
}

function PlayerModal({ player, onRemove, onClose }: {
  player: TournamentPlayer;
  onRemove: () => void;
  onClose: () => void;
}) {
  return (
    <Modal title={playerName(player)} open onClose={onClose}>
      <div className="space-y-4">
        {player.placed != null && (
          <p className="rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-300">
            Finished in {ordinal(player.placed)} place.
          </p>
        )}
        <button className="btn-ghost w-full border-red-800 text-red-400" onClick={onRemove}>
          Remove from tournament
        </button>
      </div>
    </Modal>
  );
}

function StatCard({
  label,
  value,
  accent = false,
  compact = false,
}: {
  label: string;
  value: string | number;
  accent?: boolean;
  compact?: boolean;
}) {
  return (
    <div className={`rounded-xl border border-pit-border bg-pit-bg/50 text-center ${compact ? 'px-3 py-2' : 'px-3 py-3'}`}>
      <p className={`${compact ? 'text-xl' : 'text-2xl'} font-semibold ${accent ? 'text-pit-teal' : 'text-white'}`}>{value}</p>
      <p className="mt-1 text-xs uppercase tracking-wide text-pit-muted">{label}</p>
    </div>
  );
}

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function playerName(player: TournamentPlayer): string {
  return player.displayname ?? player.emailaddress ?? 'Player';
}

function formatMoney(value: number): string {
  return `$${toNumber(value).toFixed(2)}`;
}

function ordinal(n: number): string {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? 'th' : n % 10 === 1 ? 'st' : n % 10 === 2 ? 'nd' : n % 10 === 3 ? 'rd' : 'th';
  return `${n}${suffix}`;
}
