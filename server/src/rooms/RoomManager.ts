import { Room } from './Room';
import { PlayerId } from '../types';
import { logger } from '../logger';

const ROOM_IDLE_TIMEOUT_MS =
  parseInt(process.env.ROOM_IDLE_TIMEOUT_SECONDS ?? '1800', 10) * 1000;

class RoomManager {
  private rooms = new Map<string, Room>();
  private idleTimers = new Map<string, ReturnType<typeof setTimeout>>();

  createRoom(hostId: PlayerId, nickname: string): Room {
    const code = generateCode();
    const room = new Room(code, hostId, nickname);
    this.rooms.set(code, room);
    this.resetIdleTimer(code);
    logger.info({ code, hostId }, 'Room created');
    return room;
  }

  getRoom(code: string): Room | undefined {
    return this.rooms.get(code.toUpperCase());
  }

  joinRoom(code: string, playerId: PlayerId, nickname: string): Room {
    const room = this.rooms.get(code.toUpperCase());
    if (!room) throw new Error('ROOM_NOT_FOUND');
    if (room.isFull && !room.playerIds.includes(playerId)) throw new Error('ROOM_FULL');
    if (room.phase === 'playing' && !room.playerIds.includes(playerId)) throw new Error('GAME_IN_PROGRESS');

    room.addPlayer(playerId, nickname);
    room.handleReconnect(playerId);
    this.resetIdleTimer(code.toUpperCase());
    return room;
  }

  leaveRoom(code: string, playerId: PlayerId): void {
    const room = this.rooms.get(code.toUpperCase());
    if (!room) return;

    if (room.phase === 'playing') {
      room.handleDisconnect(playerId);
    } else {
      room.removePlayer(playerId);
      if (room.isEmpty) {
        this.closeRoom(code.toUpperCase());
      }
    }
  }

  closeRoom(code: string): void {
    this.rooms.delete(code);
    const t = this.idleTimers.get(code);
    if (t) { clearTimeout(t); this.idleTimers.delete(code); }
    logger.info({ code }, 'Room closed');
  }

  private resetIdleTimer(code: string): void {
    const existing = this.idleTimers.get(code);
    if (existing) clearTimeout(existing);

    const t = setTimeout(() => {
      this.closeRoom(code);
    }, ROOM_IDLE_TIMEOUT_MS);
    this.idleTimers.set(code, t);
  }

  getRoomByPlayer(playerId: PlayerId): Room | undefined {
    for (const room of this.rooms.values()) {
      if (room.playerIds.includes(playerId)) return room;
    }
    return undefined;
  }

  activeRoomCount(): number { return this.rooms.size; }
  activePlayerCount(): number {
    let count = 0;
    for (const r of this.rooms.values()) count += r.playerIds.length;
    return count;
  }
}

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code: string;
  do {
    code = Array.from({ length: 6 }, () =>
      chars[Math.floor(Math.random() * chars.length)]
    ).join('');
  } while (false);
  return code;
}

export const roomManager = new RoomManager();
