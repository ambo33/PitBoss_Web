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
  aicreditsremaining?: number;
  defaultaicredits?: number;
  checkinaudiodata?: string | null;
  checkinaudiofilename?: string | null;
  hascheckinaudio?: boolean;
  avatarimagedata?: string | null;
  avatarfilename?: string | null;
  hasavatarimage?: boolean;
  phonenumber?: string | null;
  smsoptedin?: boolean;
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
  aiannouncerenabled?: boolean;
  aiannouncerpreset?: 'all_in_alex' | 'royal_rumble_riley' | 'velvet_dealer' | 'chipstorm' | 'queen_of_spades' | 'the_pit_boss' | 'british_high_roller' | 'turbo_tony' | 'midnight_mayhem' | 'sunny_stacks';
  aiannouncercustomprompt?: string | null;
  aiannouncerclassicmode?: boolean;
  postapprovalrequired?: boolean;
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
  emailalertsenabled?: boolean;
  smsalertsenabled?: boolean;
  pushalertsenabled?: boolean;
  firstplacecount?: number;
  secondplacecount?: number;
  thirdplacecount?: number;
}

export interface GroupCoin {
  id: string;
  groupid: string;
  name: string;
  description?: string | null;
  imagedata?: string | null;
  imageurl?: string | null;
  imagefilename?: string | null;
  awardcount?: number;
  createdat: string;
}

export interface GroupCoinAward {
  id: string;
  groupid: string;
  coinid: string;
  userid: string;
  displayname?: string;
  note?: string | null;
  createdat: string;
}

export interface PlayerCoinBadge {
  coinid: string;
  name: string;
  description?: string | null;
  imagedata?: string | null;
  imageurl?: string | null;
  count: number;
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
  rebuylastlevel?: number | null;
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
  aiannouncerpreset?: 'all_in_alex' | 'royal_rumble_riley' | 'velvet_dealer' | 'chipstorm' | 'queen_of_spades' | 'the_pit_boss' | 'british_high_roller' | 'turbo_tony' | 'midnight_mayhem' | 'sunny_stacks';
  aiannouncercustomprompt?: string | null;
  aiannouncerclassicmode?: boolean;
  tvfeatureenabled?: boolean;
  pocketadminenabled?: boolean;
  isdemo?: boolean;
  playercount?: number;
  checkedincount?: number;
  isregistered?: boolean;
  isdeclined?: boolean;
  isgroupadmin?: boolean;
  canmanage?: boolean;
}

export interface TournamentPlayer {
  userid: string;
  emailaddress: string;
  displayname?: string;
  firstplacecount?: number;
  secondplacecount?: number;
  thirdplacecount?: number;
  awardedcoins?: PlayerCoinBadge[];
  checkinaudiodata?: string | null;
  avatarimagedata?: string | null;
  checkedin: boolean;
  rebuys: number;
  addedon: boolean;
  placed: number | null;
  knockedoutbyuserid?: string | null;
  knockedoutbyname?: string | null;
  bountyamount?: number;
  bountyclaimedbyuserid?: string | null;
  bountyclaimedbyname?: string | null;
  bountyclaimedat?: string | null;
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
  bountytotal?: number;
  bountyremaining?: number;
  bountyclaimed?: number;
}

export interface LobbyEntry {
  userid: string;
  emailaddress: string;
  displayname?: string;
  awardedcoins?: PlayerCoinBadge[];
  checkedin: boolean;
  addedon?: boolean;
  placed?: number | null;
  bountyamount?: number;
  bountyclaimedbyuserid?: string | null;
  bountyclaimedbyname?: string | null;
  bountyclaimedat?: string | null;
  tablenumber?: number | null;
  seat?: number | null;
}

export interface KnockoutOption {
  userid: string;
  emailaddress: string;
  displayname?: string;
  awardedcoins?: PlayerCoinBadge[];
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
  status?: 'pending' | 'approved' | 'rejected';
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
