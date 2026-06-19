export type Suit = 'man' | 'pin' | 'sou' | 'wind' | 'dragon' | 'flower';
export type Wind = 'east' | 'south' | 'west' | 'north';
export type PlayerId = string;

export interface Tile {
  id: string;
  suit: Suit;
  value: number;
  // man/pin/sou: 1-9
  // wind: 1=East 2=South 3=West 4=North
  // dragon: 1=中(Zhong) 2=发(Fa) 3=白(Bai)
  // flower: 1=春 2=夏 3=秋 4=冬 5=梅 6=兰 7=竹 8=菊
}

export type MeldType = 'chi' | 'pong' | 'kong_open' | 'kong_closed' | 'kong_added';

export interface Meld {
  type: MeldType;
  tiles: Tile[];
  claimedFrom?: 'left' | 'right' | 'opposite';
}

export interface PlayerState {
  id: PlayerId;
  nickname: string;
  position: Wind;
  hand: Tile[];
  handCount: number;
  melds: Meld[];
  discards: Tile[];
  flowers: Tile[];
  flowerBonus: number;
  score: number;
  isDealer: boolean;
  isAI: boolean;
  isTenpai: boolean;
  isConnected: boolean;
  disconnectedAt?: number;
  isReady: boolean;
}

export type GamePhase =
  | 'waiting'
  | 'dealing'
  | 'player_turn'
  | 'waiting_response'
  | 'settled';

export interface PendingAction {
  playerId: string;
  availableActions: Array<'chi' | 'pong' | 'kong' | 'win' | 'pass'>;
  chiOptions?: ChiOption[];
  deadline: number;
  responded: boolean;
  chosenAction?: string;
  payload?: unknown;
}

export interface ChiOption {
  combination: [string, string];
  display: string;
}

export interface GameState {
  phase: GamePhase;
  round: {
    wind: Wind;
    roundIndex: number;
    totalRound: number;
    maxRounds: number;
  };
  dealer: PlayerId;
  currentTurn: PlayerId;
  wall: {
    remaining: number;
  };
  players: Record<PlayerId, PlayerState>;
  playerOrder: PlayerId[];
  lastDiscard: { playerId: PlayerId; tile: Tile } | null;
  pendingActions: PendingAction[];
  isLastTile: boolean;
  lastDrawIsReplacement: boolean;
}

export interface RoomSettings {
  totalRounds: number;
  actionTimeoutSeconds: number;
  botCount: number;
}

export interface RoomMeta {
  code: string;
  phase: 'waiting' | 'playing' | 'settled';
  playerIds: PlayerId[];
  hostId: PlayerId;
  createdAt: number;
  randomSeats: boolean;
  settings: RoomSettings;
}

export interface SessionData {
  playerId: string;
  nickname: string;
  roomCode: string | null;
  lastSeen: number;
}

export interface FanEntry {
  name: string;
  value: number;
  count?: number;
}

export interface FlowerBonusEntry {
  tile: Tile;
  bonus: number;
}

export interface FanResult {
  fans: FanEntry[];
  flowerBonus: FlowerBonusEntry[];
  subtotal: number;
  flowerTotal: number;
  total: number;
  winType: 'self' | 'discard';
}

export interface SettlementData {
  winner: string | null;
  winType: 'self' | 'discard' | null;
  payer?: string;
  fanDetail: FanResult | null;
  scores: Record<string, { before: number; delta: number; after: number }>;
  hands: Record<string, Tile[]>;
  isTenpai: Record<string, boolean>;
  nextRound: {
    wind: Wind;
    roundIndex: number;
    totalRound: number;
    maxRounds: number;
    dealer: string;
  } | null;
}

export type ActionType = 'chi' | 'pong' | 'kong' | 'win' | 'pass' | 'discard';

export interface WinContext {
  hand: Tile[];
  melds: Meld[];
  winTile: Tile;
  winType: 'self' | 'discard';
  roundWind: Wind;
  seatWind: Wind;
  isLastTile: boolean;
  isAfterKong: boolean;
  isRobbingKong: boolean;
  flowers: Tile[];
  isTenpaiStart?: boolean;
  visibleTileCounts: Map<string, number>;
}

// Decomposed hand for fan checking
export interface Group {
  type: 'chow' | 'pung' | 'kong' | 'pair';
  tiles: Tile[];
  concealed: boolean;
}

export interface Decomposition {
  type: 'standard' | 'seven-pairs' | 'knitted' | 'combination-dragon';
  groups: Group[];
  allTiles: Tile[];
  concealedTiles: Tile[];
  melds: Meld[];
}
