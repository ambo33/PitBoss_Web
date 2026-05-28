import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { io, Socket } from 'socket.io-client';
import { CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Menu, XCircle } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { api, BlindLevel, Tournament, TournamentPlayer } from '../../api/client';
import BrandLockup from '../../components/BrandLockup';
import CoinBadgeStrip from '../../components/CoinBadgeStrip';
import ConfirmDialog from '../../components/ConfirmDialog';
import { featureFlags } from '../../features';
import { useAuthStore } from '../../store/auth';
import { announceCheckinGreeting, announceFiveMinuteWarning, announceLevel, announceMessage, announceOneMinuteWarning, announceTimerPaused, announceTimerStarted, playCheckinGreetingClip, playGeneratedSpeech, playKachingSound, playLevelChangeTone, playStoredSpeech, primeTimerAudio, unlockTimerAudio } from '../../utils/timerAudio';
import { getConfiguredBountyPool, isBountyPlacementEligible } from '../../utils/bountyMath';
import { playerNameWithMedals } from '../../utils/playerAchievements';

interface TimerTick {
  remainingsecs: number;
  currentlevel: number;
  running: boolean;
}

interface TimerState extends TimerTick {
  blinds: BlindLevel[];
  tournamentid: string;
}

type PayoutMode = 'count' | 'percent';

interface PayoutStructureConfig {
  mode: PayoutMode;
  value: number;
}

interface GreetingQueueItem {
  id: string;
  name: string;
  audioDataUrl?: string | null;
  avatarImageUrl?: string | null;
  awardedCoins?: TournamentPlayer['awardedcoins'];
  tableNumber?: number | null;
  seat?: number | null;
}

interface MoneyBurst {
  id: string;
  name: string;
  type: 'rebuy' | 'add-on' | 'bounty';
  amount?: number;
  claimedByName?: string | null;
}

