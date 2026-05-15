export interface User {
  guid: string;
  emailaddress: string;
  emailverified: boolean;
  displayname?: string;
  tierid?: number;
  accounttier?: 'host' | 'club' | 'pro';
  issuperadmin?: boolean;
  hostedtournamentcount?: number;
  trialhostedremaining?: number;
  trialactive?: boolean;
  canuseclubfeatures?: boolean;
  checkinaudiodata?: string | null;
  checkinaudiofilename?: string | null;
  hascheckinaudio?: boolean;
  avatarimagedata?: string | null;
  avatarfilename?: string | null;
  hasavatarimage?: boolean;
}

export interface Group {
  groupid: string;
  ownerid: string;
  name: string;
  invitecode: string;
  approvalneeded: boolean;
  defaulttrackingmode?: 'standard' | 'player';
  tvseatingwelcomemessage?: string | null;
  speechfiveminutemessage?: string | null;
  speechoneminutemessage?: string | null;
  speechlevelupmessage?: string | null;
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
  genericrebuys?: number;
  addonprice: number;
  addonchips: number;
  genericaddons?: number;
  maxplayers: number;
  playerselftracking: boolean;
  active: boolean;
  completed?: boolean;
  registerself?: boolean;
  createdat: string;
  groupid?: string | null;
  groupname?: string | null;
  tvdisplaycode?: string | null;
  tvgreetingdisplayenabled?: boolean;
  tvgreetingaudioenabled?: boolean;
  tvshowknockoutqrenabled?: boolean;
  tvdisplaymode?: 'timer' | 'seating';
  seatingmaxpertable?: number;
  tvseatingwelcomemessage?: string | null;
  speechfiveminutemessage?: string | null;
  speechoneminutemessage?: string | null;
  speechlevelupmessage?: string | null;
  tvfeatureenabled?: boolean;
  pocketadminenabled?: boolean;
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
  checkinaudiodata?: string | null;
  avatarimagedata?: string | null;
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

export interface GroupBlindStructure {
  id: string;
  groupid: string;
  name: string;
  levels: Omit<BlindLevel, 'id'>[];
  createdat: string;
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
  addedon?: boolean;
  placed?: number | null;
  tablenumber?: number | null;
  seat?: number | null;
}

export interface KnockoutOption {
  userid: string;
  emailaddress: string;
  displayname?: string;
}

export interface GroupPollOption {
  id: string;
  label: string;
  sortorder: number;
  votecount: number;
  votedbyme?: boolean;
}

export interface GroupComment {
  id: string;
  userid: string;
  displayname?: string;
  message: string;
  createdat: string;
}

export interface GroupPost {
  id: string;
  groupid: string;
  createdby: string;
  displayname?: string;
  posttype: 'message' | 'poll';
  message: string;
  createdat: string;
  options?: GroupPollOption[];
  comments?: GroupComment[];
}

// Express request augmentation
declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}
