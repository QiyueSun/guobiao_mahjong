import { create } from 'zustand';
import {
  GameState, RoomState, DrawTileData, ActionBroadcastData,
  CanActData, FanResult, SettlementData, Tile, TenpaiTileInfo, AuthUser,
} from '../types';

interface GameStore {
  // Connection
  playerId: string | null;
  connected: boolean;

  // Auth
  authUser: AuthUser | null;

  // Room
  roomState: RoomState | null;
  gameStarted: boolean;

  // Game
  gameState: GameState | null;
  myHand: Tile[];
  pendingDraw: DrawTileData | null;
  canActData: CanActData | null;
  fanHint: FanResult | null;
  settlement: SettlementData | null;

  // Timers
  turnTimer: { playerId: string; timeoutAt: number } | null;

  // Next-round ready
  nextReadyCount: number;

  // Tenpai info (on-demand, populated after game:requestTenpaiInfo)
  tenpaiInfo: TenpaiTileInfo[] | null;

  // UI
  selectedTileId: string | null;
  animatingTiles: Set<string>;

  // Actions
  setPlayerId: (id: string) => void;
  setConnected: (v: boolean) => void;
  setAuthUser: (user: AuthUser | null) => void;
  setRoomState: (r: RoomState) => void;
  setGameStarted: (v: boolean) => void;
  applyStateUpdate: (state: GameState) => void;
  applyDrawTile: (data: DrawTileData) => void;
  applyActionBroadcast: (data: ActionBroadcastData) => void;
  setCanAct: (data: CanActData | null) => void;
  setFanHint: (data: FanResult | null) => void;
  setTenpaiInfo: (info: TenpaiTileInfo[] | null) => void;
  setTurnTimer: (data: { playerId: string; timeoutAt: number } | null) => void;
  applySettlement: (data: SettlementData) => void;
  setNextReadyCount: (n: number) => void;
  selectTile: (id: string | null) => void;
  clearSettlement: () => void;
  reset: () => void;
}

export const useGameStore = create<GameStore>((set, get) => ({
  playerId: null,
  connected: false,
  authUser: null,
  roomState: null,
  gameStarted: false,
  gameState: null,
  myHand: [],
  pendingDraw: null,
  canActData: null,
  fanHint: null,
  tenpaiInfo: null,
  settlement: null,
  turnTimer: null,
  nextReadyCount: 0,
  selectedTileId: null,
  animatingTiles: new Set(),

  setPlayerId: (id) => set({ playerId: id }),
  setConnected: (v) => set({ connected: v }),
  setAuthUser: (user) => set({ authUser: user }),
  setRoomState: (r) => set({ roomState: r }),
  setGameStarted: (v) => set({ gameStarted: v }),

  applyStateUpdate: (state) => {
    const { playerId, gameState: prev } = get();
    const myPlayer = playerId ? state.players[playerId] : null;
    // Auto-dismiss settlement overlay when the next round's dealing phase begins
    const settlementCleared = prev?.phase === 'settled' && state.phase !== 'settled'
      ? { settlement: null }
      : {};
    set({
      gameState: state,
      myHand: myPlayer?.hand ?? [],
      canActData: null,  // will be set by canAct event if applicable
      turnTimer: null,   // will be reset by the next drawTile/canAct broadcast
      ...settlementCleared,
    });
  },

  applyDrawTile: (data) => {
    set((s) => ({
      myHand: [...(s.gameState?.players[s.playerId ?? '']?.hand ?? [])],
      pendingDraw: data,
      fanHint: data.fanHint ?? null,
      tenpaiInfo: null,
      canActData: null,
    }));
  },

  applyActionBroadcast: (data) => {
    // Handled by stateUpdate mostly; this is for animations
    set({ pendingDraw: null });
  },

  setCanAct: (data) => set({ canActData: data }),
  setFanHint: (hint) => set({ fanHint: hint }),
  setTenpaiInfo: (info) => set({ tenpaiInfo: info }),
  setTurnTimer: (data) => set({ turnTimer: data }),

  applySettlement: (data) => {
    set({ settlement: data, canActData: null, fanHint: null, tenpaiInfo: null, turnTimer: null, nextReadyCount: 0 });
  },

  setNextReadyCount: (n) => set({ nextReadyCount: n }),

  selectTile: (id) => set({ selectedTileId: id }),

  clearSettlement: () => set({ settlement: null }),

  reset: () => set({
    gameState: null,
    myHand: [],
    pendingDraw: null,
    canActData: null,
    fanHint: null,
    tenpaiInfo: null,
    settlement: null,
    turnTimer: null,
    selectedTileId: null,
    gameStarted: false,
  }),
}));
