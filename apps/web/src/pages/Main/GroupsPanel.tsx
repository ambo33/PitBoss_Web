import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Award, Calendar, Check, ChevronRight, Clock, Copy, FileText, Home, Info, Layers3, MoreHorizontal, Pencil, Settings2, ShieldCheck, Users, Trophy, Hash, Crown, ExternalLink, LogOut, MessageSquare, Mic2, Play, Plus, Save, Share, Trash2, Upload, Vote, type LucideIcon } from 'lucide-react';
import { api, AnnouncerPreset, GameListItem, Group, GroupCoin, GroupMember, GroupPost, Tournament } from '../../api/client';
import Modal from '../../components/Modal';
import JoinShareDialog from '../../components/JoinShareDialog';
import { formatGroupInviteCodeInput, normalizeGroupInviteCode } from '../../utils/invites';
import LoadingSpinner from '../../components/LoadingSpinner';
import ConfirmDialog from '../../components/ConfirmDialog';
import PlayerTrophyStrip from '../../components/PlayerTrophyStrip';
import { useAuthStore } from '../../store/auth';
import { DEFAULT_COIN_PRESETS } from '../../utils/defaultCoins';
import { PLAYER_ACHIEVEMENT_LEGEND, playerNameWithMedals } from '../../utils/playerAchievements';
import { isEnabledFlag } from '../../utils/flags';
import { BlindStructureCalculator, BlindStructureDraftLevel } from '../PreTournament/BlindTimer';
import {
  DEFAULT_FIVE_MINUTE_ANNOUNCEMENT,
  DEFAULT_LEVEL_UP_ANNOUNCEMENT,
  DEFAULT_ONE_MINUTE_ANNOUNCEMENT,
} from '../../utils/timerAudio';
import { prepareAvatarImage } from '../../utils/avatarImage';

type GroupOpenRequest = { groupId: string; tab?: 'posts'; postId?: string; token: number } | null;

