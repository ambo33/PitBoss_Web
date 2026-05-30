const BASE = '/api';
const REQUEST_TIMEOUT_MS = 20_000;

function getToken(): string | null {
  return localStorage.getItem('pb_token');
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    signal: options.signal ?? controller.signal,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  }).catch((error) => {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Request timed out. Please refresh and try again.');
    }
    throw error;
  }).finally(() => window.clearTimeout(timeout));
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? 'Request failed');
  }
  return res.json() as Promise<T>;
}

const get = <T>(path: string) => request<T>(path);
const post = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: 'POST', body: JSON.stringify(body) });
const put = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: 'PUT', body: JSON.stringify(body) });
const patch = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
const del = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: 'DELETE', body: body === undefined ? undefined : JSON.stringify(body) });

export const api = {
  // Auth
  register: (data: { email: string; password: string; name: string; displayname: string; acceptterms?: boolean }) =>
    post('/auth/register', data),
  verifyEmail: (data: { email: string; pin: string }) =>
    post<{ token: string }>('/auth/verify-email', data),
  login: (data: { email: string; password: string }) =>
    post<{ token: string }>('/auth/login', data),
  requestReset: (email: string) => post('/auth/request-reset', { email }),
  resetPassword: (data: { token: string; password: string }) =>
    post('/auth/reset-password', data),
  me: () => get<AuthProfile>('/auth/me'),
  updateMe: (data: {
    name?: string;
    displayname?: string;
    phonenumber?: string | null;
    smsoptedin?: boolean;
    checkinaudiodata?: string | null;
    checkinaudiofilename?: string | null;
    clearcheckinaudio?: boolean;
    avatarimagedata?: string | null;
    avatarfilename?: string | null;
    clearavatarimage?: boolean;
    completeonboarding?: boolean;
  }) => put<AuthProfile>('/auth/me', data),
  submitFeedback: (data: { type: 'issue' | 'idea' | 'question'; message: string; pageurl?: string; useragent?: string }) =>
    post<{ success: boolean; id: string }>('/feedback', data),
  getNotificationPreferences: () =>
    get<{ preferences: NotificationPreference[] }>('/push/preferences'),
  updateNotificationPreference: (category: NotificationCategory, data: { enabled: boolean; digestOnly?: boolean }) =>
    put<{ success: boolean; preferences: NotificationPreference[] }>(`/push/preferences/${category}`, data),

  // Groups
  getGroups: () => get<Group[]>('/groups'),
  createGroup: (data: { name: string; approvalneeded?: boolean }) =>
    post<{ groupid: string; invitecode: string }>('/groups', data),
  getGroup: (id: string) => get<Group & { members: GroupMember[] }>(`/groups/${id}`),
  updateGroup: (id: string, data: { name?: string; approvalneeded?: boolean; invitecode?: string; defaulttrackingmode?: TrackingMode; tvseatingwelcomemessage?: string; speechfiveminutemessage?: string; speechoneminutemessage?: string; speechlevelupmessage?: string; aiannouncerenabled?: boolean; aiannouncerpreset?: AnnouncerPreset; aiannouncercustomprompt?: string; aiannouncerclassicmode?: boolean; postapprovalrequired?: boolean }) =>
    put<{ success: boolean } & Partial<Group>>(`/groups/${id}`, data),
  deleteGroup: (id: string) =>
    del<{ success: boolean }>(`/groups/${id}`),
  getGroupBlindStructures: (groupId: string) =>
    get<GroupBlindStructure[]>(`/groups/${groupId}/blind-structures`),
  createGroupBlindStructure: (groupId: string, data: { name: string; levels: Omit<BlindLevel, 'id'>[] }) =>
    post<{ id: string; success: boolean }>(`/groups/${groupId}/blind-structures`, data),
  deleteGroupBlindStructure: (groupId: string, structureId: string) =>
    del<{ success: boolean }>(`/groups/${groupId}/blind-structures/${structureId}`),
  sendGroupInvite: (groupId: string, data: { email?: string; phone?: string; note?: string }) =>
    post<{ success: boolean; emailed: boolean; joinLink: string; smsLink: string; smsBody: string }>(`/groups/${groupId}/invite`, data),
  joinGroup: (invitecode: string) =>
    post<{ groupid: string; pending: boolean }>('/groups/join', { invitecode }),
  approveMember: (groupId: string, userId: string) =>
    put(`/groups/${groupId}/members/${userId}/approve`),
  removeMember: (groupId: string, userId: string) =>
    del(`/groups/${groupId}/members/${userId}`),
  leaveGroup: (groupId: string, userId: string) =>
    del(`/groups/${groupId}/members/${userId}`),
  getGroupTournaments: (groupId: string) =>
    get<(Tournament & { isregistered: boolean })[]>(`/groups/${groupId}/tournaments`),
  getGroupPosts: (groupId: string) =>
    get<{ enabled: boolean; posts: GroupPost[] }>(`/groups/${groupId}/posts`),
  createGroupPost: (groupId: string, data: { posttype: 'message' | 'poll'; message: string; options?: string[] }) =>
    post<{ id: string; success: boolean; status?: 'pending' | 'approved' }>(`/groups/${groupId}/posts`, data),
  moderateGroupPost: (groupId: string, postId: string, status: 'approved' | 'rejected') =>
    put<{ success: boolean; id: string; status: string }>(`/groups/${groupId}/posts/${postId}/moderate`, { status }),
  deleteGroupPost: (groupId: string, postId: string) =>
    del<{ success: boolean; id: string }>(`/groups/${groupId}/posts/${postId}`),
  voteGroupPoll: (groupId: string, postId: string, optionId: string) =>
    post<{ success: boolean }>(`/groups/${groupId}/posts/${postId}/vote`, { optionid: optionId }),
  commentOnGroupPost: (groupId: string, postId: string, message: string) =>
    post<{ success: boolean }>(`/groups/${groupId}/posts/${postId}/comments`, { message }),
  getGroupCoins: (groupId: string) =>
    get<{ coins: GroupCoin[]; awards: GroupCoinAward[] }>(`/groups/${groupId}/coins`),
  createGroupCoin: (groupId: string, data: { name: string; description?: string; imagedata?: string | null; imageurl?: string | null; imagefilename?: string | null }) =>
    post<{ coin: GroupCoin }>(`/groups/${groupId}/coins`, data),
  awardGroupCoin: (groupId: string, coinId: string, data: { userid: string; note?: string }) =>
    post<{ award: GroupCoinAward }>(`/groups/${groupId}/coins/${coinId}/awards`, data),
  updateGroupNotificationPreferences: (groupId: string, data: { emailalertsenabled?: boolean; smsalertsenabled?: boolean; pushalertsenabled?: boolean }) =>
    put<{ success: boolean; preferences: Partial<GroupMember> }>(`/groups/${groupId}/notification-preferences`, data),

  // Games
  createGame: (data: CreateGameRequest) =>
    post<{ id: string; gameid: string }>('/games', data),
  getGames: () =>
    get<GameListItem[]>('/games'),
  getGroupGames: (groupId: string) =>
    get<GameListItem[]>(`/games/group/${groupId}`),
  getGame: (gameId: string) =>
    get<GameDetail>(`/games/${gameId}`),
  updateGame: (gameId: string, data: Partial<Pick<GameRecord, 'title' | 'status' | 'startsat'>> & { cash?: Partial<CashGameDetails> }) =>
    patch<GameDetail>(`/games/${gameId}`, data),
  deleteGame: (gameId: string) =>
    del<{ success: boolean; notified: number }>(`/games/${gameId}`),
  rsvpCashGame: (gameId: string, status: CashGameRsvpStatus) =>
    put<GameDetail>(`/games/${gameId}/rsvp`, { status }),
  addCashGamePlayer: (gameId: string, userid: string) =>
    post<GameDetail>(`/games/${gameId}/players`, { userid }),
  updateCashGamePlayer: (gameId: string, userId: string, data: Partial<Pick<CashGamePlayer, 'status' | 'buyintotal' | 'addontotal' | 'cashouttotal'>>) =>
    put<GameDetail>(`/games/${gameId}/players/${userId}`, data),
  removeCashGamePlayer: (gameId: string, userId: string) =>
    del<GameDetail>(`/games/${gameId}/players/${userId}`),

  // Leagues
  getLeagues: () => get<League[]>('/leagues'),
  getLeagueSchedule: () => get<LeagueScheduleEvent[]>('/leagues/schedule'),
  createLeague: (data: { name: string; approvalneeded?: boolean; expectedplayercount?: number; leaguefee?: number; pereventfee?: number; showupbonuspoints?: number; bestfinishcount?: number; pointslookup?: LeaguePointRule[]; eventcount?: number; seasonname?: string; seasonbegindate?: string; seasonenddate?: string }) =>
    post<{ leagueid: string; invitecode: string; seasonid: string }>('/leagues', data),
  updateLeague: (id: string, data: Partial<Pick<League, 'name' | 'approvalneeded' | 'expectedplayercount' | 'leaguefee' | 'pereventfee' | 'showupbonuspoints' | 'bestfinishcount' | 'pointslookup' | 'finalenabled' | 'finalmultiplierlookup' | 'finalchiprounding' | 'finalstartingbigblind' | 'memberledgervisible'>>) =>
    patch<{ league: League; recalculatedResults?: number }>(`/leagues/${id}`, data),
  deleteLeague: (id: string) =>
    del<{ success: boolean }>(`/leagues/${id}`),
  createLeaguePayment: (id: string, data: { userid: string; eventid?: string | null; seasonid?: string | null; paymenttype: LeaguePaymentType; amount: number; paidat?: string; note?: string }) =>
    post<{ payment: LeaguePayment | null; payments?: LeaguePayment[] }>(`/leagues/${id}/payments`, data),
  deleteLeaguePayment: (id: string, paymentId: string) =>
    del<{ success: boolean }>(`/leagues/${id}/payments/${paymentId}`),
  joinLeague: (invitecode: string) =>
    post<{ leagueid: string; pending: boolean }>('/leagues/join', { invitecode }),
  addLeagueGuest: (id: string, displayname: string, seasonid?: string | null) =>
    post<{ member: LeagueMember }>(`/leagues/${id}/members/guest`, { displayname, seasonid }),
  addLeagueAdmin: (id: string, email: string) =>
    post<{ member: LeagueMember }>(`/leagues/${id}/admins`, { email }),
  inviteLeagueGuestClaim: (id: string, guestUserId: string, email: string) =>
    post<{ success: boolean; email: string }>(`/leagues/${id}/members/${guestUserId}/claim-invite`, { email }),
  inviteLeagueSpotTakeover: (id: string, userId: string, email: string, seasonid?: string | null) =>
    post<{ success: boolean; email: string }>(`/leagues/${id}/members/${userId}/takeover-invite`, { email, seasonid }),
  updateLeagueMemberAdmin: (id: string, userId: string, isadmin: boolean) =>
    patch<{ success: boolean; userid: string; isadmin: boolean }>(`/leagues/${id}/members/${userId}/admin`, { isadmin }),
  claimLeagueGuest: (token: string) =>
    post<{ success: boolean; leagueid: string; leaguename: string }>(`/leagues/guest-claims/${encodeURIComponent(token)}/claim`),
  removeLeagueMember: (id: string, userId: string, seasonid?: string | null) =>
    del<{ success: boolean }>(`/leagues/${id}/members/${userId}${seasonid ? `?seasonId=${encodeURIComponent(seasonid)}` : ''}`),
  getLeague: (id: string, seasonid?: string | null) => get<LeagueDetail>(`/leagues/${id}${seasonid ? `?seasonId=${encodeURIComponent(seasonid)}` : ''}`),
  createLeagueSeason: (id: string, data: { name: string; begindate: string; enddate: string; eventcount?: number; pereventfee?: number }) =>
    post<{ season: LeagueSeason; events: LeagueEvent[] }>(`/leagues/${id}/seasons`, data),
  updateLeagueSeason: (id: string, seasonId: string, data: { name?: string; begindate?: string; enddate?: string; pereventfee?: number }) =>
    patch<{ season: LeagueSeason }>(`/leagues/${id}/seasons/${seasonId}`, data),
  deleteLeagueSeason: (id: string, seasonId: string) =>
    del<{ success: boolean }>(`/leagues/${id}/seasons/${seasonId}`),
  markLeagueEventPaid: (id: string, eventId: string, data: { userId?: string; all?: boolean; paidat?: string }) =>
    post<{ payments: LeaguePayment[]; updatedCount: number }>(`/leagues/${id}/events/${eventId}/payments/mark-paid`, data),
  createLeagueEvent: (id: string, data: { name: string; eventdate?: string | null; eventtime?: string | null; eventnumber?: number; eventcount?: number; seasonid?: string | null; eventfee?: number | null }) =>
    post<{ event: LeagueEvent | null; events?: LeagueEvent[] }>(`/leagues/${id}/events`, data),
  updateLeagueEvent: (id: string, eventId: string, data: { name?: string; eventdate?: string | null; eventtime?: string | null; eventnumber?: number | null; eventfee?: number | null }) =>
    patch<{ event: LeagueEvent }>(`/leagues/${id}/events/${eventId}`, data),
  rsvpLeagueEvent: (id: string, eventId: string, status: LeagueEventRsvpStatus) =>
    put<{ rsvp: LeagueEventRsvp }>(`/leagues/${id}/events/${eventId}/rsvp`, { status }),
  logLeagueResult: (leagueId: string, eventId: string, userId: string, data: { placed?: number | null; dnf?: boolean }) =>
    put<{ result: LeagueResult }>(`/leagues/${leagueId}/events/${eventId}/results/${userId}`, data),
  logLeagueSelfResult: (leagueId: string, eventId: string, data: { placed?: number | null; dnf?: boolean }) =>
    put<{ result: LeagueResult }>(`/leagues/${leagueId}/events/${eventId}/self-result`, data),

  // Tournaments
  getTournaments: () => get<Tournament[]>('/tournaments'),
  getRegistered: () => get<Tournament[]>('/tournaments/registered'),
  createTournament: (data: Partial<Tournament>) =>
    post<{ tournamentid: string }>('/tournaments', data),
  getTournament: (id: string) => get<Tournament>(`/tournaments/${id}`),
  updateTournament: (id: string, data: Partial<Tournament>) => put(`/tournaments/${id}`, data),
  deleteTournament: (id: string, data?: { notifyPlayers?: boolean }) =>
    del<{ success: boolean; notified: number; pushSent?: number }>(`/tournaments/${id}`, data),
  getPublicLobby: (id: string, guestUserId?: string) =>
    get<PublicLobbyResponse>(`/public/tournaments/${id}/lobby${guestUserId ? `?guestUserId=${encodeURIComponent(guestUserId)}` : ''}`),
  getPublicTvBoard: (code: string) =>
    get<PublicTvBoardResponse>(`/public/tv/${encodeURIComponent(code)}`),
  generatePublicTvAnnouncerMoment: (code: string, data: AnnouncerMomentRequest) =>
    post<AnnouncerMomentResponse>(`/public/tv/${encodeURIComponent(code)}/announcer`, data),
  lobbySelfCheckin: (id: string) =>
    post<{ success: boolean }>(`/public/tournaments/${id}/checkin/self`),
  lobbyGuestCheckin: (id: string, data: { displayname?: string; guestUserId?: string }) =>
    post<{ success: boolean; guestUserId: string }>(`/public/tournaments/${id}/checkin/guest`, data),
  lobbySelfRegister: (id: string) =>
    post<{ success: boolean }>(`/public/tournaments/${id}/register/self`),
  lobbyGuestRegister: (id: string, data: { displayname?: string; guestUserId?: string }) =>
    post<{ success: boolean; guestUserId: string }>(`/public/tournaments/${id}/register/guest`, data),
  getPublicAddon: (id: string, guestUserId?: string) =>
    get<PublicAddonResponse>(`/public/tournaments/${id}/addon${guestUserId ? `?guestUserId=${encodeURIComponent(guestUserId)}` : ''}`),
  publicSelfAddon: (id: string, data: { guestUserId?: string }) =>
    post<{ success: boolean; addedon: boolean }>(`/public/tournaments/${id}/addon/self`, data),
  getPublicKnockout: (id: string, guestUserId?: string) =>
    get<PublicKnockoutResponse>(`/public/tournaments/${id}/knockout${guestUserId ? `?guestUserId=${encodeURIComponent(guestUserId)}` : ''}`),
  publicSelfKnockout: (id: string, data: { guestUserId?: string; knockedOutByUserId?: string }) =>
    post<{ success: boolean; placed: number }>(`/public/tournaments/${id}/knockout/self`, data),
  createPublicBlindTimer: (data: { name?: string; levels: Omit<BlindLevel, 'id'>[] }) =>
    post<{ timer: PublicBlindTimer }>('/public/blind-timers', data),
  getPublicBlindTimer: (code: string) =>
    get<{ timer: PublicBlindTimer }>(`/public/blind-timers/${encodeURIComponent(code)}`),
  updatePublicBlindTimer: (code: string, data: { name?: string; levels: Omit<BlindLevel, 'id'>[] }) =>
    put<{ timer: PublicBlindTimer }>(`/public/blind-timers/${encodeURIComponent(code)}`, data),
  emailPublicBlindTimerCode: (code: string, data: { email: string; enableSoundAnnouncements?: boolean; state?: PublicBlindTimerState }) =>
    post<{ success: boolean; timer: PublicBlindTimer }>(`/public/blind-timers/${encodeURIComponent(code)}/email`, data),
  updatePublicBlindTimerState: (code: string, state: PublicBlindTimerState) =>
    put<{ timer: PublicBlindTimer }>(`/public/blind-timers/${encodeURIComponent(code)}/state`, { state }),
  unsubscribePublicBlindTimer: (token: string) =>
    post<{ success: boolean }>(`/public/blind-timers/unsubscribe/${encodeURIComponent(token)}`),

  // Voice and coaching
  generateAnnouncerMoment: (id: string, data: AnnouncerMomentRequest) =>
    post<AnnouncerMomentResponse>(`/ai/tournaments/${id}/announcer`, data),
  analyzeHand: (id: string, data: HandAnalysisRequest) =>
    post<HandAnalysisResponse>(`/ai/tournaments/${id}/analyze-hand`, data),

  // Players
  getPlayers: (tid: string) => get<TournamentPlayer[]>(`/tournaments/${tid}/players`),
  addPlayer: (tid: string, data: { email?: string; userid?: string; displayname?: string }) =>
    post(`/tournaments/${tid}/players`, data),
  selfRegister: (tid: string) => post(`/tournaments/${tid}/players/self`),
  groupRegister: (tid: string) => post(`/tournaments/${tid}/players/group-register`),
  leaveTournament: (tid: string) => del(`/tournaments/${tid}/players/self`),
  declineTournament: (tid: string) => post(`/tournaments/${tid}/players/self/decline`),
  removePlayer: (tid: string, uid: string) => del(`/tournaments/${tid}/players/${uid}`),
  toggleCheckin: (tid: string, uid: string) =>
    put(`/tournaments/${tid}/players/${uid}/checkin`),
  addRebuy: (tid: string, uid: string) => post(`/tournaments/${tid}/players/${uid}/rebuy`),
  removeRebuy: (tid: string, uid: string) => del(`/tournaments/${tid}/players/${uid}/rebuy`),
  addAddon: (tid: string, uid: string) => post(`/tournaments/${tid}/players/${uid}/addon`),
  removeAddon: (tid: string, uid: string) => del(`/tournaments/${tid}/players/${uid}/addon`),
  addGenericRebuy: (tid: string) => post(`/tournaments/${tid}/rebuys`),
  removeGenericRebuy: (tid: string) => del(`/tournaments/${tid}/rebuys`),
  addGenericAddon: (tid: string) => post(`/tournaments/${tid}/addons`),
  removeGenericAddon: (tid: string) => del(`/tournaments/${tid}/addons`),
  knockPlayer: (tid: string, uid: string, placed: number | null) =>
    put(`/tournaments/${tid}/players/${uid}/knock`, { placed }),
  updatePlayerBounty: (tid: string, uid: string, amount: number) =>
    put(`/tournaments/${tid}/players/${uid}/bounty`, { amount }),
  assignMysteryBounties: (tid: string, prizepool?: number, denomination?: number) =>
    post<{ success: boolean; assigned: number; total: number; denomination: number }>(`/tournaments/${tid}/bounties/mystery-assign`, { prizepool, denomination }),
  togglePaid: (tid: string, uid: string) =>
    put(`/tournaments/${tid}/players/${uid}/paid`),

  // Blinds
  getBlinds: (tid: string) => get<BlindLevel[]>(`/tournaments/${tid}/blinds`),
  saveBlinds: (tid: string, levels: Omit<BlindLevel, 'id'>[]) =>
    put(`/tournaments/${tid}/blinds`, levels),
  deleteBlinds: (tid: string) => del(`/tournaments/${tid}/blinds`),
  getChips: (tid: string) => get<TournamentChip[]>(`/tournaments/${tid}/chips`),
  saveChips: (tid: string, chips: Omit<TournamentChip, 'id'>[]) =>
    put(`/tournaments/${tid}/chips`, chips),

  // Seating
  getSeating: (tid: string) => get<SeatingAssignment[]>(`/tournaments/${tid}/seating`),
  assignSeats: (tid: string, maxPerTable?: number, mode?: 'all' | 'remaining') =>
    post<{ assigned: number }>(`/tournaments/${tid}/seating/assign`, { maxPerTable, mode }),
  clearSeating: (tid: string) => del(`/tournaments/${tid}/seating`),

  // Admin
  getAdminUsers: (email?: string) => get<AdminUserSummary[]>(`/admin/users${email ? `?email=${encodeURIComponent(email)}` : ''}`),
  getAdminUser: (id: string) => get<AdminUserDetail>(`/admin/users/${id}`),
  updateAdminUser: (id: string, data: { tierid?: number; issuperadmin?: boolean; aicreditsremaining?: number }) =>
    put<{ success: boolean; account: AuthProfile }>(`/admin/users/${id}`, data),
  getAdminAiCreditSettings: () => get<{ defaultaicredits: number }>('/admin/settings/ai-credits'),
  updateAdminAiCreditSettings: (data: { defaultaicredits: number }) =>
    put<{ defaultaicredits: number }>('/admin/settings/ai-credits', data),
  getAdminFeedback: () => get<AdminFeedbackResponse>('/admin/feedback'),
  getAdminFeedbackSummary: () => get<{ newcount: number }>('/admin/feedback/summary'),
  updateAdminFeedback: (id: string, data: { status: AdminFeedbackStatus }) =>
    put<{ success: boolean; id: string; status: string }>(`/admin/feedback/${id}`, data),
  getAdminVoiceLabStyles: () => get<{ styles: AdminVoiceLabStyle[] }>('/admin/voice-lab/styles'),
  generateAdminVoiceLabScript: (data: { style: string; brief: string }) =>
    post<{ script: string }>('/admin/voice-lab/script', data),
  generateAdminVoiceLabClip: (data: { style: string; text: string; filename?: string; overwrite?: boolean }) =>
    post<AdminVoiceLabClip>('/admin/voice-lab/clips', data),
};

