const BASE = '/api';

function getToken(): string | null {
  return localStorage.getItem('pb_token');
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
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
const del = <T>(path: string) => request<T>(path, { method: 'DELETE' });

export const api = {
  // Auth
  register: (data: { email: string; password: string; displayname?: string }) =>
    post('/auth/register', data),
  verifyEmail: (data: { email: string; pin: string }) =>
    post<{ token: string }>('/auth/verify-email', data),
  login: (data: { email: string; password: string }) =>
    post<{ token: string }>('/auth/login', data),
  requestReset: (email: string) => post('/auth/request-reset', { email }),
  resetPassword: (data: { token: string; password: string }) =>
    post('/auth/reset-password', data),
  me: () => get<{ guid: string; emailaddress: string; displayname: string }>('/auth/me'),

  // Groups
  getGroups: () => get<Group[]>('/groups'),
  createGroup: (data: { name: string; approvalneeded?: boolean }) =>
    post<{ groupid: string; invitecode: string }>('/groups', data),
  getGroup: (id: string) => get<Group & { members: GroupMember[] }>(`/groups/${id}`),
  updateGroup: (id: string, data: { name?: string; approvalneeded?: boolean; invitecode?: string }) =>
    put(`/groups/${id}`, data),
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

  // Tournaments
  getTournaments: () => get<Tournament[]>('/tournaments'),
  getRegistered: () => get<Tournament[]>('/tournaments/registered'),
  createTournament: (data: Partial<Tournament>) =>
    post<{ tournamentid: string }>('/tournaments', data),
  getTournament: (id: string) => get<Tournament>(`/tournaments/${id}`),
  updateTournament: (id: string, data: Partial<Tournament>) => put(`/tournaments/${id}`, data),

  // Players
  getPlayers: (tid: string) => get<TournamentPlayer[]>(`/tournaments/${tid}/players`),
  addPlayer: (tid: string, data: { email?: string; userid?: string; displayname?: string }) =>
    post(`/tournaments/${tid}/players`, data),
  selfRegister: (tid: string) => post(`/tournaments/${tid}/players/self`),
  groupRegister: (tid: string) => post(`/tournaments/${tid}/players/group-register`),
  removePlayer: (tid: string, uid: string) => del(`/tournaments/${tid}/players/${uid}`),
  toggleCheckin: (tid: string, uid: string) =>
    put(`/tournaments/${tid}/players/${uid}/checkin`),
  addRebuy: (tid: string, uid: string) => post(`/tournaments/${tid}/players/${uid}/rebuy`),
  addAddon: (tid: string, uid: string) => post(`/tournaments/${tid}/players/${uid}/addon`),
  knockPlayer: (tid: string, uid: string, placed: number) =>
    put(`/tournaments/${tid}/players/${uid}/knock`, { placed }),
  togglePaid: (tid: string, uid: string) =>
    put(`/tournaments/${tid}/players/${uid}/paid`),

  // Blinds
  getBlinds: (tid: string) => get<BlindLevel[]>(`/tournaments/${tid}/blinds`),
  saveBlinds: (tid: string, levels: Omit<BlindLevel, 'id'>[]) =>
    put(`/tournaments/${tid}/blinds`, levels),
  deleteBlinds: (tid: string) => del(`/tournaments/${tid}/blinds`),

  // Seating
  getSeating: (tid: string) => get<SeatingAssignment[]>(`/tournaments/${tid}/seating`),
  assignSeats: (tid: string, maxPerTable?: number) =>
    post<{ assigned: number }>(`/tournaments/${tid}/seating/assign`, { maxPerTable }),
  clearSeating: (tid: string) => del(`/tournaments/${tid}/seating`),
};

// Shared type re-exports so pages don't need separate imports
export interface Group {
  groupid: string; ownerid: string; name: string; invitecode: string;
  approvalneeded: boolean; active: boolean; createdat: string;
  membercount?: number; isadmin?: boolean; approved?: boolean;
}
export interface GroupMember {
  userid: string; emailaddress: string; displayname?: string;
  isadmin: boolean; approved: boolean;
}
export interface Tournament {
  tournamentid: string; ownerid: string; name: string;
  tourneydate: string | null; tourneytime: string | null;
  buyin: number; rake?: number; rebuyprice: number; rebuychips: number;
  addonprice: number; addonchips: number; maxplayers: number;
  playerselftracking: boolean; active: boolean; completed?: boolean; registerself?: boolean; createdat: string;
  groupid?: string | null;
  playercount?: number; checkedincount?: number; isregistered?: boolean;
}
export interface TournamentPlayer {
  userid: string; emailaddress: string; displayname?: string;
  checkedin: boolean; rebuys: number; addedon: boolean;
  placed: number | null; paid: boolean; registeredat: string;
  tablenumber?: number | null; seat?: number | null;
}
export interface BlindLevel {
  id: string; level: number; label: string;
  smallblind: number; bigblind: number; ante: number;
  minutes: number; islastlevel: boolean;
}
export interface SeatingAssignment {
  userid: string; emailaddress: string; displayname?: string;
  tablenumber: number; seat: number;
}
