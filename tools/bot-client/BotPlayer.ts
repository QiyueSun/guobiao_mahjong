import { io, Socket } from 'socket.io-client';

interface Tile { id: string; suit: string; value: number; }
interface CanActData {
  actions: string[];
  chiOptions?: Array<{ combination: [string, string]; display: string }>;
  timeoutAt: number;
}
interface DrawTileData { tile: Tile; canWin: boolean; }
interface GameState {
  phase: string;
  currentTurn: string;
  players: Record<string, { hand: Tile[] }>;
}
interface RoomPlayer { id: string; isReady: boolean; isHost: boolean; }
interface RoomState { code: string; hostId: string; players: RoomPlayer[]; phase: string; }
interface SettlementData { winner: string | null; scores: Record<string, { delta: number; after: number }>; }

export interface BotConfig {
  serverUrl: string;
  nickname: string;
  delayMs?: number;
  onLog?: (msg: string) => void;
}

export class BotPlayer {
  private socket: Socket;
  private playerId = '';
  private roomCode = '';
  private isHost = false;
  private hand: Tile[] = [];
  private pendingDraw: Tile | null = null;
  private gameStarted = false;
  private discardPending = false;
  private readonly delayMs: number;
  private readonly nickname: string;
  private readonly log: (msg: string) => void;
  private roundsPlayed = 0;
  readonly maxRounds: number;

  constructor(config: BotConfig, maxRounds = 1) {
    this.nickname = config.nickname;
    this.delayMs = config.delayMs ?? 600;
    this.maxRounds = maxRounds;
    this.log = config.onLog ?? ((m) => console.log(`[${this.nickname}] ${m}`));

    this.socket = io(config.serverUrl, {
      transports: ['websocket'],
      reconnection: false,
    });

    this.socket.on('session:init', ({ playerId }: { playerId: string }) => {
      this.playerId = playerId;
    });

    this.socket.on('room:updated', (state: RoomState) => {
      this.roomCode = state.code;
      this.isHost = state.hostId === this.playerId;

      if (state.phase === 'waiting') {
        const me = state.players?.find(p => p.id === this.playerId);
        if (me && !me.isReady) {
          this.delay(() => this.socket.emit('room:ready'));
        }
        // Host starts game once all 4 players are ready — only once
        if (this.isHost && !this.gameStarted && state.players?.length === 4 && state.players.every(p => p.isReady)) {
          this.gameStarted = true;
          this.delay(() => {
            this.log('所有玩家准备就绪，开始游戏！');
            this.socket.emit('room:start');
          }, 300);
        }
      } else if (state.phase === 'playing') {
        this.gameStarted = true;
      }
    });

    this.socket.on('game:stateUpdate', (state: GameState) => {
      if (!state.players[this.playerId]) return;
      const hand = state.players[this.playerId].hand;
      if (hand.length > 0) this.hand = hand;
    });

    this.socket.on('game:drawTile', ({ tile, canWin }: DrawTileData) => {
      this.pendingDraw = tile;
      if (canWin) {
        this.log(`可以胡牌！`);
        this.discardPending = false;
        this.delay(() => this.socket.emit('game:win'));
        return;
      }
      // Deduplicate: ignore if a discard is already scheduled
      if (this.discardPending) return;
      this.discardPending = true;
      this.delay(() => {
        this.discardPending = false;
        this.log(`打出 ${tile.suit}${tile.value}`);
        this.socket.emit('game:discard', { tileId: tile.id });
        this.pendingDraw = null;
      });
    });

    this.socket.on('game:canAct', (data: CanActData) => {
      const { actions } = data;
      if (actions.includes('win')) {
        this.log('荣和！');
        this.delay(() => this.socket.emit('game:win'));
      } else {
        this.delay(() => this.socket.emit('game:pass'));
      }
    });

    this.socket.on('game:settled', (data: SettlementData) => {
      const myScore = data.scores[this.playerId];
      const delta = myScore ? (myScore.delta >= 0 ? `+${myScore.delta}` : `${myScore.delta}`) : '?';
      this.log(`本局结束 ${delta}分 (合计${myScore?.after ?? '?'}分)`);

      this.roundsPlayed++;
      if (this.roundsPlayed < this.maxRounds) {
        // Signal ready for next round — server advances only when all 4 players confirm
        this.delay(() => this.socket.emit('room:next_ready'), 1500);
      } else {
        this.log('已完成所有局数，退出。');
        this.socket.disconnect();
      }
    });

    this.socket.on('game:error', ({ code, message }: { code: string; message: string }) => {
      this.log(`错误: ${code} — ${message}`);
    });

    this.socket.on('disconnect', () => {
      this.log('已断开连接');
    });
  }

  createRoom(): void {
    this.socket.emit('room:create', { nickname: this.nickname });
    this.log('创建房间...');
  }

  joinRoom(code: string): void {
    this.socket.emit('room:join', { roomCode: code, nickname: this.nickname });
    this.log(`加入房间 ${code}...`);
  }

  getRoomCode(): string { return this.roomCode; }
  getPlayerId(): string { return this.playerId; }

  waitForRoomCode(): Promise<string> {
    return new Promise((resolve) => {
      const check = setInterval(() => {
        if (this.roomCode) { clearInterval(check); resolve(this.roomCode); }
      }, 50);
    });
  }

  waitForDisconnect(): Promise<void> {
    return new Promise((resolve) => {
      this.socket.on('disconnect', () => resolve());
      const check = setInterval(() => {
        if (!this.socket.connected) { clearInterval(check); resolve(); }
      }, 200);
    });
  }

  private delay(fn: () => void, ms?: number): void {
    setTimeout(fn, ms ?? this.delayMs);
  }
}
