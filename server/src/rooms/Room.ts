import { v4 as uuidv4 } from 'uuid';
import { PlayerId, PlayerState, RoomSettings, Wind } from '../types';
import { GameEngine, GameEvent } from '../game/GameEngine';
import { logger } from '../logger';
import { ALLOWED_TOTAL_ROUNDS, ALLOWED_ACTION_TIMEOUT_SECONDS, ALLOWED_BOT_COUNTS, DEFAULT_ROOM_SETTINGS } from './roomSettings';

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
  settings: RoomSettings = { ...DEFAULT_ROOM_SETTINGS };
  createdAt = Date.now();

  engine: GameEngine | null = null;
  botIds: PlayerId[] = [];
  leftPlayerIds = new Set<PlayerId>();
  nextReadySet = new Set<PlayerId>();
  private disconnectTimers = new Map<PlayerId, ReturnType<typeof setTimeout>>();
  private waitingDisconnectTimers = new Map<PlayerId, ReturnType<typeof setTimeout>>();

  onEvent?: (e: GameEvent) => void;

  constructor(code: string, hostId: PlayerId, nickname: string, settings?: Partial<RoomSettings>) {
    this.code = code;
    this.hostId = hostId;
    this.addPlayer(hostId, nickname);
    if (settings) this.updateSettings(settings);
  }

  updateSettings(settings: Partial<RoomSettings>): void {
    if (settings.totalRounds !== undefined &&
        (ALLOWED_TOTAL_ROUNDS as readonly number[]).includes(settings.totalRounds)) {
      this.settings.totalRounds = settings.totalRounds;
    }
    if (settings.actionTimeoutSeconds !== undefined &&
        (ALLOWED_ACTION_TIMEOUT_SECONDS as readonly number[]).includes(settings.actionTimeoutSeconds)) {
      this.settings.actionTimeoutSeconds = settings.actionTimeoutSeconds;
    }
    if (settings.botCount !== undefined &&
        (ALLOWED_BOT_COUNTS as readonly number[]).includes(settings.botCount) &&
        this.playerIds.length + settings.botCount <= 4) {
      this.settings.botCount = settings.botCount;
    }
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
    const humanSeats = 4 - this.settings.botCount;
    return this.playerIds.length === humanSeats &&
      this.playerIds.every(p => this.readySet.has(p));
  }

  startGame(): void {
    if (!this.allReady()) throw new Error('所有玩家需要准备');

    this.botIds = [];
    for (let i = 1; i <= this.settings.botCount; i++) {
      const botId = uuidv4();
      this.botIds.push(botId);
      this.playerIds.push(botId);
      this.nicknames[botId] = `电脑${i}`;
    }

    this.engine = new GameEngine(
      this.playerIds,
      this.nicknames,
      this.code,
      (e) => this.onEvent?.(e),
      this.randomSeats,
      this.settings,
    );
    for (const botId of this.botIds) {
      this.engine.setPlayerAI(botId);
    }
    this.phase = 'playing';
  }

  async beginRound(): Promise<void> {
    if (!this.engine) throw new Error('游戏未初始化');
    this.nextReadySet.clear();
    const settlement = this.engine.getLastSettlement();
    if (settlement?.nextRound) {
      this.engine.advanceToNextRound(settlement.nextRound);
    }
    await this.engine.startRound();
  }

  markNextReady(playerId: PlayerId): number {
    this.nextReadySet.add(playerId);
    return this.nextReadySet.size;
  }

  allNextReady(): boolean {
    return this.playerIds.length === 4 &&
      this.playerIds.every(p => this.botIds.includes(p) || this.leftPlayerIds.has(p) || this.nextReadySet.has(p));
  }

  // Permanently hand a player's seat over to AI control. The player may not
  // reconnect and retake their seat afterwards (see leftPlayerIds checks in
  // RoomManager.joinRoom and the connection auto-restore in SocketHandler).
  leaveGame(playerId: PlayerId): void {
    this.leftPlayerIds.add(playerId);
    const t = this.disconnectTimers.get(playerId);
    if (t) { clearTimeout(t); this.disconnectTimers.delete(playerId); }
    this.engine?.leaveAsAI(playerId);
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

  handleWaitingDisconnect(playerId: PlayerId, onTimeout: () => void): void {
    const t = setTimeout(onTimeout, 30_000);
    this.waitingDisconnectTimers.set(playerId, t);
  }

  cancelWaitingDisconnect(playerId: PlayerId): void {
    const t = this.waitingDisconnectTimers.get(playerId);
    if (t) { clearTimeout(t); this.waitingDisconnectTimers.delete(playerId); }
  }

  get isFull(): boolean {
    return this.playerIds.length >= 4 - this.settings.botCount;
  }

  get isEmpty(): boolean {
    return this.playerIds.length === 0;
  }
}
