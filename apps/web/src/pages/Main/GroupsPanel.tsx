import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Award, Calendar, Clock, FileText, Info, Layers3, Users, Trophy, Hash, Crown, ExternalLink, LogOut, Mail, MessageSquare, Mic2, Play, Save, Trash2, Upload, Vote } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { api, AnnouncerPreset, GameListItem, Group, GroupCoin, GroupMember, GroupPost, Tournament } from '../../api/client';
import Modal from '../../components/Modal';
import LoadingSpinner from '../../components/LoadingSpinner';
import ConfirmDialog from '../../components/ConfirmDialog';
import { useAuthStore } from '../../store/auth';
import { DEFAULT_COIN_PRESETS } from '../../utils/defaultCoins';
import { playerMedalSuffix, playerNameWithMedals } from '../../utils/playerAchievements';
import { isEnabledFlag } from '../../utils/flags';
import {
  DEFAULT_FIVE_MINUTE_ANNOUNCEMENT,
  DEFAULT_LEVEL_UP_ANNOUNCEMENT,
  DEFAULT_ONE_MINUTE_ANNOUNCEMENT,
} from '../../utils/timerAudio';

type GroupOpenRequest = { groupId: string; token: number } | null;

export default function GroupsPanel({
  onDetailStateChange,
  createRequestId = 0,
  openGroupRequest = null,
}: {
  onDetailStateChange?: (open: boolean) => void;
  createRequestId?: number;
  openGroupRequest?: GroupOpenRequest;
}) {
  const qc = useQueryClient();
  const lastCreateRequestRef = useRef(createRequestId);
  const lastOpenRequestRef = useRef(openGroupRequest?.token ?? 0);
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [selected, setSelected] = useState<Group | null>(null);

  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: api.me,
  });
  const { data: groups = [], isLoading } = useQuery({ queryKey: ['groups'], queryFn: api.getGroups });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; approvalneeded: boolean }) => api.createGroup(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['groups'] }); setShowCreate(false); },
  });
  const joinMutation = useMutation({
    mutationFn: (code: string) => api.joinGroup(code),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['groups'] }); setShowJoin(false); },
  });
  const hostedGroupCount = groups.filter((group) => group.isadmin).length;
  const hostedGroupLimitReached = !me?.issuperadmin && !me?.canuseclubfeatures && hostedGroupCount >= 1;

  useEffect(() => {
    if (!createRequestId || createRequestId === lastCreateRequestRef.current) return;
    lastCreateRequestRef.current = createRequestId;
    setSelected(null);
    setShowCreate(true);
  }, [createRequestId]);

  useEffect(() => {
    if (!openGroupRequest || openGroupRequest.token === lastOpenRequestRef.current || groups.length === 0) return;
    lastOpenRequestRef.current = openGroupRequest.token;
    const requestedGroup = groups.find((group) => group.groupid === openGroupRequest.groupId);
    if (requestedGroup) {
      setShowCreate(false);
      setSelected(requestedGroup);
    }
  }, [groups, openGroupRequest]);

  useEffect(() => {
    onDetailStateChange?.(Boolean(selected));
    return () => onDetailStateChange?.(false);
  }, [onDetailStateChange, selected]);

  if (isLoading) return <LoadingSpinner className="mt-16" />;

  if (selected) {
    return <GroupDetailView group={selected} onBack={() => setSelected(null)} />;
  }

  return (
    <>
      <div className="flex items-center justify-between mb-5">
        <h2 className="font-bold text-white">My Groups</h2>
        <div className="flex gap-2">
          <button className="btn-ghost gap-1.5 px-3 py-2 text-xs" onClick={() => setShowJoin(true)}>
            <Hash size={13} /> Join
          </button>
          <button
            className="btn-primary gap-1.5 px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-60"
            onClick={() => setShowCreate(true)}
            disabled={hostedGroupLimitReached}
            title={hostedGroupLimitReached ? 'Host tier can host 1 group.' : undefined}
          >
            <Users size={13} /> New group
          </button>
        </div>
      </div>

      {hostedGroupLimitReached && (
        <p className="mb-4 rounded-lg border border-yellow-300/20 bg-yellow-300/10 px-3 py-2 text-sm text-yellow-200">
          Host tier can host 1 group at a time. Upgrade to Club or Pro to create more hosted groups.
        </p>
      )}

      <div>
        {groups.length > 0 && (
          <GroupList groups={groups} onSelect={setSelected} />
        )}
        {groups.length === 0 && <GroupEmptyState onJoin={() => setShowJoin(true)} onCreate={() => setShowCreate(true)} />}
      </div>

      <CreateGroupModal open={showCreate} onClose={() => setShowCreate(false)}
        onSubmit={(d) => createMutation.mutate(d)}
        loading={createMutation.isPending} error={createMutation.error?.message} />

      <JoinGroupModal open={showJoin} onClose={() => setShowJoin(false)}
        onSubmit={(code) => joinMutation.mutate(code)}
        loading={joinMutation.isPending} error={joinMutation.error?.message} />

    </>
  );
}

function GroupList({ groups, onSelect }: { groups: Group[]; onSelect: (group: Group) => void }) {
  return (
    <div className="overflow-hidden rounded-xl border border-pit-border bg-pit-surface/70 shadow-[0_14px_38px_rgba(0,0,0,0.16)]">
      <div className="hidden grid-cols-[minmax(0,1.4fr)_8rem_9rem_minmax(0,1.1fr)_7rem] gap-3 border-b border-pit-border/70 bg-black/18 px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-pit-muted md:grid">
        <span>Group</span>
        <span>Members</span>
        <span>Posts</span>
        <span>Next game</span>
        <span className="text-right">Action</span>
      </div>
      <div className="divide-y divide-pit-border/60">
        {groups.map((group) => (
          <GroupListRow key={group.groupid} group={group} onClick={() => onSelect(group)} />
        ))}
      </div>
    </div>
  );
}

