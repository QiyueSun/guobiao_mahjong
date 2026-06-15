export type Suit = 'man' | 'pin' | 'sou' | 'wind' | 'dragon' | 'flower';
export type Wind = 'east' | 'south' | 'west' | 'north';
export type PlayerId = string;

export interface Tile {
  id: string;
  suit: Suit;
  value: number;
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
  isReady: boolean;
  disconnectedAt?: number;
}

export type GamePhase = 'waiting' | 'dealing' | 'player_turn' | 'waiting_response' | 'settled';

export interface PendingAction {
  playerId: string;
  availableActions: Array<'chi' | 'pong' | 'kong' | 'win' | 'pass'>;
  chiOptions?: ChiOption[];
  deadline: number;
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
  wall: { remaining: number };
  players: Record<PlayerId, PlayerState>;
  playerOrder: PlayerId[];
  lastDiscard: { playerId: PlayerId; tile: Tile } | null;
  pendingActions: PendingAction[];
  isLastTile: boolean;
}

export interface FanEntry {
  name: string;
  value: number;
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

export interface RoomPlayer {
  id: string;
  nickname: string;
  isReady: boolean;
  isHost: boolean;
}

export interface RoomSettings {
  totalRounds: number;
  actionTimeoutSeconds: number;
  botCount: number;
}

export interface RoomState {
  code: string;
  phase: 'waiting' | 'playing' | 'settled';
  hostId: string;
  players: RoomPlayer[];
  randomSeats: boolean;
  settings: RoomSettings;
}

export interface DrawTileData {
  tile: Tile;
  isFlower: boolean;
  flowerChain: Tile[];
  wallRemaining: number;
  canWin: boolean;
  fanHint?: FanResult;
}

export interface ActionBroadcastData {
  playerId: string;
  action: string;
  tile?: Tile;
  meld?: Meld;
  flowerRevealed?: Tile[];
}

export interface CanActData {
  actions: Array<'chi' | 'pong' | 'kong' | 'win' | 'pass'>;
  chiOptions?: ChiOption[];
  timeoutAt: number;
}

export interface TenpaiTileInfo {
  tile: Tile;
  fanTotal: number;
  remaining: number;
}

export interface AuthUser {
  id: string;
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
}

export interface GameHistoryEntry {
  gameId: string;
  roomCode: string;
  startedAt: string;
  endedAt: string;
  totalRoundsPlayed: number;
  maxRounds: number;
  finalScore: number;
  rank: number;
}
