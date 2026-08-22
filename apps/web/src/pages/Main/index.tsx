import { ChangeEvent, type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { Bot, Calendar, ChevronDown, Gamepad2, Home, ImageIcon, LogOut, Mail, Menu, MessageSquare, Music4, Pencil, Phone, Settings, Shield, Trash2, Trophy, Upload, User, Users } from 'lucide-react';
import Layout, { HomeShellDestination, NavTab } from '../../components/Layout';
import { api } from '../../api/client';
import AdminPanel from './AdminPanel';
import GroupsPanel from './GroupsPanel';
import LeaguesPanel from './LeaguesPanel';
import TournamentsPanel, { CommandCenterSection } from './TournamentsPanel';
import { useAuthStore } from '../../store/auth';
import PushNotificationSettings from '../../components/PushNotificationSettings';
import PwaPushPrompt from '../../components/PwaPushPrompt';
import { cleanupDemoSessionIfNeeded } from '../../utils/demoSession';
import { prepareAvatarImage } from '../../utils/avatarImage';

type MainView = 'command' | 'profile' | 'admin';

export default function MainPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, updateUser } = useAuthStore();
  const requestedTab = location.state && typeof location.state === 'object' && 'tab' in location.state
    ? location.state.tab as NavTab
    : undefined;
  const requestedLeagueId = location.state && typeof location.state === 'object' && 'leagueId' in location.state
    ? String(location.state.leagueId ?? '')
    : '';
  const deepLink = parseCommandCenterDeepLink(location.search);
  const [view, setView] = useState<MainView>(requestedTab === 'profile' || requestedTab === 'admin' ? requestedTab : 'command');
  const [commandSection, setCommandSection] = useState<CommandCenterSection>(deepLink.section ?? sectionFromTab(requestedTab));
  const [commandDetailOpen, setCommandDetailOpen] = useState(false);
  const [createTournamentOpen, setCreateTournamentOpen] = useState(false);
  const [createGameRequestId, setCreateGameRequestId] = useState(0);
  const [homeRequestId, setHomeRequestId] = useState(0);
  const [gamesRequestId, setGamesRequestId] = useState(0);
  const [homeScheduleMode, setHomeScheduleMode] = useState<'home' | 'games'>('home');
  const [canHostGames, setCanHostGames] = useState(false);
  const [groupCreateRequestId, setGroupCreateRequestId] = useState(0);
  const [leagueCreateRequestId, setLeagueCreateRequestId] = useState(0);
  const [groupOpenRequest, setGroupOpenRequest] = useState<{ groupId: string; tab?: 'posts'; postId?: string; token: number } | null>(() => (
    deepLink.groupId ? { groupId: deepLink.groupId, tab: deepLink.groupTab, postId: deepLink.postId, token: 1 } : null
  ));
  const [leagueDeepLink, setLeagueDeepLink] = useState(() => ({
    leagueId: deepLink.leagueId ?? (requestedLeagueId || undefined),
    seasonId: deepLink.seasonId,
    tab: deepLink.leagueTab,
    postId: deepLink.postId,
    eventId: deepLink.eventId,
  }));
  const handledSearchRef = useRef(location.search);
  const [showTour, setShowTour] = useState(() => user?.onboardingcomplete === false);

  useLayoutEffect(() => {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, []);

  const { data: currentProfile } = useQuery({
    queryKey: ['me'],
    queryFn: api.me,
    enabled: Boolean(user),
  });

  const completeTourMutation = useMutation({
    mutationFn: () => api.updateMe({ completeonboarding: true }),
    onSuccess: (updated) => {
      queryClient.setQueryData(['me'], updated);
      updateUser({ onboardingcomplete: true });
      setShowTour(false);
    },
    onError: () => setShowTour(false),
  });

  useEffect(() => {
    if (requestedLeagueId) {
      setLeagueDeepLink((current) => ({ ...current, leagueId: requestedLeagueId }));
    }
    if (requestedTab) {
      if (requestedTab === 'profile' || requestedTab === 'admin') {
        setView(requestedTab);
      } else {
        setView('command');
        setCommandSection(sectionFromTab(requestedTab));
      }
    }
    if (requestedTab) {
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.pathname, navigate, requestedLeagueId, requestedTab]);

  useEffect(() => {
    if (!location.search) {
      handledSearchRef.current = '';
      return;
    }
    if (handledSearchRef.current === location.search) return;
    handledSearchRef.current = location.search;
    const next = parseCommandCenterDeepLink(location.search);
    if (!next.section) return;
    setView('command');
    setCommandDetailOpen(false);
    setCommandSection(next.section);
    if (next.groupId) {
      setGroupOpenRequest({ groupId: next.groupId, tab: next.groupTab, postId: next.postId, token: Date.now() });
    }
    if (next.leagueId) {
      setLeagueDeepLink({ leagueId: next.leagueId, seasonId: next.seasonId, tab: next.leagueTab, postId: next.postId, eventId: next.eventId });
    }
  }, [location.search]);

  useEffect(() => {
    if (user && user.onboardingcomplete === false && !user.isdemo) {
      setShowTour(true);
    }
  }, [user]);

  useEffect(() => {
    if (!currentProfile) return;
    updateUser({
      displayname: currentProfile.displayname,
      emailaddress: currentProfile.emailaddress,
      tierid: currentProfile.tierid,
      accounttier: currentProfile.accounttier,
      issuperadmin: currentProfile.issuperadmin,
      hostedtournamentcount: currentProfile.hostedtournamentcount,
      trialhostedremaining: currentProfile.trialhostedremaining,
      trialactive: currentProfile.trialactive,
      canuseclubfeatures: currentProfile.canuseclubfeatures,
      aicreditsremaining: currentProfile.aicreditsremaining,
      defaultaicredits: currentProfile.defaultaicredits,
      phonenumber: currentProfile.phonenumber ?? null,
      smsoptedin: currentProfile.smsoptedin ?? false,
      avatarimagedata: currentProfile.avatarimagedata ?? null,
      hasavatarimage: currentProfile.hasavatarimage ?? false,
      onboardingcomplete: currentProfile.onboardingcomplete,
      isdemo: currentProfile.isdemo,
    });
    setShowTour(currentProfile.onboardingcomplete === false && !currentProfile.isdemo);
  }, [currentProfile, updateUser]);

  const handleCommandSectionChange = (nextSection: CommandCenterSection) => {
    if (nextSection !== 'leagues') {
      setLeagueDeepLink({ leagueId: undefined, seasonId: undefined, tab: undefined, postId: undefined, eventId: undefined });
    }
    setCommandDetailOpen(false);
    setView('command');
    setCommandSection(nextSection);
  };

  const returnToGames = () => {
    handledSearchRef.current = '';
    setGroupOpenRequest(null);
    setLeagueDeepLink({ leagueId: undefined, seasonId: undefined, tab: undefined, postId: undefined, eventId: undefined });
    setCommandDetailOpen(false);
    setView('command');
    setCommandSection('upcoming');
    if (location.search) {
      navigate(location.pathname, { replace: true });
    }
  };

  const startGroupCreate = () => {
    setView('command');
    setCommandSection('groups');
    setCommandDetailOpen(false);
    setGroupCreateRequestId(0);
    window.setTimeout(() => setGroupCreateRequestId((value) => value + 1), 0);
  };

  const startLeagueCreate = () => {
    setView('command');
    setCommandSection('leagues');
    setCommandDetailOpen(false);
    setLeagueCreateRequestId(0);
    window.setTimeout(() => setLeagueCreateRequestId((value) => value + 1), 0);
  };

  const startGroupInvite = (groupId: string) => {
    setView('command');
    setCommandSection('groups');
    setCommandDetailOpen(false);
    setGroupOpenRequest({ groupId, token: Date.now() });
  };

  const startGameCreate = () => {
    setView('command');
    setCommandSection('upcoming');
    setCommandDetailOpen(false);
    setCreateGameRequestId((value) => value + 1);
  };

  const showHomeDashboard = () => {
    handleCommandSectionChange('upcoming');
    setHomeScheduleMode('home');
    setHomeRequestId((value) => value + 1);
  };

  const showAllGames = () => {
    handleCommandSectionChange('upcoming');
    setHomeScheduleMode('games');
    setGamesRequestId((value) => value + 1);
  };

  const currentTab: NavTab = view === 'command'
    ? commandSection === 'groups'
      ? 'groups'
      : commandSection === 'leagues'
        ? 'leagues'
        : 'tournaments'
    : view;
  const homeShellActive: HomeShellDestination = view === 'profile'
    ? 'profile'
    : view === 'admin'
      ? 'admin'
      : commandSection === 'history'
        ? 'history'
        : commandSection === 'communities' || commandSection === 'groups' || commandSection === 'leagues'
          ? 'communities'
          : homeScheduleMode;
  const responsiveHomeShell = view === 'command' && !commandDetailOpen ? {
    active: homeShellActive,
    canHost: canHostGames,
    onHome: showHomeDashboard,
    onGames: showAllGames,
    onCommunities: () => handleCommandSectionChange('communities'),
    onHistory: () => handleCommandSectionChange('history'),
    onHostGame: startGameCreate,
    onProfile: () => setView('profile'),
    onAdmin: () => setView('admin'),
  } : undefined;

  return (
    <>
      <Layout
        tab={currentTab}
        hideSidebar
        hideMobileNav
        hideFeedback={createTournamentOpen}
        responsiveHomeShell={responsiveHomeShell}
        headerRight={({ openFeedback }) => (
          <CommandCenterMenu
            onHome={showHomeDashboard}
            onGames={showAllGames}
            onHistory={() => handleCommandSectionChange('history')}
            onCommunities={() => handleCommandSectionChange('communities')}
            onHostGame={startGameCreate}
            onFeedback={openFeedback}
            onProfile={() => setView('profile')}
            onAdmin={() => setView('admin')}
          />
        )}
        mainWidthClassName={view === 'admin' || commandSection === 'communities' || commandSection === 'leagues' || commandSection === 'groups' ? 'max-w-7xl' : 'max-w-[64rem]'}
      >
        <PwaPushPrompt />
        {view === 'command' && (
          <TournamentsPanel
            section={commandSection}
            onSectionChange={handleCommandSectionChange}
            onOpenCommunity={({ type, id }) => {
              setView('command');
              setCommandDetailOpen(false);
              if (type === 'group') {
                setLeagueDeepLink({ leagueId: undefined, seasonId: undefined, tab: undefined, postId: undefined, eventId: undefined });
                setCommandSection('groups');
                setGroupOpenRequest({ groupId: id, token: Date.now() });
                return;
              }
              setGroupOpenRequest(null);
              setCommandSection('leagues');
              setLeagueDeepLink({ leagueId: id, seasonId: undefined, tab: undefined, postId: undefined, eventId: undefined });
            }}
            hideDashboard={commandDetailOpen}
            onCreateFlowChange={setCreateTournamentOpen}
            onboardingActive={showTour}
            createGameRequestId={createGameRequestId}
            homeRequestId={homeRequestId}
            gamesRequestId={gamesRequestId}
            onScheduleModeChange={setHomeScheduleMode}
            onHostCapabilityChange={setCanHostGames}
            focusScheduleItemId={deepLink.scheduleItemId}
            onStartGroupCreate={startGroupCreate}
            onStartLeagueCreate={startLeagueCreate}
            onStartGroupInvite={startGroupInvite}
            onStartFirstGame={startGameCreate}
            onCompleteOnboarding={() => completeTourMutation.mutate()}
            renderSection={(section) => (
              section === 'groups'
                ? (
                  <GroupsPanel
                    onDetailStateChange={setCommandDetailOpen}
                    onBackToCommunities={returnToGames}
                    createRequestId={groupCreateRequestId}
                    openGroupRequest={groupOpenRequest}
                  />
                )
                : (
                  <LeaguesPanel
                    initialLeagueId={leagueDeepLink.leagueId}
                    initialSeasonId={leagueDeepLink.seasonId}
                    initialTab={leagueDeepLink.tab}
                    initialPostId={leagueDeepLink.postId}
                    initialEventId={leagueDeepLink.eventId}
                    onDetailStateChange={setCommandDetailOpen}
                    onBackToCommunities={returnToGames}
                    createRequestId={leagueCreateRequestId}
                  />
                )
            )}
          />
        )}
        {view === 'profile' && <ProfilePanel onReturn={() => setView('command')} />}
        {view === 'admin' && <AdminPanel />}
      </Layout>
    </>
  );
}

function parseCommandCenterDeepLink(search: string): {
  section?: CommandCenterSection;
  groupId?: string;
  groupTab?: 'posts';
  leagueId?: string;
  seasonId?: string;
  leagueTab?: 'board' | 'events';
  postId?: string;
  eventId?: string;
  scheduleItemId?: string;
} {
  const params = new URLSearchParams(search);
  const rawSection = params.get('section');
  const section = rawSection === 'groups' || rawSection === 'leagues' || rawSection === 'communities' || rawSection === 'history' || rawSection === 'upcoming'
    ? rawSection
    : undefined;
  return {
    section,
    groupId: params.get('group') || undefined,
    groupTab: params.get('groupTab') === 'posts' ? 'posts' : undefined,
    leagueId: params.get('league') || undefined,
    seasonId: params.get('season') || undefined,
    leagueTab: params.get('leagueTab') === 'board' || params.get('leagueTab') === 'events'
      ? params.get('leagueTab') as 'board' | 'events'
      : undefined,
    postId: params.get('post') || undefined,
    eventId: params.get('event') || undefined,
    scheduleItemId: params.get('tournament') || params.get('game') || undefined,
  };
}

function sectionFromTab(tab?: NavTab): CommandCenterSection {
  if (tab === 'groups' || tab === 'leagues') return 'communities';
  return 'upcoming';
}

function CommandCenterMenu({
  onHome,
  onGames,
  onHistory,
  onCommunities,
  onHostGame,
  onFeedback,
  onProfile,
  onAdmin,
}: {
  onHome: () => void;
  onGames: () => void;
  onHistory: () => void;
  onCommunities: () => void;
  onHostGame: () => void;
  onFeedback: () => void;
  onProfile: () => void;
  onAdmin: () => void;
}) {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  function handleLogout() {
    const token = localStorage.getItem('pb_token');
    void cleanupDemoSessionIfNeeded(user, token);
    queryClient.clear();
    logout();
    navigate('/landing', { replace: true });
  }

  return (
    <div ref={menuRef} className="relative flex items-center gap-2">
      <span className="hidden max-w-32 truncate text-sm font-semibold text-white min-[370px]:inline sm:max-w-48" title={user?.tablename || user?.displayname || 'Account'}>
        {user?.tablename || user?.displayname || 'Account'}
      </span>
      <button
          type="button"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-pit-border bg-pit-card text-pit-text transition hover:border-pit-teal/50 hover:text-white"
          onClick={() => setOpen((value) => !value)}
          aria-label="Open account menu"
          aria-expanded={open}
        >
          <Menu size={20} />
        </button>
      {open && (
        <div className="absolute right-0 top-12 z-50 w-52 overflow-hidden rounded-xl border border-pit-border bg-pit-card py-1 shadow-2xl">
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-semibold text-pit-text transition hover:bg-white/5 hover:text-white"
            onClick={() => {
              setOpen(false);
              onHome();
            }}
          >
            <Home size={15} />
            Home
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-semibold text-pit-text transition hover:bg-white/5 hover:text-white"
            onClick={() => {
              setOpen(false);
              onGames();
            }}
          >
            <Gamepad2 size={15} />
            Games
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-semibold text-pit-text transition hover:bg-white/5 hover:text-white"
            onClick={() => {
              setOpen(false);
              onCommunities();
            }}
          >
            <Users size={15} />
            Groups & Leagues
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-semibold text-pit-text transition hover:bg-white/5 hover:text-white"
            onClick={() => {
              setOpen(false);
              onHistory();
            }}
          >
            <Calendar size={15} />
            History
          </button>
          <div className="my-1 border-t border-pit-border" />
          <button
            type="button"
            className="mx-2 flex w-[calc(100%-1rem)] items-center justify-center gap-2 rounded-lg bg-pit-teal px-3 py-2.5 text-sm font-black text-pit-bg shadow-[0_0_18px_rgba(20,184,166,0.2)] transition hover:brightness-110"
            onClick={() => {
              setOpen(false);
              onHostGame();
            }}
          >
            + Host a Game
          </button>
          <div className="my-1 border-t border-pit-border" />
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-semibold text-pit-text transition hover:bg-white/5 hover:text-white"
            onClick={() => {
              setOpen(false);
              onProfile();
            }}
          >
            <Settings size={15} />
            Settings
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-semibold text-pit-text transition hover:bg-white/5 hover:text-white"
            onClick={() => {
              setOpen(false);
              onFeedback();
            }}
          >
            <MessageSquare size={15} />
            Help & Feedback
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-semibold text-pit-text transition hover:bg-white/5 hover:text-white"
            onClick={() => {
              setOpen(false);
              onProfile();
            }}
          >
            <User size={15} />
            Profile
          </button>
          {user?.issuperadmin && (
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-semibold text-red-200 transition hover:bg-red-500/10 hover:text-red-100"
              onClick={() => {
                setOpen(false);
                onAdmin();
              }}
            >
              <Shield size={15} />
              Admin
            </button>
          )}
          <div className="my-1 border-t border-pit-border" />
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-semibold text-pit-muted transition hover:bg-red-500/10 hover:text-red-300"
            onClick={handleLogout}
          >
            <LogOut size={15} />
            Sign Out
          </button>
        </div>
      )}
    </div>
  );
}

function ProfilePanel({ onReturn }: { onReturn: () => void }) {
  const { user, logout, updateUser } = useAuthStore();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const audioInputRef = useRef<HTMLInputElement | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [mediaSuccess, setMediaSuccess] = useState<string | null>(null);
  const [avatarProcessing, setAvatarProcessing] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [smsOptIn, setSmsOptIn] = useState(false);
  const [emailAlertsEnabled, setEmailAlertsEnabled] = useState(true);
  const [profileName, setProfileName] = useState('');
  const [tableNickname, setTableNickname] = useState('');
  const [editingProfile, setEditingProfile] = useState(false);
  const compactProfileLayout = useCompactProfileLayout();

  const { data: profile, isLoading } = useQuery({
    queryKey: ['me'],
    queryFn: api.me,
  });

  useEffect(() => {
    if (!profile) return;
    updateUser({
      fullname: profile.fullname ?? null,
      tablename: profile.tablename ?? null,
      displayname: profile.displayname,
      emailaddress: profile.emailaddress,
      avatarimagedata: profile.avatarimagedata ?? null,
      hasavatarimage: profile.hasavatarimage ?? false,
      aicreditsremaining: profile.aicreditsremaining,
      defaultaicredits: profile.defaultaicredits,
      phonenumber: profile.phonenumber ?? null,
      smsoptedin: profile.smsoptedin ?? false,
      onboardingcomplete: profile.onboardingcomplete,
      isdemo: profile.isdemo,
    });
    setPhoneNumber(profile.phonenumber ?? '');
    setSmsOptIn(Boolean(profile.smsoptedin));
    setEmailAlertsEnabled(profile.emailalertsenabled !== false);
    setProfileName(profile.fullname ?? '');
    setTableNickname(profile.tablename ?? (profile.displayname === profile.emailaddress ? '' : profile.displayname ?? ''));
  }, [profile, updateUser]);

  const updateProfileMutation = useMutation({
    mutationFn: api.updateMe,
    onSuccess: (updated, variables) => {
      queryClient.setQueryData(['me'], updated);
      updateUser({
        fullname: updated.fullname ?? null,
        tablename: updated.tablename ?? null,
        displayname: updated.displayname,
        emailaddress: updated.emailaddress,
        avatarimagedata: updated.avatarimagedata ?? null,
        hasavatarimage: updated.hasavatarimage ?? false,
        aicreditsremaining: updated.aicreditsremaining,
        defaultaicredits: updated.defaultaicredits,
        phonenumber: updated.phonenumber ?? null,
        smsoptedin: updated.smsoptedin ?? false,
      });
      setPhoneNumber(updated.phonenumber ?? '');
      setSmsOptIn(Boolean(updated.smsoptedin));
      setEmailAlertsEnabled(updated.emailalertsenabled !== false);
      setProfileName(updated.fullname ?? '');
      setTableNickname(updated.tablename ?? (updated.displayname === updated.emailaddress ? '' : updated.displayname ?? ''));
      if ('name' in variables || 'displayname' in variables) setEditingProfile(false);
      if ('checkinaudiodata' in variables || variables.clearcheckinaudio) {
        setMediaSuccess(variables.clearcheckinaudio ? 'Check-in clip removed.' : 'Check-in clip saved.');
      } else if ('avatarimagedata' in variables || variables.clearavatarimage) {
        setMediaSuccess(variables.clearavatarimage ? 'Avatar removed.' : 'Avatar saved.');
      } else {
        setMediaSuccess('Profile updated.');
      }
    },
  });

  const displayName = profile?.displayname ?? user?.displayname;
  const emailAddress = profile?.emailaddress ?? user?.emailaddress;
  const avatarImage = profile?.avatarimagedata ?? user?.avatarimagedata ?? null;
  const initials = displayName
    ?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() ?? '?';

  function handleLogout() {
    const token = localStorage.getItem('pb_token');
    void cleanupDemoSessionIfNeeded(user, token);
    queryClient.clear();
    logout();
    navigate('/landing', { replace: true });
  }

  async function handleAvatarFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setMediaError(null);
    setMediaSuccess(null);
    setAvatarProcessing(true);
    try {
      const avatar = await prepareAvatarImage(file);
      updateProfileMutation.mutate({
        avatarimagedata: avatar.dataUrl,
        avatarfilename: avatar.filename,
        clearavatarimage: false,
      });
    } catch (error) {
      setMediaError(error instanceof Error ? error.message : 'That avatar image could not be prepared.');
    } finally {
      setAvatarProcessing(false);
    }
  }

  async function handleAudioFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setMediaError(null);
    setMediaSuccess(null);
    if (!isSupportedAudioType(file)) {
      setMediaError('Please choose an MP3, WAV, M4A, or AAC file.');
      return;
    }
    if (file.size > 3_000_000) {
      setMediaError('Keep check-in clips under 3 MB.');
      return;
    }

    const durationSeconds = await getAudioDurationSeconds(file).catch(() => null);
    if (durationSeconds == null) {
      setMediaError('That audio file could not be read by the browser. Please choose an MP3, WAV, M4A, or AAC clip that plays locally.');
      return;
    }
    if (durationSeconds < 0.1) {
      setMediaError('That audio file looks empty. Please choose a clip with audible sound.');
      return;
    }
    if (durationSeconds > 5.05) {
      setMediaError('Check-in clips must be 5 seconds or shorter.');
      return;
    }

    const dataUrl = await readAudioFileAsDataUrl(file);
    updateProfileMutation.mutate({
      checkinaudiodata: dataUrl,
      checkinaudiofilename: file.name,
      clearcheckinaudio: false,
    });
  }

  const audioSummary = useMemo(() => {
    if (!profile?.hascheckinaudio) return 'No custom check-in clip yet';
    return profile.checkinaudiofilename ?? 'Custom check-in clip uploaded';
  }, [profile]);
  const tierName = formatTierName(profile?.accounttier);
  const savedNickname = profile?.tablename ?? (profile?.displayname === profile?.emailaddress ? '' : profile?.displayname ?? '');
  const profileDirty = profileName.trim() !== (profile?.fullname ?? '') || tableNickname.trim() !== savedNickname;
  const contactDirty = phoneNumber.trim() !== (profile?.phonenumber ?? '')
    || smsOptIn !== Boolean(profile?.smsoptedin)
    || emailAlertsEnabled !== (profile?.emailalertsenabled !== false);
  const smsPhoneMissing = smsOptIn && !phoneNumber.trim();

  function cancelProfileEdit() {
    setProfileName(profile?.fullname ?? '');
    setTableNickname(savedNickname);
    setEditingProfile(false);
  }

  if (isLoading && !profile) {
    return <div className="mx-auto mt-12 max-w-2xl text-center text-pit-text">Loading profile...</div>;
  }

  if (profile?.isdemo) {
    return (
      <div className="mx-auto mt-6 max-w-2xl space-y-4">
        <button type="button" className="btn-ghost gap-2 px-3 py-2" onClick={onReturn}>
          <Home size={15} />
          Return to Command Center
        </button>
        <div className="card space-y-4 py-8 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-pit-teal/35 bg-pit-teal/15 text-2xl font-black text-pit-teal">
            D
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-pit-muted">Demo Mode</p>
            <h2 className="mt-2 text-2xl font-bold text-white">Profile editing is locked.</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-pit-muted">
              This temporary sandbox lets you run tournaments, manage players, reseat tables, open the TV board, and explore groups without changing a real account.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <button type="button" className="btn-primary" onClick={onReturn}>
              Return to Command Center
            </button>
            <button type="button" className="btn-ghost text-red-200 hover:text-red-100" onClick={handleLogout}>
              <LogOut size={15} />
              End demo
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1240px] space-y-4 px-3 pb-8 pt-3 sm:px-4 sm:pt-5">
      <header className="grid min-h-11 grid-cols-[2.75rem_1fr_2.75rem] items-center sm:flex sm:justify-between">
        <button type="button" className="btn-ghost h-10 w-10 p-0 sm:hidden" onClick={onReturn} aria-label="Return home">
          <Home size={18} />
        </button>
        <div className="flex items-center justify-center gap-3 sm:justify-start">
          <User size={20} className="hidden text-pit-teal sm:block" />
          <div className="text-center sm:text-left">
            <h2 className="font-semibold text-white sm:text-lg">My Profile</h2>
            <p className="hidden text-xs text-pit-muted sm:block">Manage your account, preferences, and alerts.</p>
          </div>
        </div>
        <button
          type="button"
          className="btn-ghost h-10 w-10 p-0 sm:h-auto sm:w-auto sm:gap-2 sm:px-3 sm:py-2"
          onClick={() => editingProfile ? cancelProfileEdit() : setEditingProfile(true)}
          aria-label={editingProfile ? 'Cancel profile editing' : 'Edit profile'}
        >
          <Pencil size={15} />
          <span className="hidden sm:inline">{editingProfile ? 'Cancel' : 'Edit Profile'}</span>
        </button>
      </header>

      {(mediaError || updateProfileMutation.error) && (
        <p className="rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-300" role="alert">
          {mediaError ?? updateProfileMutation.error?.message}
        </p>
      )}
      {mediaSuccess && !mediaError && !updateProfileMutation.error && (
        <p className="rounded-lg border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-200" role="status">
          {mediaSuccess}
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-[1.65fr_1fr]">
        <section className="relative overflow-hidden rounded-lg border border-pit-teal/45 bg-[linear-gradient(130deg,rgba(11,86,88,0.42),rgba(18,22,28,0.96)_66%)] p-4 sm:p-6">
          <div className="flex flex-col items-center gap-3 text-center sm:flex-row sm:gap-5 sm:text-left">
            <button
              type="button"
              className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full border border-pit-teal bg-pit-bg text-3xl font-black text-pit-teal shadow-[0_0_0_4px_rgba(20,184,180,0.08)]"
              onClick={() => avatarInputRef.current?.click()}
              disabled={avatarProcessing || updateProfileMutation.isPending}
              aria-label="Update avatar"
            >
              {avatarImage ? <img src={avatarImage} alt={displayName} className="h-full w-full object-cover" /> : initials}
            </button>
            <div className="w-full min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                <p className="max-w-full truncate text-2xl font-bold text-white">{displayName}</p>
                <span className="rounded-full bg-pit-teal/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-pit-teal">{tierName}</span>
              </div>
              <p className="mt-1 block w-full overflow-hidden text-ellipsis whitespace-nowrap px-2 text-sm text-pit-text sm:px-0">{emailAddress}</p>
            </div>
          </div>

          {editingProfile ? (
            <div className="mt-5 grid gap-3 border-t border-pit-border/70 pt-4 sm:grid-cols-2">
              <label className="space-y-1.5 text-left">
                <span className="text-[11px] font-semibold uppercase tracking-[0.15em] text-pit-muted">Name</span>
                <input className="input" type="text" maxLength={160} value={profileName} onChange={(event) => setProfileName(event.target.value)} />
              </label>
              <label className="space-y-1.5 text-left">
                <span className="text-[11px] font-semibold uppercase tracking-[0.15em] text-pit-muted">Table Nickname</span>
                <input className="input" type="text" maxLength={80} value={tableNickname} onChange={(event) => setTableNickname(event.target.value)} />
              </label>
              <div className="flex justify-end gap-2 sm:col-span-2">
                <button type="button" className="btn-ghost" onClick={cancelProfileEdit}>Cancel</button>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={updateProfileMutation.isPending || !profileName.trim() || !tableNickname.trim() || !profileDirty}
                  onClick={() => updateProfileMutation.mutate({ name: profileName.trim(), displayname: tableNickname.trim() })}
                >
                  {updateProfileMutation.isPending ? 'Saving...' : 'Save Profile'}
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-5 hidden grid-cols-2 divide-x divide-pit-border/70 border-t border-pit-border/70 pt-4 sm:grid">
              <ProfileIdentity label="Name" value={profile?.fullname || 'Not set'} />
              <ProfileIdentity label="Table Nickname" value={savedNickname || 'Not set'} className="pl-5" />
            </div>
          )}

          <div className="mt-5 grid grid-cols-3 divide-x divide-pit-border/70 border-t border-pit-border/70 pt-4 sm:hidden">
            <ProfileHeroMetric label="Hosted" value={profile?.hostedtournamentcount ?? 0} />
            <ProfileHeroMetric label="Status" value={tierName} />
            <ProfileHeroMetric label="Features" value={profile?.canuseclubfeatures ? 'Enabled' : 'Locked'} />
          </div>
        </section>

        <section className="card hidden space-y-3 md:block">
          <div>
            <h3 className="font-semibold text-white">Status Overview</h3>
            <p className="text-sm text-pit-muted">Your ThePokerPlanner account tier.</p>
          </div>
          <ProfileStatusRow icon={<Trophy size={16} />} label="Hosted Tournaments" value={profile?.hostedtournamentcount ?? 0} />
          <ProfileStatusRow icon={<Shield size={16} />} label="Status" value={tierName} accent />
          <ProfileStatusRow icon={<Settings size={16} />} label="Club Features" value={profile?.canuseclubfeatures ? 'Enabled' : 'Locked'} accent={profile?.canuseclubfeatures} />
        </section>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[0.88fr_1.35fr]">
        <div className="contents lg:block lg:space-y-4">
          <ProfileDisclosure
            compact
            className="order-1"
            icon={<Bot size={19} />}
            title="Voice Credits"
            summary={`${profile?.aicreditsremaining ?? 0} of ${profile?.defaultaicredits ?? 0} remaining`}
          >
            <div className="grid grid-cols-2 gap-2">
              <TierStat label="Credits remaining" value={profile?.aicreditsremaining ?? 0} accent={(profile?.aicreditsremaining ?? 0) > 0} />
              <TierStat label="Default allotment" value={`${profile?.defaultaicredits ?? 0} / month`} />
            </div>
          </ProfileDisclosure>

          <ProfileDisclosure compact={compactProfileLayout} className="order-3" icon={<Shield size={18} />} title="ThePokerPlanner Alerts" summary="Manage alert categories">
            <PushNotificationSettings embedded showHeader={!compactProfileLayout} />
          </ProfileDisclosure>
        </div>

        <div className="contents lg:block lg:space-y-4">
          <ProfileDisclosure compact={compactProfileLayout} className="order-2" icon={<Phone size={18} />} title="Notification Contact" summary="Email and SMS preferences">
            <div className="space-y-3">
              {!compactProfileLayout && <div className="flex items-center gap-3">
                <Phone size={18} className="text-pit-teal" />
                <div>
                  <h3 className="font-semibold text-white">Notification Contact</h3>
                  <p className="text-sm text-pit-muted">Choose how groups and leagues can contact you.</p>
                </div>
              </div>}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm text-pit-text">
                  <input type="checkbox" className="h-4 w-4 rounded border-pit-border bg-pit-bg accent-pit-teal" checked={emailAlertsEnabled} onChange={(event) => setEmailAlertsEnabled(event.target.checked)} />
                  <Mail size={15} className="shrink-0 text-pit-teal" />
                  Email alerts
                </label>
                <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm text-pit-text">
                  <input type="checkbox" className="h-4 w-4 rounded border-pit-border bg-pit-bg accent-pit-teal" checked={smsOptIn} onChange={(event) => setSmsOptIn(event.target.checked)} />
                  <Phone size={15} className="shrink-0 text-pit-teal" />
                  SMS alerts
                </label>
              </div>
              {smsOptIn && (
                <label className="block space-y-1.5">
                  <span className="text-xs font-semibold uppercase tracking-[0.12em] text-pit-muted">Mobile number</span>
                  <input
                    className="input w-full"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="10 digit mobile number"
                    required
                    aria-invalid={smsPhoneMissing}
                    aria-describedby={smsPhoneMissing ? 'sms-phone-required' : undefined}
                    value={phoneNumber}
                    onChange={(event) => setPhoneNumber(event.target.value)}
                  />
                  {smsPhoneMissing && <p id="sms-phone-required" className="text-xs text-red-300">Mobile number is required for SMS alerts.</p>}
                </label>
              )}
              <button
                type="button"
                className="btn-primary"
                disabled={updateProfileMutation.isPending || !contactDirty || smsPhoneMissing}
                onClick={() => updateProfileMutation.mutate({ phonenumber: phoneNumber.trim() || null, smsoptedin: smsOptIn, emailalertsenabled: emailAlertsEnabled })}
              >
                Save Notifications
              </button>
            </div>
          </ProfileDisclosure>

          <div className="order-4 grid gap-4 sm:grid-cols-2">
            <ProfileDisclosure compact={compactProfileLayout} icon={<ImageIcon size={18} />} title="Avatar" summary={avatarImage ? 'Profile image added' : 'Upload a profile image'}>
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <ImageIcon size={18} className="text-pit-teal" />
                  <div><h3 className="font-semibold text-white">Avatar</h3><p className="text-sm text-pit-muted">Choose an image up to 25 MB. It will be optimized before saving.</p></div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="btn-primary gap-2" onClick={() => avatarInputRef.current?.click()} disabled={avatarProcessing || updateProfileMutation.isPending}><Upload size={14} />{avatarProcessing ? 'Preparing...' : avatarImage ? 'Replace Avatar' : 'Upload Avatar'}</button>
                  {avatarImage && <button type="button" className="btn-ghost gap-2 text-red-300" onClick={() => updateProfileMutation.mutate({ clearavatarimage: true })} disabled={updateProfileMutation.isPending}><Trash2 size={14} />Remove</button>}
                </div>
              </div>
            </ProfileDisclosure>

            <ProfileDisclosure compact={compactProfileLayout} icon={<Music4 size={18} />} title="Check-In Clip" summary={audioSummary}>
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <Music4 size={18} className="text-pit-teal" />
                  <div><h3 className="font-semibold text-white">Check-In Clip</h3><p className="text-sm text-pit-muted">Upload a 5 second audio clip.</p></div>
                </div>
                <p className="text-sm text-pit-text">{audioSummary}</p>
                {profile?.checkinaudiodata && <audio key={`${profile.checkinaudiofilename ?? 'check-in-clip'}-${profile.checkinaudiodata.length}`} controls preload="metadata" src={profile.checkinaudiodata} className="w-full" />}
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="btn-primary gap-2" onClick={() => audioInputRef.current?.click()} disabled={updateProfileMutation.isPending}><Upload size={14} />{profile?.hascheckinaudio ? 'Replace Clip' : 'Upload Clip'}</button>
                  {profile?.hascheckinaudio && <button type="button" className="btn-ghost gap-2 text-red-300" onClick={() => updateProfileMutation.mutate({ clearcheckinaudio: true })} disabled={updateProfileMutation.isPending}><Trash2 size={14} />Remove</button>}
                </div>
              </div>
            </ProfileDisclosure>
          </div>

          <ProfileDisclosure compact={compactProfileLayout} className="order-5" icon={<Shield size={18} />} title="Account" summary="Email, password, and session">
            <div className="space-y-3">
              <div className="flex items-center gap-3"><Shield size={18} className="text-pit-teal" /><div><h3 className="font-semibold text-white">Account</h3><p className="text-sm text-pit-muted">Managed via email and password.</p></div></div>
              <div className="flex flex-wrap gap-2 border-t border-pit-border pt-3">
                <button type="button" className="btn-ghost gap-2" onClick={onReturn}><Home size={15} />Return Home</button>
                <button type="button" className="btn-ghost gap-2 text-red-300 hover:text-red-200" onClick={handleLogout}><LogOut size={15} />Sign out</button>
              </div>
            </div>
          </ProfileDisclosure>
        </div>
      </div>

      <input ref={avatarInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={handleAvatarFile} />
      <input ref={audioInputRef} type="file" accept=".mp3,.wav,.m4a,.aac,audio/mpeg,audio/wav,audio/mp4,audio/aac" className="hidden" onChange={handleAudioFile} />
    </div>
  );
}

function ProfileDisclosure({
  icon,
  title,
  summary,
  children,
  className = '',
  compact,
}: {
  icon: ReactNode;
  title: string;
  summary: string;
  children: ReactNode;
  className?: string;
  compact: boolean;
}) {
  if (!compact) {
    return <section className={`card p-5 ${className}`}>{children}</section>;
  }

  return (
    <section className={`card overflow-hidden p-0 ${className}`}>
      <details className="group">
        <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 px-4 py-3">
          <span className="text-pit-teal">{icon}</span>
          <span className="min-w-0 flex-1">
            <strong className="block text-sm font-semibold text-white">{title}</strong>
            <span className="block truncate text-xs text-pit-muted">{summary}</span>
          </span>
          <ChevronDown size={17} className="shrink-0 text-pit-muted transition-transform group-open:rotate-180" />
        </summary>
        <div className="hidden border-t border-pit-border p-4 group-open:block">
          {children}
        </div>
      </details>
    </section>
  );
}

function useCompactProfileLayout() {
  const [compact, setCompact] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches);

  useEffect(() => {
    const query = window.matchMedia('(max-width: 639px)');
    const update = () => setCompact(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  return compact;
}

function ProfileIdentity({ label, value, className = '' }: { label: string; value: string; className?: string }) {
  return <div className={className}><p className="text-[11px] uppercase tracking-[0.14em] text-pit-muted">{label}</p><p className="mt-1 truncate text-sm font-medium text-white">{value}</p></div>;
}

function ProfileHeroMetric({ label, value }: { label: string; value: string | number }) {
  return <div className="min-w-0 px-2 text-center"><p className="text-[9px] uppercase tracking-[0.12em] text-pit-muted">{label}</p><p className="mt-1 truncate text-sm font-semibold text-white">{value}</p></div>;
}

function ProfileStatusRow({ icon, label, value, accent = false }: { icon: ReactNode; label: string; value: string | number; accent?: boolean }) {
  return <div className="flex items-center gap-3 rounded-lg border border-pit-border bg-pit-bg/45 px-3 py-3"><span className="text-pit-teal">{icon}</span><span className="min-w-0 flex-1 text-sm text-pit-text">{label}</span><strong className={accent ? 'text-pit-teal' : 'text-white'}>{value}</strong></div>;
}

function isSupportedAudioType(file: File) {
  return ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/aac', 'audio/x-m4a'].includes(file.type) || /\.(mp3|wav|m4a|aac)$/i.test(file.name);
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.readAsDataURL(file);
  });
}

async function readAudioFileAsDataUrl(file: File): Promise<string> {
  const dataUrl = await readFileAsDataUrl(file);
  const mimeType = audioMimeType(file);
  return dataUrl.replace(/^data:[^;,]*;base64,/i, `data:${mimeType};base64,`);
}

function getAudioDurationSeconds(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const audio = document.createElement('audio');
    const url = URL.createObjectURL(file);
    let settled = false;
    function finish(value: number | null) {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      URL.revokeObjectURL(url);
      resolve(value);
    }
    const timeout = window.setTimeout(() => {
      finish(null);
    }, 5000);
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => {
      const duration = Number(audio.duration);
      if (Number.isFinite(duration) && duration > 0) {
        finish(duration);
        return;
      }
      audio.ondurationchange = () => {
        const nextDuration = Number(audio.duration);
        if (Number.isFinite(nextDuration) && nextDuration > 0) finish(nextDuration);
      };
      try {
        audio.currentTime = Number.MAX_SAFE_INTEGER;
      } catch {
        finish(null);
      }
    };
    audio.onerror = () => finish(null);
    audio.src = url;
  });
}