function GroupListRow({ group: g, onClick }: { group: Group; onClick: () => void }) {
  const pendingPosts = Number(g.pendingpostcount ?? 0);
  const postCount = Number(g.postcount ?? 0);
  const postLabel = g.isadmin && pendingPosts > 0
    ? `${pendingPosts} pending`
    : `${postCount} post${postCount === 1 ? '' : 's'}`;
  const nextGameLabel = g.nexttournamentname ? g.nexttournamentname : 'No game scheduled';
  const nextGameDate = formatGroupDate(g.nexttournamentdate);
  const nextGameTime = formatGroupTime(g.nexttournamenttime);

  return (
    <button type="button" onClick={onClick} className={`group grid w-full grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1.5 border-l-2 px-3 py-2.5 text-left transition md:grid-cols-[minmax(0,1.4fr)_8rem_9rem_minmax(0,1.1fr)_7rem] md:items-center md:gap-3 md:border-l-0 md:px-4 md:py-3 ${
      g.isadmin ? 'border-pit-gold/60 bg-pit-gold/[0.035]' : 'border-transparent hover:bg-white/[0.025]'
    }`}>
      <div className="col-start-1 row-start-1 min-w-0 md:col-auto md:row-auto">
        <div className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 truncate text-sm font-semibold text-white transition group-hover:text-pit-teal md:text-base">
            {g.name}
          </span>
          {g.isadmin && (
            <span className="hidden shrink-0 rounded-full border border-pit-gold/35 bg-pit-gold/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-pit-gold sm:inline-flex">
              <Crown size={10} className="mr-1" />
              Admin
            </span>
          )}
        </div>
        <p className="mt-1 font-mono text-[11px] tracking-widest text-pit-muted">{g.invitecode}</p>
      </div>

      <div className="col-start-1 row-start-2 flex min-w-0 flex-wrap items-center gap-1.5 text-[11px] text-pit-text md:col-auto md:row-auto">
        <span className="inline-flex items-center gap-1 rounded-full bg-black/25 px-1.5 py-0.5 md:bg-transparent md:px-0 md:py-0">
          <Users size={11} />
          {g.membercount ?? 0}
        </span>
        {g.isadmin && (
          <span className="inline-flex items-center gap-1 rounded-full border border-pit-gold/25 bg-pit-gold/10 px-1.5 py-0.5 text-pit-gold md:hidden">
            <Crown size={10} />
            Admin
          </span>
        )}
      </div>

      <div className="col-start-2 row-start-1 justify-self-end whitespace-nowrap text-right text-xs font-semibold md:col-auto md:row-auto md:justify-self-auto md:text-left">
        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 ${
          g.isadmin && pendingPosts > 0
            ? 'border-red-300/30 bg-red-400/10 text-red-200'
            : 'border-pit-border bg-white/5 text-pit-text'
        }`}>
          <MessageSquare size={12} />
          {postLabel}
        </span>
      </div>

      <div className="col-span-2 row-start-3 min-w-0 text-xs text-pit-text md:col-auto md:row-auto">
        <p className="truncate font-semibold text-white md:text-pit-text">{nextGameLabel}</p>
        {g.nexttournamentname && (
          <p className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-pit-muted">
            {nextGameDate && (
              <span className="inline-flex items-center gap-1">
                <Calendar size={11} />
                {nextGameDate}
              </span>
            )}
            {nextGameTime && (
              <span className="inline-flex items-center gap-1">
                <Clock size={11} />
                {nextGameTime}
              </span>
            )}
          </p>
        )}
      </div>

      <div className="col-start-2 row-start-2 flex justify-end md:col-auto md:row-auto">
        <span className="rounded-lg border border-pit-border bg-pit-card px-3 py-2 text-xs font-semibold text-pit-text transition group-hover:border-pit-teal/40 group-hover:text-white">
          Open
        </span>
      </div>
    </button>
  );
}

function formatGroupDate(value?: string | null) {
  if (!value) return '';
  return String(value).slice(0, 10);
}

function formatGroupTime(value?: string | null) {
  if (!value) return '';
  const match = String(value).match(/^(\d{1,2}):(\d{2})/);
  if (!match) return String(value);
  const hours24 = Number(match[1]);
  const minutes = match[2];
  const period = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 || 12;
  return `${hours12}:${minutes} ${period}`;
}

function GroupEmptyState({ onJoin, onCreate }: { onJoin: () => void; onCreate: () => void }) {
  return (
    <div className="col-span-full flex flex-col items-center py-20 gap-4">
      <div className="w-14 h-14 rounded-2xl bg-pit-surface border border-pit-border flex items-center justify-center">
        <Users size={24} className="text-pit-muted" />
      </div>
      <div className="text-center">
        <p className="text-white font-semibold">No groups yet</p>
        <p className="text-pit-muted text-sm mt-1">Create or join a group to play with friends</p>
      </div>
      <div className="flex gap-2">
        <button className="btn-ghost text-sm" onClick={onJoin}>Join with code</button>
        <button className="btn-primary text-sm" onClick={onCreate}>Create group</button>
      </div>
    </div>
  );
}

function CreateGroupModal({ open, onClose, onSubmit, loading, error }: {
  open: boolean; onClose: () => void;
  onSubmit: (d: { name: string; approvalneeded: boolean }) => void;
  loading: boolean; error?: string;
}) {
  const [name, setName] = useState('');
  const [approvalneeded, setApprovalneeded] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({ name, approvalneeded });
  }

  return (
    <Modal title="Create Group" open={open} onClose={onClose}
      footer={<>
        <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn-primary" form="create-group" disabled={loading}>
          {loading ? 'Creating…' : 'Create'}
        </button>
      </>}
    >
      <form id="create-group" onSubmit={submit} className="space-y-4">
        {error && <p className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">{error}</p>}
        <input className="input" placeholder="Group name *" value={name} onChange={e => setName(e.target.value)} required />
        <label className="flex items-center gap-3 cursor-pointer group/check">
          <div className={`w-9 h-5 rounded-full transition-colors duration-150 flex items-center px-0.5 ${approvalneeded ? 'bg-pit-teal' : 'bg-pit-border'}`}>
            <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform duration-150 ${approvalneeded ? 'translate-x-4' : 'translate-x-0'}`} />
          </div>
          <input type="checkbox" className="sr-only" checked={approvalneeded} onChange={e => setApprovalneeded(e.target.checked)} />
          <span className="text-sm text-pit-text group-hover/check:text-white transition-colors">Require approval to join</span>
        </label>
      </form>
    </Modal>
  );
}

function JoinGroupModal({ open, onClose, onSubmit, loading, error }: {
  open: boolean; onClose: () => void;
  onSubmit: (code: string) => void;
  loading: boolean; error?: string;
}) {
  const [code, setCode] = useState('');

  return (
    <Modal title="Join Group" open={open} onClose={onClose}
      footer={<>
        <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
        <button type="button" className="btn-primary" onClick={() => onSubmit(code)} disabled={loading || !code}>
          {loading ? 'Joining…' : 'Join group'}
        </button>
      </>}
    >
      <div className="space-y-3">
        {error && <p className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">{error}</p>}
        <input className="input text-center font-mono text-lg uppercase tracking-[0.3em] py-3"
          placeholder="XXXXXX" value={code}
          onChange={e => setCode(e.target.value.toUpperCase())} maxLength={8} />
        <p className="text-pit-muted text-xs text-center">Enter the invite code shared by your group admin</p>
      </div>
    </Modal>
  );
}

function AnnouncementField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-semibold uppercase tracking-wide text-pit-muted">{label}</span>
      <textarea
        className="input min-h-20 text-sm"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        maxLength={240}
      />
    </label>
  );
}

