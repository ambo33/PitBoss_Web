import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, GroupMember, Tournament, TournamentPlayer } from '../../api/client';
import LoadingSpinner from '../../components/LoadingSpinner';
import Modal from '../../components/Modal';

interface Props {
  tournamentId: string;
  isOwner: boolean;
  tournament: Tournament;
}

export default function CheckIn({ tournamentId, isOwner, tournament }: Props) {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<'all' | 'in' | 'out'>('all');
  const [search, setSearch] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [guestName, setGuestName] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [selected, setSelected] = useState<TournamentPlayer | null>(null);

  function refreshTournamentData() {
    qc.invalidateQueries({ queryKey: ['players', tournamentId] });
    qc.invalidateQueries({ queryKey: ['tournament', tournamentId] });
    qc.invalidateQueries({ queryKey: ['seating', tournamentId] });
  }

  const { data: groupData } = useQuery({
    queryKey: ['group', tournament.groupid],
    queryFn: () => api.getGroup(tournament.groupid!),
    enabled: isOwner && !!tournament.groupid,
  });

  const { data: players = [], isLoading } = useQuery({
    queryKey: ['players', tournamentId],
    queryFn: () => api.getPlayers(tournamentId),
    refetchInterval: 15_000,
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
  const knockMutation = useMutation({
    mutationFn: ({ uid, placed }: { uid: string; placed: number }) => api.knockPlayer(tournamentId, uid, placed),
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

  const filtered = players.filter((player) => {
    const matchSearch = !search
      || (player.emailaddress?.toLowerCase().includes(search.toLowerCase()) ?? false)
      || (player.displayname?.toLowerCase().includes(search.toLowerCase()) ?? false);
    const matchFilter = filter === 'all' || (filter === 'in' ? player.checkedin : !player.checkedin);
    return matchSearch && matchFilter;
  });

  const checkedIn = players.filter((player) => player.checkedin).length;
  const placed = players.filter((player) => player.placed != null).length;
  const registeredIds = new Set(players.map((player) => player.userid));
  const availableGroupMembers = (groupData?.members ?? []).filter(
    (member: GroupMember) => member.approved && !registeredIds.has(member.userid)
  );

  if (isLoading) return <LoadingSpinner className="mt-12" />;

  return (
    <>
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
            onSelect={() => setSelected(player)}
            tournament={tournament}
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
          activeCount={checkedIn - placed}
          onKnock={(knockPlaced) => knockMutation.mutate({ uid: selected.userid, placed: knockPlaced })}
          onRemove={() => removeMutation.mutate(selected.userid)}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}

function PlayerRow({ player, isOwner, onCheckin, onRebuy, onAddon, onSelect, tournament }: {
  player: TournamentPlayer;
  isOwner: boolean;
  onCheckin: () => void;
  onRebuy: () => void;
  onAddon: () => void;
  onSelect: () => void;
  tournament: Tournament;
}) {
  return (
    <div className={`card flex items-center justify-between gap-3 py-3 ${player.placed != null ? 'opacity-50' : ''}`}>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-white">{player.displayname ?? player.emailaddress ?? 'Guest Player'}</p>
        <div className="mt-1 flex gap-2">
          {player.rebuys > 0 && <span className="badge bg-yellow-900/50 text-xs text-yellow-300">x{player.rebuys} rebuy</span>}
          {player.addedon && <span className="badge bg-blue-900/50 text-xs text-blue-300">add-on</span>}
          {player.placed != null && <span className="badge bg-red-900/50 text-xs text-red-300">#{player.placed}</span>}
          {player.seat != null && <span className="badge bg-pit-teal/20 text-xs text-pit-teal">T{player.tablenumber}.S{player.seat}</span>}
        </div>
      </div>
      {isOwner && (
        <div className="flex shrink-0 gap-2">
          {tournament.rebuyprice > 0 && player.checkedin && player.placed == null && (
            <button className="btn-ghost px-2 py-1 text-xs" onClick={onRebuy}>Rebuy</button>
          )}
          {tournament.addonprice > 0 && !player.addedon && (
            <button className="btn-ghost px-2 py-1 text-xs" onClick={onAddon}>Add-on</button>
          )}
          <button
            onClick={onCheckin}
            className={`btn px-3 py-1 text-xs ${player.checkedin ? 'border border-pit-teal bg-pit-teal/20 text-pit-teal' : 'btn-ghost'}`}
          >
            {player.checkedin ? 'In' : 'Check In'}
          </button>
          <button className="btn-ghost px-2 py-1 text-xs" onClick={onSelect}>...</button>
        </div>
      )}
    </div>
  );
}

function PlayerModal({ player, activeCount, onKnock, onRemove, onClose }: {
  player: TournamentPlayer;
  activeCount: number;
  onKnock: (placed: number) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const [knockPlace, setKnockPlace] = useState(String(activeCount));

  return (
    <Modal title={player.displayname ?? player.emailaddress ?? 'Guest Player'} open onClose={onClose}>
      <div className="space-y-4">
        {player.placed == null && (
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className="mb-1 block text-xs text-pit-text">Place (knock out)</label>
              <input className="input" type="number" min="1" value={knockPlace} onChange={(e) => setKnockPlace(e.target.value)} />
            </div>
            <button className="btn-danger" onClick={() => onKnock(Number(knockPlace))}>
              Knock Out
            </button>
          </div>
        )}
        <button className="btn-ghost w-full border-red-800 text-red-400" onClick={onRemove}>
          Remove from tournament
        </button>
      </div>
    </Modal>
  );
}
