import { Server, Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import { roomManager } from '../rooms/RoomManager';
import { GameEvent } from '../game/GameEngine';
import { GameState, PlayerState, RoomSettings, SettlementData } from '../types';
import { ALLOWED_TOTAL_ROUNDS, ALLOWED_ACTION_TIMEOUT_SECONDS, ALLOWED_BOT_COUNTS } from '../rooms/roomSettings';
import { recordCompletedGame } from '../db/gameHistory';
import { logger } from '../logger';

interface SessionMap {
  [socketId: string]: { playerId: string; roomCode: string | null; nickname: string };
}

const sessions: SessionMap = {};

export function setupSocketHandler(io: Server): void {
  io.on('connection', (socket: Socket) => {
    logger.info({ socketId: socket.id }, 'Client connected');

    // ── Session init ────────────────────────────────────────────────────────

    const existingPlayerId = (socket.handshake.auth as Record<string, string>).playerId;
    const playerId = existingPlayerId && isValidUUID(existingPlayerId)
      ? existingPlayerId
      : uuidv4();

    sessions[socket.id] = { playerId, roomCode: null, nickname: '' };

    socket.emit('session:init', {
      playerId,
      reconnected: !!existingPlayerId,
    });

    // Auto-restore room session on reconnect
    const existingRoom = roomManager.getRoomByPlayer(playerId);
    if (existingRoom) {
      existingRoom.cancelWaitingDisconnect(playerId);
      existingRoom.handleReconnect(playerId);
      sessions[socket.id].roomCode = existingRoom.code;
      socket.join(existingRoom.code);
      socket.emit('room:updated', {
        code: existingRoom.code,
        phase: existingRoom.phase,
        hostId: existingRoom.hostId,
        players: existingRoom.playerIds.map(pid => ({
          id: pid,
          nickname: existingRoom.nicknames[pid],
          isReady: existingRoom.readySet.has(pid),
          isHost: pid === existingRoom.hostId,
        })),
        randomSeats: existingRoom.randomSeats,
        settings: existingRoom.settings,
      });
      if (existingRoom.engine) {
        emitGameState(socket, existingRoom.engine.getState(), playerId);
        socket.emit('game:started');
        const timer = existingRoom.engine.getCurrentTimer();
        if (timer) socket.emit('game:turnTimer', timer);
        // Re-send pending chi/pong/kong/win/pass options if this player has an outstanding decision
        const pending = existingRoom.engine.getState().pendingActions
          .find(a => a.playerId === playerId && !a.responded);
        if (pending) {
          socket.emit('game:canAct', {
            actions: pending.availableActions,
            chiOptions: pending.chiOptions,
            timeoutAt: pending.deadline,
          });
        }
        // Re-send settlement overlay (round end / liuju) if the round just ended
        if (existingRoom.engine.getState().phase === 'settled') {
          const settlement = existingRoom.engine.getLastSettlement();
          if (settlement) socket.emit('game:settled', settlement);
        }
      }
    }

    // ── Room events ─────────────────────────────────────────────────────────

    socket.on('room:create', (payload: { nickname: string; settings?: Partial<RoomSettings> }) => {
      try {
        const nickname = sanitizeNickname(payload?.nickname);
        sessions[socket.id].nickname = nickname;
        sessions[socket.id].playerId = playerId;

        const room = roomManager.createRoom(playerId, nickname, sanitizeSettings(payload?.settings));
        sessions[socket.id].roomCode = room.code;

        socket.join(room.code);
        socket.emit('room:created', {
          roomCode: room.code,
          shareUrl: buildShareUrl(room.code),
        });
        broadcastRoomState(io, room.code);
      } catch (e: unknown) {
        socket.emit('game:error', { code: 'CREATE_FAILED', message: String(e) });
      }
    });

    socket.on('room:join', (payload: { roomCode: string; nickname: string }) => {
      try {
        const code = (payload?.roomCode ?? '').toUpperCase();
        const nickname = sanitizeNickname(payload?.nickname);
        sessions[socket.id].nickname = nickname;

        const room = roomManager.joinRoom(code, playerId, nickname);
        sessions[socket.id].roomCode = room.code;

        socket.join(room.code);
        socket.emit('room:joined', { roomCode: room.code });
        broadcastRoomState(io, room.code);

        // If game in progress, send current state
        if (room.engine) {
          emitGameState(socket, room.engine.getState(), playerId);
          const timer = room.engine.getCurrentTimer();
          if (timer) socket.emit('game:turnTimer', timer);
        }
      } catch (e: unknown) {
        const msg = String(e);
        socket.emit('game:error', {
          code: msg.includes('ROOM_NOT_FOUND') ? 'ROOM_NOT_FOUND'
            : msg.includes('ROOM_FULL') ? 'ROOM_FULL'
            : 'JOIN_FAILED',
          message: msg,
        });
      }
    });

    socket.on('room:ready', () => {
      const { roomCode } = sessions[socket.id];
      if (!roomCode) return;
      const room = roomManager.getRoom(roomCode);
      if (!room) return;
      room.setReady(playerId, true);
      broadcastRoomState(io, roomCode);
    });

    socket.on('room:unready', () => {
      const { roomCode } = sessions[socket.id];
      if (!roomCode) return;
      const room = roomManager.getRoom(roomCode);
      if (!room) return;
      room.setReady(playerId, false);
      broadcastRoomState(io, roomCode);
    });

    socket.on('room:start', async () => {
      const { roomCode } = sessions[socket.id];
      if (!roomCode) return;
      const room = roomManager.getRoom(roomCode);
      if (!room) return;
      if (room.hostId !== playerId) {
        socket.emit('game:error', { code: 'NOT_HOST', message: '只有房主可以开始游戏' });
        return;
      }

      try {
        room.onEvent = (e: GameEvent) => handleGameEvent(io, roomCode, room.playerIds, e);
        room.startGame();
        io.to(roomCode).emit('game:started');
        broadcastRoomState(io, roomCode);
        await room.beginRound();
      } catch (e: unknown) {
        socket.emit('game:error', { code: 'START_FAILED', message: String(e) });
      }
    });

    socket.on('room:next', async () => {
      const { roomCode } = sessions[socket.id];
      if (!roomCode) return;
      const room = roomManager.getRoom(roomCode);
      if (!room || !room.engine) return;
      if (room.hostId !== playerId) return;

      const state = room.engine.getState();
      if (state.phase !== 'settled') return;

      try {
        await room.beginRound();
      } catch (e: unknown) {
        socket.emit('game:error', { code: 'ROUND_FAILED', message: String(e) });
      }
    });

    socket.on('room:next_ready', async () => {
      const { roomCode } = sessions[socket.id];
      if (!roomCode) return;
      const room = roomManager.getRoom(roomCode);
      if (!room || !room.engine) return;

      const state = room.engine.getState();
      if (state.phase !== 'settled') return;

      const count = room.markNextReady(playerId);
      io.to(roomCode).emit('room:next_ready_update', {
        count,
        total: room.playerIds.length,
      });

      if (room.allNextReady()) {
        try {
          await room.beginRound();
        } catch (e: unknown) {
          socket.emit('game:error', { code: 'ROUND_FAILED', message: String(e) });
        }
      }
    });

    socket.on('room:random_seats', (payload: { enabled: boolean }) => {
      const { roomCode } = sessions[socket.id];
      if (!roomCode) return;
      const room = roomManager.getRoom(roomCode);
      if (!room || room.hostId !== playerId) return;
      room.randomSeats = !!payload?.enabled;
      broadcastRoomState(io, roomCode);
    });

    socket.on('room:update_settings', (payload: Partial<RoomSettings>) => {
      const { roomCode } = sessions[socket.id];
      if (!roomCode) return;
      const room = roomManager.getRoom(roomCode);
      if (!room || room.hostId !== playerId) return;
      if (room.phase !== 'waiting') return;
      room.updateSettings(sanitizeSettings(payload));
      broadcastRoomState(io, roomCode);
    });

    // ── Game action events ──────────────────────────────────────────────────

    socket.on('game:discard', async (payload: { tileId: string }) => {
      await withGame(socket, sessions[socket.id].roomCode, async (engine) => {
        await engine.handleDiscard(playerId, payload?.tileId);
      });
    });

    socket.on('game:chi', async (payload: { tileId: string; combination: [string, string] }) => {
      await withGame(socket, sessions[socket.id].roomCode, async (engine) => {
        await engine.handleChi(playerId, payload?.tileId, payload?.combination);
      });
    });

    socket.on('game:pong', async () => {
      await withGame(socket, sessions[socket.id].roomCode, async (engine) => {
        await engine.handlePong(playerId);
      });
    });

    socket.on('game:kong', async (payload: { tileId: string; type: string }) => {
      await withGame(socket, sessions[socket.id].roomCode, async (engine) => {
        await engine.handleKong(playerId, payload?.tileId, payload?.type);
      });
    });

    socket.on('game:win', async () => {
      await withGame(socket, sessions[socket.id].roomCode, async (engine) => {
        await engine.handleWin(playerId);
      });
    });

    socket.on('game:pass', async () => {
      await withGame(socket, sessions[socket.id].roomCode, async (engine) => {
        await engine.handlePass(playerId);
      });
    });

    socket.on('game:extend_timer', () => {
      const { roomCode } = sessions[socket.id];
      if (!roomCode) return;
      const room = roomManager.getRoom(roomCode);
      if (!room?.engine) return;
      const timer = room.engine.extendCurrentTimer(10_000);
      if (timer) io.to(roomCode).emit('game:turnTimer', timer);
    });

    socket.on('game:requestTenpaiInfo', () => {
      const { roomCode } = sessions[socket.id];
      if (!roomCode) return;
      const room = roomManager.getRoom(roomCode);
      if (!room?.engine) return;
      const tiles = room.engine.computeTenpaiInfo(playerId);
      socket.emit('game:tenpaiInfo', { tiles });
    });

    // ── Disconnect ──────────────────────────────────────────────────────────

    socket.on('disconnect', () => {
      const { roomCode } = sessions[socket.id];
      logger.info({ socketId: socket.id, playerId, roomCode }, 'Client disconnected');

      if (roomCode) {
        const room = roomManager.getRoom(roomCode);
        if (room) {
          if (room.phase === 'playing') {
            room.handleDisconnect(playerId);
          } else {
            room.handleWaitingDisconnect(playerId, () => {
              room.removePlayer(playerId);
              if (room.isEmpty) {
                roomManager.closeRoom(roomCode);
              } else {
                broadcastRoomState(io, roomCode);
              }
            });
          }
        }
      }
      delete sessions[socket.id];
    });
  });
}

// ── Event broadcasting ────────────────────────────────────────────────────────

function handleGameEvent(
  io: Server,
  roomCode: string,
  playerIds: string[],
  event: GameEvent,
): void {
  const room = roomManager.getRoom(roomCode);
  if (!room?.engine) return;

  switch (event.type) {
    case 'stateUpdate': {
      const state = room.engine.getState();
      // Send individualized state to each player
      for (const pid of playerIds) {
        const socketId = findSocketId(io, pid);
        if (socketId) {
          const socket = io.sockets.sockets.get(socketId);
          if (socket) emitGameState(socket, state, pid);
        }
      }
      break;
    }

    case 'drawTile': {
      const socketId = findSocketId(io, event.playerId);
      if (socketId) {
        const socket = io.sockets.sockets.get(socketId);
        socket?.emit('game:drawTile', {
          tile: event.tile,
          isFlower: event.isFlower,
          flowerChain: event.flowerChain,
          wallRemaining: event.wallRemaining,
          canWin: event.canWin,
          fanHint: event.fanHint,
        });
      }
      // Broadcast timer so all players see whose turn it is and how long they have
      io.to(roomCode).emit('game:turnTimer', {
        playerId: event.playerId,
        timeoutAt: event.timeoutAt,
      });
      break;
    }

    case 'action':
      io.to(roomCode).emit('game:action', {
        playerId: event.playerId,
        action: event.action,
        tile: event.tile,
        meld: event.meld,
        flowerRevealed: event.flowerRevealed,
      });
      // Chi/pong start a new discard timer for the claiming player
      if (event.timeoutAt !== undefined) {
        io.to(roomCode).emit('game:turnTimer', {
          playerId: event.playerId,
          timeoutAt: event.timeoutAt,
        });
      }
      break;

    case 'canAct': {
      const socketId = findSocketId(io, event.playerId);
      if (socketId) {
        const socket = io.sockets.sockets.get(socketId);
        socket?.emit('game:canAct', {
          actions: event.actions,
          chiOptions: event.chiOptions,
          timeoutAt: event.timeoutAt,
        });
      }
      // Broadcast timer to all players so everyone can show countdown
      io.to(roomCode).emit('game:turnTimer', {
        playerId: event.playerId,
        timeoutAt: event.timeoutAt,
      });
      break;
    }

    case 'fanHint': {
      const socketId = findSocketId(io, event.playerId);
      if (socketId) {
        const socket = io.sockets.sockets.get(socketId);
        socket?.emit('game:fanHint', { fanHint: event.fanHint });
      }
      break;
    }

    case 'settled':
      io.to(roomCode).emit('game:settled', event.data);
      if (event.data.nextRound === null) {
        recordCompletedGame(room, room.engine.getState(), event.data)
          .catch((err) => logger.error({ err, roomCode }, 'Failed to record game history'));
      }
      break;
  }
}

function emitGameState(socket: Socket, state: GameState, forPlayerId: string): void {
  // Mask other players' hands
  const masked: GameState = {
    ...state,
    players: Object.fromEntries(
      Object.entries(state.players).map(([pid, p]) => [
        pid,
        pid === forPlayerId
          ? p
          : { ...p, hand: [] },
      ])
    ),
  };
  socket.emit('game:stateUpdate', masked);
}

function broadcastRoomState(io: Server, roomCode: string): void {
  const room = roomManager.getRoom(roomCode);
  if (!room) return;

  io.to(roomCode).emit('room:updated', {
    code: room.code,
    phase: room.phase,
    hostId: room.hostId,
    players: room.playerIds.map(pid => ({
      id: pid,
      nickname: room.nicknames[pid],
      isReady: room.readySet.has(pid),
      isHost: pid === room.hostId,
    })),
    randomSeats: room.randomSeats,
    settings: room.settings,
  });
}

// ── Utilities ─────────────────────────────────────────────────────────────────

async function withGame(
  socket: Socket,
  roomCode: string | null,
  fn: (engine: import('../game/GameEngine').GameEngine) => Promise<void>,
): Promise<void> {
  if (!roomCode) return;
  const room = roomManager.getRoom(roomCode);
  if (!room?.engine) {
    socket.emit('game:error', { code: 'NO_GAME', message: '游戏未进行' });
    return;
  }
  try {
    await fn(room.engine);
  } catch (e: unknown) {
    const msg = String(e).replace('Error: ', '');
    socket.emit('game:error', { code: msg, message: msg });
  }
}

function findSocketId(io: Server, playerId: string): string | undefined {
  for (const [sid, session] of Object.entries(sessions)) {
    if (session.playerId === playerId) return sid;
  }
  return undefined;
}

function sanitizeNickname(name: unknown): string {
  if (typeof name !== 'string') return '玩家';
  return name.trim().slice(0, 8) || '玩家';
}

function sanitizeSettings(settings: Partial<RoomSettings> | undefined): Partial<RoomSettings> {
  const result: Partial<RoomSettings> = {};
  if (settings?.totalRounds !== undefined &&
      (ALLOWED_TOTAL_ROUNDS as readonly number[]).includes(settings.totalRounds)) {
    result.totalRounds = settings.totalRounds;
  }
  if (settings?.actionTimeoutSeconds !== undefined &&
      (ALLOWED_ACTION_TIMEOUT_SECONDS as readonly number[]).includes(settings.actionTimeoutSeconds)) {
    result.actionTimeoutSeconds = settings.actionTimeoutSeconds;
  }
  if (settings?.botCount !== undefined &&
      (ALLOWED_BOT_COUNTS as readonly number[]).includes(settings.botCount)) {
    result.botCount = settings.botCount;
  }
  return result;
}

function buildShareUrl(roomCode: string): string {
  const base = process.env.SHARE_BASE_URL ?? `http://localhost:${process.env.PORT ?? 5173}`;
  return `${base}/room/${roomCode}`;
}

function isValidUUID(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);
}
