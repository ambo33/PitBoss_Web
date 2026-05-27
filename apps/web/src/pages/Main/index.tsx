import { ChangeEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { Bot, Home, ImageIcon, LogOut, Menu, Music4, Phone, Shield, Trash2, Upload, User, Users, Trophy, Timer, QrCode, MessageSquare } from 'lucide-react';
import Layout, { NavTab } from '../../components/Layout';
import { api } from '../../api/client';
import AdminPanel from './AdminPanel';
import GroupsPanel from './GroupsPanel';
import LeaguesPanel from './LeaguesPanel';
import TournamentsPanel, { CommandCenterSection } from './TournamentsPanel';
import { useAuthStore } from '../../store/auth';
import Modal from '../../components/Modal';
import PushNotificationSettings from '../../components/PushNotificationSettings';

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
  const [view, setView] = useState<MainView>(requestedTab === 'profile' || requestedTab === 'admin' ? requestedTab : 'command');
  const [commandSection, setCommandSection] = useState<CommandCenterSection>(sectionFromTab(requestedTab));
  const [commandDetailOpen, setCommandDetailOpen] = useState(false);
  const [createTournamentOpen, setCreateTournamentOpen] = useState(false);
  const [leagueDeepLinkId, setLeagueDeepLinkId] = useState<string | undefined>(requestedLeagueId || undefined);
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
      setLeagueDeepLinkId(requestedLeagueId);
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
    if (user && user.onboardingcomplete === false) {
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
    });
  }, [currentProfile, updateUser]);

  const handleCommandSectionChange = (nextSection: CommandCenterSection) => {
    if (nextSection !== 'leagues') {
      setLeagueDeepLinkId(undefined);
    }
    setCommandDetailOpen(false);
    setView('command');
    setCommandSection(nextSection);
  };

  const currentTab: NavTab = view === 'command'
    ? commandSection === 'groups'
      ? 'groups'
      : commandSection === 'leagues'
        ? 'leagues'
        : 'tournaments'
    : view;

  return (
    <>
      <Layout
        tab={currentTab}
        hideSidebar
        hideMobileNav
        hideFeedback={createTournamentOpen}
        headerRight={
          <CommandCenterMenu
            onHome={() => setView('command')}
            onProfile={() => setView('profile')}
            onAdmin={() => setView('admin')}
          />
        }
        mainWidthClassName={view === 'admin' || commandSection === 'leagues' || commandSection === 'groups' ? 'max-w-7xl' : 'max-w-5xl'}
      >
        {view === 'command' && (
          <TournamentsPanel
            section={commandSection}
            onSectionChange={handleCommandSectionChange}
            hideDashboard={commandDetailOpen}
            onCreateFlowChange={setCreateTournamentOpen}
            renderSection={(section) => (
              section === 'groups'
                ? <GroupsPanel onDetailStateChange={setCommandDetailOpen} />
                : <LeaguesPanel initialLeagueId={leagueDeepLinkId} onDetailStateChange={setCommandDetailOpen} />
            )}
          />
        )}
        {view === 'profile' && <ProfilePanel />}
        {view === 'admin' && <AdminPanel />}
      </Layout>
      <OnboardingTour
        open={showTour}
        onClose={() => completeTourMutation.mutate()}
        onGoToGroups={() => {
          setView('command');
          setCommandSection('groups');
          setCommandDetailOpen(false);
          completeTourMutation.mutate();
        }}
      />
    </>
  );
}

function sectionFromTab(tab?: NavTab): CommandCenterSection {
  if (tab === 'groups') return 'groups';
  if (tab === 'leagues') return 'leagues';
  return 'upcoming';
}