export default function RunTournament({
  tournamentId,
  isOwner,
  tournament,
  players,
  mode = 'admin',
  queryKeysToRefresh,
}: {
  tournamentId: string;
  isOwner: boolean;
  tournament: Tournament;
  players: TournamentPlayer[];
  mode?: 'admin' | 'display' | 'tv';
  queryKeysToRefresh?: unknown[][];
}) {
  const qc = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const socketRef = useRef<Socket | null>(null);
  const screenRef = useRef<HTMLDivElement | null>(null);
  const [timerState, setTimerState] = useState<TimerState | null>(null);
  const [showAdjustments, setShowAdjustments] = useState(false);
  const [selectedPlayerId, setSelectedPlayerId] = useState('');
  const [showPlayerActions, setShowPlayerActions] = useState(false);
  const [seatingMaxPerTable, setSeatingMaxPerTable] = useState(() => Math.max(2, Math.floor(Number(tournament.seatingmaxpertable ?? 9) || 9)));
  const [activeGreeting, setActiveGreeting] = useState<GreetingQueueItem | null>(null);
  const [activeMoneyBurst, setActiveMoneyBurst] = useState<MoneyBurst | null>(null);
  const [showTvMenu, setShowTvMenu] = useState(false);
  const [startWithoutSeatingOpen, setStartWithoutSeatingOpen] = useState(false);
  const lastWarningRef = useRef<{ fiveMin: boolean; oneMin: boolean; level: number | null }>({
    fiveMin: false,
    oneMin: false,
    level: null,
  });
  const receivedInitialTimerStateRef = useRef(false);
  const lastRunningRef = useRef<boolean | null>(null);
  const levelStartedAtRef = useRef<string | null>(null);
  const announcementTemplatesRef = useRef({
    fiveMinute: tournament.speechfiveminutemessage,
    oneMinute: tournament.speechoneminutemessage,
    levelUp: tournament.speechlevelupmessage,
  });
  const seenCheckedInRef = useRef<Set<string> | null>(null);
  const moneyActionCountsRef = useRef<Map<string, { rebuys: number; addedon: number; bountyClaimed: string }> | null>(null);
  const knockoutPlacementsRef = useRef<Map<string, number | null> | null>(null);
  const greetingQueueRef = useRef<GreetingQueueItem[]>([]);
  const greetingTimeoutRef = useRef<number | null>(null);
  const moneyBurstTimeoutRef = useRef<number | null>(null);

  const showAdminControls = isOwner && mode === 'admin';
  const canUseClubFeatures = Boolean(user?.issuperadmin || user?.canuseclubfeatures);
  const tvMode = mode === 'tv';
  const displayMode = mode === 'display' || tvMode;
  const tvGreetingDisplayEnabled = tournament.tvgreetingdisplayenabled ?? true;
  const tvGreetingAudioEnabled = tournament.tvgreetingaudioenabled ?? true;
  const showKnockoutQr = mode === 'admin' || (displayMode && (tournament.tvshowknockoutqrenabled ?? true));

  const refreshTournamentData = () => {
    if (queryKeysToRefresh?.length) {
      queryKeysToRefresh.forEach((queryKey) => qc.invalidateQueries({ queryKey }));
      return;
    }
    qc.invalidateQueries({ queryKey: ['players', tournamentId] });
    qc.invalidateQueries({ queryKey: ['tournament', tournamentId] });
  };

  const rebuyMutation = useMutation({
    mutationFn: (userId: string) => api.addRebuy(tournamentId, userId),
    onSuccess: () => refreshTournamentData(),
  });
  const addonMutation = useMutation({
    mutationFn: (userId: string) => api.addAddon(tournamentId, userId),
    onSuccess: () => refreshTournamentData(),
  });
  const knockMutation = useMutation({
    mutationFn: ({ userId, placed }: { userId: string; placed: number | null }) => api.knockPlayer(tournamentId, userId, placed),
    onSuccess: () => refreshTournamentData(),
  });
  const genericRebuyMutation = useMutation({
    mutationFn: () => api.addGenericRebuy(tournamentId),
    onSuccess: () => refreshTournamentData(),
  });
  const removeGenericRebuyMutation = useMutation({
    mutationFn: () => api.removeGenericRebuy(tournamentId),
    onSuccess: () => refreshTournamentData(),
  });
  const genericAddonMutation = useMutation({
    mutationFn: () => api.addGenericAddon(tournamentId),
    onSuccess: () => refreshTournamentData(),
  });
  const removeGenericAddonMutation = useMutation({
    mutationFn: () => api.removeGenericAddon(tournamentId),
    onSuccess: () => refreshTournamentData(),
  });
  const checkinMutation = useMutation({
    mutationFn: (userId: string) => api.toggleCheckin(tournamentId, userId),
    onSuccess: () => refreshTournamentData(),
  });
  const tvOptionsMutation = useMutation({
    mutationFn: (data: Partial<Tournament>) => api.updateTournament(tournamentId, data),
    onSuccess: () => refreshTournamentData(),
  });
  const assignSeatsMutation = useMutation({
    mutationFn: (mode: 'all' | 'remaining') => api.assignSeats(tournamentId, seatingMaxPerTable, mode),
    onSuccess: () => refreshTournamentData(),
  });
  const clearSeatingMutation = useMutation({
    mutationFn: () => api.clearSeating(tournamentId),
    onSuccess: () => refreshTournamentData(),
  });

  useEffect(() => {
    setSeatingMaxPerTable(Math.max(2, Math.floor(Number(tournament.seatingmaxpertable ?? 9) || 9)));
  }, [tournament.seatingmaxpertable]);

  useEffect(() => {
    announcementTemplatesRef.current = {
      fiveMinute: tournament.speechfiveminutemessage,
      oneMinute: tournament.speechoneminutemessage,
      levelUp: tournament.speechlevelupmessage,
    };
  }, [tournament.speechfiveminutemessage, tournament.speechlevelupmessage, tournament.speechoneminutemessage]);

  useEffect(() => {
    primeTimerAudio();
    receivedInitialTimerStateRef.current = false;

    const socket = io('/', {
      path: '/socket.io',
      auth: { token: localStorage.getItem('pb_token') ?? '' },
    });
    socketRef.current = socket;
    const joinTournament = () => {
      socket.emit('join-tournament', tournamentId);
    };
    socket.on('connect', joinTournament);
    if (socket.connected) {
      joinTournament();
    }
    socket.on('timer-state', (state: TimerState) => {
      const isInitialState = !receivedInitialTimerStateRef.current;
      receivedInitialTimerStateRef.current = true;
      setTimerState(state);
      handleTimerCues(state, isInitialState);
    });
    socket.on('timer-tick', (tick: TimerTick) => {
      setTimerState((current) => {
        if (!current) return null;
        const nextState = { ...current, ...tick };
        handleTimerCues(nextState);
        return nextState;
      });
    });
    socket.on('tournament-updated', () => {
      refreshTournamentData();
    });
    return () => {
      socket.disconnect();
    };
  }, [qc, tournamentId]);

  useEffect(() => {
    if (!displayMode) return;

    const checkedInPlayers = players
      .filter((player) => player.checkedin && player.placed == null)
      .map((player) => ({
        id: player.userid,
        name: player.displayname ?? player.emailaddress ?? 'Player',
        audioDataUrl: player.checkinaudiodata ?? null,
        avatarImageUrl: player.avatarimagedata ?? null,
        awardedCoins: player.awardedcoins ?? [],
        tableNumber: player.tablenumber ?? null,
        seat: player.seat ?? null,
      }));
    const currentSet = new Set(checkedInPlayers.map((player) => player.id));
    const previousSet = seenCheckedInRef.current;

    if (previousSet) {
      checkedInPlayers
        .filter((player) => !previousSet.has(player.id))
        .forEach((player) => {
          if (tvGreetingAudioEnabled || tvGreetingDisplayEnabled) {
            greetingQueueRef.current.push(player);
            setActiveGreeting((current) => current ?? greetingQueueRef.current.shift() ?? null);
          }
        });
    }

    seenCheckedInRef.current = currentSet;
  }, [displayMode, players, tournament.name, tvGreetingAudioEnabled, tvGreetingDisplayEnabled]);

  useEffect(() => {
    if (!activeGreeting && greetingQueueRef.current.length > 0) {
      setActiveGreeting(greetingQueueRef.current.shift() ?? null);
    }
  }, [activeGreeting, players]);

  useEffect(() => {
    if (!activeGreeting) return;

    if (tvGreetingAudioEnabled) {
      if (activeGreeting.audioDataUrl) {
        playCheckinGreetingClip(activeGreeting.audioDataUrl, activeGreeting.name);
      } else if (tournament.aiannouncerenabled) {
        announceCheckinWithAi(activeGreeting.name);
      } else {
        announceCheckinGreeting(activeGreeting.name);
      }
    }

    greetingTimeoutRef.current = window.setTimeout(() => {
      setActiveGreeting(null);
    }, tvGreetingDisplayEnabled ? 5000 : 250);

    return () => {
      if (greetingTimeoutRef.current) {
        window.clearTimeout(greetingTimeoutRef.current);
      }
    };
  }, [activeGreeting, tvGreetingAudioEnabled, tvGreetingDisplayEnabled, tournament.aiannouncerenabled]);

  useEffect(() => {
    if (!showAdminControls && !displayMode) return;

    const currentCounts = new Map<string, { rebuys: number; addedon: number; bountyClaimed: string }>();
    for (const player of players) {
      currentCounts.set(player.userid, {
        rebuys: toNumber(player.rebuys),
        addedon: player.addedon ? 1 : 0,
        bountyClaimed: player.bountyclaimedat ?? '',
      });
    }

    const previousCounts = moneyActionCountsRef.current;
    if (!previousCounts) {
      moneyActionCountsRef.current = currentCounts;
      return;
    }

    let nextBurst: MoneyBurst | null = null;
    for (const player of players) {
      const previous = previousCounts.get(player.userid) ?? { rebuys: 0, addedon: 0, bountyClaimed: '' };
      const current = currentCounts.get(player.userid) ?? { rebuys: 0, addedon: 0, bountyClaimed: '' };
      if (current.rebuys > previous.rebuys) {
        nextBurst = {
          id: `${player.userid}-rebuy-${current.rebuys}-${Date.now()}`,
          name: player.displayname ?? player.emailaddress ?? 'Player',
          type: 'rebuy',
        };
        break;
      }
      if (current.addedon > previous.addedon) {
        nextBurst = {
          id: `${player.userid}-addon-${Date.now()}`,
          name: player.displayname ?? player.emailaddress ?? 'Player',
          type: 'add-on',
        };
        break;
      }
      if (current.bountyClaimed && current.bountyClaimed !== previous.bountyClaimed && toNumber(player.bountyamount) > 0) {
        nextBurst = {
          id: `${player.userid}-bounty-${current.bountyClaimed}-${Date.now()}`,
          name: player.displayname ?? player.emailaddress ?? 'Player',
          type: 'bounty',
          amount: toNumber(player.bountyamount),
          claimedByName: player.bountyclaimedbyname,
        };
        break;
      }
    }

    moneyActionCountsRef.current = currentCounts;

    if (nextBurst) {
      setActiveMoneyBurst(nextBurst);
      playKachingSound();
      announceMoneyAction(nextBurst);
      if (moneyBurstTimeoutRef.current) window.clearTimeout(moneyBurstTimeoutRef.current);
      moneyBurstTimeoutRef.current = window.setTimeout(() => setActiveMoneyBurst(null), 2400);
    }
  }, [displayMode, players, showAdminControls]);

  useEffect(() => {
    if (!showAdminControls && !displayMode) return;

    const currentPlacements = new Map<string, number | null>();
    for (const player of players) {
      currentPlacements.set(player.userid, player.placed ?? null);
    }

    const previousPlacements = knockoutPlacementsRef.current;
    if (!previousPlacements) {
      knockoutPlacementsRef.current = currentPlacements;
      return;
    }

    const newKnockout = players.find((player) => {
      const previousPlaced = previousPlacements.get(player.userid) ?? null;
      return previousPlaced == null && player.placed != null;
    });

    knockoutPlacementsRef.current = currentPlacements;

    if (newKnockout) {
      announceKnockout(newKnockout);
    }
  }, [displayMode, players, showAdminControls]);

  const actionablePlayers = useMemo(
    () => [...players]
      .filter((player) => player.placed == null)
      .sort((a, b) => {
        if (Boolean(b.checkedin) !== Boolean(a.checkedin)) return Number(b.checkedin) - Number(a.checkedin);
        return (a.displayname ?? a.emailaddress).localeCompare(b.displayname ?? b.emailaddress);
      }),
    [players]
  );

  const selectedPlayer = actionablePlayers.find((player) => player.userid === selectedPlayerId) ?? actionablePlayers[0] ?? null;
  const selectedPlayerLabel = selectedPlayer ? playerNameWithMedals(selectedPlayer) : 'No active players';
  const longestPlayerLabelLength = actionablePlayers.reduce((max, player) => {
    const label = playerNameWithMedals(player);
    return Math.max(max, label.length);
  }, selectedPlayerLabel.length);
  const playerSelectWidth = clamp((longestPlayerLabelLength * 8) + 56, 190, 360);

  useEffect(() => {
    if (!selectedPlayerId && actionablePlayers[0]) {
      setSelectedPlayerId(actionablePlayers[0].userid);
      return;
    }
    if (selectedPlayerId && !actionablePlayers.some((player) => player.userid === selectedPlayerId)) {
      setSelectedPlayerId(actionablePlayers[0]?.userid ?? '');
    }
  }, [actionablePlayers, selectedPlayerId]);

  useEffect(() => () => {
    if (greetingTimeoutRef.current) {
      window.clearTimeout(greetingTimeoutRef.current);
    }
    if (moneyBurstTimeoutRef.current) {
      window.clearTimeout(moneyBurstTimeoutRef.current);
    }
  }, []);

  function emit(event: string, payload: Record<string, unknown> = {}) {
    socketRef.current?.emit(event, { tournamentId, ...payload });
  }

  async function warmTimerAudio() {
    await unlockTimerAudio();
  }

  function handleStartTimer() {
    void warmTimerAudio();

    if (showAdminControls && seatedPlayers.length === 0 && checkedInRoster.length > 0) {
      const promptKey = `pb-start-without-seating:${tournamentId}`;
      const hasSeenPrompt = window.localStorage.getItem(promptKey) === '1';
      if (!hasSeenPrompt) {
        window.localStorage.setItem(promptKey, '1');
        setStartWithoutSeatingOpen(true);
        return;
      }
    }

    emit('timer-start');
  }

  function cancelStartWithoutSeating() {
    setStartWithoutSeatingOpen(false);
    if (tournament.tvdisplaymode !== 'seating') {
      tvOptionsMutation.mutate({ tvdisplaymode: 'seating' });
    }
  }

  function confirmStartWithoutSeating() {
    setStartWithoutSeatingOpen(false);
    emit('timer-start');
  }

  function handleTimerCues(state: TimerState, initial = false) {
    const warningState = lastWarningRef.current;

    if (lastRunningRef.current !== state.running) {
      if (!initial && lastRunningRef.current != null) {
        announceTimerStatus(state.running ? 'resume' : 'pause');
      }
      lastRunningRef.current = state.running;
    }

    if (warningState.level !== state.currentlevel) {
      if (!initial && warningState.level != null) {
        const announcedBlind = state.blinds.find((blind) => Number(blind.level) === Number(state.currentlevel));
        if (announcedBlind) {
          playLevelChangeTone();
          announceAiOrTemplate('level_up', state, announcedBlind, warningState.level, levelStartedAtRef.current, isRebuyFinalLevel(warningState.level));
        }
      }
      warningState.level = state.currentlevel;
      levelStartedAtRef.current = new Date().toISOString();
      warningState.fiveMin = false;
      warningState.oneMin = false;
    }

    if (state.remainingsecs > 300) {
      warningState.fiveMin = false;
      warningState.oneMin = false;
    } else if (state.remainingsecs > 60) {
      warningState.oneMin = false;
    }

    if (state.remainingsecs <= 300 && state.remainingsecs > 60 && !warningState.fiveMin) {
      warningState.fiveMin = true;
      const blind = getStateBlind(state);
      announceStaticWarning('five_minute_warning', state, blind);
    }
    if (state.remainingsecs <= 60 && state.remainingsecs > 0 && !warningState.oneMin) {
      warningState.oneMin = true;
      const blind = getStateBlind(state);
      announceStaticWarning('one_minute_warning', state, blind);
    }
  }

  function announceTimerStatus(action: 'pause' | 'resume') {
    const fallback = action === 'resume' ? announceTimerStarted : announceTimerPaused;
    if (!tournament.aiannouncerenabled) {
      fallback();
      return;
    }
    const preset = normalizeAnnouncerPreset(tournament.aiannouncerpreset);
    playStoredSpeech(`/sounds/announcer-static/${preset.replace(/_/g, '-')}-${action}.mp3`, fallback);
  }

  function announceCheckinWithAi(playerName: string) {
    api.generateAnnouncerMoment(tournamentId, {
      eventtype: 'checkin',
      currentlevel: Number(timerState?.currentlevel ?? effectiveLevel),
      playername: playerName,
    }).then((result) => {
      if (result.aiEnabled && result.audioBase64) {
        playGeneratedSpeech(result.audioBase64, result.mimeType, () => announceCheckinGreeting(playerName));
      } else {
        announceCheckinGreeting(playerName);
      }
    }).catch(() => announceCheckinGreeting(playerName));
  }

  function announceStaticWarning(
    eventtype: 'five_minute_warning' | 'one_minute_warning',
    state: TimerState,
    blind: BlindLevel | undefined
  ) {
    const isRebuyCutoffWarning = isRebuyFinalLevel(state.currentlevel);
    const fallback = () => {
      if (isRebuyCutoffWarning) {
        announceMessage(eventtype === 'five_minute_warning'
          ? 'Five minutes left in the final level for re-buys.'
          : 'One minute left to get your re-buys in.');
      } else if (eventtype === 'five_minute_warning') {
        announceFiveMinuteWarning(announcementTemplatesRef.current.fiveMinute, buildAnnouncementTokens(state, blind));
      } else {
        announceOneMinuteWarning(announcementTemplatesRef.current.oneMinute, buildAnnouncementTokens(state, blind));
      }
    };

    if (!tournament.aiannouncerenabled) {
      fallback();
      return;
    }

    if (isRebuyCutoffWarning) {
      api.generateAnnouncerMoment(tournamentId, {
        eventtype,
        currentlevel: Number(state.currentlevel),
        smallblind: Number(blind?.smallblind ?? 0),
        bigblind: Number(blind?.bigblind ?? 0),
        ante: Number(blind?.ante ?? 0),
        rebuycutoffwarning: eventtype,
      }).then((result) => {
        if (result.aiEnabled && result.audioBase64) {
          playGeneratedSpeech(result.audioBase64, result.mimeType, fallback);
        } else {
          fallback();
        }
      }).catch(() => fallback());
      return;
    }

    const preset = normalizeAnnouncerPreset(tournament.aiannouncerpreset);
    playStoredSpeech(`/sounds/announcer-static/${preset.replace(/_/g, '-')}-${eventtype.replace(/_/g, '-')}.mp3`, fallback);
  }

  function announceAiOrTemplate(
    eventtype: 'level_up',
    state: TimerState,
    blind: BlindLevel | undefined,
    previousLevel: number | null,
    previousLevelStartedAt: string | null,
    rebuyClosed = false
  ) {
    const fallback = () => {
      if (isBreakBlind(blind)) {
        announceMessage(`${blind?.label || 'Break'}. ${Number(blind?.minutes ?? 0)} minute break.`);
        return;
      }
      if (rebuyClosed) {
        announceMessage(`Level ${state.currentlevel}. Small blind is ${Number(blind?.smallblind ?? 0).toLocaleString()}, big blind is ${Number(blind?.bigblind ?? 0).toLocaleString()}. Re-buys officially closed.`);
        return;
      }
      announceLevel(state.currentlevel, Number(blind?.smallblind ?? 0), Number(blind?.bigblind ?? 0), announcementTemplatesRef.current.levelUp, Number(blind?.ante ?? 0));
    };

    api.generateAnnouncerMoment(tournamentId, {
      eventtype,
      currentlevel: Number(state.currentlevel),
      previouslevel: previousLevel,
      previouslevelstartedat: previousLevelStartedAt,
      smallblind: Number(blind?.smallblind ?? 0),
      bigblind: Number(blind?.bigblind ?? 0),
      ante: Number(blind?.ante ?? 0),
      isbreak: isBreakBlind(blind),
      breaklabel: isBreakBlind(blind) ? (blind?.label ?? 'Break') : null,
      breakminutes: isBreakBlind(blind) ? Number(blind?.minutes ?? 0) : null,
      rebuyclosed: rebuyClosed,
    }).then((result) => {
      if (result.aiEnabled && result.audioBase64) {
        playGeneratedSpeech(result.audioBase64, result.mimeType, fallback);
      } else {
        fallback();
      }
    }).catch(() => fallback());
  }

  function announceKnockout(player: TournamentPlayer) {
    if (!tournament.aiannouncerenabled) return;
    const state = timerState;
    const blind = state ? getStateBlind(state) : currentBlind;
    api.generateAnnouncerMoment(tournamentId, {
      eventtype: 'knockout',
      currentlevel: Number(state?.currentlevel ?? effectiveLevel),
      smallblind: Number(blind?.smallblind ?? 0),
      bigblind: Number(blind?.bigblind ?? 0),
      ante: Number(blind?.ante ?? 0),
      knockedoutplayername: player.displayname ?? player.emailaddress ?? 'Player',
      knockedoutbyname: player.knockedoutbyname ?? null,
      placement: player.placed ?? null,
      prizeamount: player.placed != null && player.placed <= payoutPlaces ? toNumber(payouts[player.placed - 1]) : null,
      bountyamount: tournament.bountyenabled && isBountyPlacementEligible(tournament, player.placed) ? toNumber(player.bountyamount) : null,
      bountyclaimedbyname: player.bountyclaimedbyname ?? player.knockedoutbyname ?? null,
    }).then((result) => {
      if (result.aiEnabled && result.audioBase64) {
        playGeneratedSpeech(result.audioBase64, result.mimeType);
      }
    }).catch(() => {
      // Knockout announcements are additive. If generation is unavailable, keep the game flow quiet.
    });
  }

  function announceMoneyAction(action: MoneyBurst) {
    if (!tournament.aiannouncerenabled || action.type === 'bounty') return;
    const state = timerState;
    const blind = state ? getStateBlind(state) : currentBlind;
    api.generateAnnouncerMoment(tournamentId, {
      eventtype: action.type === 'add-on' ? 'addon' : 'rebuy',
      currentlevel: Number(state?.currentlevel ?? effectiveLevel),
      smallblind: Number(blind?.smallblind ?? 0),
      bigblind: Number(blind?.bigblind ?? 0),
      ante: Number(blind?.ante ?? 0),
      playername: action.name,
    }).then((result) => {
      if (result.aiEnabled && result.audioBase64) {
        playGeneratedSpeech(result.audioBase64, result.mimeType);
      }
    }).catch(() => {
      // Rebuy/add-on announcements should never interrupt the host workflow if generation is unavailable.
    });
  }

  const effectiveBlinds = (timerState?.blinds ?? [])
    .map((blind) => ({
      ...blind,
      level: Number(blind.level),
      smallblind: Number(blind.smallblind),
      bigblind: Number(blind.bigblind),
      ante: Number(blind.ante),
      minutes: Number(blind.minutes),
    }))
    .sort((a, b) => a.level - b.level);
  const effectiveLevel = Number(timerState?.currentlevel ?? effectiveBlinds[0]?.level ?? 1);
  const currentBlindIndex = Math.max(effectiveBlinds.findIndex((blind) => blind.level === effectiveLevel), 0);
  const currentBlind = effectiveBlinds[currentBlindIndex] ?? effectiveBlinds[0];
  const previousBlind = currentBlindIndex > 0 ? effectiveBlinds[currentBlindIndex - 1] : null;
  const nextBlind = effectiveBlinds[currentBlindIndex + 1] ?? null;
  const currentBlindIsBreak = isBreakBlind(currentBlind);
  const nextBlindIsBreak = isBreakBlind(nextBlind);
  const displayedLevel = currentBlind ? currentBlindIndex + 1 : 1;
  const secs = timerState?.remainingsecs ?? (currentBlind?.minutes ?? 0) * 60;
  const mins = Math.floor(secs / 60);
  const sec = secs % 60;
  const minsStr = String(mins).padStart(2, '0');
  const secsStr = String(sec).padStart(2, '0');
  const urgency = secs <= 60 ? 'text-red-400' : secs <= 300 ? 'text-yellow-400' : 'text-white';
  const timerTone = secs <= 60
    ? 'border-red-400/40 bg-red-500/10 animate-pulse'
    : secs <= 300
      ? 'border-yellow-300/40 bg-yellow-300/10'
      : 'border-pit-border bg-pit-bg/50';
  const playerLobbyUrl = `${window.location.origin}/lobby/${tournamentId}`;

  function handleManualLevelChange(targetBlind: BlindLevel | null | undefined) {
    if (!showAdminControls || !targetBlind) return;
    void warmTimerAudio();
    emit('timer-level', { level: Number(targetBlind.level) });
  }

  function isRebuyFinalLevel(level: number | null | undefined): boolean {
    return toNumber(tournament.rebuyprice) > 0
      && Number(tournament.rebuylastlevel ?? 0) > 0
      && Number(level) === Number(tournament.rebuylastlevel);
  }

  const registeredCount = players.length;
  const activePlayers = players.filter((player) => player.checkedin && player.placed == null).length;
  const totalRebuys = players.reduce((sum, player) => sum + toNumber(player.rebuys), 0) + toNumber(tournament.genericrebuys);
  const totalAddons = players.filter((player) => Boolean(player.addedon)).length + toNumber(tournament.genericaddons);
  const enteredFieldCount = players.filter((player) => player.checkedin || player.placed != null).length;
  const fieldSize = enteredFieldCount > 0 ? enteredFieldCount : registeredCount;
  const payoutPlaces = resolvePaidPlaces(parsePayoutStructure(tournament.payoutstructure), fieldSize);
  const payoutSplits = buildDefaultSplits(payoutPlaces);
  const grossPot = (toNumber(tournament.buyin) * fieldSize)
    + (toNumber(tournament.rebuyprice) * totalRebuys)
    + (toNumber(tournament.addonprice) * totalAddons);
  const bountyTotal = getConfiguredBountyPool(tournament, grossPot, players);
  const bountyRemaining = tournament.bountyenabled
    ? players.filter((player) => player.placed == null).reduce((sum, player) => sum + toNumber(player.bountyamount), 0)
    : 0;
  const bountyClaimed = tournament.bountyenabled
    ? players.filter((player) => Boolean(player.bountyclaimedat)).reduce((sum, player) => sum + toNumber(player.bountyamount), 0)
    : 0;
  const totalPot = Math.max(grossPot - toNumber(tournament.rake) - bountyTotal, 0);
  const payouts = payoutSplits.map((pct) => (totalPot * pct) / 100);
  const paidFinishers = useMemo(
    () => players
      .filter((player) => player.placed != null && (player.placed ?? 999) <= payoutPlaces)
      .sort((a, b) => (a.placed ?? 999) - (b.placed ?? 999)),
    [players, payoutPlaces]
  );
  const knockedOutPlayers = useMemo(
    () => players
      .filter((player) => player.placed != null)
      .sort((a, b) => (a.placed ?? 999) - (b.placed ?? 999)),
    [players]
  );
  const knockoutLeader = useMemo(() => {
    const counts = new Map<string, { name: string; count: number }>();
    for (const player of players) {
      if (!player.knockedoutbyuserid || !player.knockedoutbyname) continue;
      const current = counts.get(player.knockedoutbyuserid) ?? { name: player.knockedoutbyname, count: 0 };
      current.count += 1;
      counts.set(player.knockedoutbyuserid, current);
    }
    return [...counts.values()].sort((a, b) => b.count - a.count)[0] ?? null;
  }, [players]);
  const confettiPieces = useMemo(
    () => Array.from({ length: 26 }, (_, index) => ({
      id: `piece-${index}`,
      left: `${3 + ((index * 91) % 94)}%`,
      delay: `${(index % 7) * 0.07}s`,
      duration: `${3 + (index % 5) * 0.22}s`,
      rotation: `${((index * 39) % 90) - 45}deg`,
      color: ['#22d3ee', '#fde047', '#f97316', '#f472b6', '#a78bfa', '#34d399'][index % 6],
    })),
    []
  );
  const summaryStats = [
    { label: 'Players Left', value: activePlayers },
    ...(tournament.rebuyprice > 0 ? [{ label: 'Rebuys', value: totalRebuys }] : []),
    ...(tournament.addonprice > 0 ? [{ label: 'Add-Ons', value: totalAddons }] : []),
    ...(tournament.bountyenabled ? [{ label: 'Bounties Left', value: formatMoney(bountyRemaining), accent: true }] : []),
    ...(knockoutLeader ? [{ label: 'Knockout Leader', value: `${knockoutLeader.name} (${knockoutLeader.count})` }] : []),
  ];
  const seatedPlayers = useMemo(
    () => players
      .filter((player) => player.tablenumber != null && player.seat != null && player.placed == null)
      .sort((a, b) => (a.displayname ?? a.emailaddress).localeCompare(b.displayname ?? b.emailaddress)),
    [players]
  );
  const checkedInRoster = useMemo(
    () => players
      .filter((player) => player.checkedin && player.placed == null)
      .sort((a, b) => (a.displayname ?? a.emailaddress).localeCompare(b.displayname ?? b.emailaddress)),
    [players]
  );
  const seatingRoster = useMemo(
    () => [...players]
      .filter((player) => player.placed == null)
      .sort((a, b) => (a.displayname ?? a.emailaddress).localeCompare(b.displayname ?? b.emailaddress)),
    [players]
  );
  const seatingValidationMessage = useMemo(() => {
    const maxPerTable = Math.max(2, Math.floor(Number(seatingMaxPerTable) || 2));
    const playersToSeat = checkedInRoster;

    if (playersToSeat.length === 0) return null;

    const playerCount = playersToSeat.length;
    const tableCount = Math.max(1, Math.ceil(playerCount / maxPerTable));
    const tableSizes = Array.from({ length: tableCount }, (_, tableIndex) => {
      const base = Math.floor(playerCount / tableCount);
      const extra = tableIndex < playerCount % tableCount ? 1 : 0;
      return base + extra;
    });

    const seatedCount = tableSizes.reduce((sum, count) => sum + count, 0);
    if (seatedCount > 1 && tableSizes.some((count) => count === 1)) {
      return 'Invalid table size. One player would be stranded alone.';
    }
    return null;
  }, [checkedInRoster, seatingMaxPerTable]);
  const isPreStart = !timerState?.running && displayedLevel === 1 && secs === (currentBlind?.minutes ?? 0) * 60;
  const showSeatingBoard = tvMode
    ? tournament.tvdisplaymode === 'seating' || isPreStart
    : showAdminControls && tournament.tvdisplaymode === 'seating';
  const rebuysEnabled = toNumber(tournament.rebuyprice) > 0;
  const addonsEnabled = toNumber(tournament.addonprice) > 0;

  return (
    <div
      className={`space-y-4 ${
        displayMode
          ? ''
          : '-mx-4 -mb-24 -mt-4 min-h-[calc(100vh-4rem)] bg-[radial-gradient(circle_at_12%_5%,rgba(20,184,166,0.22),transparent_36%),radial-gradient(circle_at_86%_7%,rgba(139,92,246,0.15),transparent_34%),linear-gradient(to_bottom,rgba(18,46,48,0.74)_0%,rgba(13,18,24,0.9)_48%,#050609_88%,#050609_100%)] px-4 pb-24 pt-4 sm:-mx-6 sm:px-6 md:-mt-6 md:pt-6 lg:-mx-8 lg:px-8'
      }`}
    >
      <div
        ref={screenRef}
        className={`relative overflow-hidden space-y-3 ${
          displayMode
            ? 'p-1 md:p-1.5 xl:p-2'
            : 'p-0'
        }`}
      >
        {showAdminControls ? (
          <section className="flex flex-wrap items-center gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex min-w-0 items-center gap-2 rounded-xl border border-pit-border bg-pit-bg/65 p-1.5">
                  <select
                    className="input min-w-0 py-1.5 pr-8 text-sm"
                    style={{ width: `${playerSelectWidth}px`, maxWidth: 'min(68vw, 320px)' }}
                    value={selectedPlayer?.userid ?? ''}
                    onChange={(event) => {
                      setSelectedPlayerId(event.target.value);
                      setShowPlayerActions(false);
                    }}
                  >
                    {actionablePlayers.length === 0 ? (
                      <option value="">No active players</option>
                    ) : (
                      actionablePlayers.map((player) => (
                        <option key={player.userid} value={player.userid}>
                          {playerNameWithMedals(player)}
                        </option>
                      ))
                    )}
                  </select>
                  <div className="relative">
                    <button
                      type="button"
                      className="btn-ghost gap-1.5 px-3 py-1.5 text-xs"
                      onClick={() => setShowPlayerActions((current) => !current)}
                      disabled={!selectedPlayer}
                      aria-expanded={showPlayerActions}
                    >
                      Actions
                      <ChevronDown size={14} />
                    </button>
                    {showPlayerActions && selectedPlayer && (
                      <div className="absolute right-0 z-30 mt-2 w-48 rounded-xl border border-pit-border bg-pit-card p-2 shadow-2xl">
                        <button
                          type="button"
                          className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs font-semibold text-pit-text transition hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                          onClick={() => {
                            checkinMutation.mutate(selectedPlayer.userid);
                            setShowPlayerActions(false);
                          }}
                          disabled={checkinMutation.isPending || selectedPlayer.placed != null}
                        >
                          {selectedPlayer.checkedin ? 'Check out' : 'Check in'}
                        </button>
                        {canUseClubFeatures && rebuysEnabled && (
                          <button
                            type="button"
                            className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs font-semibold text-pit-text transition hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                            onClick={() => {
                              rebuyMutation.mutate(selectedPlayer.userid);
                              setShowPlayerActions(false);
                            }}
                            disabled={!selectedPlayer.checkedin || rebuyMutation.isPending}
                          >
                            Rebuy
                          </button>
                        )}
                        {canUseClubFeatures && addonsEnabled && (
                          <button
                            type="button"
                            className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs font-semibold text-pit-text transition hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                            onClick={() => {
                              addonMutation.mutate(selectedPlayer.userid);
                              setShowPlayerActions(false);
                            }}
                            disabled={selectedPlayer.addedon || addonMutation.isPending}
                          >
                            {selectedPlayer.addedon ? 'Add-On Used' : 'Add-On'}
                          </button>
                        )}
                        <button
                          type="button"
                          className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs font-semibold text-red-200 transition hover:bg-red-500/10 hover:text-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                          onClick={() => {
                            knockMutation.mutate({ userId: selectedPlayer.userid, placed: Math.max(activePlayers, 1) });
                            setShowPlayerActions(false);
                          }}
                          disabled={!selectedPlayer.checkedin || selectedPlayer.placed != null || knockMutation.isPending}
                        >
                          Knockout
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center rounded-xl border border-pit-border bg-pit-bg/65 p-1">
                  <button
                    type="button"
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${((tournament.tvdisplaymode ?? 'timer') === 'timer') ? 'bg-pit-teal text-white shadow-[0_0_16px_rgba(20,184,166,0.22)]' : 'text-pit-muted hover:text-white'}`}
                    disabled={tvOptionsMutation.isPending}
                    onClick={() => tvOptionsMutation.mutate({ tvdisplaymode: 'timer' })}
                  >
                    Timer
                  </button>
                  <button
                    type="button"
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${tournament.tvdisplaymode === 'seating' ? 'bg-pit-teal text-white shadow-[0_0_16px_rgba(20,184,166,0.22)]' : 'text-pit-muted hover:text-white'}`}
                    disabled={tvOptionsMutation.isPending}
                    onClick={() => tvOptionsMutation.mutate({ tvdisplaymode: 'seating' })}
                  >
                    Seat Chart
                  </button>
                </div>

                {featureFlags.tvBoard && tournament.tvdisplaycode && (
                  <div className="relative">
                    <button
                      type="button"
                      className="flex items-center gap-2 rounded-xl border border-pit-border bg-pit-bg/65 px-3 py-2 text-sm text-white hover:border-pit-teal/70 hover:bg-pit-surface/70"
                      onClick={() => setShowTvMenu((current) => !current)}
                      aria-expanded={showTvMenu}
                      aria-label="TV board options"
                    >
                      <span className="text-[11px] uppercase tracking-[0.2em] text-pit-muted">TV</span>
                      <span className="font-mono font-semibold tracking-[0.24em]">{tournament.tvdisplaycode ?? 'UNAVAILABLE'}</span>
                      <Menu size={15} className="text-pit-muted" />
                    </button>
                    {showTvMenu && (
                      <div className="absolute right-0 z-20 mt-2 w-64 rounded-xl border border-pit-border bg-pit-card p-2 text-left shadow-2xl">
                        <a
                          className="mb-2 block rounded-lg border border-pit-border bg-pit-bg/60 px-3 py-2 text-xs font-medium text-pit-teal hover:text-pit-teal/80"
                          href={`/tv/${tournament.tvdisplaycode}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open TV board
                        </a>
                        <TvMenuToggle
                          label="Greeting Display"
                          enabled={tournament.tvgreetingdisplayenabled ?? true}
                          disabled={tvOptionsMutation.isPending}
                          onClick={() => tvOptionsMutation.mutate({ tvgreetingdisplayenabled: !(tournament.tvgreetingdisplayenabled ?? true) })}
                        />
                        <TvMenuToggle
                          label="Greeting Audio"
                          enabled={tournament.tvgreetingaudioenabled ?? true}
                          disabled={tvOptionsMutation.isPending}
                          onClick={() => tvOptionsMutation.mutate({ tvgreetingaudioenabled: !(tournament.tvgreetingaudioenabled ?? true) })}
                        />
                        <TvMenuToggle
                          label="Player Lobby QR"
                          enabled={tournament.tvshowknockoutqrenabled ?? true}
                          disabled={tvOptionsMutation.isPending}
                          onClick={() => tvOptionsMutation.mutate({ tvshowknockoutqrenabled: !(tournament.tvshowknockoutqrenabled ?? true) })}
                        />
                        <p className="mt-2 text-[11px] leading-4 text-pit-muted">
                          TV view follows the Timer or Seat Chart control above.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
          </section>
        ) : displayMode && !tvMode ? (
          <div className="flex justify-end">
            <BrandLockup compact showSlogan={false} className="items-center gap-2" />
          </div>
        ) : null}

        {currentBlind ? (
          <>
            {showSeatingBoard ? (
              <div className="space-y-2">
                {showAdminControls && (
                  <div className="mx-auto w-fit max-w-full rounded-2xl border border-yellow-300/45 bg-yellow-300/12 px-4 py-3 shadow-[0_0_28px_rgba(253,224,71,0.12)]">
                    <div className="flex flex-wrap items-center justify-center gap-3">
                      <button
                        type="button"
                        className="rounded-xl bg-yellow-300 px-5 py-2.5 text-sm font-bold uppercase tracking-wide text-black shadow-[0_0_18px_rgba(253,224,71,0.3)] transition hover:bg-yellow-200 disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={assignSeatsMutation.isPending || checkedInRoster.length === 0 || Boolean(seatingValidationMessage)}
                        onClick={() => assignSeatsMutation.mutate(seatedPlayers.length > 0 ? 'remaining' : 'all')}
                      >
                        {seatedPlayers.length > 0 ? 'Re-seat Remaining Players' : 'Seat Players'}
                      </button>
                      <div className="flex items-center gap-2 rounded-xl border border-yellow-200/25 bg-black/20 px-3 py-2">
                        <span className="text-xs font-semibold uppercase tracking-wide text-yellow-100">Max per table</span>
                        <input
                          type="number"
                          min={2}
                          max={12}
                          className="input w-16 border-yellow-200/30 py-1.5 text-center text-sm"
                          value={seatingMaxPerTable}
                          onChange={(event) => setSeatingMaxPerTable(Math.max(2, Math.floor(Number(event.target.value) || 2)))}
                        />
                      </div>
                      {seatedPlayers.length > 0 && (
                        <button
                          type="button"
                          className="rounded-xl border border-red-300/35 bg-red-400/10 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-red-100 transition hover:bg-red-400/20 disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={clearSeatingMutation.isPending}
                          onClick={() => clearSeatingMutation.mutate()}
                        >
                          Clear Seating
                        </button>
                      )}
                    </div>
                    {seatingValidationMessage && (
                      <p className="mt-2 text-center text-xs font-semibold text-red-300">
                        {seatingValidationMessage}
                      </p>
                    )}
                  </div>
                )}
                <TvSeatingBoard
                  seatedPlayers={seatedPlayers}
                  checkedInPlayers={checkedInRoster}
                  registeredPlayers={seatingRoster}
                  welcomeMessage={tournament.tvseatingwelcomemessage ?? 'Welcome! Please see host to check-in!'}
                  fullWidth
                  tvMode={tvMode}
                />
              </div>
            ) : (
            <div className={`grid items-start ${tvMode ? 'grid-cols-[248px_minmax(0,1fr)_248px] gap-3 2xl:grid-cols-[260px_minmax(0,1fr)_260px]' : displayMode ? 'grid-cols-[300px_minmax(0,1fr)_300px] gap-4 2xl:grid-cols-[320px_minmax(0,1fr)_320px]' : 'gap-3 lg:grid-cols-[220px_minmax(0,1fr)_220px] xl:grid-cols-[240px_minmax(0,1fr)_240px]'}`}>
              <section className={`rounded-xl border border-pit-border bg-pit-bg/60 ${tvMode ? 'p-3' : displayMode ? 'p-4' : 'p-3'}`}>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className={`${displayMode ? 'text-base' : 'text-sm'} font-semibold uppercase tracking-[0.2em] text-white`}>Structure</h3>
                  <span className={`${displayMode ? 'text-sm' : 'text-xs'} text-pit-muted`}>{effectiveBlinds.length} levels</span>
                </div>
                <div className="overflow-hidden rounded-lg border border-pit-border">
                  <div className={`grid grid-cols-[42px_minmax(0,1fr)_52px] bg-pit-surface/70 px-2 py-1.5 font-semibold uppercase tracking-wide text-pit-muted ${displayMode ? 'text-xs' : 'text-[10px]'}`}>
                    <span>Level</span>
                    <span>Blinds</span>
                    <span>Time</span>
                  </div>
                  <div className={`${tvMode ? 'max-h-[40rem]' : displayMode ? 'max-h-[48rem]' : 'max-h-[34rem]'} overflow-y-auto`}>
                    {effectiveBlinds.map((blind) => {
                      const isCurrent = blind.level === effectiveLevel;
                      const isNext = nextBlind?.level === blind.level;
                      return (
                        <button
                          type="button"
                          key={blind.id}
                          disabled={!showAdminControls}
                          onClick={() => handleManualLevelChange(blind)}
                          className={`grid w-full grid-cols-[42px_minmax(0,1fr)_52px] items-center border-t px-2 py-1.5 text-left leading-tight transition-colors disabled:cursor-default ${showAdminControls ? 'cursor-pointer hover:bg-pit-teal/10' : ''} ${tvMode ? 'text-xs' : displayMode ? 'text-sm' : 'text-xs'} ${
                            isCurrent
                              ? 'border-l-2 border-l-yellow-200 border-t-yellow-200/60 bg-yellow-200/35 text-yellow-950 shadow-[inset_0_0_0_1px_rgba(254,240,138,0.55)]'
                              : isNext
                                ? 'border-pit-border bg-pit-surface/70 text-white'
                                : 'border-pit-border bg-pit-bg/30 text-pit-text'
                          }`}
                        >
                          <span className="font-semibold">{blind.level}</span>
                          <span>{isBreakBlind(blind) ? (blind.label || 'Break') : `${blind.smallblind.toLocaleString()} / ${blind.bigblind.toLocaleString()}${blind.ante > 0 ? ` - ${blind.ante.toLocaleString()}` : ''}`}</span>
                          <span>{blind.minutes}:00</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </section>

              <section className={`min-w-0 ${displayMode ? 'space-y-3' : 'space-y-4'}`}>
                <div className={`rounded-xl border text-center ${tvMode ? 'px-3 py-3' : displayMode ? 'px-4 py-4' : 'px-3 py-4'} ${timerTone}`}>
                  {showAdminControls && (
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        aria-pressed={showAdjustments}
                        className={`px-3 py-1.5 text-xs transition-none ${
                          showAdjustments
                            ? 'rounded-lg border border-yellow-300/70 bg-yellow-300/20 font-semibold text-yellow-200'
                            : 'btn-ghost text-pit-muted'
                        }`}
                        onClick={() => setShowAdjustments((current) => !current)}
                      >
                        Adjust Timer
                      </button>
                      {timerState?.running
                        ? <button className="btn-danger px-3 py-1.5 text-xs" onClick={() => { void warmTimerAudio(); emit('timer-pause'); }}>Pause</button>
                        : <button className="btn-primary px-3 py-1.5 text-xs" onClick={handleStartTimer}>Start</button>
                      }
                    </div>
                  )}
                  <div className="flex items-center justify-center gap-2">
                    {showAdminControls && showAdjustments && (
                      <button
                        type="button"
                        className="btn-ghost h-8 w-8 px-0 text-base"
                        disabled={!previousBlind}
                        onClick={() => handleManualLevelChange(previousBlind)}
                        aria-label="Previous blind level"
                      >
                        <ChevronLeft size={18} />
                      </button>
                    )}
                    <p className={`${displayMode ? 'text-sm md:text-base' : 'text-xs md:text-sm'} font-medium uppercase tracking-[0.22em] text-pit-text`}>
                      Level {displayedLevel} of {effectiveBlinds.length}
                      {!timerState?.running && <span className="ml-3 text-yellow-400">Paused</span>}
                    </p>
                    {showAdminControls && showAdjustments && (
                      <button
                        type="button"
                        className="btn-ghost h-8 w-8 px-0 text-base"
                        disabled={!nextBlind}
                        onClick={() => handleManualLevelChange(nextBlind)}
                        aria-label="Next blind level"
                      >
                        <ChevronRight size={18} />
                      </button>
                    )}
                  </div>
                  <div className="mt-2.5 flex items-center justify-center gap-2 md:gap-3">
                    {showAdminControls && showAdjustments && (
                      <div className="flex flex-col gap-1.5">
                        <button
                          type="button"
                          className="btn-ghost h-9 w-9 px-0"
                          onClick={() => emit('timer-adjust', { deltaSeconds: 60 })}
                          aria-label="Add one minute"
                        >
                          <ChevronUp size={18} />
                        </button>
                        <button
                          type="button"
                          className="btn-ghost h-9 w-9 px-0"
                          onClick={() => emit('timer-adjust', { deltaSeconds: -60 })}
                          aria-label="Subtract one minute"
                        >
                          <ChevronDown size={18} />
                        </button>
                      </div>
                    )}
                    <div
                      className={`flex items-center leading-none ${urgency} ${
                        tvMode
                          ? 'font-mono font-bold tabular-nums tracking-tight'
                          : showAdjustments
                            ? 'font-sans font-[300] tabular-nums tracking-tight text-[6.8rem] md:text-[9.5rem] lg:text-[10.4rem] xl:text-[11.2rem]'
                            : displayMode
                              ? 'font-sans font-[300] tabular-nums tracking-tight text-[10.75rem] md:text-[14.5rem] lg:text-[16.75rem] xl:text-[17.75rem]'
                              : 'font-mono font-bold tabular-nums text-[8.5rem] md:text-[12rem] lg:text-[12.9rem] xl:text-[13.8rem]'
                      }`}
                      style={tvMode
                        ? { fontSize: showAdjustments ? 'clamp(6.8rem, 11vw, 10.4rem)' : 'clamp(9.2rem, 14.4vw, 13.8rem)' }
                        : undefined}
                    >
                      <span>{minsStr}</span>
                      <span className="-mx-[0.08em]">:</span>
                      <span>{secsStr}</span>
                    </div>
                    {showAdminControls && showAdjustments && (
                      <div className="flex flex-col gap-1.5">
                        <button
                          type="button"
                          className="btn-ghost h-9 w-9 px-0"
                          onClick={() => emit('timer-adjust', { deltaSeconds: 1 })}
                          aria-label="Add one second"
                        >
                          <ChevronUp size={18} />
                        </button>
                        <button
                          type="button"
                          className="btn-ghost h-9 w-9 px-0"
                          onClick={() => emit('timer-adjust', { deltaSeconds: -1 })}
                          aria-label="Subtract one second"
                        >
                          <ChevronDown size={18} />
                        </button>
                      </div>
                    )}
                  </div>

                  <div className={`mt-2 grid gap-2 ${displayMode ? 'grid-cols-2 xl:gap-3' : 'md:grid-cols-2'}`}>
                    <div className={`rounded-lg border border-pit-border bg-black/25 ${displayMode ? 'px-3 py-3' : 'px-3 py-3'}`}>
                      <p className="text-xs uppercase tracking-[0.2em] text-pit-muted">Current Blinds</p>
                      <p
                        style={tvMode
                          ? {
                              fontSize: currentBlindIsBreak ? 'clamp(1.7rem, 3.3vw, 2.6rem)' : currentBlind.ante > 0 ? 'clamp(1.55rem, 3vw, 2.35rem)' : 'clamp(1.95rem, 3.8vw, 2.8rem)',
                              fontWeight: 700,
                              letterSpacing: currentBlindIsBreak ? '0' : '-0.045em',
                            }
                          : undefined}
                        className={`mt-1 font-bold leading-none text-white ${
                          tvMode
                            ? currentBlindIsBreak ? 'font-sans' : 'font-mono tabular-nums'
                            : currentBlindIsBreak
                              ? 'font-sans text-[2.4rem] md:text-[3rem] xl:text-[3.4rem]'
                              : currentBlind.ante > 0
                                ? 'font-sans font-[300] tracking-tight text-[2.5rem] md:text-[3.15rem] xl:text-[3.55rem]'
                                : 'font-sans font-[300] tracking-tight text-[3rem] md:text-[3.65rem] xl:text-[4.15rem]'
                        }`}
                      >
                        {currentBlindIsBreak ? (currentBlind.label || 'Break') : `${currentBlind.smallblind.toLocaleString()} / ${currentBlind.bigblind.toLocaleString()}`}
                      </p>
                      {!currentBlindIsBreak && currentBlind.ante > 0 && (
                        <p className="mt-1 text-sm text-pit-text md:text-base">Ante {currentBlind.ante.toLocaleString()}</p>
                      )}
                    </div>
                    <div className={`rounded-lg border border-pit-border bg-black/25 ${displayMode ? 'px-3 py-3' : 'px-3 py-3'}`}>
                      <p className="text-xs uppercase tracking-[0.2em] text-pit-muted">Next Blinds</p>
                      {nextBlind ? (
                        <>
                          <p
                        style={tvMode
                          ? {
                                  fontSize: nextBlindIsBreak ? 'clamp(1.7rem, 3.3vw, 2.6rem)' : nextBlind.ante > 0 ? 'clamp(1.55rem, 3vw, 2.35rem)' : 'clamp(1.95rem, 3.8vw, 2.8rem)',
                                  fontWeight: 700,
                                  letterSpacing: nextBlindIsBreak ? '0' : '-0.045em',
                                }
                              : undefined}
                            className={`mt-1 font-bold leading-none text-white ${
                              tvMode
                                ? nextBlindIsBreak ? 'font-sans' : 'font-mono tabular-nums'
                                : nextBlindIsBreak
                                  ? 'font-sans text-[2.4rem] md:text-[3rem] xl:text-[3.4rem]'
                                  : nextBlind.ante > 0
                                    ? 'font-sans font-[300] tracking-tight text-[2.5rem] md:text-[3.15rem] xl:text-[3.55rem]'
                                    : 'font-sans font-[300] tracking-tight text-[3rem] md:text-[3.65rem] xl:text-[4.15rem]'
                            }`}
                          >
                            {nextBlindIsBreak ? (nextBlind.label || 'Break') : `${nextBlind.smallblind.toLocaleString()} / ${nextBlind.bigblind.toLocaleString()}`}
                          </p>
                          {!nextBlindIsBreak && nextBlind.ante > 0 && (
                            <p className="mt-1 text-sm text-pit-text md:text-base">Ante {nextBlind.ante.toLocaleString()}</p>
                          )}
                        </>
                      ) : (
                        <>
                          <p className={`mt-1.5 font-bold leading-none text-white ${tvMode ? 'text-[1.55rem] xl:text-[1.9rem]' : 'text-[2rem] md:text-[2.5rem] xl:text-[2.9rem]'}`}>Final Level</p>
                          <p className={`mt-1.5 text-pit-text ${tvMode ? 'text-sm xl:text-base' : 'text-base md:text-lg'}`}>No further increase</p>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid gap-2 xl:grid-cols-1">
                  <div
                    className={`grid gap-2 ${displayMode ? 'grid-cols-3' : ''}`}
                    style={displayMode ? undefined : { gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))' }}
                  >
                    {summaryStats.map((stat) => {
                      const canAdjustRebuys = showAdminControls && !canUseClubFeatures && stat.label === 'Rebuys';
                      const canAdjustAddons = showAdminControls && !canUseClubFeatures && stat.label === 'Add-Ons';
                      const canAdjust = canAdjustRebuys || canAdjustAddons;
                      return (
                        <div key={stat.label} className={`rounded-lg border border-pit-border bg-pit-bg/50 text-center ${tvMode ? 'px-2 py-1.5' : displayMode ? 'px-2 py-2.5' : 'px-2.5 py-3'}`}>
                          <p className={`${tvMode ? 'text-xs' : displayMode ? 'text-sm' : 'text-xs'} uppercase tracking-wide text-pit-muted`}>{stat.label}</p>
                          {canAdjust ? (
                            <div className="mt-1 flex items-center justify-center gap-2">
                              <button
                                type="button"
                                className="btn-ghost h-7 w-7 justify-center px-0 text-sm"
                                onClick={() => canAdjustRebuys ? removeGenericRebuyMutation.mutate() : removeGenericAddonMutation.mutate()}
                                disabled={
                                  canAdjustRebuys
                                    ? removeGenericRebuyMutation.isPending || toNumber(tournament.genericrebuys) <= 0
                                    : removeGenericAddonMutation.isPending || toNumber(tournament.genericaddons) <= 0
                                }
                                aria-label={`Remove one ${stat.label.toLowerCase()}`}
                              >
                                -
                              </button>
                              <p className={`${tvMode ? 'text-sm xl:text-base' : displayMode ? 'text-base md:text-lg' : 'text-base'} min-w-8 font-semibold text-white`}>{stat.value}</p>
                              <button
                                type="button"
                                className="btn-ghost h-7 w-7 justify-center px-0 text-sm"
                                onClick={() => canAdjustRebuys ? genericRebuyMutation.mutate() : genericAddonMutation.mutate()}
                                disabled={canAdjustRebuys ? genericRebuyMutation.isPending : genericAddonMutation.isPending}
                                aria-label={`Add one ${stat.label.toLowerCase()}`}
                              >
                                +
                              </button>
                            </div>
                          ) : (
                            <p className={`mt-1 ${tvMode ? 'text-sm xl:text-base' : displayMode ? 'text-base md:text-lg' : 'text-base'} font-semibold ${'accent' in stat && stat.accent ? 'text-pit-teal' : 'text-white'}`}>{stat.value}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </section>

              <section className={`space-y-2.5 ${displayMode ? 'pt-1' : ''}`}>
                {showKnockoutQr && (
                  <div className={`rounded-xl border border-pit-border bg-pit-bg/60 text-center ${tvMode ? 'p-1.5' : 'p-2.5'}`}>
                    <div className="mb-1 text-white">
                      <p className={`${tvMode ? 'text-[10px]' : 'text-[11px]'} font-semibold uppercase tracking-wide`}>Open Player Lobby</p>
                    </div>
                    <div className={`inline-block rounded-md bg-white ${tvMode ? 'p-0.5' : 'p-1.5'}`}>
                      <QRCodeSVG value={playerLobbyUrl} size={tvMode ? 58 : 88} />
                    </div>
                  </div>
                )}
                <div className={`rounded-xl border border-pit-border bg-pit-bg/60 ${tvMode ? 'p-2.5' : displayMode ? 'p-4' : 'p-3'}`}>
                  <div className="mb-2">
                    <h3 className={`${tvMode ? 'text-sm' : displayMode ? 'text-base' : 'text-sm'} font-semibold uppercase tracking-[0.2em] text-white`}>Payout Structure</h3>
                  </div>

                  <div className={`mb-2 flex items-center justify-between gap-2 rounded-lg border border-pit-border bg-pit-bg/40 ${tvMode ? 'px-2 py-1.5' : displayMode ? 'px-3 py-2' : 'px-2.5 py-2'}`}>
                    <p className={`${tvMode ? 'text-xs' : displayMode ? 'text-sm' : 'text-xs'} uppercase tracking-wide text-pit-muted`}>Prize Pool</p>
                    <p className={`${tvMode ? 'text-base' : displayMode ? 'text-xl' : 'text-base'} font-semibold text-pit-teal`}>{formatMoney(totalPot)}</p>
                  </div>
                  {tournament.bountyenabled && (
                    <div className={`mb-2 grid grid-cols-2 gap-1.5 ${tvMode ? 'text-[11px]' : 'text-xs'}`}>
                      <div className="rounded-lg border border-amber-300/20 bg-amber-300/10 px-2 py-1.5">
                        <p className="uppercase tracking-wide text-amber-100/70">Bounties Left</p>
                        <p className="font-semibold text-amber-100">{formatMoney(bountyRemaining)}</p>
                      </div>
                      <div className="rounded-lg border border-pit-border bg-pit-bg/40 px-2 py-1.5">
                        <p className="uppercase tracking-wide text-pit-muted">Claimed</p>
                        <p className="font-semibold text-white">{formatMoney(bountyClaimed)}</p>
                      </div>
                    </div>
                  )}

                  <div className={`${tvMode ? 'max-h-[40rem] space-y-1' : displayMode ? 'max-h-[48rem] space-y-1.5' : 'max-h-[26rem] space-y-1.5'} overflow-y-auto pr-1`}>
                    {payoutSplits.map((split, index) => {
                      const place = index + 1;
                      const finisher = paidFinishers.find((player) => Number(player.placed) === place);
                      return (
                        <div key={`${index}-${split}`} className={`flex items-center justify-between gap-2 rounded-lg border ${finisher ? 'border-pit-teal/40 bg-pit-teal/10' : 'border-pit-border bg-pit-surface/40'} ${tvMode ? 'px-2 py-1 text-xs' : displayMode ? 'px-3 py-2 text-base' : 'px-2.5 py-1.5 text-sm'}`}>
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="shrink-0 font-semibold text-white">{ordinal(place)}</span>
                            {finisher ? (
                              <span className={`truncate font-semibold text-white ${tvMode ? 'text-[11px]' : 'text-xs'}`}>
                                {playerNameWithMedals(finisher)}
                              </span>
                            ) : null}
                          </div>
                          <p className="shrink-0 text-sm font-semibold text-pit-teal">{formatMoney(payouts[index] ?? 0)}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className={`rounded-xl border border-pit-border bg-pit-bg/60 ${tvMode ? 'p-2.5' : displayMode ? 'p-4' : 'p-3'}`}>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h3 className={`${tvMode ? 'text-sm' : displayMode ? 'text-base' : 'text-sm'} font-semibold uppercase tracking-[0.2em] text-white`}>Knocked Out</h3>
                    <span className={`${tvMode ? 'text-[11px]' : 'text-xs'} text-pit-muted`}>{knockedOutPlayers.length}</span>
                  </div>
                  {knockedOutPlayers.length === 0 ? (
                    <p className={`${tvMode ? 'text-[11px]' : 'text-xs'} rounded-lg border border-pit-border bg-pit-surface/35 px-2.5 py-2 text-pit-muted`}>
                      No knockouts yet.
                    </p>
                  ) : (
                    <div className={`${tvMode ? 'max-h-44 space-y-1' : displayMode ? 'max-h-64 space-y-1.5' : 'max-h-52 space-y-1.5'} overflow-y-auto pr-1`}>
                      {knockedOutPlayers.map((player) => {
                        const paid = (player.placed ?? 999) <= payoutPlaces;
                        return (
                          <div
                            key={`${player.userid}-${player.placed}`}
                            className={`rounded-lg border ${paid ? 'border-pit-teal/35 bg-pit-teal/10' : 'border-pit-border bg-pit-surface/40'} ${tvMode ? 'px-2 py-1.5' : 'px-2.5 py-2'}`}
                          >
                            <div className="flex min-w-0 items-center justify-between gap-2">
                              <div className="flex min-w-0 items-center gap-2">
                                <span className="shrink-0 font-semibold text-white">{ordinal(player.placed ?? 0)}</span>
                                <span className={`${tvMode ? 'text-[11px]' : 'text-xs'} truncate font-medium text-pit-text`}>
                                  {playerNameWithMedals(player)}
                                </span>
                              </div>
                              {paid && <span className="shrink-0 rounded-full bg-pit-teal/20 px-2 py-0.5 text-[10px] font-semibold text-pit-teal">Paid</span>}
                            </div>
                            {player.knockedoutbyname && (
                              <p className={`${tvMode ? 'text-[10px]' : 'text-[11px]'} mt-1 truncate text-pit-muted`}>
                                Knocked out by {player.knockedoutbyname}
                              </p>
                            )}
                            {tournament.bountyenabled && toNumber(player.bountyamount) > 0 && isBountyPlacementEligible(tournament, player.placed) && (
                              <p className={`${tvMode ? 'text-[10px]' : 'text-[11px]'} mt-1 truncate font-semibold text-amber-200`}>
                                {formatMoney(toNumber(player.bountyamount))} bounty
                                {player.bountyclaimedbyname ? ` to ${player.bountyclaimedbyname}` : ' revealed'}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </section>
            </div>
            )}
          </>
        ) : (
          <p className="py-8 text-center text-pit-text">No blind structure yet.</p>
        )}

        {displayMode && activeGreeting && tvGreetingDisplayEnabled && (
          <div className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center overflow-hidden px-6 py-8">
            <style>{`
              @keyframes tv-confetti-fall {
                0% { transform: translate3d(0, -18px, 0) rotate(0deg); opacity: 0; }
                12% { opacity: 1; }
                100% { transform: translate3d(0, 76vh, 0) rotate(540deg); opacity: 0; }
              }
            `}</style>
            {confettiPieces.map((piece) => (
              <span
                key={`${activeGreeting.id}-${piece.id}`}
                className="absolute top-0 h-4 w-2 rounded-full"
                style={{
                  left: piece.left,
                  backgroundColor: piece.color,
                  transform: `rotate(${piece.rotation})`,
                  animation: `tv-confetti-fall ${piece.duration} ease-out ${piece.delay} forwards`,
                  boxShadow: '0 0 10px rgba(255,255,255,0.15)',
                }}
              />
            ))}
            <div className="max-h-[calc(100vh-4rem)] w-full max-w-2xl rounded-2xl border border-white/15 bg-black/65 px-8 py-6 text-center shadow-2xl backdrop-blur-md">
              <p className="text-base font-semibold uppercase tracking-[0.28em] text-yellow-200 xl:text-xl">Welcome To The Tournament</p>
              {activeGreeting.avatarImageUrl ? (
                <div className="mx-auto mt-5 h-24 w-24 overflow-hidden rounded-full border-4 border-white/25 shadow-xl xl:h-32 xl:w-32">
                  <img
                    src={activeGreeting.avatarImageUrl}
                    alt={activeGreeting.name}
                    className="h-full w-full object-cover"
                  />
                </div>
              ) : (
                <div className="mx-auto mt-5 flex h-24 w-24 items-center justify-center rounded-full border-4 border-white/20 bg-white/10 text-4xl font-semibold text-white shadow-xl xl:h-32 xl:w-32 xl:text-5xl">
                  {getInitials(activeGreeting.name)}
                </div>
              )}
              <h2 className="mt-4 truncate text-5xl font-semibold tracking-tight text-white xl:text-8xl 2xl:text-[7rem]">
                {activeGreeting.name}
              </h2>
              <CoinBadgeStrip coins={activeGreeting.awardedCoins} size="lg" limit={8} className="mt-4 justify-center" />
              {activeGreeting.tableNumber != null && activeGreeting.seat != null && (
                <p className="mt-3 text-2xl font-semibold uppercase tracking-[0.18em] text-yellow-200 xl:text-4xl">
                  Table {activeGreeting.tableNumber} Seat {activeGreeting.seat}
                </p>
              )}
            </div>
          </div>
        )}

        {(showAdminControls || displayMode) && activeMoneyBurst && (
          <div className="pointer-events-none absolute inset-0 z-40 flex items-start justify-center overflow-hidden rounded-[inherit]">
            <style>{`
              @keyframes money-bill-fall {
                0% { transform: translate3d(0, -20px, 0) rotate(0deg); opacity: 0; }
                10% { opacity: 1; }
                100% { transform: translate3d(0, 80vh, 0) rotate(500deg); opacity: 0; }
              }
            `}</style>
            {confettiPieces.map((piece, index) => (
              <span
                key={`${activeMoneyBurst.id}-${piece.id}`}
                className="absolute top-0 flex h-5 w-10 items-center justify-center rounded-sm border border-emerald-200/70 bg-emerald-400 text-[10px] font-black text-emerald-950 shadow-lg"
                style={{
                  left: piece.left,
                  transform: `rotate(${piece.rotation})`,
                  animation: `money-bill-fall ${piece.duration} ease-out ${piece.delay} forwards`,
                }}
              >
                ${index % 3 === 0 ? '$' : ''}
              </span>
            ))}
            <div className="mt-12 rounded-2xl border border-emerald-300/30 bg-black/60 px-6 py-4 text-center shadow-2xl backdrop-blur-md">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-200">
                {activeMoneyBurst.type === 'bounty' ? 'Bounty Claimed' : activeMoneyBurst.type}
              </p>
              <p className="mt-1 text-3xl font-bold text-white">
                {activeMoneyBurst.type === 'bounty'
                  ? formatMoney(toNumber(activeMoneyBurst.amount))
                  : activeMoneyBurst.name}
              </p>
              {activeMoneyBurst.type === 'bounty' && (
                <p className="mt-1 text-sm font-semibold text-emerald-100">
                  {activeMoneyBurst.claimedByName ? `${activeMoneyBurst.claimedByName} knocked out ${activeMoneyBurst.name}` : `${activeMoneyBurst.name} bounty revealed`}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
      <ConfirmDialog
        open={startWithoutSeatingOpen}
        title="Start without seating?"
        tone="warning"
        message="Players are checked in, but no seats are assigned yet. You can start the clock now, or cancel and show the seating board first."
        confirmLabel="Start clock"
        cancelLabel="Show seating"
        onClose={cancelStartWithoutSeating}
        onConfirm={confirmStartWithoutSeating}
      />
    </div>
  );
}

function TvSeatingBoard({
  seatedPlayers,
  checkedInPlayers,
  registeredPlayers,
  welcomeMessage,
  fullWidth = false,
  tvMode = false,
}: {
  seatedPlayers: TournamentPlayer[];
  checkedInPlayers: TournamentPlayer[];
  registeredPlayers: TournamentPlayer[];
  welcomeMessage: string;
  fullWidth?: boolean;
  tvMode?: boolean;
}) {
  const hasAssignments = seatedPlayers.length > 0;
  const compactRegistered = tvMode && !hasAssignments;
  const checkedInIds = new Set(checkedInPlayers.map((player) => player.userid));
  const assignmentByUserId = new Map(seatedPlayers.map((player) => [player.userid, player]));
  const roster = registeredPlayers.map((player) => assignmentByUserId.get(player.userid) ?? player);

  return (
    <div className={`rounded-xl border border-yellow-200/35 bg-yellow-200/10 ${fullWidth ? 'px-5 py-5' : 'px-3 py-3'}`}>
      <div className={`${fullWidth ? 'mb-4' : 'mb-2'} flex items-center ${compactRegistered ? 'justify-center text-center' : 'justify-between'} gap-3`}>
        <div className={compactRegistered ? 'mx-auto' : ''}>
          <h3 className={`${fullWidth ? 'text-4xl xl:text-5xl' : 'text-xl'} font-semibold uppercase tracking-[0.2em] text-white`}>
            {hasAssignments ? 'Table Assignments' : 'Registered Players'}
          </h3>
          {!hasAssignments && (
            <p className={`${fullWidth ? 'mt-2 text-2xl xl:text-3xl' : 'mt-1 text-base xl:text-lg'} font-semibold text-yellow-200`}>{welcomeMessage}</p>
          )}
        </div>
        {!compactRegistered && (
          <span className="rounded-lg border border-pit-border bg-pit-bg/50 px-2 py-1 text-xs text-pit-text">
            {checkedInRosterLabel(checkedInIds.size, roster.length)}
          </span>
        )}
      </div>

      {roster.length === 0 ? (
        <div className="rounded-lg border border-pit-border bg-pit-bg/45 px-4 py-14 text-center">
          <p className="text-3xl font-semibold text-white">No registered players yet</p>
          <p className="mt-2 text-sm text-pit-text">Players will appear here as they register.</p>
        </div>
      ) : (
        <div className={`grid overflow-y-auto pr-1 ${
          compactRegistered
            ? 'max-h-[70vh] grid-cols-5 gap-1.5'
            : fullWidth
              ? 'max-h-[70vh] grid-cols-4 gap-2 xl:grid-cols-5 2xl:grid-cols-6'
              : 'max-h-[32rem] grid-cols-2 gap-1.5 xl:grid-cols-3 2xl:grid-cols-4'
        }`}>
          {roster.map((player) => {
            const checkedIn = checkedInIds.has(player.userid) || Boolean(player.checkedin);
            return (
            <div
              key={player.userid}
              className={`flex min-w-0 items-center rounded-lg border text-left transition ${
                checkedIn
                  ? 'border-emerald-400/45 bg-emerald-400/12 text-white'
                  : 'border-pit-border bg-pit-bg/45 text-pit-muted'
              } ${compactRegistered ? 'gap-1.5 px-2 py-1' : fullWidth ? 'gap-2 px-2.5 py-2' : 'gap-2 px-2 py-1.5'}`}
            >
              {checkedIn ? (
                <CheckCircle2 className={`shrink-0 text-emerald-300 ${compactRegistered ? 'h-3.5 w-3.5' : fullWidth ? 'h-5 w-5' : 'h-4 w-4'}`} />
              ) : (
                <XCircle className={`shrink-0 text-red-300 ${compactRegistered ? 'h-3.5 w-3.5' : fullWidth ? 'h-5 w-5' : 'h-4 w-4'}`} />
              )}
              <div className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-pit-surface font-semibold ${checkedIn ? 'text-white' : 'text-pit-muted'} ${compactRegistered ? 'h-5 w-5 text-[9px]' : fullWidth ? 'h-9 w-9 text-xs' : 'h-7 w-7 text-[11px]'}`}>
                {player.avatarimagedata ? (
                  <img src={player.avatarimagedata} alt={player.displayname ?? player.emailaddress} className="h-full w-full object-cover" />
                ) : (
                  getInitials(player.displayname ?? player.emailaddress)
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className={`truncate font-semibold ${checkedIn ? 'text-white' : 'text-pit-muted'} ${compactRegistered ? 'text-xs xl:text-sm' : fullWidth ? 'text-base xl:text-lg' : 'text-sm'}`}>{playerNameWithMedals(player)}</p>
                {!compactRegistered && <CoinBadgeStrip coins={player.awardedcoins} size={fullWidth ? 'md' : 'sm'} limit={fullWidth ? 5 : 4} className="mt-1" />}
                {hasAssignments ? (
                  <p className={`${fullWidth ? 'text-xs xl:text-sm' : 'text-xs'} font-medium ${checkedIn ? 'text-yellow-200' : 'text-pit-muted'}`}>
                    Table {player.tablenumber} Seat {player.seat}
                  </p>
                ) : null}
              </div>
            </div>
          );})}
        </div>
      )}
    </div>
  );
}

function checkedInRosterLabel(checkedIn: number, total: number) {
  return `${checkedIn}/${total} checked in`;
}

function TvMenuToggle({
  label,
  enabled,
  disabled,
  onClick,
}: {
  label: string;
  enabled: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm text-pit-text hover:bg-pit-bg/70 disabled:opacity-50"
    >
      <span>{label}</span>
      <span className={`h-2.5 w-2.5 rounded-full ${enabled ? 'bg-pit-teal shadow-[0_0_10px_rgba(19,173,173,0.75)]' : 'bg-pit-border'}`} />
    </button>
  );
}

function parsePayoutStructure(value: string | null | undefined): PayoutStructureConfig {
  if (!value) return { mode: 'count', value: 3 };
  try {
    const parsed = JSON.parse(value) as Partial<PayoutStructureConfig>;
    if (parsed.mode !== 'count' && parsed.mode !== 'percent') {
      return { mode: 'count', value: 3 };
    }
    return {
      mode: parsed.mode,
      value: sanitizePayoutValue(parsed.mode, Number(parsed.value)),
    };
  } catch {
    return { mode: 'count', value: 3 };
  }
}

function sanitizePayoutValue(mode: PayoutMode, value: number): number {
  if (mode === 'percent') return clamp(Math.round(value), 1, 100);
  return Math.max(1, Math.round(value));
}

function resolvePaidPlaces(config: PayoutStructureConfig, fieldSize: number): number {
  if (config.mode === 'percent') {
    if (fieldSize <= 0) return 1;
    return clamp(Math.ceil((fieldSize * sanitizePayoutValue('percent', config.value)) / 100), 1, fieldSize);
  }
  const requested = sanitizePayoutValue('count', config.value);
  if (fieldSize <= 0) return requested;
  return clamp(requested, 1, fieldSize);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getStateBlind(state: TimerState) {
  return state.blinds.find((blind) => Number(blind.level) === Number(state.currentlevel)) ?? state.blinds[0];
}

function buildAnnouncementTokens(state: TimerState, blind?: BlindLevel) {
  return {
    BlindLevel: Number(state.currentlevel),
    SB: Number(blind?.smallblind ?? 0),
    BB: Number(blind?.bigblind ?? 0),
    Ante: Number(blind?.ante ?? 0),
  };
}

function isBreakBlind(blind: BlindLevel | null | undefined): boolean {
  return Boolean(blind && (/^break\b/i.test(String(blind.label ?? '')) || (Number(blind.smallblind) === 0 && Number(blind.bigblind) === 0)));
}

function normalizeAnnouncerPreset(value: string | null | undefined) {
  if (
    value === 'all_in_alex'
    || value === 'royal_rumble_riley'
    || value === 'velvet_dealer'
    || value === 'chipstorm'
    || value === 'queen_of_spades'
    || value === 'the_pit_boss'
    || value === 'british_high_roller'
    || value === 'turbo_tony'
    || value === 'midnight_mayhem'
    || value === 'sunny_stacks'
  ) return value;
  if (value === 'football' || value === 'wwe') return 'royal_rumble_riley';
  if (value === 'minimal') return 'sunny_stacks';
  if (value === 'roaster') return 'turbo_tony';
  if (value === 'series_director' || value === 'professional') return 'the_pit_boss';
  return 'all_in_alex';
}

const DEFAULT_SPLITS: Record<number, number[]> = {
  1: [100],
  2: [65, 35],
  3: [50, 30, 20],
  4: [45, 27, 18, 10],
  5: [40, 25, 17, 11, 7],
  6: [37, 23, 16, 11, 8, 5],
};

function buildDefaultSplits(count: number): number[] {
  const normalizedCount = Math.max(1, count);
  if (DEFAULT_SPLITS[normalizedCount]) {
    return [...DEFAULT_SPLITS[normalizedCount]];
  }

  const weights = Array.from({ length: normalizedCount }, (_, index) => normalizedCount - index);
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  return weights.map((weight) => roundToTenth((weight / totalWeight) * 100));
}

function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

function formatMoney(value: number): string {
  return `$${toNumber(value).toFixed(2)}`;
}

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getInitials(name: string) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return initials || '?';
}
