import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Trophy, Users, DollarSign, Calendar, Clock } from 'lucide-react';
import { api, Tournament, Group } from '../../api/client';
import Modal from '../../components/Modal';
import LoadingSpinner from '../../components/LoadingSpinner';

export default function TournamentsPanel() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [tab, setTab] = useState<'upcoming' | 'history'>('upcoming');

  const { data: mine = [], isLoading: loadingMine } = useQuery({
    queryKey: ['tournaments', 'mine'],
    queryFn: api.getTournaments,
  });

  const createMutation = useMutation({
    mutationFn: (data: Partial<Tournament>) => api.createTournament(data),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['tournaments'] });
      setShowCreate(false);
      navigate(`/tournament/${(res as { tournamentid: string }).tournamentid}`);
    },
  });

  const todayKey = getLocalDateKey(new Date());

  const upcoming = mine.filter((t) => {
    const tournamentDateKey = getDateKey(t.tourneydate);
    return !!tournamentDateKey && tournamentDateKey > todayKey;
  });

  const history = mine.filter((t) => !upcoming.some((future) => future.tournamentid === t.tournamentid));

  const list = tab === 'upcoming' ? upcoming : history;
  const loading = loadingMine;

  return (
    <>
      <div className="flex items-center justify-between mb-5">
        <div className="flex gap-0.5 bg-pit-surface rounded-lg p-1 border border-pit-border">
          {(['upcoming', 'history'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all duration-150 ${
                tab === t
                  ? 'bg-pit-teal text-white shadow-sm'
                  : 'text-pit-muted hover:text-white'
              }`}
            >
              {t === 'upcoming' ? 'Upcoming' : 'History'}
            </button>
          ))}
        </div>
        <button className="btn-primary gap-1.5 px-3 py-2" onClick={() => setShowCreate(true)}>
          <Trophy size={14} />
          New
        </button>
      </div>

      {loading ? <LoadingSpinner className="mt-16" /> : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map(t => (
            <TournamentCard key={t.tournamentid} t={t} onClick={() => navigate(`/tournament/${t.tournamentid}`)} />
          ))}
          {list.length === 0 && <EmptyState tab={tab} onNew={() => setShowCreate(true)} />}
        </div>
      )}

      <CreateTournamentModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onSubmit={(data) => createMutation.mutate(data)}
        loading={createMutation.isPending}
        error={createMutation.error?.message}
      />
    </>
  );
}

function TournamentCard({ t, onClick }: { t: Tournament; onClick: () => void }) {
  const dateLabel = getDateKey(t.tourneydate);
  const hasDate = !!dateLabel;
  const hasBuyin = t.buyin > 0;

  return (
    <div onClick={onClick} className="card-hover group">
      {/* Top accent */}
      <div className="h-0.5 -mx-4 -mt-4 mb-4 rounded-t-xl bg-gradient-to-r from-pit-teal/60 via-pit-teal/20 to-transparent" />

      <div className="flex items-start justify-between gap-2 mb-3">
        <p className="font-bold text-white leading-snug line-clamp-2">{t.name}</p>
        {hasBuyin && (
          <span className="shrink-0 flex items-center gap-0.5 text-pit-gold font-bold text-sm">
            <DollarSign size={13} strokeWidth={2.5} />
            {Number(t.buyin).toFixed(0)}
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5 mb-3">
        {hasDate && (
          <span className="chip">
            <Calendar size={10} />
            {dateLabel}
          </span>
        )}
        {t.tourneytime && (
          <span className="chip">
            <Clock size={10} />
            {formatTime12Hour(t.tourneytime)}
          </span>
        )}
      </div>

      <div className="flex items-center gap-3 pt-2.5 border-t border-pit-border/60">
        <span className="flex items-center gap-1 text-xs text-pit-text">
          <Users size={11} />
          {t.playercount ?? 0} registered
        </span>
        {(t.checkedincount ?? 0) > 0 && (
          <span className="text-xs text-pit-teal font-medium">
            {t.checkedincount} checked in
          </span>
        )}
      </div>
    </div>
  );
}

function getDateKey(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.slice(0, 10);
}

function getLocalDateKey(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatTime12Hour(value: string | null | undefined): string {
  if (!value) return '';
  const match = value.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return value;
  const hours24 = Number(match[1]);
  const minutes = match[2];
  const period = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 || 12;
  return `${hours12}:${minutes} ${period}`;
}

function EmptyState({ tab, onNew }: { tab: 'upcoming' | 'history'; onNew: () => void }) {
  return (
    <div className="col-span-full flex flex-col items-center justify-center py-20 gap-4">
      <div className="w-14 h-14 rounded-2xl bg-pit-surface border border-pit-border flex items-center justify-center">
        <Trophy size={24} className="text-pit-muted" />
      </div>
      <div className="text-center">
        <p className="text-white font-semibold">No tournaments yet</p>
        <p className="text-pit-muted text-sm mt-1">
          {tab === 'upcoming' ? 'Only future-dated tournaments appear here' : 'Past and undated tournaments appear here'}
        </p>
      </div>
      {tab === 'upcoming' && (
        <button className="btn-primary" onClick={onNew}>Create tournament</button>
      )}
    </div>
  );
}

function CreateTournamentModal({
  open, onClose, onSubmit, loading, error,
}: {
  open: boolean; onClose: () => void;
  onSubmit: (data: Partial<Tournament>) => void;
  loading: boolean; error?: string;
}) {
  const { data: groups = [] } = useQuery<Group[]>({ queryKey: ['groups'], queryFn: api.getGroups });

  const [form, setForm] = useState({
    name: '', tourneydate: '', tourneytime: '',
    buyin: '', rake: '', rebuyprice: '', rebuychips: '',
    addonprice: '', addonchips: '',
    maxplayers: '', registerself: true,
    groupid: '',
  });

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: (e.target as HTMLInputElement).type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({
      name: form.name,
      tourneydate: form.tourneydate || undefined,
      tourneytime: form.tourneytime || undefined,
      buyin: Number(form.buyin) || 0,
      rake: Number(form.rake) || 0,
      rebuyprice: Number(form.rebuyprice) || 0,
      rebuychips: Number(form.rebuychips) || 0,
      addonprice: Number(form.addonprice) || 0,
      addonchips: Number(form.addonchips) || 0,
      maxplayers: Number(form.maxplayers) || 0,
      registerself: form.registerself,
      groupid: form.groupid || undefined,
    });
  }

  return (
    <Modal title="New Tournament" open={open} onClose={onClose}
      footer={<>
        <button className="btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn-primary" form="create-tourney" disabled={loading}>
          {loading ? 'Creating…' : 'Create'}
        </button>
      </>}
    >
      <form id="create-tourney" onSubmit={submit} className="space-y-3">
        {error && <p className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">{error}</p>}

        <input className="input" placeholder="Tournament name *" value={form.name} onChange={set('name')} required />

        {groups.length > 0 && (
          <select className="input" value={form.groupid} onChange={set('groupid')}>
            <option value="">No group (private)</option>
            {groups.map(g => (
              <option key={g.groupid} value={g.groupid}>{g.name}</option>
            ))}
          </select>
        )}

        <div className="grid grid-cols-2 gap-2">
          <input className="input" type="date" value={form.tourneydate} onChange={set('tourneydate')} />
          <input className="input" type="time" value={form.tourneytime} onChange={set('tourneytime')} />
        </div>

        <p className="eyebrow pt-1">Buy-in &amp; Structure</p>
        <div className="grid grid-cols-2 gap-2">
          <input className="input" type="number" placeholder="Buy-in $" min="0" step="0.01" value={form.buyin} onChange={set('buyin')} />
          <input className="input" type="number" placeholder="Rake $" min="0" step="0.01" value={form.rake} onChange={set('rake')} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input className="input" type="number" placeholder="Max players" min="0" value={form.maxplayers} onChange={set('maxplayers')} />
          <input className="input" type="number" placeholder="Rebuy $" min="0" step="0.01" value={form.rebuyprice} onChange={set('rebuyprice')} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input className="input" type="number" placeholder="Rebuy chips" min="0" value={form.rebuychips} onChange={set('rebuychips')} />
          <input className="input" type="number" placeholder="Add-on $" min="0" step="0.01" value={form.addonprice} onChange={set('addonprice')} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input className="input" type="number" placeholder="Add-on chips" min="0" value={form.addonchips} onChange={set('addonchips')} />
        </div>

        <label className="flex items-center gap-3 py-1 cursor-pointer group/check">
          <div className={`w-9 h-5 rounded-full transition-colors duration-150 flex items-center px-0.5 ${form.registerself ? 'bg-pit-teal' : 'bg-pit-border'}`}>
            <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform duration-150 ${form.registerself ? 'translate-x-4' : 'translate-x-0'}`} />
          </div>
          <input type="checkbox" className="sr-only" checked={form.registerself} onChange={set('registerself')} />
          <span className="text-sm text-pit-text group-hover/check:text-white transition-colors">Register me in this tournament</span>
        </label>
      </form>
    </Modal>
  );
}