// Shared type re-exports so pages don't need separate imports
export interface Group {
  groupid: string; ownerid: string; name: string; invitecode: string;
  approvalneeded: boolean; active: boolean; createdat: string;
  defaulttrackingmode?: TrackingMode;
  tvseatingwelcomemessage?: string | null;
  speechfiveminutemessage?: string | null;
  speechoneminutemessage?: string | null;
  speechlevelupmessage?: string | null;
  aiannouncerenabled?: boolean;
  aiannouncerpreset?: AnnouncerPreset;
  aiannouncercustomprompt?: string | null;
  aiannouncerclassicmode?: boolean;
  postapprovalrequired?: boolean;
  membercount?: number; isadmin?: boolean; approved?: boolean;
  pendingpostcount?: number;
  postcount?: number;
  nexttournamentid?: string | null;
  nexttournamentname?: string | null;
  nexttournamentdate?: string | null;
  nexttournamenttime?: string | null;
}
export type TrackingMode = 'standard' | 'player';
export type AnnouncerPreset =
  | 'all_in_alex'
  | 'royal_rumble_riley'
  | 'velvet_dealer'
  | 'chipstorm'
  | 'queen_of_spades'
  | 'the_pit_boss'
  | 'british_high_roller'
  | 'turbo_tony'
  | 'midnight_mayhem'
  | 'sunny_stacks';
