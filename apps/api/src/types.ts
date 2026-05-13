export interface User {
  guid: string;
  emailaddress: string;
  emailverified: boolean;
  displayname?: string;
}

export interface Group {
  groupid: string;
  ownerid: string;
  name: string;
  invitecode: string;
  approvalneeded: boolean;
  active: boolean;
  createdat: string;
  membercount?: number;
  isadmin?: boolean;
  approved?: boolean;
}

export interface GroupMember {
  userid: string;
  emailaddress: string;
  displayname?: string;
  isadmin: boolean;
  approved: boolean;
}

export interface Tournament {
  tournamentid: string;
  ownerid: string;
  name: string;
  tourneydate: string | null;
  tourneytime: string | null;
  buyin: number;
  rake?: number;
  payoutstructure?: string | null;
  rebuyprice: number;
  rebuychips: number;
  addonprice: number;
  addonchips: number;
  maxplayers: number;
  playerselftracking: boolean;
  active: boolean;
  completed?: boolean;
  registerself?: boolean;
  createdat: string;
  groupid?: string | null;
  groupname?: string | null;
  playercount?: number;
  checkedincount?: number;
  isregistered?: boolean;
  isgroupadmin?: boolean;
  canmanage?: boolean;
}

export interface TournamentPlayer {
  userid: string;
  emailaddress: string;
  displayname?: string;
  checkedin: boolean;
  rebuys: number;
  addedon: boolean;
  placed: number | null;
  knockedoutbyuserid?: string | null;
  knockedoutbyname?: string | null;
  paid: boolean;
  registeredat: string;
  tablenumber?: number | null;
  seat?: number | null;
}

export interface BlindLevel {
  id: string;
  level: number;
  label: string;
  smallblind: number;
  bigblind: number;
  ante: number;
  minutes: number;
  islastlevel: boolean;
}

export interface TournamentChip {
  id: string;
  denomination: number;
  color: string;
  quantity: number;
  sortorder: number;
}

export interface TimerState {
  tournamentid: string;
  currentlevel: number;
  remainingsecs: number;
  running: boolean;
  blinds: BlindLevel[];
}

export interface SeatingAssignment {
  userid: string;
  emailaddress: string;
  displayname?: string;
  tablenumber: number;
  seat: number;
}

export interface LobbyFieldStats {
  registeredcount: number;
  checkedincount: number;
  knockedoutcount: number;
  activecount: number;
  totalrebuys: number;
  totaladdons: number;
  grosspot: number;
}

export interface LobbyEntry {
  userid: string;
  emailaddress: string;
  displayname?: string;
  checkedin: boolean;
  placed?: number | null;
  tablenumber?: number | null;
  seat?: number | null;
}

export interface KnockoutOption {
  userid: string;
  emailaddress: string;
  displayname?: string;
}

// Express request augmentation
declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}
