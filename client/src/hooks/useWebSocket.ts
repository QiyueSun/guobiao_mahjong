import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { useGameStore } from '../store/gameStore';
import {
  GameState, RoomState, DrawTileData, ActionBroadcastData,
  CanActData, FanResult, SettlementData, TenpaiTileInfo, AuthUser,
} from '../types';
import { playDiscardSound, playMeldSound, playKongSound, playFlowerSound, playWinSound } from '../utils/sounds';

let socket: Socket | null = null;

export function useWebSocket() {
  const store = useGameStore();
  const seqRef = useRef(0);

  useEffect(() => {
    fetch('/api/v1/auth/me', { credentials: 'include' })
      .then(res => (res.ok ? res.json() : null))
      .then((data: { user: AuthUser } | null) => store.setAuthUser(data?.user ?? null))
      .catch(() => store.setAuthUser(null));
  }, []);

  useEffect(() => {
    if (socket) return;

    const savedPlayerId = localStorage.getItem('mj_playerId');

    socket = io({
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      auth: savedPlayerId ? { playerId: savedPlayerId } : {},
      reconnection: true,
      reconnectionDelay: 1000,
    });

    socket.on('connect', () => {
      store.setConnected(true);
    });

    socket.on('disconnect', () => {
      store.setConnected(false);
    });

    socket.on('session:init', (data: { playerId: string; reconnected: boolean }) => {
      store.setPlayerId(data.playerId);
      localStorage.setItem('mj_playerId', data.playerId);
    });

    socket.on('room:updated', (data: RoomState) => {
      store.setRoomState(data);
    });

    socket.on('game:started', () => {
      store.setGameStarted(true);
    });

    socket.on('game:stateUpdate', (state: GameState) => {
      store.applyStateUpdate(state);
    });

    socket.on('game:drawTile', (data: DrawTileData) => {
      store.applyDrawTile(data);
    });

    socket.on('game:action', (data: ActionBroadcastData) => {
      store.applyActionBroadcast(data);
      switch (data.action) {
        case 'discard': playDiscardSound(); break;
        case 'chi':
        case 'pong': playMeldSound(); break;
        case 'kong_open':
        case 'kong_closed':
        case 'kong_added': playKongSound(); break;
        case 'flower': playFlowerSound(); break;
      }
    });

    socket.on('game:canAct', (data: CanActData) => {
      store.setCanAct(data);
    });

    socket.on('game:fanHint', (data: { fanHint: FanResult }) => {
      store.setFanHint(data.fanHint);
    });

    socket.on('game:tenpaiInfo', (data: { tiles: TenpaiTileInfo[] }) => {
      store.setTenpaiInfo(data.tiles);
    });

    socket.on('game:settled', (data: SettlementData) => {
      store.applySettlement(data);
      if (data.winner) playWinSound();
    });

    socket.on('game:turnTimer', (data: { playerId: string; timeoutAt: number }) => {
      store.setTurnTimer(data);
    });

    socket.on('game:error', (err: { code: string; message: string }) => {
      console.error('Game error:', err);
    });

    socket.on('room:next_ready_update', (data: { count: number; total: number }) => {
      store.setNextReadyCount(data.count);
    });

    return () => {
      // Don't disconnect on unmount — keep session alive
    };
  }, []);

  const emit = useCallback((event: string, data?: object) => {
    if (!socket) return;
    socket.emit(event, { ...data, seq: ++seqRef.current });
  }, []);

  const emitRaw = useCallback((event: string, data?: object) => {
    socket?.emit(event, data);
  }, []);

  return { emit, emitRaw };
}