export interface GroupMember {
  userid: string; emailaddress: string; displayname?: string;
  isadmin: boolean; approved: boolean;
  emailalertsenabled?: boolean; smsalertsenabled?: boolean; pushalertsenabled?: boolean;
  firstplacecount?: number; secondplacecount?: number; thirdplacecount?: number;
}
export interface Tournament {
  tournamentid: string; ownerid: string; name: string;
  tourneydate: string | null; tourneytime: string | null;
  buyin: number; rake?: number; payoutstructure?: string | null; rebuyprice: number; rebuychips: number; rebuylastlevel?: number | null;
  genericrebuys?: number;
  addonprice: number; addonchips: number;
  genericaddons?: number;
  maxplayers: number;
  savedstructureid?: string | null;
  notifygroup?: boolean;
  playerselftracking: boolean; active: boolean; completed?: boolean; registerself?: boolean; createdat: string;
  groupid?: string | null; groupname?: string | null;
  tvdisplaycode?: string | null;
  tvgreetingdisplayenabled?: boolean;
  tvgreetingaudioenabled?: boolean;
  tvshowknockoutqrenabled?: boolean;
  tvdisplaymode?: 'timer' | 'seating';
  seatingmaxpertable?: number;
  bountyenabled?: boolean;
  bountymode?: 'manual' | 'mystery';
  bountyprizepool?: number;
  bountypooltype?: 'amount' | 'percent';
  bountyroundingdenomination?: number;
  bountystartplace?: number | null;
  bountyminpayout?: number;
  tvseatingwelcomemessage?: string | null;
  speechfiveminutemessage?: string | null;
  speechoneminutemessage?: string | null;
  speechlevelupmessage?: string | null;
  aiannouncerenabled?: boolean;
  aiannouncerpreset?: AnnouncerPreset;
  aiannouncercustomprompt?: string | null;
  aiannouncerclassicmode?: boolean;
  tvfeatureenabled?: boolean;
  pocketadminenabled?: boolean;
  isowner?: boolean;
  playercount?: number; checkedincount?: number; isregistered?: boolean; isdeclined?: boolean;
  isgroupadmin?: boolean; canmanage?: boolean;
}
export interface TournamentPlayer {
  userid: string; emailaddress: string; displayname?: string;
  firstplacecount?: number; secondplacecount?: number; thirdplacecount?: number;
  awardedcoins?: PlayerCoinBadge[];
  checkinaudiodata?: string | null;
  avatarimagedata?: string | null;
  checkedin: boolean; rebuys: number; addedon: boolean;
  placed: number | null; knockedoutbyuserid?: string | null; knockedoutbyname?: string | null; paid: boolean; registeredat: string;
  bountyamount?: number; bountyclaimedbyuserid?: string | null; bountyclaimedbyname?: string | null; bountyclaimedat?: string | null;
  tablenumber?: number | null; seat?: number | null;
}

