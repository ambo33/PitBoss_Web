import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Banknote, CheckCircle2, MinusCircle, Plus, ReceiptText, UserPlus } from 'lucide-react';
import { api, CashGamePlayer, CashGamePlayerStatus } from '../../api/client';
import ConfirmDialog from '../../components/ConfirmDialog';
import LoadingSpinner from '../../components/LoadingSpinner';

type MoneyField = 'buyintotal' | 'addontotal' | 'cashouttotal';

export default function CashGameAdminPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [selectedUserId, setSelectedUserId] = useState('');
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [removeTarget, setRemoveTarget] = useState<CashGamePlayer | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['game', id],
    queryFn: () => api.getGame(id!),
    enabled: Boolean(id),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['game', id] });
  const addPlayerMutation = useMutation({
    mutationFn: (userid: string) => api.addCashGamePlayer(id!, userid),
    onSuccess: () => {
      setSelectedUserId('');
      invalidate();
    },
  });
  const updatePlayerMutation = useMutation({
    mutationFn: ({ player, data }: { player: CashGamePlayer; data: Partial<Pick<CashGamePlayer, MoneyField | 'status'>> }) =>
      api.updateCashGamePlayer(id!, player.userid, data),
    onSuccess: invalidate,
  });
  const removeMutation = useMutation({
    mutationFn: (player: CashGamePlayer) => api.removeCashGamePlayer(id!, player.userid),
    onSuccess: () => {
      setRemoveTarget(null);
      invalidate();
    },
  });
  const updateGameMutation = useMutation({
    mutationFn: (status: 'active' | 'completed' | 'cancelled') => api.updateGame(id!, { status }),
    onSuccess: invalidate,
  });

  const players = data?.players ?? [];
  const availableMembers = useMemo(() => {
    const activeIds = new Set(players.map((player) => player.userid));
    return (data?.members ?? []).filter((member) => !activeIds.has(member.userid));
  }, [data?.members, players]);
  const totals = useMemo(() => {
    const buyIns = players.reduce((sum, player) => sum + Number(player.buyintotal ?? 0), 0);
    const addOns = players.reduce((sum, player) => sum + Number(player.addontotal ?? 0), 0);
    const cashOuts = players.reduce((sum, player) => sum + Number(player.cashouttotal ?? 0), 0);
    return {
      buyIns,
      addOns,
      cashOuts,
      onTable: buyIns + addOns - cashOuts,
    };
  }, [players]);
  const seats = Number(data?.cashdetails?.seatsavailable ?? 0);
  const openSeats = seats > 0 ? Math.max(0, seats - players.filter((player) => player.status !== 'cashed_out').length) : null;
  const canManage = Boolean(data?.game.canmanage);

  function money(value: unknown) {
    const amount = Number(value ?? 0);
    return `$${Number.isFinite(amount) ? amount.toFixed(2) : '0.00'}`;
  }

  function addAmount(player: CashGamePlayer, field: MoneyField) {
    const raw = amounts[player.userid] ?? '';
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount <= 0) return;
    setAmounts((current) => ({ ...current, [player.userid]: '' }));
    updatePlayerMutation.mutate({
      player,
      data: { [field]: Number(player[field] ?? 0) + amount },
    });
  }

  function setStatus(player: CashGamePlayer, status: CashGamePlayerStatus) {
    updatePlayerMutation.mutate({ player, data: { status } });
  }

  if (isLoading) return <LoadingSpinner className="mt-24" />;
  if (error || !data) {
    return (
      <div className="min-h-screen bg-pit-bg p-4 text-white">
        <div className="card mx-auto mt-16 max-w-lg text-center">
          <h1 className="text-lg font-semibold">Cash game unavailable</h1>
          <p className="mt-2 text-sm text-pit-muted">{error?.message ?? 'This game could not be loaded.'}</p>
          <button className="btn-primary mt-4" onClick={() => navigate('/')}>Back home</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-pit-bg px-4 py-5 text-white">
      <div className="mx-auto max-w-6xl space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button type="button" className="btn-ghost gap-2 px-3 py-2" onClick={() => navigate(-1)}>
            <ArrowLeft size={15} />
            Back
          </button>
          <div className="flex flex-wrap items-center gap-2">
            {canManage && data.game.status !== 'active' && (
              <button className="btn-ghost px-3 py-2 text-xs" onClick={() => updateGameMutation.mutate('active')}>
                Mark active
              </button>
            )}
            {canManage && data.game.status !== 'completed' && (
              <button className="btn-ghost px-3 py-2 text-xs" onClick={() => updateGameMutation.mutate('completed')}>
                Complete
              </button>
            )}
          </div>
        </div>

        <section className="rounded-2xl border border-pit-border bg-gradient-to-br from-pit-teal/20 via-pit-surface to-pit-bg p-5 shadow-card">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pit-teal">Cash Game</p>
              <h1 className="mt-2 text-3xl font-bold">{data.game.title}</h1>
              <p className="mt-1 text-sm text-pit-text">
                {data.game.groupname} · {data.cashdetails?.stakeslabel ?? 'Stakes TBD'} · {data.game.visibility === 'invite_only' ? 'Invite only' : 'Public to group'}
              </p>
              {data.cashdetails?.notes && <p className="mt-3 max-w-2xl text-sm text-pit-text">{data.cashdetails.notes}</p>}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Status" value={data.game.status} />
              <Stat label="Seats" value={openSeats === null ? 'Open' : `${openSeats} open`} />
              <Stat label="Min" value={data.cashdetails?.minbuyin == null ? '-' : money(data.cashdetails.minbuyin)} />
              <Stat label="Max" value={data.cashdetails?.maxbuyin == null ? '-' : money(data.cashdetails.maxbuyin)} />
            </div>
          </div>
        </section>

        <div className="grid gap-3 md:grid-cols-4">
          <StatCard icon={Banknote} label="Buy-ins" value={money(totals.buyIns)} />
          <StatCard icon={Plus} label="Add-ons/top-ups" value={money(totals.addOns)} />
          <StatCard icon={ReceiptText} label="Cash-outs" value={money(totals.cashOuts)} />
          <StatCard icon={CheckCircle2} label="On table" value={money(totals.onTable)} highlight />
        </div>

        {!canManage && (
          <div className="rounded-xl border border-pit-border bg-pit-surface p-4 text-sm text-pit-text">
            This cash game is visible to you, but only group admins can manage buy-ins, add-ons/top-ups, and cash-outs.
          </div>
        )}

        {canManage && (
          <section className="rounded-2xl border border-pit-border bg-pit-surface p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <label className="flex-1 space-y-2">
                <span className="text-xs font-semibold uppercase tracking-[0.2em] text-pit-muted">Add player from group</span>
                <select className="input" value={selectedUserId} onChange={(event) => setSelectedUserId(event.target.value)}>
                  <option value="">Choose member</option>
                  {availableMembers.map((member) => (
                    <option key={member.userid} value={member.userid}>{member.displayname ?? member.emailaddress ?? 'Player'}</option>
                  ))}
                </select>
              </label>
              <button
                className="btn-primary gap-2 px-4 py-2.5"
                disabled={!selectedUserId || addPlayerMutation.isPending}
                onClick={() => addPlayerMutation.mutate(selectedUserId)}
              >
                <UserPlus size={16} />
                Add player
              </button>
            </div>
          </section>
        )}

        <section className="rounded-2xl border border-pit-border bg-pit-surface p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-pit-muted">Player ledger</p>
              <h2 className="text-xl font-semibold">Players</h2>
            </div>
            <span className="chip">{players.length} players</span>
          </div>

          {players.length === 0 ? (
            <div className="rounded-xl border border-dashed border-pit-border bg-pit-bg p-8 text-center">
              <p className="font-semibold">No players added yet</p>
              <p className="mt-1 text-sm text-pit-muted">Invite group members to this cash game.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {players.map((player) => {
                const net = Number(player.cashouttotal ?? 0) - Number(player.buyintotal ?? 0) - Number(player.addontotal ?? 0);
                return (
                  <article key={player.userid} className="rounded-xl border border-pit-border bg-pit-bg p-3">
                    <div className="grid gap-3 lg:grid-cols-[1.2fr_3fr_auto] lg:items-center">
                      <div>
                        <p className="font-semibold">{player.displayname ?? 'Player'}</p>
                        <p className="mt-1 text-xs uppercase tracking-[0.16em] text-pit-muted">{player.status.replace('_', ' ')}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <MiniStat label="Buy-in" value={money(player.buyintotal)} />
                        <MiniStat label="Top-up" value={money(player.addontotal)} />
                        <MiniStat label="Cash out" value={money(player.cashouttotal)} />
                        <MiniStat label="Net" value={money(net)} tone={net >= 0 ? 'good' : 'bad'} />
                      </div>
                      {canManage && (
                        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                          <input
                            className="input h-9 w-24 text-sm"
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="$"
                            value={amounts[player.userid] ?? ''}
                            onChange={(event) => setAmounts((current) => ({ ...current, [player.userid]: event.target.value }))}
                          />
                          <button className="btn-ghost px-2.5 py-2 text-xs" onClick={() => addAmount(player, 'buyintotal')}>Buy-in</button>
                          <button className="btn-ghost px-2.5 py-2 text-xs" onClick={() => addAmount(player, 'addontotal')}>Top-up</button>
                          <button className="btn-ghost px-2.5 py-2 text-xs" onClick={() => addAmount(player, 'cashouttotal')}>Cash out</button>
                          {player.status !== 'seated' && <button className="btn-ghost px-2.5 py-2 text-xs" onClick={() => setStatus(player, 'seated')}>Seat</button>}
                          {player.status !== 'cashed_out' && <button className="btn-ghost px-2.5 py-2 text-xs" onClick={() => setStatus(player, 'cashed_out')}>Mark out</button>}
                          <button className="btn-ghost px-2.5 py-2 text-xs text-red-300" onClick={() => setRemoveTarget(player)}>
                            <MinusCircle size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {canManage && data.ledger.length > 0 && (
          <section className="rounded-2xl border border-pit-border bg-pit-surface p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-pit-muted">Recent activity</p>
            <div className="mt-3 space-y-2">
              {data.ledger.slice(0, 8).map((event) => (
                <div key={event.id} className="flex items-center justify-between gap-3 rounded-lg border border-pit-border bg-pit-bg px-3 py-2 text-sm">
                  <span>{event.displayname ?? 'Player'} · {event.eventtype.replace('_', ' ')}</span>
                  <span className="text-pit-muted">{event.amount == null ? '' : money(event.amount)}</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(removeTarget)}
        onClose={() => setRemoveTarget(null)}
        title="Remove player?"
        confirmLabel="Remove"
        tone="danger"
        loading={removeMutation.isPending}
        onConfirm={() => removeTarget && removeMutation.mutate(removeTarget)}
        message={removeTarget ? (
          <p>Remove <span className="font-semibold text-white">{removeTarget.displayname ?? 'this player'}</span> from this cash game ledger?</p>
        ) : null}
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-pit-border bg-pit-bg/70 px-3 py-2">
      <p className="text-[10px] uppercase tracking-[0.2em] text-pit-muted">{label}</p>
      <p className="mt-1 text-sm font-semibold capitalize">{value}</p>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, highlight = false }: { icon: React.ElementType; label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${highlight ? 'border-pit-teal/40 bg-pit-teal/10' : 'border-pit-border bg-pit-surface'}`}>
      <Icon size={18} className={highlight ? 'text-pit-teal' : 'text-pit-muted'} />
      <p className="mt-3 text-xs uppercase tracking-[0.2em] text-pit-muted">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'bad' }) {
  return (
    <div className="rounded-lg border border-pit-border bg-pit-surface/70 px-3 py-2">
      <p className="text-[10px] uppercase tracking-[0.18em] text-pit-muted">{label}</p>
      <p className={`mt-1 font-semibold ${tone === 'good' ? 'text-pit-teal' : tone === 'bad' ? 'text-red-200' : 'text-white'}`}>{value}</p>
    </div>
  );
}