function PreferenceToggle({
  label,
  active,
  disabled,
  onClick,
}: {
  label: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-60 ${
        active
          ? 'border-pit-teal/40 bg-pit-teal/15 text-pit-teal'
          : 'border-pit-border bg-pit-surface text-pit-muted hover:text-white'
      }`}
    >
      {label} {active ? 'On' : 'Off'}
    </button>
  );
}

function previewAnnouncement(template: string) {
  return template
    .replace(/\{BlindLevel\}/g, '4')
    .replace(/\{SB\}/g, '200')
    .replace(/\{BB\}/g, '400')
    .replace(/\{Ante\}/g, '50');
}

function groupTabLabel(tab: DetailTab, memberCount: number) {
  if (tab === 'info') return 'Info';
  if (tab === 'members') return `Members (${memberCount})`;
  if (tab === 'posts') return 'Posts';
  if (tab === 'coins') return 'Coins';
  if (tab === 'voice') return 'Voice Configuration';
  if (tab === 'structures') return 'Blind Structures';
  return 'Tournament History';
}

function groupTabIcon(tab: DetailTab) {
  if (tab === 'info') return Info;
  if (tab === 'members') return Users;
  if (tab === 'posts') return MessageSquare;
  if (tab === 'coins') return Award;
  if (tab === 'voice') return Mic2;
  if (tab === 'structures') return Layers3;
  return FileText;
}

const ANNOUNCER_PRESETS: Array<{ value: AnnouncerPreset; label: string; description: string }> = [
  { value: 'all_in_alex', label: 'All-In Alex', description: 'Fast Vegas poker announcer' },
  { value: 'royal_rumble_riley', label: 'Royal Rumble Riley', description: 'Sports arena announcer' },
  { value: 'velvet_dealer', label: 'Velvet Dealer', description: 'Cool female casino host' },
  { value: 'chipstorm', label: 'Chipstorm', description: 'Hyper esports caster' },
  { value: 'queen_of_spades', label: 'Queen of Spades', description: 'Fast confident female announcer' },
  { value: 'the_pit_boss', label: 'The Pit Boss', description: 'Gruff casino floor manager' },
  { value: 'british_high_roller', label: 'British High Roller', description: 'Fast luxury British host' },
  { value: 'turbo_tony', label: 'Turbo Tony', description: 'NY poker room chaos energy' },
  { value: 'midnight_mayhem', label: 'Midnight Mayhem', description: 'Dark cinematic narrator' },
  { value: 'sunny_stacks', label: 'Sunny Stacks', description: 'Friendly upbeat female host' },
];

type DetailTab = 'info' | 'members' | 'posts' | 'coins' | 'voice' | 'structures' | 'history';

function normalizeAnnouncerPreset(value: string | null | undefined): AnnouncerPreset {
  if (ANNOUNCER_PRESETS.some((preset) => preset.value === value)) return value as AnnouncerPreset;
  if (value === 'football') return 'royal_rumble_riley';
  if (value === 'minimal') return 'sunny_stacks';
  if (value === 'roaster') return 'turbo_tony';
  if (value === 'series_director' || value === 'professional') return 'the_pit_boss';
  if (value === 'wwe') return 'royal_rumble_riley';
  return 'all_in_alex';
}

function announcerPreviewUrl(preset: AnnouncerPreset): string {
  return `/sounds/ai-demo/custom/${preset.replace(/_/g, '-')}.mp3`;
}

function GroupDetailView({ group, onBack }: { group: Group; onBack: () => void }) {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [detailTab, setDetailTab] = useState<DetailTab>('info');
  const [inviteCode, setInviteCode] = useState(group.invitecode);
  const [inviteEmail, setInviteEmail] = useState('');
  const [invitePhone, setInvitePhone] = useState('');
  const [inviteNote, setInviteNote] = useState('');
  const [defaultTrackingMode, setDefaultTrackingMode] = useState(group.defaulttrackingmode ?? 'standard');
  const [tvSeatingMessage, setTvSeatingMessage] = useState(group.tvseatingwelcomemessage ?? 'Welcome! Please see host to check-in!');
  const [speechFiveMinuteMessage, setSpeechFiveMinuteMessage] = useState(group.speechfiveminutemessage ?? DEFAULT_FIVE_MINUTE_ANNOUNCEMENT);
  const [speechOneMinuteMessage, setSpeechOneMinuteMessage] = useState(group.speechoneminutemessage ?? DEFAULT_ONE_MINUTE_ANNOUNCEMENT);
  const [speechLevelUpMessage, setSpeechLevelUpMessage] = useState(group.speechlevelupmessage ?? DEFAULT_LEVEL_UP_ANNOUNCEMENT);
  const [aiAnnouncerEnabled, setAiAnnouncerEnabled] = useState(Boolean(group.aiannouncerenabled));
  const [aiAnnouncerPreset, setAiAnnouncerPreset] = useState<AnnouncerPreset>(normalizeAnnouncerPreset(group.aiannouncerpreset));
  const [aiAnnouncerPrompt, setAiAnnouncerPrompt] = useState(group.aiannouncercustomprompt ?? '');
  const [aiAnnouncerClassicMode, setAiAnnouncerClassicMode] = useState(Boolean(group.aiannouncerclassicmode));
  const [announcerPreviewError, setAnnouncerPreviewError] = useState('');
  const [previewingAnnouncer, setPreviewingAnnouncer] = useState(false);
  const announcerPreviewRef = useRef<HTMLAudioElement | null>(null);
  const [postType, setPostType] = useState<'message' | 'poll'>('message');
  const [postMessage, setPostMessage] = useState('');
  const [pollOptionsText, setPollOptionsText] = useState('Yes\nNo');
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [smsStatus, setSmsStatus] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const [coinName, setCoinName] = useState('');
  const [coinDescription, setCoinDescription] = useState('');
  const [coinImageData, setCoinImageData] = useState<string | null>(null);
  const [coinImageFilename, setCoinImageFilename] = useState<string | null>(null);
  const [coinFileError, setCoinFileError] = useState('');
  const [awardCoinId, setAwardCoinId] = useState('');
  const [awardUserId, setAwardUserId] = useState('');
  const [awardNote, setAwardNote] = useState('');
  const [deleteGroupConfirmOpen, setDeleteGroupConfirmOpen] = useState(false);
  const [deletePostTarget, setDeletePostTarget] = useState<GroupPost | null>(null);

  const { data } = useQuery({
    queryKey: ['group', group.groupid],
    queryFn: () => api.getGroup(group.groupid),
  });
  const { data: profile } = useQuery({
    queryKey: ['me'],
    queryFn: api.me,
  });

  const effectiveGroup = data ?? group;

  const { data: groupTournaments = [], isLoading: loadingTourneys } = useQuery({
    queryKey: ['group', group.groupid, 'tournaments'],
    queryFn: () => api.getGroupTournaments(group.groupid),
    enabled: detailTab === 'history',
  });
  const { data: groupGames = [], isLoading: loadingGames } = useQuery({
    queryKey: ['group', group.groupid, 'games'],
    queryFn: () => api.getGroupGames(group.groupid),
    enabled: detailTab === 'history',
  });
  const { data: savedStructures = [], isLoading: loadingStructures } = useQuery({
    queryKey: ['group', group.groupid, 'blind-structures'],
    queryFn: () => api.getGroupBlindStructures(group.groupid),
    enabled: detailTab === 'structures',
  });
  const { data: postsData, isLoading: loadingPosts } = useQuery({
    queryKey: ['group', group.groupid, 'posts'],
    queryFn: () => api.getGroupPosts(group.groupid),
    enabled: detailTab === 'posts',
  });
  const { data: coinsData, isLoading: loadingCoins } = useQuery({
    queryKey: ['group', group.groupid, 'coins'],
    queryFn: () => api.getGroupCoins(group.groupid),
    enabled: detailTab === 'coins',
  });

  const approveMutation = useMutation({
    mutationFn: (uid: string) => api.approveMember(group.groupid, uid),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['group', group.groupid] }),
  });
  const removeMutation = useMutation({
    mutationFn: (uid: string) => api.removeMember(group.groupid, uid),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['group', group.groupid] });
      qc.invalidateQueries({ queryKey: ['groups'] });
      qc.invalidateQueries({ queryKey: ['tournaments'] });
      qc.invalidateQueries({ queryKey: ['tournament'] });
    },
  });
  const notificationPrefsMutation = useMutation({
    mutationFn: (payload: { emailalertsenabled?: boolean; smsalertsenabled?: boolean; pushalertsenabled?: boolean }) =>
      api.updateGroupNotificationPreferences(group.groupid, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['group', group.groupid] }),
  });
  const leaveMutation = useMutation({
    mutationFn: () => api.leaveGroup(group.groupid, user!.guid),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['groups'] }); onBack(); },
  });
  const registerMutation = useMutation({
    mutationFn: (tid: string) => api.groupRegister(tid),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['group', group.groupid, 'tournaments'] }),
  });
  const declineMutation = useMutation({
    mutationFn: (tid: string) => api.declineTournament(tid),
    onSuccess: (_result, tid) => {
      qc.setQueryData<Array<Tournament & { isregistered: boolean; isdeclined?: boolean }>>(
        ['group', group.groupid, 'tournaments'],
        (current) => current?.map((tournament) => tournament.tournamentid === tid
          ? {
              ...tournament,
              isregistered: false,
              isdeclined: true,
              playercount: Math.max(0, Number(tournament.playercount ?? 0) - (tournament.isregistered ? 1 : 0)),
            }
          : tournament
        )
      );
      qc.invalidateQueries({ queryKey: ['group', group.groupid, 'tournaments'] });
    },
  });
  const updateGroupMutation = useMutation({
    mutationFn: (payload: {
      invitecode?: string;
      defaulttrackingmode?: 'standard' | 'player';
      tvseatingwelcomemessage?: string;
      speechfiveminutemessage?: string;
      speechoneminutemessage?: string;
      speechlevelupmessage?: string;
      aiannouncerenabled?: boolean;
      aiannouncerpreset?: AnnouncerPreset;
      aiannouncercustomprompt?: string;
      aiannouncerclassicmode?: boolean;
      postapprovalrequired?: boolean;
    }) => api.updateGroup(group.groupid, payload),
    onSuccess: (result) => {
      qc.setQueryData<Group & { members: GroupMember[] }>(
        ['group', group.groupid],
        (current) => current ? { ...current, ...result } : current
      );
      qc.invalidateQueries({ queryKey: ['group', group.groupid] });
      qc.invalidateQueries({ queryKey: ['groups'] });
    },
  });
  const deleteGroupMutation = useMutation({
    mutationFn: () => api.deleteGroup(group.groupid),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['groups'] });
      setDeleteGroupConfirmOpen(false);
      onBack();
    },
  });

  const toggleAnnouncerMutation = useMutation({
    mutationFn: (enabled: boolean) => api.updateGroup(group.groupid, {
      aiannouncerenabled: enabled,
      aiannouncerpreset: aiAnnouncerPreset,
      aiannouncercustomprompt: aiAnnouncerPrompt,
      aiannouncerclassicmode: aiAnnouncerClassicMode,
    }),
    onSuccess: (result) => {
      qc.setQueryData<Group & { members: GroupMember[] }>(
        ['group', group.groupid],
        (current) => current ? { ...current, ...result } : current
      );
      qc.invalidateQueries({ queryKey: ['group', group.groupid] });
      qc.invalidateQueries({ queryKey: ['groups'] });
    },
    onError: () => setAiAnnouncerEnabled(Boolean(effectiveGroup.aiannouncerenabled)),
  });
  const deleteStructureMutation = useMutation({
    mutationFn: (structureId: string) => api.deleteGroupBlindStructure(group.groupid, structureId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['group', group.groupid, 'blind-structures'] }),
  });
  const inviteMutation = useMutation({
    mutationFn: (payload: { email?: string; phone?: string; note?: string }) => api.sendGroupInvite(group.groupid, payload),
    onSuccess: (result) => {
      if (invitePhone.trim()) {
        setSmsStatus('Text invite is ready.');
        window.location.href = result.smsLink;
      } else {
        setSmsStatus('');
      }
      setInviteEmail('');
      setInvitePhone('');
      setInviteNote('');
    },
  });
  const createPostMutation = useMutation({
    mutationFn: () => api.createGroupPost(group.groupid, {
      posttype: postType,
      message: postMessage,
      options: postType === 'poll' ? pollOptionsText.split('\n') : undefined,
    }),
    onSuccess: () => {
      setPostMessage('');
      setPollOptionsText('Yes\nNo');
      qc.invalidateQueries({ queryKey: ['group', group.groupid, 'posts'] });
    },
  });
  const moderatePostMutation = useMutation({
    mutationFn: ({ postId, status }: { postId: string; status: 'approved' | 'rejected' }) =>
      api.moderateGroupPost(group.groupid, postId, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['group', group.groupid, 'posts'] }),
  });
  const deletePostMutation = useMutation({
    mutationFn: (postId: string) => api.deleteGroupPost(group.groupid, postId),
    onSuccess: () => {
      setDeletePostTarget(null);
      qc.invalidateQueries({ queryKey: ['group', group.groupid, 'posts'] });
    },
  });
  const voteMutation = useMutation({
    mutationFn: ({ postId, optionId }: { postId: string; optionId: string }) => api.voteGroupPoll(group.groupid, postId, optionId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['group', group.groupid, 'posts'] }),
  });
  const commentMutation = useMutation({
    mutationFn: ({ postId, message }: { postId: string; message: string }) => api.commentOnGroupPost(group.groupid, postId, message),
    onSuccess: (_result, variables) => {
      setCommentDrafts((current) => ({ ...current, [variables.postId]: '' }));
      qc.invalidateQueries({ queryKey: ['group', group.groupid, 'posts'] });
    },
  });
  const createCoinMutation = useMutation({
    mutationFn: () => api.createGroupCoin(group.groupid, {
      name: coinName,
      description: coinDescription,
      imagedata: coinImageData,
      imageurl: null,
      imagefilename: coinImageFilename,
    }),
    onSuccess: () => {
      setCoinName('');
      setCoinDescription('');
      setCoinImageData(null);
      setCoinImageFilename(null);
      qc.invalidateQueries({ queryKey: ['group', group.groupid, 'coins'] });
    },
  });
  const awardCoinMutation = useMutation({
    mutationFn: () => api.awardGroupCoin(group.groupid, awardCoinId, { userid: awardUserId, note: awardNote }),
    onSuccess: () => {
      setAwardNote('');
      qc.invalidateQueries({ queryKey: ['group', group.groupid, 'coins'] });
    },
  });
  const addDefaultCoinMutation = useMutation({
    mutationFn: (presetKey: string) => {
      const preset = DEFAULT_COIN_PRESETS.find((item) => item.key === presetKey);
      if (!preset) throw new Error('Default coin not found.');
      return api.createGroupCoin(group.groupid, {
        name: preset.name,
        description: preset.description,
        imageurl: preset.imageurl,
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['group', group.groupid, 'coins'] }),
  });

  const members: GroupMember[] = data?.members ?? [];
  const pending = members.filter(m => !m.approved);
  const approved = members.filter(m => m.approved);
  const currentMember = members.find((member) => member.userid === user?.guid);
  const joinLink = `${window.location.origin}/join/${encodeURIComponent(effectiveGroup.invitecode)}`;
  const account = profile ?? user;
  const canUseClubFeatures = Boolean(account?.issuperadmin || account?.canuseclubfeatures || account?.tierid === 2 || account?.tierid === 3);
  const announcerControlsEnabled = canUseClubFeatures && aiAnnouncerEnabled;
  const postsEnabled = postsData?.enabled ?? canUseClubFeatures;
  const detailTabs: DetailTab[] = group.isadmin
    ? ['info', 'members', 'posts', 'coins', 'voice', 'structures', 'history']
    : ['info', 'members', 'posts', 'coins', 'structures', 'history'];

  useEffect(() => {
    setDefaultTrackingMode(effectiveGroup.defaulttrackingmode ?? 'standard');
    setTvSeatingMessage(effectiveGroup.tvseatingwelcomemessage ?? 'Welcome! Please see host to check-in!');
    setSpeechFiveMinuteMessage(effectiveGroup.speechfiveminutemessage ?? DEFAULT_FIVE_MINUTE_ANNOUNCEMENT);
    setSpeechOneMinuteMessage(effectiveGroup.speechoneminutemessage ?? DEFAULT_ONE_MINUTE_ANNOUNCEMENT);
    setSpeechLevelUpMessage(effectiveGroup.speechlevelupmessage ?? DEFAULT_LEVEL_UP_ANNOUNCEMENT);
    setAiAnnouncerEnabled(Boolean(effectiveGroup.aiannouncerenabled));
    setAiAnnouncerPreset(normalizeAnnouncerPreset(effectiveGroup.aiannouncerpreset));
    setAiAnnouncerPrompt(effectiveGroup.aiannouncercustomprompt ?? '');
    setAiAnnouncerClassicMode(Boolean(effectiveGroup.aiannouncerclassicmode));
  }, [
    effectiveGroup.defaulttrackingmode,
    effectiveGroup.tvseatingwelcomemessage,
    effectiveGroup.speechfiveminutemessage,
    effectiveGroup.speechoneminutemessage,
    effectiveGroup.speechlevelupmessage,
    effectiveGroup.aiannouncerenabled,
    effectiveGroup.aiannouncerpreset,
    effectiveGroup.aiannouncercustomprompt,
    effectiveGroup.aiannouncerclassicmode,
  ]);

  useEffect(() => () => {
    announcerPreviewRef.current?.pause();
  }, []);

  function handleAnnouncerToggle(enabled: boolean) {
    setAnnouncerPreviewError('');
    setAiAnnouncerEnabled(enabled);
    toggleAnnouncerMutation.mutate(enabled);
  }

  function handleClassicModeToggle(enabled: boolean) {
    setAnnouncerPreviewError('');
    setAiAnnouncerClassicMode(enabled);
    updateGroupMutation.mutate({
      aiannouncerenabled: aiAnnouncerEnabled,
      aiannouncerpreset: aiAnnouncerPreset,
      aiannouncercustomprompt: aiAnnouncerPrompt,
      aiannouncerclassicmode: enabled,
    });
  }

  async function handleAnnouncerPreview() {
    setAnnouncerPreviewError('');
    setPreviewingAnnouncer(true);
    announcerPreviewRef.current?.pause();
    const url = announcerPreviewUrl(aiAnnouncerPreset);
    try {
      const response = await fetch(url, { method: 'HEAD' });
      if (!response.ok) {
        throw new Error('No saved MP3 preview exists for this announcer yet.');
      }
      const audio = new Audio(url);
      announcerPreviewRef.current = audio;
      audio.onended = () => setPreviewingAnnouncer(false);
      await audio.play();
    } catch (err) {
      setPreviewingAnnouncer(false);
      setAnnouncerPreviewError(err instanceof Error ? err.message : 'Could not play this announcer preview.');
    }
  }

  async function handleCoinFile(file: File | null) {
    setCoinFileError('');
    setCoinImageData(null);
    setCoinImageFilename(null);
    if (!file) return;
    const allowed = ['image/png', 'image/jpeg', 'image/webp'];
    if (!allowed.includes(file.type)) {
      setCoinFileError('Use a PNG, JPG, or WebP image.');
      return;
    }
    if (file.size > 1024 * 1024) {
      setCoinFileError('Keep coin art at 1 MB or smaller.');
      return;
    }
    const data = await readFileAsDataUrl(file);
    setCoinImageData(data);
    setCoinImageFilename(file.name);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <button
            type="button"
            className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-pit-teal/35 bg-gradient-to-r from-pit-teal/20 via-[#122E30] to-pit-teal/10 px-3 py-2 text-xs font-semibold text-pit-teal shadow-[0_0_18px_rgba(20,184,166,0.12)] transition hover:border-pit-teal/60 hover:text-white"
            onClick={onBack}
          >
            <ArrowLeft size={15} />
            Back to Groups
          </button>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-2xl font-bold text-white">{effectiveGroup.name}</h2>
            {group.isadmin && (
              <span className="badge bg-pit-gold/10 border border-pit-gold/20 text-pit-gold">
                <Crown size={9} className="mr-0.5" /> Admin
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 sm:justify-end">
          {group.isadmin && (
            <button
              className="btn-ghost justify-center gap-1.5 text-red-300 hover:border-red-400/40 hover:text-red-200 sm:shrink-0"
              onClick={() => setDeleteGroupConfirmOpen(true)}
              disabled={deleteGroupMutation.isPending}
            >
              <Trash2 size={14} />
              Delete group
            </button>
          )}
          {!group.isadmin && (
            <button
              className="btn-ghost justify-center gap-1.5 text-red-300 hover:text-red-200 sm:shrink-0"
              onClick={() => leaveMutation.mutate()}
              disabled={leaveMutation.isPending}
            >
              <LogOut size={14} />
              {leaveMutation.isPending ? 'Leaving...' : 'Leave group'}
            </button>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
          <div className="flex min-w-max gap-2 rounded-xl border border-pit-border bg-pit-bg/55 p-1">
            {detailTabs.map((t) => {
              const Icon = groupTabIcon(t);
              return (
                <button
                  key={t}
                  onClick={() => setDetailTab(t)}
                  className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors duration-150 ${
                    detailTab === t
                      ? 'border-pit-teal bg-pit-teal/15 text-white'
                      : 'border-transparent bg-transparent text-pit-muted hover:border-pit-teal/35 hover:bg-pit-card/70 hover:text-pit-text'
                  }`}
                >
                  <Icon size={13} />
                  {groupTabLabel(t, approved.length)}
                </button>
              );
            })}
          </div>
        </div>

        {detailTab === 'info' && (
          <div className="space-y-4">
        {/* Invite code */}
        <div className="flex flex-col gap-1 rounded-xl bg-pit-bg border border-pit-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-xs text-pit-muted">Invite code</span>
          <span className="font-mono font-bold text-white tracking-[0.2em]">{effectiveGroup.invitecode}</span>
        </div>

        {group.isadmin && (
          <div className="space-y-4 rounded-xl border border-pit-border bg-pit-bg px-4 py-4">
            <div className="space-y-3">
              <p className="text-sm font-semibold text-white">Join link</p>
              <div className="rounded-xl border border-pit-border bg-pit-surface px-3 py-3">
                <p className="break-all font-mono text-xs text-pit-text">{joinLink}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  className="btn-ghost"
                  onClick={async () => {
                    await navigator.clipboard.writeText(joinLink);
                    setCopyStatus('Join link copied.');
                    setTimeout(() => setCopyStatus(''), 2000);
                  }}
                >
                  Copy Link
                </button>
              </div>
              {copyStatus && <p className="text-sm text-pit-teal">{copyStatus}</p>}
              <div className="inline-block rounded-xl bg-white p-3">
                <QRCodeSVG value={joinLink} size={150} />
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-semibold text-white">Group settings</p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  className="input font-mono uppercase"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                  maxLength={12}
                />
                <button
                  className="btn-primary shrink-0"
                  onClick={() => updateGroupMutation.mutate({ invitecode: inviteCode })}
                  disabled={updateGroupMutation.isPending || !inviteCode.trim()}
                >
                  <Save size={14} />
                  {updateGroupMutation.isPending ? 'Saving...' : 'Save Code'}
                </button>
              </div>
              {updateGroupMutation.error && <p className="text-sm text-red-400">{updateGroupMutation.error.message}</p>}
            </div>

            <div className="space-y-2">
              <p className="text-sm font-semibold text-white">Tournament defaults</p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <select
                  className="input"
                  value={canUseClubFeatures ? defaultTrackingMode : 'standard'}
                  onChange={(event) => setDefaultTrackingMode(event.target.value as 'standard' | 'player')}
                  disabled={!canUseClubFeatures}
                >
                  <option value="standard">Standard tracking</option>
                  <option value="player">Player tracked stats</option>
                </select>
                <button
                  className="btn-primary shrink-0"
                  onClick={() => updateGroupMutation.mutate({ defaulttrackingmode: canUseClubFeatures ? defaultTrackingMode : 'standard' })}
                  disabled={updateGroupMutation.isPending || !canUseClubFeatures}
                >
                  <Save size={14} />
                  Save Default
                </button>
              </div>
              <p className="text-xs text-pit-muted">
                {canUseClubFeatures
                  ? 'New tournaments for this group use this stats tracking mode by default.'
                  : 'Host accounts use standard tracking. Player-tracked stats unlock with Club or Pro.'}
              </p>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-semibold text-white">TV seating message</p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  className="input"
                  value={canUseClubFeatures ? tvSeatingMessage : (effectiveGroup.tvseatingwelcomemessage ?? 'Welcome! Please see host to check-in!')}
                  onChange={(event) => setTvSeatingMessage(event.target.value)}
                  disabled={!canUseClubFeatures}
                  maxLength={180}
                />
                <button
                  className="btn-primary shrink-0"
                  onClick={() => updateGroupMutation.mutate({ tvseatingwelcomemessage: tvSeatingMessage })}
                  disabled={updateGroupMutation.isPending || !canUseClubFeatures}
                >
                  <Save size={14} />
                  Save Message
                </button>
              </div>
              <p className="text-xs text-pit-muted">
                {canUseClubFeatures
                  ? 'Shown on the TV seating view before seats are assigned.'
                  : 'Host accounts use the default TV seating message. Custom wording unlocks with Club or Pro.'}
              </p>
            </div>

            <div className="space-y-3">
              <p className="text-sm font-semibold text-white">Invite people</p>
              <input
                className="input"
                placeholder="Email address"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
              <input
                className="input"
                placeholder="Phone number for text"
                value={invitePhone}
                onChange={(e) => setInvitePhone(e.target.value)}
              />
              <input
                className="input"
                placeholder="Optional note"
                value={inviteNote}
                onChange={(e) => setInviteNote(e.target.value)}
              />
              <div className="flex flex-wrap gap-2">
                <button
                  className="btn-primary"
                  onClick={() => {
                    setSmsStatus('');
                    inviteMutation.mutate({ email: inviteEmail || undefined, note: inviteNote || undefined });
                  }}
                  disabled={inviteMutation.isPending || !inviteEmail.trim()}
                >
                  <Mail size={14} />
                  Send Email
                </button>
                <button
                  className="btn-ghost"
                  onClick={() => {
                    setSmsStatus('');
                    inviteMutation.mutate({ phone: invitePhone || undefined, note: inviteNote || undefined });
                  }}
                  disabled={inviteMutation.isPending || !invitePhone.trim()}
                >
                  <MessageSquare size={14} />
                  Send Text
                </button>
              </div>
              {inviteMutation.error && <p className="text-sm text-red-400">{inviteMutation.error.message}</p>}
              {smsStatus && <p className="text-sm text-pit-teal">{smsStatus}</p>}
            </div>
          </div>
        )}
          </div>
        )}

        {detailTab === 'voice' && group.isadmin && (
          <div className="space-y-4">
            <div className="rounded-xl border border-pit-teal/20 bg-pit-teal/5 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">Announcer</p>
                  <p className="mt-1 text-xs leading-5 text-pit-muted">
                    Level changes can generate smart announcer audio using the tournament field, rebuys, add-ons, and this group's style.
                  </p>
                </div>
                {!canUseClubFeatures && <span className="badge border-yellow-300/25 bg-yellow-300/10 text-yellow-100">Club</span>}
                <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-pit-text">
                  <span>{aiAnnouncerEnabled ? 'Enabled' : 'Disabled'}</span>
                  <span className={`flex h-6 w-11 rounded-full p-0.5 transition-colors ${aiAnnouncerEnabled ? 'bg-pit-teal' : 'bg-pit-border'}`}>
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={aiAnnouncerEnabled}
                      disabled={!canUseClubFeatures}
                      onChange={(event) => handleAnnouncerToggle(event.target.checked)}
                    />
                    <span className={`h-5 w-5 rounded-full bg-white shadow transition-transform ${aiAnnouncerEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                  </span>
                </label>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {ANNOUNCER_PRESETS.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    className={`rounded-lg border px-3 py-2 text-left transition-colors ${
                      aiAnnouncerPreset === preset.value
                        ? 'border-pit-teal bg-pit-teal/15 text-pit-teal'
                        : 'border-pit-border bg-pit-bg/50 text-pit-text hover:border-pit-muted hover:text-white'
                    }`}
                    onClick={() => setAiAnnouncerPreset(preset.value)}
                    disabled={!announcerControlsEnabled}
                  >
                    <span className="block text-xs font-semibold">{preset.label}</span>
                    <span className="mt-1 block text-[11px] font-normal leading-4 text-pit-muted">{preset.description}</span>
                  </button>
                ))}
              </div>
              <textarea
                className="input mt-3 min-h-24"
                value={aiAnnouncerPrompt}
                onChange={(event) => setAiAnnouncerPrompt(event.target.value)}
                disabled={!announcerControlsEnabled || aiAnnouncerClassicMode}
                maxLength={500}
                placeholder={aiAnnouncerClassicMode ? 'Classic mode ignores custom context and keeps announcements concise.' : 'Optional group flavor. Example: Mention our group as the Thursday Night Crew. Keep it hype, but clean.'}
              />
              <label className="mt-3 flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-pit-border bg-pit-bg/60 px-3 py-2">
                <div>
                  <span className="block text-sm font-semibold text-white">Classic mode</span>
                  <span className="block text-xs leading-5 text-pit-muted">Turns tournament context off. Starts, pauses, level changes, warnings, knockouts, rebuys, and add-ons stay clear and concise.</span>
                </div>
                <span className={`flex h-6 w-11 shrink-0 rounded-full p-0.5 transition-colors ${aiAnnouncerClassicMode ? 'bg-pit-teal' : 'bg-pit-border'}`}>
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={aiAnnouncerClassicMode}
                    disabled={!announcerControlsEnabled || updateGroupMutation.isPending}
                    onChange={(event) => handleClassicModeToggle(event.target.checked)}
                  />
                  <span className={`h-5 w-5 rounded-full bg-white shadow transition-transform ${aiAnnouncerClassicMode ? 'translate-x-5' : 'translate-x-0'}`} />
                </span>
              </label>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  className="btn-primary"
                  onClick={() => updateGroupMutation.mutate({
                    aiannouncerenabled: aiAnnouncerEnabled,
                    aiannouncerpreset: aiAnnouncerPreset,
                    aiannouncercustomprompt: aiAnnouncerPrompt,
                    aiannouncerclassicmode: aiAnnouncerClassicMode,
                  })}
                  disabled={updateGroupMutation.isPending || toggleAnnouncerMutation.isPending || !announcerControlsEnabled}
                >
                  <Save size={14} />
                  {updateGroupMutation.isPending ? 'Saving...' : 'Save Voice'}
                </button>
                <button
                  className="btn-ghost"
                  onClick={() => void handleAnnouncerPreview()}
                  disabled={!announcerControlsEnabled || previewingAnnouncer}
                >
                  <Play size={14} />
                  {previewingAnnouncer ? 'Playing...' : 'Preview'}
                </button>
              </div>
              {toggleAnnouncerMutation.isPending && <p className="mt-2 text-sm text-pit-muted">Saving Announcer setting...</p>}
              {updateGroupMutation.error && <p className="mt-2 text-sm text-red-400">{updateGroupMutation.error.message}</p>}
              {toggleAnnouncerMutation.error && <p className="mt-2 text-sm text-red-400">{toggleAnnouncerMutation.error.message}</p>}
              {announcerPreviewError && <p className="mt-2 text-sm text-red-400">{announcerPreviewError}</p>}
            </div>
            <div className="space-y-3 rounded-xl border border-pit-border bg-pit-bg p-4">
              <div>
                <p className="text-sm font-semibold text-white">Speech announcements</p>
                <p className="mt-1 text-xs leading-5 text-pit-muted">
                  Use <code className="text-pit-teal">{'{BlindLevel}'}</code>, <code className="text-pit-teal">{'{SB}'}</code>, <code className="text-pit-teal">{'{BB}'}</code>, and <code className="text-pit-teal">{'{Ante}'}</code> for live blind values.
                </p>
              </div>
              <AnnouncementField
                label="5 minute warning"
                value={speechFiveMinuteMessage}
                onChange={setSpeechFiveMinuteMessage}
                placeholder={DEFAULT_FIVE_MINUTE_ANNOUNCEMENT}
              />
              <AnnouncementField
                label="1 minute warning"
                value={speechOneMinuteMessage}
                onChange={setSpeechOneMinuteMessage}
                placeholder={DEFAULT_ONE_MINUTE_ANNOUNCEMENT}
              />
              <AnnouncementField
                label="Level up"
                value={speechLevelUpMessage}
                onChange={setSpeechLevelUpMessage}
                placeholder={DEFAULT_LEVEL_UP_ANNOUNCEMENT}
              />
              <div className="rounded-lg border border-pit-border bg-pit-surface/50 px-3 py-2 text-xs leading-5 text-pit-text">
                Preview: {previewAnnouncement(speechLevelUpMessage || DEFAULT_LEVEL_UP_ANNOUNCEMENT)}
              </div>
              <button
                className="btn-primary"
                onClick={() => updateGroupMutation.mutate({
                  speechfiveminutemessage: speechFiveMinuteMessage,
                  speechoneminutemessage: speechOneMinuteMessage,
                  speechlevelupmessage: speechLevelUpMessage,
                })}
                disabled={updateGroupMutation.isPending}
              >
                <Save size={14} />
                {updateGroupMutation.isPending ? 'Saving...' : 'Save Announcements'}
              </button>
            </div>
          </div>
        )}

        {detailTab === 'posts' && (
          <div className="space-y-4">
            {group.isadmin && (
              <div className="rounded-xl border border-pit-border bg-pit-bg p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">Post approval</p>
                    <p className="mt-1 text-xs text-pit-muted">When enabled, member posts wait for an admin before going live.</p>
                  </div>
                  <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-pit-text">
                    <span>{effectiveGroup.postapprovalrequired === false ? 'Off' : 'On'}</span>
                    <span className={`flex h-6 w-11 rounded-full p-0.5 transition-colors ${effectiveGroup.postapprovalrequired === false ? 'bg-pit-border' : 'bg-pit-teal'}`}>
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={effectiveGroup.postapprovalrequired !== false}
                        onChange={(event) => updateGroupMutation.mutate({ postapprovalrequired: event.target.checked })}
                      />
                      <span className={`h-5 w-5 rounded-full bg-white shadow transition-transform ${effectiveGroup.postapprovalrequired === false ? 'translate-x-0' : 'translate-x-5'}`} />
                    </span>
                  </label>
                </div>
              </div>
            )}

            {group.isadmin && (postsData?.posts ?? []).some((post) => post.status === 'pending') && (
              <div className="rounded-xl border border-yellow-300/25 bg-yellow-300/10 p-3">
                <p className="mb-3 text-sm font-semibold text-yellow-100">Needs approval</p>
                <div className="space-y-2">
                  {(postsData?.posts ?? []).filter((post) => post.status === 'pending').map((post) => (
                    <article key={post.id} className="rounded-lg border border-yellow-300/20 bg-pit-bg/70 p-3">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-white">{post.displayname ?? 'Member'}</p>
                          <p className="text-xs text-pit-muted">{new Date(post.createdat).toLocaleString()}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="badge border-yellow-300/30 bg-yellow-300/10 text-yellow-100">Pending</span>
                          <button
                            type="button"
                            className="btn-ghost h-8 w-8 p-0 text-red-300 hover:border-red-400/40 hover:text-red-200"
                            title="Delete post"
                            onClick={() => setDeletePostTarget(post)}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                      <p className="whitespace-pre-wrap text-sm leading-6 text-pit-text">{post.message}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          className="btn-primary px-3 py-1.5 text-xs"
                          disabled={moderatePostMutation.isPending}
                          onClick={() => moderatePostMutation.mutate({ postId: post.id, status: 'approved' })}
                        >
                          Approve
                        </button>
                        <button
                          className="btn-ghost px-3 py-1.5 text-xs text-red-300"
                          disabled={moderatePostMutation.isPending}
                          onClick={() => moderatePostMutation.mutate({ postId: post.id, status: 'rejected' })}
                        >
                          Reject
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            )}

            {postsEnabled && (
              <div className={`rounded-xl border p-3 ${postsEnabled ? 'border-pit-border bg-pit-bg' : 'border-yellow-300/25 bg-yellow-300/10'}`}>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-white">Post to group</p>
                  {effectiveGroup.postapprovalrequired !== false && !group.isadmin && <span className="badge border-yellow-300/25 bg-yellow-300/10 text-yellow-100">Approval required</span>}
                </div>
                <textarea
                  className="input min-h-20"
                  placeholder="Ask a question or post an update..."
                  value={postMessage}
                  onChange={(event) => setPostMessage(event.target.value)}
                  disabled={!postsEnabled}
                />
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <select
                    className="input w-auto"
                    value={postType}
                    onChange={(event) => setPostType(event.target.value as 'message' | 'poll')}
                    disabled={!postsEnabled}
                  >
                    <option value="message">Message</option>
                    <option value="poll">Poll</option>
                  </select>
                  <button
                    className="btn-primary"
                    onClick={() => createPostMutation.mutate()}
                    disabled={!postsEnabled || createPostMutation.isPending || !postMessage.trim()}
                  >
                    Post
                  </button>
                </div>
                {postType === 'poll' && (
                  <textarea
                    className="input mt-2 min-h-24 font-mono text-xs"
                    value={pollOptionsText}
                    onChange={(event) => setPollOptionsText(event.target.value)}
                    disabled={!postsEnabled}
                    placeholder="One option per line"
                  />
                )}
                {createPostMutation.data?.status === 'pending' && <p className="mt-2 text-xs text-yellow-100">Submitted for admin approval.</p>}
                {createPostMutation.error && <p className="mt-2 text-sm text-red-400">{createPostMutation.error.message}</p>}
              </div>
            )}

            {!postsEnabled && (
              <div className="rounded-xl border border-yellow-300/25 bg-yellow-300/10 px-4 py-5 text-sm text-yellow-100">
                Group polls and conversations are a Club feature. They are enabled during the host's first two tournaments, then lock until the group upgrades.
              </div>
            )}

            {loadingPosts ? (
              <LoadingSpinner className="py-8" />
            ) : (postsData?.posts ?? []).length === 0 ? (
              <div className="rounded-xl border border-pit-border bg-pit-bg px-4 py-10 text-center text-sm text-pit-text">
                No group posts yet.
              </div>
            ) : (
              <div className="space-y-3">
                {(postsData?.posts ?? []).filter((post) => post.status !== 'pending').map((post) => {
                  const totalVotes = (post.options ?? []).reduce((sum, option) => sum + Number(option.votecount ?? 0), 0);
                  return (
                    <article key={post.id} className="rounded-xl border border-pit-border bg-pit-bg p-3">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-white">{post.displayname ?? 'Group admin'}</p>
                          <p className="text-xs text-pit-muted">{new Date(post.createdat).toLocaleString()}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="chip">{post.posttype === 'poll' ? <Vote size={11} /> : <MessageSquare size={11} />}{post.posttype}</span>
                          {group.isadmin && (
                            <button
                              type="button"
                              className="btn-ghost h-8 w-8 p-0 text-red-300 hover:border-red-400/40 hover:text-red-200"
                              title="Delete post"
                              onClick={() => setDeletePostTarget(post)}
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </div>
                      <p className="whitespace-pre-wrap text-sm leading-6 text-pit-text">{post.message}</p>
                      {post.posttype === 'poll' && (
                        <div className="mt-3 space-y-2">
                          {(post.options ?? []).map((option) => {
                            const pct = totalVotes > 0 ? Math.round((Number(option.votecount ?? 0) / totalVotes) * 100) : 0;
                            return (
                              <button
                                key={option.id}
                                className={`w-full overflow-hidden rounded-lg border text-left ${option.votedbyme ? 'border-pit-teal/50 bg-pit-teal/10' : 'border-pit-border bg-pit-surface/40'}`}
                                onClick={() => voteMutation.mutate({ postId: post.id, optionId: option.id })}
                                disabled={voteMutation.isPending || !postsEnabled}
                              >
                                <div className="relative px-3 py-2">
                                  <div className="absolute inset-y-0 left-0 bg-pit-teal/15" style={{ width: `${pct}%` }} />
                                  <div className="relative flex items-center justify-between gap-3 text-sm">
                                    <span className="font-medium text-white">{option.label}</span>
                                    <span className="text-xs text-pit-muted">{option.votecount} votes - {pct}%</span>
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                      <div className="mt-3 space-y-2 border-t border-pit-border pt-3">
                        {(post.comments ?? []).map((comment) => (
                          <div key={comment.id} className="rounded-lg bg-pit-surface/40 px-3 py-2">
                            <p className="text-xs font-semibold text-white">{comment.displayname ?? 'Member'}</p>
                            <p className="mt-0.5 text-sm text-pit-text">{comment.message}</p>
                          </div>
                        ))}
                        <div className="flex gap-2">
                          <input
                            className="input"
                            placeholder="Reply..."
                            value={commentDrafts[post.id] ?? ''}
                            onChange={(event) => setCommentDrafts((current) => ({ ...current, [post.id]: event.target.value }))}
                            disabled={!postsEnabled}
                          />
                          <button
                            className="btn-ghost shrink-0"
                            disabled={!postsEnabled || commentMutation.isPending || !(commentDrafts[post.id] ?? '').trim()}
                            onClick={() => commentMutation.mutate({ postId: post.id, message: commentDrafts[post.id] ?? '' })}
                          >
                            Reply
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Members tab */}
        {detailTab === 'members' && (
          <div className="space-y-3">
            {currentMember?.approved && (
              <div className="rounded-xl border border-pit-border bg-pit-bg p-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-white">Your group alerts</p>
                    <p className="mt-1 text-xs leading-5 text-pit-muted">
                      Choose how this group can notify you. SMS and push are preference-ready while provider/browser delivery is wired.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <PreferenceToggle
                      label="Email"
                      active={currentMember.emailalertsenabled !== false}
                      disabled={notificationPrefsMutation.isPending}
                      onClick={() => notificationPrefsMutation.mutate({ emailalertsenabled: currentMember.emailalertsenabled === false })}
                    />
                    <PreferenceToggle
                      label="SMS"
                      active={Boolean(currentMember.smsalertsenabled)}
                      disabled={notificationPrefsMutation.isPending}
                      onClick={() => notificationPrefsMutation.mutate({ smsalertsenabled: !currentMember.smsalertsenabled })}
                    />
                    <PreferenceToggle
                      label="Push"
                      active={Boolean(currentMember.pushalertsenabled)}
                      disabled={notificationPrefsMutation.isPending}
                      onClick={() => notificationPrefsMutation.mutate({ pushalertsenabled: !currentMember.pushalertsenabled })}
                    />
                  </div>
                </div>
                {notificationPrefsMutation.error && (
                  <p className="mt-2 text-sm text-red-400">{notificationPrefsMutation.error.message}</p>
                )}
              </div>
            )}
            {pending.length > 0 && group.isadmin && (
              <div>
                <p className="eyebrow mb-2">Pending Approval</p>
                <div className="space-y-1">
                  {pending.map(m => (
                    <div key={m.userid} className="flex items-center justify-between py-2 px-3 rounded-lg bg-pit-bg border border-pit-border">
                      <span className="text-sm">{m.displayname ?? m.emailaddress}</span>
                      <button className="btn-primary text-xs px-3 py-1"
                        onClick={() => approveMutation.mutate(m.userid)}>Approve</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="space-y-1">
              {approved.map(m => (
                <div key={m.userid} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-pit-bg/60 transition-colors">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-pit-surface border border-pit-border flex items-center justify-center text-[10px] font-bold text-pit-muted">
                      {(m.displayname ?? m.emailaddress).slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <span className="text-sm text-white">{playerNameWithMedals(m)}</span>
                      {m.isadmin && (
                        <span className="ml-2 badge bg-pit-gold/10 border border-pit-gold/20 text-pit-gold text-[10px]">
                          <Crown size={8} className="mr-0.5" /> Admin
                        </span>
                      )}
                      {playerMedalSuffix(m) && (
                        <p className="mt-0.5 text-[11px] text-pit-muted">Registered player history</p>
                      )}
                    </div>
                  </div>
                  {group.isadmin && !m.isadmin && (
                    <button className="text-xs text-pit-muted hover:text-red-400 transition-colors px-2 py-1"
                      onClick={() => removeMutation.mutate(m.userid)}>Remove</button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {detailTab === 'coins' && (
          <div className="space-y-4">
            <div className="rounded-xl border border-pit-border bg-pit-bg p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-white">Placement medals</p>
                  <p className="mt-1 text-xs leading-5 text-pit-muted">
                    Registered users automatically collect first, second, and third place counts from this group's tournament results. Guests are ignored.
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <img src="/challenge-coins/placement-gold.svg" alt="First place" className="h-10 w-10" />
                  <img src="/challenge-coins/placement-silver.svg" alt="Second place" className="h-10 w-10" />
                  <img src="/challenge-coins/placement-bronze.svg" alt="Third place" className="h-10 w-10" />
                </div>
              </div>
            </div>

            {group.isadmin && (
              <div className="grid gap-3 lg:grid-cols-[1.1fr_0.9fr]">
                <div className="rounded-xl border border-pit-border bg-pit-bg p-4">
                  <p className="text-sm font-semibold text-white">Create challenge coin</p>
                  <p className="mt-1 text-xs leading-5 text-pit-muted">
                    Upload square art, ideally 512x512 PNG/WebP/JPG. Max 1 MB. Keep text large enough to read at icon size.
                  </p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-[96px_1fr]">
                    <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-xl border border-pit-border bg-pit-surface">
                      {coinImageData ? (
                        <img src={coinImageData} alt="Coin preview" className="h-full w-full object-cover" />
                      ) : (
                        <Award size={28} className="text-pit-muted" />
                      )}
                    </div>
                    <div className="space-y-2">
                      <input className="input" placeholder="Coin name, e.g. Always Late" value={coinName} onChange={(event) => setCoinName(event.target.value)} />
                      <input className="input" placeholder="Short description" value={coinDescription} onChange={(event) => setCoinDescription(event.target.value)} />
                      <label className="btn-ghost inline-flex cursor-pointer items-center gap-2 text-xs">
                        <Upload size={13} />
                        Upload art
                        <input
                          className="hidden"
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          onChange={(event) => void handleCoinFile(event.target.files?.[0] ?? null)}
                        />
                      </label>
                      {coinImageFilename && <p className="truncate text-xs text-pit-muted">{coinImageFilename}</p>}
                    </div>
                  </div>
                  {coinFileError && <p className="mt-2 text-sm text-red-400">{coinFileError}</p>}
                  {createCoinMutation.error && <p className="mt-2 text-sm text-red-400">{createCoinMutation.error.message}</p>}
                  <button
                    className="btn-primary mt-3"
                    disabled={createCoinMutation.isPending || !coinName.trim()}
                    onClick={() => createCoinMutation.mutate()}
                  >
                    {createCoinMutation.isPending ? 'Creating...' : 'Create Coin'}
                  </button>
                </div>

                <div className="rounded-xl border border-pit-border bg-pit-bg p-4">
                  <p className="text-sm font-semibold text-white">Award coin</p>
                  <div className="mt-3 space-y-2">
                    <select className="input" value={awardCoinId} onChange={(event) => setAwardCoinId(event.target.value)}>
                      <option value="">Choose a coin</option>
                      {(coinsData?.coins ?? []).map((coin) => (
                        <option key={coin.id} value={coin.id}>{coin.name}</option>
                      ))}
                    </select>
                    <select className="input" value={awardUserId} onChange={(event) => setAwardUserId(event.target.value)}>
                      <option value="">Choose a member</option>
                      {approved.map((member) => (
                        <option key={member.userid} value={member.userid}>{playerNameWithMedals(member)}</option>
                      ))}
                    </select>
                    <input className="input" placeholder="Optional note" value={awardNote} onChange={(event) => setAwardNote(event.target.value)} />
                    {awardCoinMutation.error && <p className="text-sm text-red-400">{awardCoinMutation.error.message}</p>}
                    <button
                      className="btn-primary"
                      disabled={awardCoinMutation.isPending || !awardCoinId || !awardUserId}
                      onClick={() => awardCoinMutation.mutate()}
                    >
                      {awardCoinMutation.isPending ? 'Awarding...' : 'Award Coin'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {group.isadmin && (
              <div className="rounded-xl border border-pit-border bg-pit-bg p-4">
                <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-white">Default coin presets</p>
                    <p className="mt-1 text-xs text-pit-muted">Add any preset to this group, then award it like a custom coin.</p>
                  </div>
                  {addDefaultCoinMutation.error && <p className="text-sm text-red-400">{addDefaultCoinMutation.error.message}</p>}
                </div>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {DEFAULT_COIN_PRESETS.map((preset) => {
                    const alreadyAdded = (coinsData?.coins ?? []).some((coin) => coin.name === preset.name);
                    return (
                      <button
                        key={preset.key}
                        type="button"
                        className="flex items-center gap-3 rounded-xl border border-pit-border bg-pit-surface/40 p-2 text-left transition hover:border-pit-teal/50 hover:bg-pit-teal/10 disabled:cursor-default disabled:opacity-60"
                        disabled={addDefaultCoinMutation.isPending || alreadyAdded}
                        onClick={() => addDefaultCoinMutation.mutate(preset.key)}
                      >
                        <img src={preset.imageurl} alt="" className="h-12 w-12 shrink-0 rounded-lg" />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-white">{preset.name}</span>
                          <span className="block truncate text-xs text-pit-muted">{alreadyAdded ? 'Added' : preset.description}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {loadingCoins ? (
              <LoadingSpinner className="py-8" />
            ) : (coinsData?.coins ?? []).length === 0 ? (
              <div className="rounded-xl border border-pit-border bg-pit-bg px-4 py-10 text-center text-sm text-pit-text">
                No challenge coins yet.
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {(coinsData?.coins ?? []).map((coin) => {
                  const awards = (coinsData?.awards ?? []).filter((award) => award.coinid === coin.id);
                  return (
                    <article key={coin.id} className="rounded-xl border border-pit-border bg-pit-bg p-3">
                      <div className="flex gap-3">
                        <CoinImage coin={coin} />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-white">{coin.name}</p>
                          {coin.description && <p className="mt-1 text-xs leading-5 text-pit-text">{coin.description}</p>}
                          <p className="mt-1 text-xs text-pit-muted">{coin.awardcount ?? awards.length} awarded</p>
                        </div>
                      </div>
                      {awards.length > 0 && (
                        <div className="mt-3 space-y-1 border-t border-pit-border pt-3">
                          {awards.slice(0, 6).map((award) => (
                            <p key={award.id} className="truncate text-xs text-pit-text">
                              {award.displayname ?? 'Member'}{award.note ? ` - ${award.note}` : ''}
                            </p>
                          ))}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {detailTab === 'history' && (
          <div>
            {(registerMutation.error?.message || declineMutation.error?.message) && (
              <p className="mb-3 rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-200">
                {registerMutation.error?.message || declineMutation.error?.message}
              </p>
            )}
            {loadingTourneys || loadingGames
              ? <LoadingSpinner className="py-8" />
              : groupTournaments.length === 0 && groupGames.length === 0
                ? (
                  <div className="flex flex-col items-center py-10 gap-3 text-center">
                    <Trophy size={28} className="text-pit-muted" />
                    <p className="text-pit-muted text-sm">No games for this group yet.</p>
                  </div>
                )
                : (
                  <div className="space-y-2">
                    {groupGames.map((game: GameListItem) => (
                      <div key={game.id} className="flex items-center justify-between gap-3 rounded-xl border border-pit-border bg-pit-bg p-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-sm font-semibold text-white">{game.title}</p>
                            <span className="chip border-pit-teal/25 text-pit-teal">{game.gametype === 'cash' ? 'Cash Game' : 'Tournament'}</span>
                          </div>
                          <p className="mt-0.5 text-xs text-pit-muted">
                            {game.startsat ? new Date(game.startsat).toLocaleString() : 'No start time'} · {game.stakeslabel ?? game.status}
                            {typeof game.playercount !== 'undefined' ? ` · ${game.playercount} players` : ''}
                          </p>
                        </div>
                        <button
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-pit-muted transition-all hover:bg-pit-surface hover:text-white"
                          onClick={() => navigate(`/cash-games/${game.id}/admin`)}
                        >
                          <ExternalLink size={13} />
                        </button>
                      </div>
                    ))}
                    {groupTournaments.map((t: Tournament & { isregistered: boolean; isdeclined?: boolean }) => (
                      <div key={t.tournamentid}
                        className={`flex items-center justify-between gap-3 rounded-xl border p-3 ${
                          t.isdeclined && !t.isregistered
                            ? 'border-red-300/35 bg-red-500/10'
                            : 'border-pit-border bg-pit-bg'
                        }`}>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-white truncate">{t.name}</p>
                          <p className="text-xs text-pit-muted mt-0.5">
                            {t.tourneydate ?? 'No date'} · {t.playercount ?? 0} players
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {t.isregistered
                            ? <span className="chip text-pit-teal border-pit-teal/30">Registered</span>
                            : (
                              <>
                                <button className="btn-primary text-xs px-2.5 py-1"
                                  onClick={() => registerMutation.mutate(t.tournamentid)}
                                  disabled={registerMutation.isPending || declineMutation.isPending}>
                                  Register
                                </button>
                                <button className={`btn-ghost border-red-300/25 px-2.5 py-1 text-xs text-red-200 hover:border-red-300/45 hover:text-red-100 ${
                                    t.isdeclined ? 'bg-red-400/20 shadow-inner ring-1 ring-red-300/25' : ''
                                  }`}
                                  onClick={() => declineMutation.mutate(t.tournamentid)}
                                  disabled={registerMutation.isPending || declineMutation.isPending || t.isdeclined}>
                                  Can't go
                                </button>
                              </>
                            )
                          }
                          <button
                            className="flex items-center justify-center w-7 h-7 rounded-lg text-pit-muted hover:text-white hover:bg-pit-surface transition-all"
                            onClick={() => navigate(isEnabledFlag(t.canmanage) ? `/tournament/${t.tournamentid}` : `/lobby/${t.tournamentid}`)}>
                            <ExternalLink size={13} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )
            }
          </div>
        )}

        {detailTab === 'structures' && (
          <div>
            {loadingStructures
              ? <LoadingSpinner className="py-8" />
              : savedStructures.length === 0
                ? (
                  <div className="flex flex-col items-center gap-3 py-10 text-center">
                    <Trophy size={28} className="text-pit-muted" />
                    <div>
                      <p className="text-sm font-semibold text-white">No saved structures yet</p>
                      <p className="mt-1 text-xs text-pit-muted">Save one from a tournament's Blind Structure tab.</p>
                    </div>
                  </div>
                )
                : (
                  <div className="space-y-2">
                    {savedStructures.map((structure) => (
                      <div key={structure.id} className="flex items-center justify-between gap-3 rounded-xl border border-pit-border bg-pit-bg p-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-white">{structure.name}</p>
                          <p className="mt-0.5 text-xs text-pit-muted">{structure.levels.length} levels</p>
                        </div>
                        {group.isadmin && (
                          <button
                            className="btn-ghost px-2 py-1.5 text-xs text-red-300"
                            onClick={() => deleteStructureMutation.mutate(structure.id)}
                            disabled={deleteStructureMutation.isPending}
                          >
                            <Trash2 size={13} />
                            Delete
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
          </div>
        )}
      </div>
      <ConfirmDialog
        open={deleteGroupConfirmOpen}
        title="Delete group?"
        message={(
          <>
            Delete <span className="font-semibold text-white">{effectiveGroup.name}</span>? This hides the group from members and removes it from group lists.
          </>
        )}
        confirmLabel="Delete group"
        loading={deleteGroupMutation.isPending}
        requireText={effectiveGroup.name}
        requireLabel="Group name"
        onClose={() => setDeleteGroupConfirmOpen(false)}
        onConfirm={() => deleteGroupMutation.mutate()}
      />
      <ConfirmDialog
        open={Boolean(deletePostTarget)}
        title="Delete post?"
        message={(
          <>
            Delete this group post from <span className="font-semibold text-white">{effectiveGroup.name}</span>? Replies and poll votes will be hidden with it.
          </>
        )}
        confirmLabel="Delete post"
        loading={deletePostMutation.isPending}
        onClose={() => setDeletePostTarget(null)}
        onConfirm={() => {
          if (deletePostTarget) deletePostMutation.mutate(deletePostTarget.id);
        }}
      />
    </div>
  );
}

function CoinImage({ coin }: { coin: GroupCoin }) {
  return (
    <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-pit-border bg-pit-surface">
      {coin.imagedata || coin.imageurl ? (
        <img src={coin.imagedata ?? coin.imageurl ?? ''} alt={coin.name} className="h-full w-full object-cover" />
      ) : (
        <Award size={22} className="text-pit-muted" />
      )}
    </div>
  );
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read file.'));
    reader.readAsDataURL(file);
  });
}