export interface GroupCoin {
  id: string; groupid: string; name: string;
  description?: string | null; imagedata?: string | null; imageurl?: string | null; imagefilename?: string | null;
  awardcount?: number; createdat: string;
}

export interface GroupCoinAward {
  id: string; groupid: string; coinid: string; userid: string;
  displayname?: string; note?: string | null; createdat: string;
}
export type GameType = 'tournament' | 'cash';
export type GameVisibility = 'group_public' | 'invite_only';
export type GameStatus = 'scheduled' | 'active' | 'completed' | 'cancelled';
export type CashGamePlayerStatus = 'interested' | 'seated' | 'cashed_out' | 'removed';
export type CashGameRsvpStatus = 'going' | 'not_going';
export interface CreateGameRequest {
  groupid: string;
  gametype: GameType;
  title: string;
  startsat?: string | null;
  visibility: GameVisibility;
  inviteUserIds?: string[];
  alertUsers?: boolean;
  cash?: {
    stakeslabel: string;
    seatsavailable?: number | null;
    minbuyin?: number | null;
    maxbuyin?: number | null;
    notes?: string | null;
  };
}
export interface GameRecord {
  id: string;
  groupid: string;
  createdbyuserid: string;
  gametype: GameType;
  title: string;
  status: GameStatus;
  visibility: GameVisibility;
  startsat?: string | null;
  tournamentid?: string | null;
  groupname?: string;
  canmanage?: boolean;
  createdat: string;
  updatedat: string;
}
export interface GameListItem extends GameRecord {
  stakeslabel?: string | null;
  minbuyin?: number | null;
  maxbuyin?: number | null;
  seatsavailable?: number | null;
  playercount?: number;
  isregistered?: boolean;
  rsvpstatus?: CashGameRsvpStatus | string | null;
}
export interface CashGameDetails {
  gameid: string;
  stakeslabel: string;
  minbuyin?: number | null;
  maxbuyin?: number | null;
  seatsavailable?: number | null;
  notes?: string | null;
  updatedat?: string;
}
export interface CashGamePlayer {
  id: string;
  gameid: string;
  userid: string;
  displayname?: string | null;
  displaynamesnapshot?: string | null;
  status: CashGamePlayerStatus;
  buyintotal: number;
  addontotal: number;
  cashouttotal: number;
  createdat: string;
  updatedat: string;
}
export interface CashGameLedgerEvent {
  id: string;
  gameid: string;
  userid?: string | null;
  displayname?: string | null;
  eventtype: 'buy_in' | 'add_on' | 'cash_out' | 'status_change' | 'removed';
  amount?: number | null;
  createdbyuserid?: string | null;
  createdat: string;
}
export interface GameDetail {
  game: GameRecord;
  cashdetails?: CashGameDetails | null;
  players: CashGamePlayer[];
  members: GroupMember[];
  ledger: CashGameLedgerEvent[];
}
export interface LeaguePointRule {
  place: number | 'DNF';
  points: number;
}
export interface LeagueFinalMultiplier {
  place: number;
  multiplier: number;
}
export interface League {
  leagueid: string;
  ownerid: string;
  name: string;
  invitecode: string;
  approvalneeded: boolean;
  expectedplayercount: number;
  leaguefee: number;
  pereventfee: number;
  showupbonuspoints: number;
  bestfinishcount: number;
  pointslookup: LeaguePointRule[];
  finalenabled: boolean;
  finalmultiplierlookup: LeagueFinalMultiplier[];
  finalchiprounding: number;
  finalstartingbigblind: number;
  memberledgervisible: boolean;
  active: boolean;
  createdat: string;
  isadmin?: boolean;
  approved?: boolean;
  membercount?: number;
  eventcount?: number;
}
export interface LeagueMember {
  userid: string;
  emailaddress?: string | null;
  displayname?: string | null;
  isadmin: boolean;
  approved: boolean;
  participating: boolean;
  isguestuser?: boolean;
  pendinginviteemail?: string | null;
}
export interface LeagueSeason {
  seasonid: string;
  leagueid: string;
  name: string;
  begindate: string;
  enddate: string;
  pereventfee: number;
  active: boolean;
  createdat: string;
}
export interface LeagueEvent {
  eventid: string;
  leagueid: string;
  seasonid?: string | null;
  name: string;
  eventdate?: string | null;
  eventtime?: string | null;
  eventnumber?: number | null;
  eventfee?: number | null;
  resultcount?: number;
  active: boolean;
  createdat: string;
}
export type LeagueEventRsvpStatus = 'going' | 'not_going';
export interface LeagueEventRsvp {
  rsvpid: string;
  eventid: string;
  leagueid: string;
  userid: string;
  displayname?: string | null;
  emailaddress?: string | null;
  status: LeagueEventRsvpStatus | string;
  createdat: string;
  updatedat: string;
}
export interface LeagueScheduleEvent {
  leagueid: string;
  leaguename: string;
  eventid: string;
  name: string;
  eventdate?: string | null;
  eventtime?: string | null;
  eventnumber?: number | null;
  eventfee?: number | null;
  isadmin?: boolean;
  participating?: boolean;
  rsvpstatus?: LeagueEventRsvpStatus | string | null;
}
export interface LeagueResult {
  resultid: string;
  eventid: string;
  leagueid: string;
  userid: string;
  displayname?: string | null;
  placed?: number | null;
  dnf: boolean;
  points: number;
  showupbonuspoints: number;
  loggedby?: string | null;
  createdat: string;
  updatedat: string;
}
export type LeaguePaymentType = 'league' | 'event' | 'other';
export interface LeaguePayment {
  paymentid: string;
  leagueid: string;
  seasonid?: string | null;
  userid: string;
  displayname?: string | null;
  eventid?: string | null;
  eventname?: string | null;
  paymenttype: LeaguePaymentType | string;
  amount: number;
  paidat: string;
  note?: string | null;
  recordedby?: string | null;
  createdat: string;
}
export interface LeagueAuditLog {
  auditid: string;
  leagueid: string;
  seasonid?: string | null;
  seasonname?: string | null;
  eventid?: string | null;
  eventname?: string | null;
  actorid?: string | null;
  actorname?: string | null;
  targetuserid?: string | null;
  targetname?: string | null;
  action: string;
  summary: string;
  details?: Record<string, unknown>;
  createdat: string;
}
export interface LeagueStanding {
  userid: string;
  displayname?: string | null;
  isadmin: boolean;
  eventsplayed: number;
  showupbonus: number;
  scoredpoints: number;
  totalpoints: number;
  averagefinish?: number | null;
  bestfinishes: number[];
}
export interface LeagueFinalStack extends LeagueStanding {
  place: number;
  multiplier: number;
  multiplierchips: number;
  roundedchips: number;
  startingstack: number;
  bbstostart: number;
}
export interface LeagueDetail {
  league: League;
  seasons: LeagueSeason[];
  selectedseasonid: string;
  members: LeagueMember[];
  events: LeagueEvent[];
  results: LeagueResult[];
  payments: LeaguePayment[];
  rsvps: LeagueEventRsvp[];
  auditlog: LeagueAuditLog[];
  standings: LeagueStanding[];
  finalstacks: LeagueFinalStack[];
}
export interface PlayerCoinBadge {
  coinid: string; name: string;
  description?: string | null; imagedata?: string | null; imageurl?: string | null;
  count: number;
}
export interface AuthProfile {
  guid: string;
  emailaddress: string;
  fullname?: string | null;
  tablename?: string | null;
  displayname: string;
  tierid?: number;
  accounttier?: AccountTier;
  issuperadmin?: boolean;
  hostedtournamentcount?: number;
  trialhostedremaining?: number;
  trialactive?: boolean;
  canuseclubfeatures?: boolean;
  aicreditsremaining?: number;
  defaultaicredits?: number;
  aicreditsrefreshat?: string;
  checkinaudiodata?: string | null;
  checkinaudiofilename?: string | null;
  hascheckinaudio?: boolean;
  avatarimagedata?: string | null;
  avatarfilename?: string | null;
  hasavatarimage?: boolean;
  phonenumber?: string | null;
  smsoptedin?: boolean;
  onboardingcomplete?: boolean;
  onboardingtourcompletedat?: string | null;
}
export interface BlindLevel {
  id: string; level: number; label: string;
  smallblind: number; bigblind: number; ante: number;
  minutes: number; islastlevel: boolean;
}
export interface PublicBlindTimer {
  code: string;
  name: string;
  levels: Omit<BlindLevel, 'id'>[];
  state?: PublicBlindTimerState | null;
  soundannouncementsenabled?: boolean;
  promoconsentactive?: boolean;
  createdat?: string;
  updatedat?: string;
}
export interface PublicBlindTimerState {
  currentIndex: number;
  remainingSecs: number;
  running: boolean;
  savedAt?: string;
}
export interface GroupBlindStructure {
  id: string; groupid: string; name: string;
  levels: Omit<BlindLevel, 'id'>[];
  createdat: string;
}
export interface GroupPollOption {
  id: string; label: string; sortorder: number; votecount: number; votedbyme?: boolean;
}
export interface GroupComment {
  id: string; userid: string; displayname?: string; message: string; createdat: string;
}
export interface GroupPost {
  id: string; groupid: string; createdby: string; displayname?: string;
  posttype: 'message' | 'poll'; message: string; createdat: string;
  status?: 'pending' | 'approved' | 'rejected' | string;
  options?: GroupPollOption[]; comments?: GroupComment[];
}
export interface TournamentChip {
  id: string; denomination: number; color: string;
  quantity: number; sortorder: number;
}
export interface SeatingAssignment {
  userid: string; emailaddress: string; displayname?: string;
  tablenumber: number; seat: number;
}
export interface LobbyFieldStats {
  registeredcount: number; checkedincount: number; knockedoutcount: number;
  activecount: number; totalrebuys: number; totaladdons: number; grosspot: number;
  bountytotal?: number; bountyremaining?: number; bountyclaimed?: number;
}
export interface LobbyEntry {
  userid: string; emailaddress: string; displayname?: string;
  awardedcoins?: PlayerCoinBadge[];
  checkedin: boolean; addedon?: boolean; placed?: number | null; tablenumber?: number | null; seat?: number | null;
  bountyamount?: number; bountyclaimedbyuserid?: string | null; bountyclaimedbyname?: string | null; bountyclaimedat?: string | null;
}
export interface PublicAddonResponse {
  tournament: Tournament;
  entry: LobbyEntry | null;
}
export interface PublicTvBoardResponse {
  tournament: Tournament;
  players: TournamentPlayer[];
}
export interface PublicLobbyResponse {
  tournament: Tournament;
  field: LobbyFieldStats;
  seating: SeatingAssignment[];
  entry: LobbyEntry | null;
  isdeclined?: boolean;
  activePlayers?: KnockoutOption[];
}
export interface KnockoutOption {
  userid: string; emailaddress: string; displayname?: string;
  awardedcoins?: PlayerCoinBadge[];
}
export interface PublicKnockoutResponse {
  tournament: Tournament;
  entry: LobbyEntry | null;
  activePlayers: KnockoutOption[];
}

