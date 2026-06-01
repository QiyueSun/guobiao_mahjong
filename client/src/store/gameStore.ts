import { create } from 'zustand';
import {
  GameState, RoomState, DrawTileData, ActionBroadcastData,
  CanActData, FanResult, SettlementData, Tile,
} from '../types';

interface GameStore {
  // Connection
  playerId: string | null;
  connected: boolean;

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

  // UI
  selectedTileId: string | null;
  animatingTiles: Set<string>;

  // Actions
  setPlayerId: (id: string) => void;
  setConnected: (v: boolean) => void;
  setRoomState: (r: RoomState) => void;
  setGameStarted: (v: boolean) => void;
  applyStateUpdate: (state: GameState) => void;
  applyDrawTile: (data: DrawTileData) => void;
  applyActionBroadcast: (data: ActionBroadcastData) => void;
  setCanAct: (data: CanActData | null) => void;
  setFanHint: (data: FanResult | null) => void;
  applySettlement: (data: SettlementData) => void;
  selectTile: (id: string | null) => void;
  clearSettlement: () => void;
  reset: () => void;
}

export const useGameStore = create<GameStore>((set, get) => ({
  playerId: null,
  connected: false,
  roomState: null,
  gameStarted: false,
  gameState: null,
  myHand: [],
  pendingDraw: null,
  canActData: null,
  fanHint: null,
  settlement: null,
  selectedTileId: null,
  animatingTiles: new Set(),

  setPlayerId: (id) => set({ playerId: id }),
  setConnected: (v) => set({ connected: v }),
  setRoomState: (r) => set({ roomState: r }),
  setGameStarted: (v) => set({ gameStarted: v }),

  applyStateUpdate: (state) => {
    const { playerId } = get();
    const myPlayer = playerId ? state.players[playerId] : null;
    set({
      gameState: state,
      myHand: myPlayer?.hand ?? [],
      canActData: null, // will be set by canAct event if applicable
    });
  },

  applyDrawTile: (data) => {
    set((s) => ({
      myHand: [...(s.gameState?.players[s.playerId ?? '']?.hand ?? [])],
      pendingDraw: data,
      fanHint: data.fanHint ?? null,
      canActData: null,
    }));
  },

  applyActionBroadcast: (data) => {
    // Handled by stateUpdate mostly; this is for animations
    set({ pendingDraw: null });
  },

  setCanAct: (data) => set({ canActData: data }),
  setFanHint: (hint) => set({ fanHint: hint }),

  applySettlement: (data) => {
    set({ settlement: data, canActData: null, fanHint: null });
  },

  selectTile: (id) => set({ selectedTileId: id }),

  clearSettlement: () => set({ settlement: null }),

  reset: () => set({
    gameState: null,
    myHand: [],
    pendingDraw: null,
    canActData: null,
    fanHint: null,
    settlement: null,
    selectedTileId: null,
    gameStarted: false,
  }),
}));