export default function GroupsPanel({
  onDetailStateChange,
  onBackToCommunities,
  createRequestId = 0,
  openGroupRequest = null,
}: {
  onDetailStateChange?: (open: boolean) => void;
  onBackToCommunities?: () => void;
  createRequestId?: number;
  openGroupRequest?: GroupOpenRequest;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const lastCreateRequestRef = useRef(createRequestId);
  const lastOpenRequestRef = useRef(0);
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
    onSuccess: async (result) => {
      await qc.invalidateQueries({ queryKey: ['groups'], refetchType: 'none' });
      const refreshed = await qc.fetchQuery({
        queryKey: ['groups'],
        queryFn: api.getGroups,
        staleTime: 0,
      });
      const createdGroup = refreshed.find((group) => group.groupid === result.groupid);
      setShowCreate(false);
      if (createdGroup) {
        setSelected(createdGroup);
      }
    },
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
    return (
      <GroupDetailView
        group={selected}
        initialTab={openGroupRequest?.groupId === selected.groupid ? openGroupRequest.tab : undefined}
        focusPostId={openGroupRequest?.groupId === selected.groupid ? openGroupRequest.postId : undefined}
        onBack={() => {
          setSelected(null);
          onBackToCommunities?.();
        }}
      />
    );
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
        onSubmit={(code) => {
          setShowJoin(false);
          navigate(`/join/${encodeURIComponent(normalizeGroupInviteCode(code))}`);
        }}
        loading={false} />

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
    <Modal title="Create Group" open={open} onClose={onClose} mobilePlacement="center"
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
    <Modal title="Join with code" open={open} onClose={onClose}
      footer={<>
        <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
        <button type="button" className="btn-primary" onClick={() => onSubmit(code)} disabled={loading || !code}>
          {loading ? 'Joining…' : 'Continue'}
        </button>
      </>}
    >
      <div className="space-y-3">
        {error && <p className="text-red-400 text-sm bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">{error}</p>}
        <input className="input text-center font-mono text-lg uppercase tracking-[0.18em] py-3"
          placeholder="Join code" value={code}
          onChange={e => setCode(formatGroupInviteCodeInput(e.target.value))}
          onBlur={() => setCode(normalizeGroupInviteCode(code))}
          maxLength={10}
          aria-label="Join code" />
        <p className="text-pit-muted text-xs text-center">Enter a group or league join code</p>
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

function previewAnnouncement(template: string) {
  return template
    .replace(/\{BlindLevel\}/g, '4')
    .replace(/\{SB\}/g, '200')
    .replace(/\{BB\}/g, '400')
    .replace(/\{Ante\}/g, '50');
}

function groupTabLabel(tab: DetailTab, memberCount: number) {
  if (tab === 'info') return 'Overview';
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

function GroupDetailView({
  group,
  initialTab,
  focusPostId,
  onBack,
}: {
  group: Group;
  initialTab?: 'posts';
  focusPostId?: string;
  onBack: () => void;
}) {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [detailTab, setDetailTab] = useState<DetailTab>(initialTab ?? 'info');
  const [inviteCode, setInviteCode] = useState(group.invitecode);
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
  const [shareInviteOpen, setShareInviteOpen] = useState(false);
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
  const [structureWizardOpen, setStructureWizardOpen] = useState(false);
  const [newStructureName, setNewStructureName] = useState('');
  const [structureNameError, setStructureNameError] = useState('');
  const [openMenu, setOpenMenu] = useState<'group' | 'more' | null>(null);
  const [settingEditor, setSettingEditor] = useState<'group' | 'join' | 'tracking' | 'tv' | null>(null);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  const [groupName, setGroupName] = useState(group.name);
  const [approvalNeeded, setApprovalNeeded] = useState(Boolean(group.approvalneeded));
  const [communityImageError, setCommunityImageError] = useState('');

  useEffect(() => {
    if (initialTab) setDetailTab(initialTab);
  }, [initialTab, focusPostId]);

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

  useEffect(() => {
    if (!focusPostId || detailTab !== 'posts' || loadingPosts) return;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(`group-post-${focusPostId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [detailTab, focusPostId, loadingPosts, postsData]);
  const approveAllMutation = useMutation({
    mutationFn: () => api.approveAllMembers(group.groupid),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['group', group.groupid] });
      qc.invalidateQueries({ queryKey: ['groups'] });
      qc.invalidateQueries({ queryKey: ['push', 'notifications'] });
    },
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
      name?: string;
      approvalneeded?: boolean;
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
  const updateCommunityImageMutation = useMutation({
    mutationFn: async (file: File) => {
      const prepared = await prepareAvatarImage(file);
      return api.updateGroupCommunityImage(group.groupid, {
        communityimagedata: prepared.dataUrl,
        communityimagefilename: prepared.filename,
      });
    },
    onSuccess: (result) => {
      setCommunityImageError('');
      qc.setQueryData<Group & { members: GroupMember[] }>(
        ['group', group.groupid],
        (current) => current ? { ...current, ...result } : current
      );
      qc.invalidateQueries({ queryKey: ['groups'] });
    },
    onError: (error) => setCommunityImageError(error instanceof Error ? error.message : 'Group image could not be saved.'),
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
  const createStructureMutation = useMutation({
    mutationFn: (levels: BlindStructureDraftLevel[]) => api.createGroupBlindStructure(group.groupid, {
      name: newStructureName.trim(),
      levels,
    }),
    onSuccess: () => {
      setNewStructureName('');
      setStructureNameError('');
      setStructureWizardOpen(false);
      qc.invalidateQueries({ queryKey: ['group', group.groupid, 'blind-structures'] });
    },
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
  const pending = useMemo(
    () => sortGroupMembersByName(members.filter(m => !m.approved)),
    [members]
  );
  const approved = useMemo(
    () => sortGroupMembersByName(members.filter(m => m.approved)),
    [members]
  );
  const joinPath = `/join/${encodeURIComponent(effectiveGroup.invitecode)}`;
  const account = profile ?? user;
  const demoMode = Boolean(user?.isdemo);
  const canUseClubFeatures = Boolean(account?.issuperadmin || account?.canuseclubfeatures || account?.tierid === 2 || account?.tierid === 3);
  const announcerControlsEnabled = canUseClubFeatures && aiAnnouncerEnabled && !demoMode;
  const postsEnabled = postsData?.enabled ?? canUseClubFeatures;
  const detailTabs: DetailTab[] = group.isadmin
    ? ['info', 'members', 'posts', 'structures', 'history', 'voice']
    : ['info', 'members', 'posts', 'structures', 'history'];
  const mobilePrimaryTabs: DetailTab[] = ['info', 'members', 'posts'];
  const mobileMoreTabs = detailTabs.filter((tab) => !mobilePrimaryTabs.includes(tab));
  const activeMobileMoreTab = mobileMoreTabs.includes(detailTab);
  const groupInitial = effectiveGroup.name.trim().slice(0, 1).toUpperCase() || 'G';
  const aggregateStats = useMemo(() => approved.reduce((totals, member) => ({
    first: totals.first + Number(member.firstplacecount ?? 0),
    second: totals.second + Number(member.secondplacecount ?? 0),
    third: totals.third + Number(member.thirdplacecount ?? 0),
    cashes: totals.cashes + Number(member.cashfinishcount ?? 0),
    finals: totals.finals + Number(member.finaltablecount ?? 0),
  }), { first: 0, second: 0, third: 0, cashes: 0, finals: 0 }), [approved]);

  useEffect(() => {
    setGroupName(effectiveGroup.name);
    setApprovalNeeded(Boolean(effectiveGroup.approvalneeded));
    setInviteCode(effectiveGroup.invitecode);
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
    effectiveGroup.name,
    effectiveGroup.approvalneeded,
    effectiveGroup.invitecode,
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

  useEffect(() => {
    if (!openMenu) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenMenu(null);
    };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [openMenu]);

  async function copyInviteCode() {
    try {
      await navigator.clipboard.writeText(effectiveGroup.invitecode);
      setCopyState('copied');
      window.setTimeout(() => setCopyState('idle'), 1800);
    } catch {
      setCopyState('error');
      window.setTimeout(() => setCopyState('idle'), 2200);
    }
  }

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

  function saveSettingEditor() {
    if (settingEditor === 'group') {
      const nextName = groupName.trim();
      if (!nextName) return;
      updateGroupMutation.mutate(
        { name: nextName, approvalneeded: approvalNeeded },
        { onSuccess: () => setSettingEditor(null) }
      );
      return;
    }
    if (settingEditor === 'join') {
      const nextCode = normalizeGroupInviteCode(inviteCode);
      if (!nextCode) return;
      updateGroupMutation.mutate(
        { invitecode: nextCode },
        { onSuccess: () => setSettingEditor(null) }
      );
      return;
    }
    if (settingEditor === 'tracking') {
      updateGroupMutation.mutate(
        { defaulttrackingmode: defaultTrackingMode },
        { onSuccess: () => setSettingEditor(null) }
      );
      return;
    }
    if (settingEditor === 'tv') {
      updateGroupMutation.mutate(
        { tvseatingwelcomemessage: tvSeatingMessage.trim() },
        { onSuccess: () => setSettingEditor(null) }
      );
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1280px] space-y-3 sm:space-y-4">
      <section className="relative overflow-visible rounded-2xl border border-pit-border bg-[radial-gradient(circle_at_top_right,rgba(20,184,181,0.15),transparent_30%),linear-gradient(135deg,rgba(18,28,34,0.98),rgba(18,46,48,0.72))] px-3 py-3 shadow-[0_18px_48px_rgba(0,0,0,0.25)] sm:px-5 sm:py-4">
        {openMenu === 'group' && (
          <button type="button" className="fixed inset-0 z-20 cursor-default" aria-label="Close group menu" onClick={() => setOpenMenu(null)} />
        )}
        <div className="flex min-w-0 items-center gap-2.5 sm:gap-4">
          <button
            type="button"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-pit-border bg-pit-bg/60 text-pit-text transition hover:border-pit-teal/55 hover:text-white lg:w-auto lg:px-3"
            onClick={onBack}
            aria-label="Back"
          >
            <ArrowLeft size={16} />
            <span className="ml-1.5 hidden text-xs font-semibold lg:inline">Back</span>
          </button>

          <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-pit-teal/50 bg-pit-teal/10 text-xl font-black text-white ring-2 ring-pit-bg ring-offset-2 ring-offset-pit-teal/70 sm:h-14 sm:w-14">
            {effectiveGroup.communityimagedata ? (
              <img src={effectiveGroup.communityimagedata} alt="" className="h-full w-full object-cover" />
            ) : groupInitial}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <h2 className="min-w-0 truncate text-xl font-black text-white sm:text-2xl">{effectiveGroup.name}</h2>
              {group.isadmin && (
                <span className="inline-flex shrink-0 items-center rounded-full border border-pit-gold/35 bg-pit-gold/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-pit-gold">
                  <Crown size={10} className="mr-1" /> Admin
                </span>
              )}
            </div>
            <p className="mt-1 text-[11px] text-pit-text sm:text-xs">
              {approved.length} member{approved.length === 1 ? '' : 's'} <span className="mx-1.5 text-pit-muted">•</span> {effectiveGroup.approvalneeded ? 'Approval required' : 'Open group'}
            </p>
          </div>

          {group.isadmin && (
            <button type="button" className="btn-ghost hidden h-10 shrink-0 px-3 text-xs lg:inline-flex" onClick={() => setSettingEditor('group')}>
              <Pencil size={14} /> Edit group
            </button>
          )}
          <div className="relative z-30 shrink-0">
            <button
              type="button"
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-pit-border bg-pit-bg/65 text-pit-text transition hover:border-pit-teal/50 hover:text-white"
              aria-label="Group actions"
              aria-expanded={openMenu === 'group'}
              onClick={() => setOpenMenu(openMenu === 'group' ? null : 'group')}
            >
              <MoreHorizontal size={18} />
            </button>
            {openMenu === 'group' && (
              <div className="absolute right-0 top-12 z-30 w-48 overflow-hidden rounded-xl border border-pit-border bg-pit-surface p-1.5 shadow-[0_18px_50px_rgba(0,0,0,0.55)]">
                {group.isadmin && (
                  <button type="button" className="flex h-10 w-full items-center gap-2 rounded-lg px-3 text-left text-xs font-semibold text-pit-text hover:bg-white/5 hover:text-white lg:hidden" onClick={() => { setOpenMenu(null); setSettingEditor('group'); }}>
                    <Pencil size={14} /> Edit group
                  </button>
                )}
                {!demoMode && group.isadmin && (
                  <button type="button" className="flex h-10 w-full items-center gap-2 rounded-lg px-3 text-left text-xs font-semibold text-pit-text hover:bg-white/5 hover:text-white" onClick={() => { setOpenMenu(null); setShareInviteOpen(true); }}>
                    <Share size={14} /> Share invite
                  </button>
                )}
                {group.isadmin ? (
                  <button type="button" className="flex h-10 w-full items-center gap-2 rounded-lg px-3 text-left text-xs font-semibold text-red-300 hover:bg-red-400/10 hover:text-red-200" onClick={() => { setOpenMenu(null); setDeleteGroupConfirmOpen(true); }}>
                    <Trash2 size={14} /> Delete group
                  </button>
                ) : (
                  <button type="button" className="flex h-10 w-full items-center gap-2 rounded-lg px-3 text-left text-xs font-semibold text-red-300 hover:bg-red-400/10 hover:text-red-200" onClick={() => { setOpenMenu(null); leaveMutation.mutate(); }} disabled={leaveMutation.isPending}>
                    <LogOut size={14} /> {leaveMutation.isPending ? 'Leaving...' : 'Leave group'}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      <div className="space-y-3 sm:space-y-4">
        <nav className="hidden grid-cols-6 gap-1 rounded-xl border border-pit-border bg-pit-bg/60 p-1 md:grid" aria-label="Group sections">
          {detailTabs.map((tab) => {
            const Icon = groupTabIcon(tab);
            return (
              <button key={tab} type="button" onClick={() => setDetailTab(tab)} className={`flex min-w-0 items-center justify-center gap-1.5 rounded-lg border px-2 py-2.5 text-xs font-semibold transition ${detailTab === tab ? 'border-pit-teal bg-pit-teal/15 text-white' : 'border-transparent text-pit-text hover:bg-white/5 hover:text-white'}`}>
                <Icon size={14} className="shrink-0" />
                <span className="truncate">{groupTabLabel(tab, approved.length)}</span>
              </button>
            );
          })}
        </nav>

        <nav className="relative grid grid-cols-4 gap-1 rounded-xl border border-pit-border bg-pit-bg/60 p-1 md:hidden" aria-label="Group sections">
          {mobilePrimaryTabs.map((tab) => {
            const Icon = groupTabIcon(tab);
            return (
              <button key={tab} type="button" onClick={() => { setOpenMenu(null); setDetailTab(tab); }} className={`flex h-11 min-w-0 items-center justify-center gap-1 rounded-lg border px-1 text-[11px] font-semibold transition ${detailTab === tab ? 'border-pit-teal bg-pit-teal/15 text-white' : 'border-transparent text-pit-text'}`}>
                <Icon size={13} className="shrink-0" /><span className="truncate">{groupTabLabel(tab, approved.length).replace(/ \(.*\)$/, '')}</span>
              </button>
            );
          })}
          <button type="button" onClick={() => setOpenMenu(openMenu === 'more' ? null : 'more')} aria-expanded={openMenu === 'more'} className={`flex h-11 min-w-0 items-center justify-center gap-1 rounded-lg border px-1 text-[11px] font-semibold transition ${activeMobileMoreTab ? 'border-pit-teal bg-pit-teal/15 text-white' : 'border-transparent text-pit-text'}`}>
            <MoreHorizontal size={14} /><span>More</span>
          </button>
          {openMenu === 'more' && (
            <>
              <button type="button" className="fixed inset-0 z-20 cursor-default" aria-label="Close section menu" onClick={() => setOpenMenu(null)} />
              <div className="absolute right-1 top-[3.15rem] z-30 w-56 overflow-hidden rounded-xl border border-pit-border bg-pit-surface p-1.5 shadow-[0_18px_50px_rgba(0,0,0,0.55)]">
                {mobileMoreTabs.map((tab) => {
                  const Icon = groupTabIcon(tab);
                  return (
                    <button key={tab} type="button" className={`flex h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-xs font-semibold ${detailTab === tab ? 'bg-pit-teal/15 text-white' : 'text-pit-text hover:bg-white/5 hover:text-white'}`} onClick={() => { setDetailTab(tab); setOpenMenu(null); }}>
                      <Icon size={15} /> {groupTabLabel(tab, approved.length)}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </nav>

        {demoMode && (
          <div className="rounded-xl border border-yellow-300/25 bg-yellow-300/10 px-4 py-3 text-sm font-medium text-yellow-100">
            Invites are disabled in demo mode, but you can still edit members, posts, structures, and tournament settings.
          </div>
        )}

        {detailTab === 'info' && (
          <div className="grid min-w-0 gap-3 xl:grid-cols-[350px_minmax(0,1fr)] xl:gap-4">
            {!demoMode && group.isadmin && (
              <section className="min-w-0 rounded-2xl border border-pit-teal/25 bg-[radial-gradient(circle_at_top_left,rgba(20,184,181,0.15),transparent_36%),linear-gradient(140deg,rgba(18,46,48,0.8),rgba(18,19,24,0.98))] p-3.5 xl:col-start-1 xl:row-start-1 xl:p-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-pit-teal">Join code</p>
                <div className="mt-2 flex min-w-0 items-center gap-2">
                  <span className="min-w-0 flex-1 truncate font-mono text-2xl font-black tracking-[0.2em] text-white sm:text-3xl">{effectiveGroup.invitecode}</span>
                  <button type="button" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-pit-border bg-pit-bg/70 text-pit-text transition hover:border-pit-teal/50 hover:text-white" onClick={() => void copyInviteCode()} aria-label="Copy join code" title="Copy join code">
                    {copyState === 'copied' ? <Check size={17} className="text-emerald-300" /> : <Copy size={17} />}
                  </button>
                  <button type="button" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-pit-teal/40 bg-pit-teal/10 text-pit-teal transition hover:bg-pit-teal hover:text-pit-bg" onClick={() => setShareInviteOpen(true)} aria-label="Share group invite" title="Share group invite">
                    <Share size={17} />
                  </button>
                </div>
                <p className={`mt-2 text-xs ${copyState === 'error' ? 'text-red-300' : 'text-pit-text'}`}>
                  {copyState === 'copied' ? 'Join code copied.' : copyState === 'error' ? 'Could not copy the code.' : 'Copy or share this code to invite players.'}
                </p>
              </section>
            )}

            <section className={`grid grid-cols-2 gap-2 xl:col-start-1 ${!demoMode && group.isadmin ? 'xl:row-start-2' : 'xl:row-start-1'}`}>
              <button type="button" onClick={() => setDetailTab('members')} className="flex min-w-0 items-center gap-3 rounded-2xl border border-pit-border bg-pit-bg/75 p-3 text-left transition hover:border-pit-teal/45">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-pit-teal/25 bg-pit-teal/10 text-pit-teal"><Users size={18} /></span>
                <span className="min-w-0"><span className="block text-[9px] font-bold uppercase tracking-[0.16em] text-pit-muted">Members</span><span className="mt-1 block text-xl font-black text-white">{approved.length}</span><span className="mt-1 hidden text-[10px] text-pit-muted sm:block">View all members</span></span>
              </button>
              <button type="button" onClick={() => group.isadmin && setSettingEditor('group')} className="flex min-w-0 items-center gap-3 rounded-2xl border border-pit-border bg-pit-bg/75 p-3 text-left transition hover:border-pit-teal/45">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-pit-teal/25 bg-pit-teal/10 text-pit-teal"><ShieldCheck size={18} /></span>
                <span className="min-w-0"><span className="block text-[9px] font-bold uppercase tracking-[0.16em] text-pit-muted">Approval</span><span className="mt-1 block truncate text-base font-black text-white">{effectiveGroup.approvalneeded ? 'Required' : 'Open'}</span><span className="mt-1 hidden truncate text-[10px] text-pit-muted sm:block">{effectiveGroup.approvalneeded ? 'Admin approval' : 'Anyone can join'}</span></span>
              </button>
            </section>

            <section className="min-w-0 rounded-2xl border border-pit-border bg-pit-surface/70 p-3 xl:col-start-2 xl:row-start-1 xl:row-span-2 xl:p-4">
              <div className="mb-2 flex items-center gap-2">
                <Settings2 size={17} className="text-pit-teal" />
                <div><h3 className="text-sm font-bold text-white">Group Settings</h3><p className="mt-0.5 hidden text-xs text-pit-muted sm:block">Defaults used when players join and tournaments are created.</p></div>
              </div>
              <div className="overflow-hidden rounded-xl border border-pit-border bg-pit-bg/55">
                {!demoMode && group.isadmin && <GroupSettingRow icon={Hash} label="Group Join Code" description="The code players use to join this group." value={effectiveGroup.invitecode} onEdit={() => setSettingEditor('join')} />}
                <GroupSettingRow icon={Users} label="Default Player Tracking" description="Connect tournament results to group members." value={effectiveGroup.defaulttrackingmode === 'player' ? 'Player tracked stats' : 'Standard tracking'} onEdit={group.isadmin && canUseClubFeatures ? () => setSettingEditor('tracking') : undefined} />
                <GroupSettingRow icon={Home} label="TV Board Check-in Message" description="Shown while players arrive and check in." value={effectiveGroup.tvseatingwelcomemessage ?? 'Welcome! Please see host to check-in!'} onEdit={group.isadmin && canUseClubFeatures ? () => setSettingEditor('tv') : undefined} last />
              </div>
              {updateGroupMutation.error && <p className="mt-2 text-sm text-red-300">{updateGroupMutation.error.message}</p>}
            </section>

            <section className="min-w-0 rounded-2xl border border-pit-border bg-pit-surface/70 p-3 xl:col-start-2 xl:row-start-3 xl:p-4">
              <div className="mb-2 flex items-center gap-2"><Layers3 size={17} className="text-pit-teal" /><h3 className="text-sm font-bold text-white">Quick Access</h3></div>
              <div className="grid gap-1.5 sm:grid-cols-5">
                {([
                  { tab: 'members' as DetailTab, icon: Users, label: 'Members', status: `${approved.length} member${approved.length === 1 ? '' : 's'}` },
                  { tab: 'posts' as DetailTab, icon: MessageSquare, label: 'Posts', status: `${Number(effectiveGroup.postcount ?? 0)} posts` },
                  { tab: 'structures' as DetailTab, icon: Layers3, label: 'Blind Structures', status: 'Saved setups' },
                  { tab: 'history' as DetailTab, icon: Trophy, label: 'Tournament History', status: 'Results' },
                  ...(group.isadmin ? [{ tab: 'voice' as DetailTab, icon: Mic2, label: 'Voice Config', status: aiAnnouncerEnabled ? 'Enabled' : 'Disabled' }] : []),
                ]).map((item) => (
                  <button key={item.tab} type="button" onClick={() => setDetailTab(item.tab)} className="flex min-h-11 min-w-0 items-center gap-3 rounded-xl border border-pit-border bg-pit-bg/55 px-3 py-2 text-left transition hover:border-pit-teal/40 sm:flex-col sm:justify-center sm:gap-1.5 sm:px-2 sm:py-3 sm:text-center">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-pit-teal/10 text-pit-teal"><item.icon size={16} /></span>
                    <span className="min-w-0 flex-1 sm:flex-none"><span className="block truncate text-xs font-semibold text-white">{item.label}</span><span className="mt-0.5 block truncate text-[10px] text-pit-muted">{item.status}</span></span>
                    <ChevronRight size={14} className="shrink-0 text-pit-muted sm:hidden" />
                  </button>
                ))}
              </div>
            </section>

            <section className="min-w-0 rounded-2xl border border-pit-border bg-pit-surface/70 p-3 xl:col-start-2 xl:row-start-4 xl:p-4">
              <div className="mb-3 flex items-center justify-between gap-3"><div className="flex items-center gap-2"><Clock size={16} className="text-pit-teal" /><h3 className="text-sm font-bold text-white">Recent Activity</h3></div></div>
              <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1.25fr)_minmax(300px,0.75fr)]">
                <div className="rounded-xl border border-pit-border bg-pit-bg/55 px-3 py-3">
                  <div className="flex items-center gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-pit-teal/10 text-pit-teal"><Users size={15} /></span><div className="min-w-0"><p className="truncate text-xs font-semibold text-white">{effectiveGroup.name} created</p><p className="mt-0.5 text-[10px] text-pit-muted">{formatGroupDate(effectiveGroup.createdat) || 'Group activity'}</p></div></div>
                </div>
                <div className="grid grid-cols-5 gap-1.5 rounded-xl border border-pit-border bg-pit-bg/55 p-2">
                  {[['🏆', aggregateStats.first, '1st'], ['🥈', aggregateStats.second, '2nd'], ['🥉', aggregateStats.third, '3rd'], ['💰', aggregateStats.cashes, 'Cashes'], ['🏁', aggregateStats.finals, 'Finals']].map(([icon, value, label]) => (
                    <div key={String(label)} className="min-w-0 text-center"><span className="block text-sm" aria-hidden="true">{icon}</span><span className="mt-0.5 block text-sm font-black text-white">{value}</span><span className="block truncate text-[8px] uppercase tracking-wide text-pit-muted">{label}</span></div>
                  ))}
                </div>
              </div>
            </section>
          </div>
        )}

        {detailTab === 'voice' && group.isadmin && (
          <div className="space-y-4">
            <div className="rounded-xl border border-pit-teal/20 bg-pit-teal/5 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">Announcer</p>
                  <p className="mt-1 text-xs leading-5 text-pit-muted">
                    {demoMode
                      ? 'Demo mode uses browser speech only, so generated voice clips stay off.'
                      : "Level changes can generate smart announcer audio using the tournament field, rebuys, add-ons, and this group's style."}
                  </p>
                </div>
                {!canUseClubFeatures && <span className="badge border-yellow-300/25 bg-yellow-300/10 text-yellow-100">Club</span>}
                {demoMode && <span className="badge border-yellow-300/25 bg-yellow-300/10 text-yellow-100">Demo TTS</span>}
                <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-pit-text">
                  <span>{aiAnnouncerEnabled ? 'Enabled' : 'Disabled'}</span>
                  <span className={`flex h-6 w-11 rounded-full p-0.5 transition-colors ${aiAnnouncerEnabled ? 'bg-pit-teal' : 'bg-pit-border'}`}>
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={aiAnnouncerEnabled}
                      disabled={!canUseClubFeatures || demoMode}
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
                    <article
                      id={`group-post-${post.id}`}
                      key={post.id}
                      className={`rounded-xl border bg-pit-bg p-3 transition ${focusPostId === post.id ? 'border-pit-teal shadow-[0_0_0_1px_rgba(20,184,166,0.3),0_0_24px_rgba(20,184,166,0.16)]' : 'border-pit-border'}`}
                    >
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
            {pending.length > 0 && group.isadmin && (
              <div>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className="eyebrow">Pending Approval</p>
                  <button
                    className="btn-primary px-3 py-1.5 text-xs"
                    disabled={approveAllMutation.isPending || approveMutation.isPending || pending.length === 0}
                    onClick={() => approveAllMutation.mutate()}
                  >
                    {approveAllMutation.isPending ? 'Approving...' : `Approve all (${pending.length})`}
                  </button>
                </div>
                {approveAllMutation.error && <p className="mb-2 text-sm text-red-400">{approveAllMutation.error.message}</p>}
                <div className="space-y-1">
                  {pending.map(m => (
                    <div key={m.userid} className="flex items-center justify-between py-2 px-3 rounded-lg bg-pit-bg border border-pit-border">
                      <span className="text-sm">{m.displayname ?? m.emailaddress}</span>
                      <button className="btn-primary text-xs px-3 py-1"
                        disabled={approveMutation.isPending || approveAllMutation.isPending}
                        onClick={() => approveMutation.mutate(m.userid)}>Approve</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="rounded-xl border border-pit-border bg-pit-bg p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-pit-muted">Member stats</p>
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-pit-text">
                {PLAYER_ACHIEVEMENT_LEGEND.map((item) => (
                  <span key={item.label} className="inline-flex items-center gap-1 rounded-full border border-pit-border bg-pit-surface/50 px-2 py-1">
                    <span aria-hidden="true">{item.icon}</span>
                    <span>{item.label}</span>
                  </span>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              {approved.map(m => (
                <div key={m.userid} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-pit-bg/60 transition-colors">
                  <div className="min-w-0 flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-pit-surface border border-pit-border flex items-center justify-center text-[10px] font-bold text-pit-muted">
                      {(m.displayname ?? m.emailaddress).slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="truncate text-sm text-white">{groupMemberDisplayName(m)}</span>
                        {m.isadmin && (
                          <span className="badge bg-pit-gold/10 border border-pit-gold/20 text-pit-gold text-[10px]">
                            <Crown size={8} className="mr-0.5" /> Admin
                          </span>
                        )}
                      </div>
                      <PlayerTrophyStrip player={m} size="sm" className="mt-1" />
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
          <div className="space-y-3">
            {structureWizardOpen ? (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-semibold text-white sm:text-2xl">New blind structure</h2>
                    <p className="mt-1 text-sm text-pit-muted">Build a custom blind structure for your group.</p>
                  </div>
                  <button
                    type="button"
                    className="btn-ghost min-h-11 shrink-0 px-3 py-2 text-sm"
                    onClick={() => {
                      setStructureWizardOpen(false);
                      setStructureNameError('');
                    }}
                    disabled={createStructureMutation.isPending}
                  >
                    Cancel
                  </button>
                </div>
                <label className="block rounded-xl border border-pit-border bg-pit-surface p-4 sm:p-5">
                  <span className="text-sm font-semibold text-white">Structure name</span>
                  <input
                    className="input mt-2 min-h-11 w-full"
                    value={newStructureName}
                    onChange={(event) => {
                      setNewStructureName(event.target.value);
                      setStructureNameError('');
                    }}
                    placeholder="Friday turbo"
                    maxLength={80}
                    autoFocus
                  />
                  <span className="mt-2 block text-xs text-pit-muted">Choose a clear name your hosts will recognize later.</span>
                </label>
                <BlindStructureCalculator
                  tournament={{ maxplayers: 0, rebuychips: 0, addonchips: 0, rebuyprice: 0, addonprice: 0 }}
                  initiallyExpanded
                  title="Blind structure wizard"
                  saveLabel="Save structure"
                  saveDisabled={!newStructureName.trim()}
                  saving={createStructureMutation.isPending}
                  error={structureNameError || createStructureMutation.error?.message}
                  onSave={(levels) => {
                    if (!newStructureName.trim()) {
                      setStructureNameError('Give this blind structure a name before saving.');
                      return;
                    }
                    createStructureMutation.mutate(levels);
                  }}
                />
              </>
            ) : loadingStructures
              ? <LoadingSpinner className="py-8" />
              : savedStructures.length === 0
                ? (
                  <div className="flex flex-col items-center gap-3 py-10 text-center">
                    <Trophy size={28} className="text-pit-muted" />
                    <div>
                      <p className="text-sm font-semibold text-white">No saved structures yet</p>
                      <p className="mt-1 text-xs text-pit-muted">Build one with the blind structure wizard.</p>
                    </div>
                    {group.isadmin && (
                      <button type="button" className="btn-primary px-3 py-2 text-xs" onClick={() => setStructureWizardOpen(true)}>
                        <Plus size={14} />
                        Add structure
                      </button>
                    )}
                  </div>
                )
                : (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-white">Saved structures</p>
                      {group.isadmin && (
                        <button type="button" className="btn-primary px-3 py-2 text-xs" onClick={() => setStructureWizardOpen(true)}>
                          <Plus size={14} />
                          Add structure
                        </button>
                      )}
                    </div>
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
      <Modal
        open={Boolean(settingEditor)}
        title={settingEditor === 'group'
          ? 'Edit group'
          : settingEditor === 'join'
            ? 'Group join code'
            : settingEditor === 'tracking'
              ? 'Default player tracking'
              : 'TV board check-in message'}
        onClose={() => setSettingEditor(null)}
        mobilePlacement="center"
        footer={(
          <>
            <button type="button" className="btn-ghost" onClick={() => setSettingEditor(null)} disabled={updateGroupMutation.isPending}>Cancel</button>
            <button
              type="button"
              className="btn-primary"
              onClick={saveSettingEditor}
              disabled={updateGroupMutation.isPending || (settingEditor === 'group' && !groupName.trim()) || (settingEditor === 'join' && !normalizeGroupInviteCode(inviteCode))}
            >
              <Save size={14} /> {updateGroupMutation.isPending ? 'Saving...' : 'Save'}
            </button>
          </>
        )}
      >
        {settingEditor === 'group' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-xl border border-pit-border bg-pit-bg/60 p-3">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border border-pit-teal/45 bg-pit-teal/10 text-xl font-black text-white">
                {effectiveGroup.communityimagedata ? <img src={effectiveGroup.communityimagedata} alt="" className="h-full w-full object-cover" /> : groupInitial}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-white">Group image</p>
                <p className="mt-1 text-xs leading-5 text-pit-muted">Upload a PNG, JPG, GIF, or WebP up to 25 MB. It will be resized automatically.</p>
                <label className="btn-ghost mt-2 inline-flex cursor-pointer px-3 py-2 text-xs">
                  <Upload size={14} /> {updateCommunityImageMutation.isPending ? 'Preparing...' : 'Choose image'}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="sr-only"
                    disabled={updateCommunityImageMutation.isPending}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) updateCommunityImageMutation.mutate(file);
                      event.target.value = '';
                    }}
                  />
                </label>
              </div>
            </div>
            {communityImageError && <p className="text-sm text-red-300">{communityImageError}</p>}
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-pit-muted">Group name</span>
              <input className="input" value={groupName} onChange={(event) => setGroupName(event.target.value)} maxLength={100} autoFocus />
            </label>
            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-pit-border bg-pit-bg/60 px-3 py-3">
              <span><span className="block text-sm font-semibold text-white">Require approval to join</span><span className="mt-1 block text-xs text-pit-muted">New members wait for an admin before entering the group.</span></span>
              <input type="checkbox" className="h-5 w-5 accent-pit-teal" checked={approvalNeeded} onChange={(event) => setApprovalNeeded(event.target.checked)} />
            </label>
          </div>
        )}
        {settingEditor === 'join' && (
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-pit-muted">Group join code</span>
            <input
              className="input font-mono uppercase tracking-[0.14em]"
              value={inviteCode}
              onChange={(event) => setInviteCode(formatGroupInviteCodeInput(event.target.value))}
              onBlur={() => setInviteCode(normalizeGroupInviteCode(inviteCode))}
              maxLength={10}
              autoFocus
            />
            <span className="mt-2 block text-xs leading-5 text-pit-muted">Use 1-10 letters, numbers, or spaces. Join codes are unique across groups and leagues.</span>
          </label>
        )}
        {settingEditor === 'tracking' && (
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-pit-muted">Player tracking</span>
            <select className="input" value={defaultTrackingMode} onChange={(event) => setDefaultTrackingMode(event.target.value as 'standard' | 'player')} autoFocus>
              <option value="standard">Standard tracking</option>
              <option value="player">Player tracked stats</option>
            </select>
            <span className="mt-2 block text-xs leading-5 text-pit-muted">Player tracked stats connect tournament results to member histories and automatic trophies.</span>
          </label>
        )}
        {settingEditor === 'tv' && (
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-pit-muted">Check-in message</span>
            <textarea className="input min-h-24" value={tvSeatingMessage} onChange={(event) => setTvSeatingMessage(event.target.value)} maxLength={180} autoFocus />
            <span className="mt-2 block text-xs leading-5 text-pit-muted">Shown on the TV board while players arrive and check in.</span>
          </label>
        )}
        {updateGroupMutation.error && <p className="mt-3 text-sm text-red-300">{updateGroupMutation.error.message}</p>}
      </Modal>
      <JoinShareDialog
        open={shareInviteOpen}
        onClose={() => setShareInviteOpen(false)}
        kind="group"
        name={effectiveGroup.name}
        inviteCode={effectiveGroup.invitecode}
        joinPath={joinPath}
      />
      <ConfirmDialog
        open={deleteGroupConfirmOpen}
        title="Delete group?"
        message={(
          <>
            Delete <span className="font-semibold text-white">{effectiveGroup.name}</span>?
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

function groupMemberDisplayName(member: GroupMember): string {
  return member.displayname ?? member.emailaddress ?? 'Player';
}

function sortGroupMembersByName(members: GroupMember[]): GroupMember[] {
  return [...members].sort((a, b) => {
    const nameCompare = groupMemberDisplayName(a).localeCompare(groupMemberDisplayName(b), undefined, {
      sensitivity: 'base',
      numeric: true,
    });
    if (nameCompare !== 0) return nameCompare;
    return a.userid.localeCompare(b.userid);
  });
}

function GroupSettingRow({
  icon: Icon,
  label,
  description,
  value,
  onEdit,
  last = false,
}: {
  icon: LucideIcon;
  label: string;
  description: string;
  value: string;
  onEdit?: () => void;
  last?: boolean;
}) {
  return (
    <div className={`grid min-w-0 grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-x-2.5 px-3 py-3 sm:grid-cols-[2.5rem_minmax(0,1fr)_minmax(180px,0.65fr)_auto] sm:gap-x-3 ${last ? '' : 'border-b border-pit-border'}`}>
      <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-pit-teal/25 bg-pit-teal/10 text-pit-teal"><Icon size={16} /></span>
      <span className="min-w-0">
        <span className="block truncate text-xs font-semibold text-white sm:text-sm">{label}</span>
        <span className="mt-0.5 hidden truncate text-[10px] text-pit-muted sm:block">{description}</span>
        <span className="mt-1 block truncate text-[11px] text-pit-text sm:hidden">{value}</span>
      </span>
      <span className="hidden min-w-0 truncate rounded-lg border border-pit-border bg-pit-surface/70 px-3 py-2 text-xs text-pit-text sm:block">{value}</span>
      {onEdit ? (
        <button type="button" aria-label={`Edit ${label}`} className="flex h-9 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-pit-teal transition hover:bg-pit-teal/10 hover:text-white" onClick={onEdit}>
          <span className="hidden sm:inline">Edit</span><ChevronRight size={14} />
        </button>
      ) : (
        <span className="h-3.5 w-3.5" aria-hidden="true" />
      )}
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