function audioMimeType(file: File): string {
  const declared = file.type.toLowerCase();
  if (declared === 'audio/mp3') return 'audio/mpeg';
  if (declared === 'audio/wave') return 'audio/wav';
  if (declared === 'audio/x-m4a') return 'audio/mp4';
  if (declared && declared.startsWith('audio/')) return declared;
  if (/\.mp3$/i.test(file.name)) return 'audio/mpeg';
  if (/\.wav$/i.test(file.name)) return 'audio/wav';
  if (/\.m4a$/i.test(file.name)) return 'audio/mp4';
  if (/\.aac$/i.test(file.name)) return 'audio/aac';
  return 'audio/mpeg';
}

function TierStat({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string | number;
  accent?: boolean;
}) {
  return (
    <div className="rounded-lg border border-pit-border bg-pit-bg/40 px-3 py-3">
      <p className="text-xs uppercase tracking-wide text-pit-muted">{label}</p>
      <p className={`mt-1 text-lg font-semibold ${accent ? 'text-pit-teal' : 'text-white'}`}>{value}</p>
    </div>
  );
}

function formatTierName(tier: 'host' | 'club' | 'pro' | undefined) {
  if (tier === 'club') return 'Club';
  if (tier === 'pro') return 'Pro';
  return 'Host';
}
