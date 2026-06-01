import { Server, Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import { roomManager } from '../rooms/RoomManager';
import { GameEvent } from '../game/GameEngine';
import { GameState, PlayerState, SettlementData } from '../types';
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

    // ── Room events ─────────────────────────────────────────────────────────

    socket.on('room:create', (payload: { nickname: string }) => {
      try {
        const nickname = sanitizeNickname(payload?.nickname);
        sessions[socket.id].nickname = nickname;
        sessions[socket.id].playerId = playerId;

        const room = roomManager.createRoom(playerId, nickname);
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

      // Advance to next round if available
      // (settlement data stored in last event)
      try {
        await room.beginRound();
      } catch (e: unknown) {
        socket.emit('game:error', { code: 'ROUND_FAILED', message: String(e) });
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
            room.removePlayer(playerId);
            if (room.isEmpty) {
              roomManager.closeRoom(roomCode);
            } else {
              broadcastRoomState(io, roomCode);
            }
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

function buildShareUrl(roomCode: string): string {
  const base = process.env.SHARE_BASE_URL ?? `http://localhost:${process.env.PORT ?? 5173}`;
  return `${base}/room/${roomCode}`;
}

function isValidUUID(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);
}
