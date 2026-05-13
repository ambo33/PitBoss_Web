import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { io, Socket } from 'socket.io-client';
import { QRCodeSVG } from 'qrcode.react';
import { api, GroupMember, Tournament, TournamentPlayer } from '../../api/client';
import LoadingSpinner from '../../components/LoadingSpinner';
import Modal from '../../components/Modal';

interface Props {
  tournamentId: string;
  isOwner: boolean;
  tournament: Tournament;
}

type QrView = 'checkin' | 'addon';

export default function CheckIn({ tournamentId, isOwner, tournament }: Props) {
  const qc = useQueryClient();
  const socketRef = useRef<Socket | null>(null);
  const [filter, setFilter] = useState<'all' | 'in' | 'out'>('all');
  const [search, setSearch] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [guestName, setGuestName] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [selected, setSelected] = useState<TournamentPlayer | null>(null);
  const [qrView, setQrView] = useState<QrView>('checkin');

  const checkInUrl = `${window.location.origin}/lobby/${tournamentId}`;
  const addOnUrl = `${window.location.origin}/addon/${tournamentId}`;

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
  });
  const rebuyMutation = useMutation({
    mutationFn: (uid: string) => api.addRebuy(tournamentId, uid),
    onSuccess: () => refreshTournamentData(),
  });
  const addonMutation = useMutation({
    mutationFn: (uid: string) => api.addAddon(tournamentId, uid),
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
    ?? removeRebuyMutation.error
    ?? removeAddonMutation.error
    ?? knockMutation.error
    ?? removeMutation.error;

  const filtered = players.filter((player) => {
    const matchSearch = !search
      || (player.emailaddress?.toLowerCase().includes(search.toLowerCase()) ?? false)
      || (player.displayname?.toLowerCase().includes(search.toLowerCase()) ?? false);
    const matchFilter = filter === 'all' || (filter === 'in' ? player.checkedin : !player.checkedin);
    return matchSearch && matchFilter;
  });

  const checkedIn = players.filter((player) => player.checkedin).length;
  const placed = players.filter((player) => player.placed != null).length;
  const activePlayers = Math.max(checkedIn - placed, 0);
  const totalRebuys = players.reduce((sum, player) => sum + toNumber(player.rebuys), 0);
  const totalAddons = players.filter((player) => Boolean(player.addedon)).length;
  const grossPot = (toNumber(tournament.buyin) * checkedIn)
    + (toNumber(tournament.rebuyprice) * totalRebuys)
    + (toNumber(tournament.addonprice) * totalAddons);

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
    { label: 'Gross Pot', value: formatMoney(grossPot), accent: true },
  ]), [activePlayers, checkedIn, grossPot, players.length, totalAddons, totalRebuys]);

  if (isLoading) return <LoadingSpinner className="mt-12" />;

  return (
    <>
      {isOwner && (
        <section className="card mb-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-semibold text-white">Arrival Check-In</h3>
            <div className="flex rounded-lg border border-pit-border bg-pit-bg p-1">
              <button
                type="button"
                onClick={() => setQrView('checkin')}
                className={qrView === 'checkin' ? 'btn-primary px-3 py-1.5 text-xs' : 'btn-ghost border-transparent px-3 py-1.5 text-xs'}
              >
                Check-In QR
              </button>
              {tournament.addonprice > 0 && tournament.addonchips > 0 && (
                <button
                  type="button"
                  onClick={() => setQrView('addon')}
                  className={qrView === 'addon' ? 'btn-primary px-3 py-1.5 text-xs' : 'btn-ghost border-transparent px-3 py-1.5 text-xs'}
                >
                  Add-On QR
                </button>
              )}
            </div>
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
            onSelect={() => setSelected(player)}
            tournament={tournament}
            isBusy={
              checkinMutation.isPending
              || rebuyMutation.isPending
              || addonMutation.isPending
              || removeRebuyMutation.isPending
              || removeAddonMutation.isPending
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
                    {member.displayname ?? member.emailaddress}
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
          activeCount={activePlayers}
          onKnock={(knockPlaced) => knockMutation.mutate({ uid: selected.userid, placed: knockPlaced })}
          onClearPlacement={() => knockMutation.mutate({ uid: selected.userid, placed: null })}
          onRemove={() => removeMutation.mutate(selected.userid)}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}

function PlayerRow({ player, isOwner, onCheckin, onRebuy, onAddon, onRemoveRebuy, onRemoveAddon, onSelect, tournament, isBusy }: {
  player: TournamentPlayer;
  isOwner: boolean;
  onCheckin: () => void;
  onRebuy: () => void;
  onAddon: () => void;
  onRemoveRebuy: () => void;
  onRemoveAddon: () => void;
  onSelect: () => void;
  tournament: Tournament;
  isBusy: boolean;
}) {
  return (
    <div className={`card flex items-center justify-between gap-3 py-3 ${player.placed != null ? 'opacity-50' : ''}`}>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-white">{player.displayname ?? player.emailaddress ?? 'Guest Player'}</p>
        <div className="mt-1 flex gap-2">
          {player.rebuys > 0 && (
            isOwner ? (
              <button
                type="button"
                className="badge bg-yellow-900/50 text-xs text-yellow-300 transition hover:bg-yellow-800/60"
                onClick={onRemoveRebuy}
                disabled={isBusy}
                title="Remove one rebuy"
              >
                x{player.rebuys} rebuy
              </button>
            ) : (
              <span className="badge bg-yellow-900/50 text-xs text-yellow-300">x{player.rebuys} rebuy</span>
            )
          )}
          {player.addedon && (
            isOwner ? (
              <button
                type="button"
                className="badge bg-blue-900/50 text-xs text-blue-300 transition hover:bg-blue-800/60"
                onClick={onRemoveAddon}
                disabled={isBusy}
                title="Remove add-on"
              >
                add-on
              </button>
            ) : (
              <span className="badge bg-blue-900/50 text-xs text-blue-300">add-on</span>
            )
          )}
          {player.placed != null && <span className="badge bg-red-900/50 text-xs text-red-300">#{player.placed}</span>}
          {player.seat != null && <span className="badge bg-pit-teal/20 text-xs text-pit-teal">T{player.tablenumber}.S{player.seat}</span>}
        </div>
      </div>
      {isOwner && (
        <div className="flex shrink-0 gap-2">
          {tournament.rebuyprice > 0 && player.checkedin && player.placed == null && (
            <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={onRebuy} disabled={isBusy}>Rebuy</button>
          )}
          {tournament.addonprice > 0 && !player.addedon && (
            <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={onAddon} disabled={isBusy}>Add-on</button>
          )}
          <button
            type="button"
            onClick={onCheckin}
            disabled={isBusy}
            className={`btn px-3 py-1 text-xs ${player.checkedin ? 'border border-pit-teal bg-pit-teal/20 text-pit-teal' : 'btn-ghost'}`}
          >
            {player.checkedin ? 'In' : 'Check In'}
          </button>
          <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={onSelect}>...</button>
        </div>
      )}
    </div>
  );
}

function PlayerModal({ player, activeCount, onKnock, onClearPlacement, onRemove, onClose }: {
  player: TournamentPlayer;
  activeCount: number;
  onKnock: (placed: number) => void;
  onClearPlacement: () => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const [knockPlace, setKnockPlace] = useState(String(player.placed ?? Math.max(activeCount, 1)));

  return (
    <Modal title={player.displayname ?? player.emailaddress ?? 'Guest Player'} open onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label className="mb-1 block text-xs text-pit-text">Finish place</label>
            <input className="input" type="number" min="1" value={knockPlace} onChange={(e) => setKnockPlace(e.target.value)} />
          </div>
          <button className="btn-danger" onClick={() => onKnock(Number(knockPlace))}>
            {player.placed == null ? 'Knock Out' : 'Update Place'}
          </button>
        </div>
        {player.placed != null && (
          <button className="btn-ghost w-full" onClick={onClearPlacement}>
            Restore To Field
          </button>
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

function formatMoney(value: number): string {
  return `$${toNumber(value).toFixed(2)}`;
}
