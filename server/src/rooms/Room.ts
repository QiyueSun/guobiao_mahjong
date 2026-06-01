import { PlayerId, PlayerState, Wind } from '../types';
import { GameEngine, GameEvent } from '../game/GameEngine';
import { logger } from '../logger';

export type RoomPhase = 'waiting' | 'playing' | 'settled';

const DISCONNECT_GRACE_MS =
  parseInt(process.env.DISCONNECT_GRACE_SECONDS ?? '60', 10) * 1000;

export class Room {
  readonly code: string;
  phase: RoomPhase = 'waiting';
  playerIds: PlayerId[] = [];
  hostId: PlayerId;
  nicknames: Record<PlayerId, string> = {};
  readySet = new Set<PlayerId>();
  randomSeats = false;
  createdAt = Date.now();

  engine: GameEngine | null = null;
  private disconnectTimers = new Map<PlayerId, ReturnType<typeof setTimeout>>();

  onEvent?: (e: GameEvent) => void;

  constructor(code: string, hostId: PlayerId, nickname: string) {
    this.code = code;
    this.hostId = hostId;
    this.addPlayer(hostId, nickname);
  }

  addPlayer(playerId: PlayerId, nickname: string): void {
    if (!this.playerIds.includes(playerId)) {
      this.playerIds.push(playerId);
    }
    this.nicknames[playerId] = nickname;
  }

  removePlayer(playerId: PlayerId): void {
    this.playerIds = this.playerIds.filter(p => p !== playerId);
    this.readySet.delete(playerId);
    if (this.hostId === playerId && this.playerIds.length > 0) {
      this.hostId = this.playerIds[0];
    }
  }

  setReady(playerId: PlayerId, ready: boolean): void {
    if (ready) this.readySet.add(playerId);
    else this.readySet.delete(playerId);
  }

  allReady(): boolean {
    return this.playerIds.length === 4 &&
      this.playerIds.every(p => this.readySet.has(p));
  }

  startGame(): void {
    if (this.playerIds.length < 4) throw new Error('需要4名玩家');
    if (!this.allReady()) throw new Error('所有玩家需要准备');

    this.engine = new GameEngine(
      this.playerIds,
      this.nicknames,
      this.code,
      (e) => this.onEvent?.(e),
      this.randomSeats,
    );
    this.phase = 'playing';
  }

  async beginRound(): Promise<void> {
    if (!this.engine) throw new Error('游戏未初始化');
    await this.engine.startRound();
  }

  handleDisconnect(playerId: PlayerId): void {
    this.engine?.setPlayerConnected(playerId, false);

    // Grace period: if not reconnected within DISCONNECT_GRACE_MS, set AI
    const t = setTimeout(() => {
      logger.info({ playerId, room: this.code }, 'Player timeout, enabling AI');
      this.engine?.setPlayerAI(playerId);
    }, DISCONNECT_GRACE_MS);
    this.disconnectTimers.set(playerId, t);
  }

  handleReconnect(playerId: PlayerId): void {
    const t = this.disconnectTimers.get(playerId);
    if (t) { clearTimeout(t); this.disconnectTimers.delete(playerId); }
    this.engine?.setPlayerConnected(playerId, true);
  }

  get isFull(): boolean {
    return this.playerIds.length >= 4;
  }

  get isEmpty(): boolean {
    return this.playerIds.length === 0;
  }
}