export interface AnnouncerMomentRequest {
  eventtype: 'tournament_start' | 'tournament_winner' | 'timer_paused' | 'timer_resumed' | 'level_up' | 'five_minute_warning' | 'one_minute_warning' | 'knockout' | 'rebuy' | 'addon' | 'checkin';
  currentlevel: number;
  previouslevel?: number | null;
  previouslevelstartedat?: string | null;
  smallblind?: number;
  bigblind?: number;
  ante?: number;
  knockedoutplayername?: string;
  knockedoutbyname?: string | null;
  placement?: number | null;
  prizeamount?: number | null;
  bountyamount?: number | null;
  bountyclaimedbyname?: string | null;
  playername?: string | null;
  isbreak?: boolean;
  breaklabel?: string | null;
  breakminutes?: number | null;
  rebuycutoffwarning?: 'five_minute_warning' | 'one_minute_warning' | null;
  rebuyclosed?: boolean;
  prizepool?: number | null;
  playercount?: number | null;
  rebuyenabled?: boolean;
  rebuyamount?: number | null;
  addonenabled?: boolean;
  addonamount?: number | null;
}

export interface AnnouncerMomentResponse {
  text: string;
  audioBase64?: string;
  mimeType?: string;
  aiEnabled: boolean;
  preset?: AnnouncerPreset;
  voice?: string;
}