function CommandCenterMenu({
  onHome,
  onProfile,
  onAdmin,
}: {
  onHome: () => void;
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
    queryClient.clear();
    logout();
    navigate('/landing', { replace: true });
  }

  return (
    <div ref={menuRef} className="relative">
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
            Command Center
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

const onboardingSlides = [
  {
    title: 'Start with a group',
    body: 'Groups are your home base. Create one, set the join code, and invite the people who play with you.',
    icon: Users,
  },
  {
    title: 'Invite your players',
    body: 'Share the invite link or code so members can join once, then future tournaments are easy to announce.',
    icon: QrCode,
  },
  {
    title: 'Create the tournament',
    body: 'Use the guided creator to set the name, schedule, buy-in, rebuys, add-ons, tracking, and group email alerts.',
    icon: Trophy,
  },
  {
    title: 'Build the structure',
    body: 'Pick a saved blind structure or use the calculator after creation. The TV board and run screen use it immediately.',
    icon: Timer,
  },
  {
    title: 'Send feedback',
    body: 'This is beta. Use the Feedback button for bugs, rough edges, and feature ideas while you run real games.',
    icon: MessageSquare,
  },
];

function OnboardingTour({
  open,
  onClose,
  onGoToGroups,
}: {
  open: boolean;
  onClose: () => void;
  onGoToGroups: () => void;
}) {
  const [slide, setSlide] = useState(0);
  const current = onboardingSlides[slide];
  const Icon = current.icon;
  const isLast = slide === onboardingSlides.length - 1;

  return (
    <Modal
      title="Welcome to ThePokerPlanner"
      open={open}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>
            Skip
          </button>
          <div className="flex gap-2">
            {slide > 0 && (
              <button type="button" className="btn-ghost" onClick={() => setSlide((value) => value - 1)}>
                Back
              </button>
            )}
            {isLast ? (
              <button type="button" className="btn-primary" onClick={onGoToGroups}>
                Create a group
              </button>
            ) : (
              <button type="button" className="btn-primary" onClick={() => setSlide((value) => value + 1)}>
                Next
              </button>
            )}
          </div>
        </>
      }
    >
      <div className="space-y-5 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-pit-teal/30 bg-pit-teal/15 text-pit-teal">
          <Icon size={30} />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-pit-teal">
            {slide + 1} of {onboardingSlides.length}
          </p>
          <h3 className="mt-2 text-2xl font-bold text-white">{current.title}</h3>
          <p className="mt-3 text-sm leading-6 text-pit-text">{current.body}</p>
        </div>
        <div className="flex justify-center gap-1.5">
          {onboardingSlides.map((item, index) => (
            <button
              key={item.title}
              type="button"
              onClick={() => setSlide(index)}
              className={`h-2 rounded-full transition-all ${index === slide ? 'w-8 bg-pit-teal' : 'w-2 bg-pit-border'}`}
              aria-label={`Go to slide ${index + 1}`}
            />
          ))}
        </div>
      </div>
    </Modal>
  );
}

function ProfilePanel() {
  const { user, logout, updateUser } = useAuthStore();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const audioInputRef = useRef<HTMLInputElement | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [mediaSuccess, setMediaSuccess] = useState<string | null>(null);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [smsOptIn, setSmsOptIn] = useState(false);

  const { data: profile, isLoading } = useQuery({
    queryKey: ['me'],
    queryFn: api.me,
  });

  useEffect(() => {
    if (!profile) return;
    updateUser({
      displayname: profile.displayname,
      emailaddress: profile.emailaddress,
      avatarimagedata: profile.avatarimagedata ?? null,
      hasavatarimage: profile.hasavatarimage ?? false,
      aicreditsremaining: profile.aicreditsremaining,
      defaultaicredits: profile.defaultaicredits,
      phonenumber: profile.phonenumber ?? null,
      smsoptedin: profile.smsoptedin ?? false,
      onboardingcomplete: profile.onboardingcomplete,
    });
    setPhoneNumber(profile.phonenumber ?? '');
    setSmsOptIn(Boolean(profile.smsoptedin));
  }, [profile, updateUser]);

  const updateProfileMutation = useMutation({
    mutationFn: api.updateMe,
    onSuccess: (updated, variables) => {
      queryClient.setQueryData(['me'], updated);
      updateUser({
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
    if (!file.type.startsWith('image/')) {
      setMediaError('Please choose a PNG, JPG, GIF, or WEBP image.');
      return;
    }
    if (file.size > 1_500_000) {
      setMediaError('Keep avatar images under 1.5 MB.');
      return;
    }

    const dataUrl = await readFileAsDataUrl(file);
    updateProfileMutation.mutate({
      avatarimagedata: dataUrl,
      avatarfilename: file.name,
      clearavatarimage: false,
    });
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

  if (isLoading && !profile) {
    return <div className="mx-auto mt-12 max-w-2xl text-center text-pit-text">Loading profile...</div>;
  }

  return (
    <div className="mx-auto mt-6 max-w-2xl space-y-4">
      <div className="card flex flex-col items-center gap-4 py-8 text-center">
        <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-3xl border border-pit-teal/30 bg-pit-teal/15 text-3xl font-bold text-pit-teal">
          {avatarImage ? (
            <img src={avatarImage} alt={displayName} className="h-full w-full object-cover" />
          ) : initials}
        </div>
        <div>
          <p className="text-lg font-bold text-white">{displayName}</p>
          <p className="text-sm text-pit-muted">{emailAddress}</p>
        </div>
      </div>

      {(mediaError || updateProfileMutation.error) && (
        <p className="rounded-lg border border-red-400/20 bg-red-400/10 px-3 py-2 text-sm text-red-400">
          {mediaError ?? updateProfileMutation.error?.message}
        </p>
      )}
      {mediaSuccess && !mediaError && !updateProfileMutation.error && (
        <p className="rounded-lg border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-sm text-emerald-300">
          {mediaSuccess}
        </p>
      )}

      <section className="card space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-white">Current Status</h3>
            <p className="text-sm text-pit-muted">Your active ThePokerPlanner account tier.</p>
          </div>
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ${
            profile?.accounttier === 'host'
              ? 'bg-pit-border/40 text-pit-text'
              : 'bg-pit-teal/15 text-pit-teal'
          }`}>
            {formatTierName(profile?.accounttier)}
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <TierStat label="Hosted tournaments" value={profile?.hostedtournamentcount ?? 0} />
          <TierStat label="Status" value={formatTierName(profile?.accounttier)} accent />
          <TierStat
            label="Club features"
            value={profile?.canuseclubfeatures ? 'Enabled' : 'Locked'}
            accent={profile?.canuseclubfeatures}
          />
        </div>
      </section>

      <section className="card space-y-3">
        <div className="flex items-center gap-3">
          <Bot size={18} className="text-pit-teal" />
          <div>
            <h3 className="font-semibold text-white">Voice Credits</h3>
            <p className="text-sm text-pit-muted">Used for announcer clips and hand analysis.</p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <TierStat label="Credits remaining" value={profile?.aicreditsremaining ?? 0} accent={(profile?.aicreditsremaining ?? 0) > 0} />
          <TierStat label="Default allotment" value={profile?.defaultaicredits ?? 0} />
        </div>
      </section>

      <section className="card space-y-4">
        <div className="flex items-center gap-3">
          <Phone size={18} className="text-pit-teal" />
          <div>
            <h3 className="font-semibold text-white">Notification Contact</h3>
            <p className="text-sm text-pit-muted">Add SMS only if you want groups to offer text alerts later.</p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <input
            className="input"
            type="tel"
            placeholder="Mobile number, optional"
            value={phoneNumber}
            onChange={(event) => setPhoneNumber(event.target.value)}
          />
          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-pit-border bg-pit-bg/40 px-3 py-2 text-sm text-pit-text">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-pit-border bg-pit-bg accent-pit-teal"
              checked={smsOptIn}
              onChange={(event) => setSmsOptIn(event.target.checked)}
            />
            SMS opt-in
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="btn-primary"
            disabled={updateProfileMutation.isPending}
            onClick={() => updateProfileMutation.mutate({ phonenumber: phoneNumber.trim() || null, smsoptedin: smsOptIn })}
          >
            Save Contact
          </button>
          <p className="text-xs leading-5 text-pit-muted">
            SMS sending is not active yet. This only stores consent and preferences so we can wire a provider cleanly later.
          </p>
        </div>
      </section>

      <PushNotificationSettings />

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card space-y-4">
          <div className="flex items-center gap-3">
            <ImageIcon size={18} className="text-pit-teal" />
            <div>
              <h3 className="font-semibold text-white">Avatar</h3>
              <p className="text-sm text-pit-muted">Upload a profile image for your account.</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button type="button" className="btn-primary gap-2" onClick={() => avatarInputRef.current?.click()} disabled={updateProfileMutation.isPending}>
              <Upload size={14} />
              {avatarImage ? 'Replace Avatar' : 'Upload Avatar'}
            </button>
            {avatarImage && (
              <button
                type="button"
                className="btn-ghost gap-2 text-red-400 hover:text-red-300"
                onClick={() => {
                  setMediaError(null);
                  setMediaSuccess(null);
                  updateProfileMutation.mutate({ clearavatarimage: true });
                }}
                disabled={updateProfileMutation.isPending}
              >
                <Trash2 size={14} />
                Remove
              </button>
            )}
          </div>
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={handleAvatarFile}
          />
        </section>

        <section className="card space-y-4">
          <div className="flex items-center gap-3">
            <Music4 size={18} className="text-pit-teal" />
            <div>
              <h3 className="font-semibold text-white">Check-In Clip</h3>
              <p className="text-sm text-pit-muted">Upload a 5 second MP3, WAV, M4A, or AAC clip for TV check-in greetings.</p>
            </div>
          </div>
          <p className="text-sm text-pit-text">{audioSummary}</p>
          {profile?.checkinaudiodata && (
            <audio
              key={`${profile.checkinaudiofilename ?? 'check-in-clip'}-${profile.checkinaudiodata.length}`}
              controls
              preload="metadata"
              src={profile.checkinaudiodata}
              className="w-full"
            />
          )}
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="btn-primary gap-2" onClick={() => audioInputRef.current?.click()} disabled={updateProfileMutation.isPending}>
              <Upload size={14} />
              {profile?.hascheckinaudio ? 'Replace Clip' : 'Upload Clip'}
            </button>
            {profile?.hascheckinaudio && (
              <button
                type="button"
                className="btn-ghost gap-2 text-red-400 hover:text-red-300"
                onClick={() => {
                  setMediaError(null);
                  setMediaSuccess(null);
                  updateProfileMutation.mutate({ clearcheckinaudio: true });
                }}
                disabled={updateProfileMutation.isPending}
              >
                <Trash2 size={14} />
                Remove
              </button>
            )}
          </div>
          <input
            ref={audioInputRef}
            type="file"
            accept=".mp3,.wav,.m4a,.aac,audio/mpeg,audio/wav,audio/mp4,audio/aac"
            className="hidden"
            onChange={handleAudioFile}
          />
        </section>
      </div>

      <div className="card divide-y divide-pit-border overflow-hidden p-0">
        <div className="flex items-center gap-3 px-4 py-3.5 text-sm text-pit-muted">
          <Shield size={16} />
          <span>Account managed via email/password</span>
        </div>
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 px-4 py-3.5 text-sm font-medium text-red-400 transition-colors hover:bg-red-400/5 hover:text-red-300"
        >
          <LogOut size={16} />
          Sign out
        </button>
      </div>
    </div>
  );
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