export interface HandAnalysisRequest {
  hand: string;
  blindlevel?: number;
  smallblind?: number;
  bigblind?: number;
  ante?: number;
}

export interface HandAnalysisResponse {
  analysis: string;
  aiEnabled: boolean;
}

export type AccountTier = 'host' | 'club' | 'pro';

export type NotificationCategory =
  | 'essential'
  | 'tournament_play'
  | 'bounties_achievements'
  | 'league'
  | 'social';

export interface NotificationPreference {
  category: NotificationCategory;
  label: string;
  description: string;
  example: string;
  enabled: boolean;
  digestOnly: boolean;
  defaultEnabled: boolean;
}

export interface AdminUserSummary {
  userid: string;
  emailaddress: string;
  displayname?: string;
  tierid: number;
  accounttier: AccountTier;
  issuperadmin: boolean;
  hostedtournamentcount: number;
  trialhostedremaining: number;
  trialactive: boolean;
  canuseclubfeatures: boolean;
  aicreditsremaining?: number;
  defaultaicredits?: number;
  groupcount: number;
  hostedgroupcount: number;
  upcominghostedcount: number;
  totalhostedcount: number;
}

export interface AdminUserDetail {
  account: AuthProfile;
  groups: Group[];
  tournaments: Tournament[];
}

export interface AdminFeedback {
  id: string;
  userid: string | null;
  emailaddress: string | null;
  displayname?: string | null;
  type: 'issue' | 'idea' | 'question' | string;
  message: string;
  pageurl: string | null;
  useragent: string | null;
  status: AdminFeedbackStatus | string;
  createdat: string;
}

export type AdminFeedbackStatus = 'new' | 'looked_at' | 'closed';

export interface AdminFeedbackResponse {
  newcount: number;
  feedback: AdminFeedback[];
}

export interface AdminVoiceLabClip {
  success: boolean;
  style: string;
  label: string;
  filename: string;
  url: string;
  bytes: number;
  text: string;
  updatedAt: string;
  mimeType: string;
}

export interface AdminVoiceLabStyle {
  id: string;
  label: string;
  description?: string;
  bestFor?: string;
  savedClip: Omit<AdminVoiceLabClip, 'success' | 'mimeType'> | null;
}
