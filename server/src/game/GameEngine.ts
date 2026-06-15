import { v4 as uuidv4 } from 'uuid';
import {
  GameState, PlayerState, Tile, Meld, Wind, PlayerId,
  PendingAction, SettlementData, FanResult, WinContext, RoomSettings,
} from '../types';
import { Deck } from './Deck';
import { calcScoreDeltas } from './ScoreCalculator';
import { calculateFan } from '../fan/FanCalculator';
import {
  isWinnable, getTenpaiTiles, isFlower, sortTiles, sameTile, tileKey,
} from '../fan/winChecker';
import { logger } from '../logger';
import { DEFAULT_ROOM_SETTINGS } from '../rooms/roomSettings';

const WINDS: Wind[] = ['east', 'south', 'west', 'north'];
const AI_THINK_MS = 700;

export type GameEvent =
  | { type: 'drawTile'; playerId: PlayerId; tile: Tile; isFlower: boolean; flowerChain: Tile[]; wallRemaining: number; canWin: boolean; fanHint?: FanResult; timeoutAt: number }
  | { type: 'action'; playerId: PlayerId; action: string; tile?: Tile; meld?: Meld; flowerRevealed?: Tile[]; timeoutAt?: number }
  | { type: 'canAct'; playerId: PlayerId; actions: PendingAction['availableActions']; chiOptions?: Array<{combination: [string,string]; display: string}>; timeoutAt: number }
  | { type: 'fanHint'; playerId: PlayerId; fanHint: FanResult }
  | { type: 'settled'; data: SettlementData }
  | { type: 'stateUpdate' };

export class GameEngine {
  private state: GameState;
  private deck!: Deck;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private currentTimer: { playerId: PlayerId; timeoutAt: number } | null = null;
  private timerCallback: (() => Promise<void>) | null = null;
  private onEvent: (e: GameEvent) => void;
  private roomCode: string;
  private actionTimeout: number;
  private maxRounds: number;
  private lastSettlement: SettlementData | null = null;

  constructor(
    playerIds: PlayerId[],
    nicknames: Record<PlayerId, string>,
    roomCode: string,
    onEvent: (e: GameEvent) => void,
    randomSeats = false,
    settings: RoomSettings = DEFAULT_ROOM_SETTINGS,
  ) {
    this.roomCode = roomCode;
    this.onEvent = onEvent;
    this.actionTimeout = settings.actionTimeoutSeconds * 1000;
    this.maxRounds = settings.totalRounds;

    const order = randomSeats ? shuffle([...playerIds]) : [...playerIds];
    const players: Record<PlayerId, PlayerState> = {};
    for (let i = 0; i < order.length; i++) {
      const pid = order[i];
      players[pid] = {
        id: pid,
        nickname: nicknames[pid] ?? '玩家',
        position: WINDS[i],
        hand: [],
        handCount: 0,
        melds: [],
        discards: [],
        flowers: [],
        flowerBonus: 0,
        score: 0,
        isDealer: i === 0,
        isAI: false,
        isTenpai: false,
        isConnected: true,
        isReady: true,
      };
    }

    this.state = {
      phase: 'dealing',
      round: { wind: 'east', roundIndex: 1, totalRound: 1, maxRounds: this.maxRounds },
      dealer: order[0],
      currentTurn: order[0],
      wall: { remaining: 0 },
      players,
      playerOrder: order,
      lastDiscard: null,
      pendingActions: [],
      isLastTile: false,
      lastDrawIsReplacement: false,
    };
  }

  getState(): GameState { return this.state; }

  // ── Start the game ──────────────────────────────────────────────────────────

  async startRound(): Promise<void> {
    this.deck = new Deck(true);
    this.state.phase = 'dealing';
    this.state.lastDiscard = null;
    this.state.pendingActions = [];
    this.state.isLastTile = false;
    this.lastSettlement = null;

    for (const pid of this.state.playerOrder) {
      const p = this.state.players[pid];
      p.hand = [];
      p.melds = [];
      p.discards = [];
      p.flowers = [];
      p.flowerBonus = 0;
      p.isTenpai = false;
    }

    // Deal 13 to each player, 14 to dealer
    for (let i = 0; i < 13; i++) {
      for (const pid of this.state.playerOrder) {
        const tile = this.deck.draw()!;
        if (isFlower(tile)) {
          this.state.players[pid].flowers.push(tile);
          this.replenishFlower(pid);
        } else {
          this.state.players[pid].hand.push(tile);
        }
      }
    }

    // Update hand counts
    for (const pid of this.state.playerOrder) {
      this.state.players[pid].handCount = this.state.players[pid].hand.length;
    }

    this.updateWallCounts();
    this.emit({ type: 'stateUpdate' });

    // Dealer draws 14th tile
    await this.drawTile(this.state.dealer, false);
  }

  // ── Draw tile ───────────────────────────────────────────────────────────────

  private async drawTile(playerId: PlayerId, isReplacement: boolean): Promise<void> {
    this.state.phase = 'player_turn';
    this.state.currentTurn = playerId;
    this.clearTimer();

    let tile = isReplacement ? this.deck.drawReplacement() : this.deck.draw();
    if (!tile) {
      await this.handleExhausted();
      return;
    }

    const flowerChain: Tile[] = [];

    // Handle flower chains
    while (isFlower(tile)) {
      flowerChain.push(tile);
      this.state.players[playerId].flowers.push(tile);
      this.updateFlowerBonus(playerId);
      tile = this.deck.drawReplacement();
      if (!tile) {
        await this.handleExhausted();
        return;
      }
    }

    this.state.players[playerId].hand.push(tile);
    this.state.players[playerId].handCount = this.state.players[playerId].hand.length;
    this.state.players[playerId].isTenpai = false;
    this.updateWallCounts();
    this.state.isLastTile = this.deck.isLastTile();
    this.state.lastDrawIsReplacement = isReplacement;

    const canWin = isWinnable(this.state.players[playerId].hand, this.state.players[playerId].melds);
    let fanHint: FanResult | undefined;

    if (canWin) {
      const ctx = this.buildWinContext(playerId, tile, 'self');
      fanHint = calculateFan(ctx);
    }

    const timeoutAt = Date.now() + this.actionTimeout;

    // stateUpdate first so clients clear stale timers before the new turnTimer arrives
    this.emit({ type: 'stateUpdate' });

    this.emit({
      type: 'drawTile',
      playerId,
      tile,
      isFlower: false,
      flowerChain,
      wallRemaining: this.deck.remaining,
      canWin,
      fanHint,
      timeoutAt,
    });

    if (flowerChain.length > 0) {
      this.emit({ type: 'action', playerId, action: 'flower', flowerRevealed: flowerChain });
    }

    // Set timeout for player action
    this.startTimer(this.actionTimeout, async () => {
      await this.autoDiscard(playerId);
    }, { playerId, timeoutAt });

    if (this.state.players[playerId].isAI) {
      this.scheduleAiAction(() => this.runAiTurn(playerId));
    }
  }

  // ── Player actions ──────────────────────────────────────────────────────────

  async handleDiscard(playerId: PlayerId, tileId: string): Promise<void> {
    if (this.state.phase !== 'player_turn' || this.state.currentTurn !== playerId) {
      throw new Error('NOT_YOUR_TURN');
    }
    this.clearTimer();

    const player = this.state.players[playerId];
    const idx = player.hand.findIndex(t => t.id === tileId);
    if (idx === -1) throw new Error('INVALID_TILE');

    const [tile] = player.hand.splice(idx, 1);
    player.handCount = player.hand.length;
    player.discards.push(tile);
    player.isTenpai = getTenpaiTiles(player.hand, player.melds).length > 0;
    this.state.lastDiscard = { playerId, tile };

    this.emit({ type: 'action', playerId, action: 'discard', tile });
    this.emit({ type: 'stateUpdate' });

    await this.broadcastDiscard(playerId, tile);
  }

  async handleChi(playerId: PlayerId, tileId: string, combination: [string, string]): Promise<void> {
    const pending = this.state.pendingActions.find(a => a.playerId === playerId);
    if (!pending || !pending.availableActions.includes('chi')) throw new Error('INVALID_ACTION');

    this.clearTimer();
    this.resolveOthers(playerId);

    const player = this.state.players[playerId];
    const discarded = this.state.lastDiscard!.tile;
    const t1 = player.hand.find(t => t.id === combination[0]);
    const t2 = player.hand.find(t => t.id === combination[1]);
    if (!t1 || !t2) throw new Error('INVALID_TILE');

    player.hand = player.hand.filter(t => t.id !== combination[0] && t.id !== combination[1]);
    player.handCount = player.hand.length;

    const meld: Meld = {
      type: 'chi',
      tiles: sortTiles([discarded, t1, t2]),
      claimedFrom: this.getRelativePosition(this.state.lastDiscard!.playerId, playerId),
    };
    player.melds.push(meld);
    this.removeFromDiscards(this.state.lastDiscard!.playerId, discarded);

    this.state.phase = 'player_turn';
    this.state.currentTurn = playerId;

    const timeoutAt = Date.now() + this.actionTimeout;
    this.emit({ type: 'action', playerId, action: 'chi', tile: discarded, meld, timeoutAt });
    this.emit({ type: 'stateUpdate' });

    this.startTimer(this.actionTimeout, async () => {
      await this.autoDiscard(playerId);
    }, { playerId, timeoutAt });
  }

  async handlePong(playerId: PlayerId): Promise<void> {
    const pending = this.state.pendingActions.find(a => a.playerId === playerId);
    if (!pending || !pending.availableActions.includes('pong')) throw new Error('INVALID_ACTION');

    this.clearTimer();
    this.resolveOthers(playerId);

    const player = this.state.players[playerId];
    const discarded = this.state.lastDiscard!.tile;
    const matching = player.hand.filter(t => sameTile(t, discarded));
    if (matching.length < 2) throw new Error('INVALID_ACTION');

    player.hand = removeN(player.hand, discarded, 2);
    player.handCount = player.hand.length;

    const meld: Meld = {
      type: 'pong',
      tiles: [discarded, matching[0], matching[1]],
      claimedFrom: this.getRelativePosition(this.state.lastDiscard!.playerId, playerId),
    };
    player.melds.push(meld);
    this.removeFromDiscards(this.state.lastDiscard!.playerId, discarded);

    this.state.phase = 'player_turn';
    this.state.currentTurn = playerId;

    const timeoutAt = Date.now() + this.actionTimeout;
    this.emit({ type: 'action', playerId, action: 'pong', tile: discarded, meld, timeoutAt });
    this.emit({ type: 'stateUpdate' });

    this.startTimer(this.actionTimeout, async () => {
      await this.autoDiscard(playerId);
    }, { playerId, timeoutAt });
  }

  async handleKong(playerId: PlayerId, tileId: string, kongType: string): Promise<void> {
    this.clearTimer();
    const player = this.state.players[playerId];

    let meld: Meld;

    if (kongType === 'closed') {
      // Concealed kong from hand
      const tile = player.hand.find(t => t.id === tileId);
      if (!tile) throw new Error('INVALID_TILE');
      const matching = player.hand.filter(t => sameTile(t, tile));
      if (matching.length < 4) throw new Error('INVALID_ACTION');
      player.hand = removeN(player.hand, tile, 4);
      player.handCount = player.hand.length;
      meld = { type: 'kong_closed', tiles: matching.slice(0, 4) };
      player.melds.push(meld);
      this.emit({ type: 'action', playerId, action: 'kong_closed', meld });
      await this.drawTile(playerId, true);

    } else if (kongType === 'open') {
      // Open kong from discard
      const pending = this.state.pendingActions.find(a => a.playerId === playerId);
      if (!pending || !pending.availableActions.includes('kong')) throw new Error('INVALID_ACTION');
      this.resolveOthers(playerId);

      const discarded = this.state.lastDiscard!.tile;
      const matching = player.hand.filter(t => sameTile(t, discarded));
      if (matching.length < 3) throw new Error('INVALID_ACTION');
      player.hand = removeN(player.hand, discarded, 3);
      player.handCount = player.hand.length;
      meld = {
        type: 'kong_open',
        tiles: [discarded, ...matching.slice(0, 3)],
        claimedFrom: this.getRelativePosition(this.state.lastDiscard!.playerId, playerId),
      };
      player.melds.push(meld);
      this.removeFromDiscards(this.state.lastDiscard!.playerId, discarded);
      this.emit({ type: 'action', playerId, action: 'kong_open', meld });
      await this.drawTile(playerId, true);

    } else if (kongType === 'added') {
      // Added kong: extend existing pong
      const tile = player.hand.find(t => t.id === tileId);
      if (!tile) throw new Error('INVALID_TILE');
      const pongIdx = player.melds.findIndex(
        m => m.type === 'pong' && sameTile(m.tiles[0], tile)
      );
      if (pongIdx === -1) throw new Error('INVALID_ACTION');
      player.hand = player.hand.filter(t => t.id !== tileId);
      player.handCount = player.hand.length;
      const old = player.melds[pongIdx];
      player.melds[pongIdx] = { type: 'kong_added', tiles: [...old.tiles, tile], claimedFrom: old.claimedFrom };
      meld = player.melds[pongIdx];
      this.emit({ type: 'action', playerId, action: 'kong_added', tile, meld });
      await this.drawTile(playerId, true);
    }

    this.emit({ type: 'stateUpdate' });
  }

  async handleWin(playerId: PlayerId): Promise<void> {
    const state = this.state;
    const player = state.players[playerId];
    const isPhasePlayerTurn = state.phase === 'player_turn' && state.currentTurn === playerId;
    const isWaitingResponse = state.phase === 'waiting_response';

    if (!isPhasePlayerTurn && !isWaitingResponse) throw new Error('INVALID_ACTION');

    const winType = isPhasePlayerTurn ? 'self' : 'discard';
    const winTile = winType === 'self'
      ? player.hand[player.hand.length - 1]
      : state.lastDiscard!.tile;

    if (!isWinnable(
      winType === 'self' ? player.hand : [...player.hand, winTile],
      player.melds
    )) throw new Error('INSUFFICIENT_FAN');

    this.clearTimer();
    this.resolveOthers(playerId);

    const ctx = this.buildWinContext(playerId, winTile, winType);
    const fanResult = calculateFan(ctx);

    if (fanResult.total < 8) throw new Error('INSUFFICIENT_FAN');

    const payer = winType === 'discard' ? state.lastDiscard!.playerId : null;
    const deltas = calcScoreDeltas(playerId, payer, fanResult, state.playerOrder);

    for (const [pid, delta] of Object.entries(deltas)) {
      state.players[pid].score += delta;
    }

    const scores: SettlementData['scores'] = {};
    for (const pid of state.playerOrder) {
      const before = state.players[pid].score - (deltas[pid] ?? 0);
      scores[pid] = { before, delta: deltas[pid] ?? 0, after: state.players[pid].score };
    }

    // Calculate tenpai for all players (for flow)
    const tenpai: Record<string, boolean> = {};
    for (const pid of state.playerOrder) {
      tenpai[pid] = getTenpaiTiles(state.players[pid].hand, state.players[pid].melds).length > 0;
    }

    const hands: Record<string, Tile[]> = {};
    for (const pid of state.playerOrder) {
      hands[pid] = pid === playerId ? state.players[pid].hand : [];
    }

    const next = this.computeNextRound(playerId === state.dealer, false);

    const settlement: SettlementData = {
      winner: playerId,
      winType,
      payer: payer ?? undefined,
      fanDetail: fanResult,
      scores,
      hands,
      isTenpai: tenpai,
      nextRound: next,
    };

    state.phase = 'settled';
    this.lastSettlement = settlement;
    this.emit({ type: 'settled', data: settlement });
    this.emit({ type: 'stateUpdate' });
  }

  async handlePass(playerId: PlayerId): Promise<void> {
    const pending = this.state.pendingActions.find(a => a.playerId === playerId);
    if (!pending) return;
    pending.responded = true;
    pending.chosenAction = 'pass';

    if (this.state.pendingActions.every(a => a.responded)) {
      this.clearTimer();
      await this.resolveResponses();
    }
  }

  // ── Broadcast discard & collect responses ────────────────────────────────────

  private async broadcastDiscard(discarderId: PlayerId, tile: Tile): Promise<void> {
    this.state.phase = 'waiting_response';
    this.state.pendingActions = [];

    const others = this.state.playerOrder.filter(p => p !== discarderId);
    const upstreamIdx = this.getNextPlayerIdx(this.state.playerOrder.indexOf(discarderId));
    const upstream = this.state.playerOrder[upstreamIdx];

    for (const pid of others) {
      const player = this.state.players[pid];
      const actions: PendingAction['availableActions'] = [];
      const chiOptions: Array<{combination:[string,string]; display: string}> = [];

      // Win
      if (isWinnable([...player.hand, tile], player.melds)) {
        const ctx = this.buildWinContext(pid, tile, 'discard');
        const fan = calculateFan(ctx);
        if (fan.total >= 8) {
          actions.push('win');
          this.emit({ type: 'fanHint', playerId: pid, fanHint: fan });
        }
      }

      // Kong
      if (player.hand.filter(t => sameTile(t, tile)).length >= 3) {
        actions.push('kong');
      }

      // Pong
      if (player.hand.filter(t => sameTile(t, tile)).length >= 2) {
        actions.push('pong');
      }

      // Chi (only from upstream/left player)
      if (pid === upstream) {
        const chiCombs = this.findChiCombinations(player.hand, tile);
        if (chiCombs.length > 0) {
          actions.push('chi');
          chiOptions.push(...chiCombs);
        }
      }

      if (actions.length > 0) {
        actions.push('pass');
        const deadline = Date.now() + this.actionTimeout;
        this.state.pendingActions.push({
          playerId: pid,
          availableActions: actions,
          chiOptions: chiOptions.length > 0 ? chiOptions : undefined,
          deadline,
          responded: false,
        });
        this.emit({ type: 'canAct', playerId: pid, actions, chiOptions, timeoutAt: deadline });

        if (player.isAI) {
          this.scheduleAiAction(() => this.runAiResponse(pid));
        }
      }
    }

    if (this.state.pendingActions.length === 0) {
      await this.advanceTurn();
      return;
    }

    const last = this.state.pendingActions[this.state.pendingActions.length - 1];
    this.startTimer(this.actionTimeout, async () => {
      await this.resolveResponses();
    }, { playerId: last.playerId, timeoutAt: last.deadline });
  }

  private async resolveResponses(): Promise<void> {
    this.clearTimer();

    // Priority: win > kong > pong > chi > pass
    // For multiple wins, pick highest fan (all win simultaneously by 一炮多响)
    const winners = this.state.pendingActions.filter(a => a.chosenAction === 'win');
    if (winners.length > 0) {
      // Pick the winner with highest potential fan (simplified: first one)
      const w = winners[0];
      await this.handleWin(w.playerId);
      return;
    }

    const kongAct = this.state.pendingActions.find(a => a.chosenAction === 'kong');
    if (kongAct) {
      const tile = this.state.lastDiscard!.tile;
      await this.handleKong(kongAct.playerId, tile.id, 'open');
      return;
    }

    const pongAct = this.state.pendingActions.find(a => a.chosenAction === 'pong');
    if (pongAct) {
      await this.handlePong(pongAct.playerId);
      return;
    }

    const chiAct = this.state.pendingActions.find(a => a.chosenAction === 'chi');
    if (chiAct) {
      const opt = chiAct.payload as { combination: [string,string] } | undefined;
      await this.handleChi(chiAct.playerId, this.state.lastDiscard!.tile.id,
        opt?.combination ?? ['', '']);
      return;
    }

    // All passed
    await this.advanceTurn();
  }

  // ── Turn advancement ─────────────────────────────────────────────────────────

  private async advanceTurn(): Promise<void> {
    if (this.deck.isLastTile()) {
      await this.handleExhausted();
      return;
    }

    const lastDiscarderId = this.state.lastDiscard?.playerId ?? this.state.currentTurn;
    const nextIdx = this.getNextPlayerIdx(this.state.playerOrder.indexOf(lastDiscarderId));
    const nextPlayer = this.state.playerOrder[nextIdx];

    await this.drawTile(nextPlayer, false);
  }

  // ── Wall exhausted ───────────────────────────────────────────────────────────

  private async handleExhausted(): Promise<void> {
    this.clearTimer();
    this.state.phase = 'settled';

    const tenpai: Record<string, boolean> = {};
    const hands: Record<string, Tile[]> = {};
    for (const pid of this.state.playerOrder) {
      const p = this.state.players[pid];
      tenpai[pid] = getTenpaiTiles(p.hand, p.melds).length > 0;
      hands[pid] = p.hand;
      p.isTenpai = tenpai[pid];
    }

    const settlement: SettlementData = {
      winner: null,
      winType: null,
      fanDetail: null,
      scores: Object.fromEntries(this.state.playerOrder.map(p => [p, { before: this.state.players[p].score, delta: 0, after: this.state.players[p].score }])),
      hands,
      isTenpai: tenpai,
      nextRound: this.computeNextRound(false, true),
    };

    this.lastSettlement = settlement;
    this.emit({ type: 'settled', data: settlement });
    this.emit({ type: 'stateUpdate' });
  }

  // ── Next round logic ─────────────────────────────────────────────────────────

  private computeNextRound(
    dealerWon: boolean,
    isExhausted: boolean,
  ): SettlementData['nextRound'] {
    const { round, dealer } = this.state;

    if (round.totalRound >= this.maxRounds) return null;

    // Dealer wins or exhausted (dealer连庄): same wind, same round index
    if (dealerWon || isExhausted) {
      return {
        wind: round.wind,
        roundIndex: round.roundIndex,
        totalRound: round.totalRound + 1,
        maxRounds: this.maxRounds,
        dealer,
      };
    }

    // Non-dealer won: rotate dealer
    const dealerIdx = this.state.playerOrder.indexOf(dealer);
    const nextDealerIdx = (dealerIdx + 1) % 4;
    const nextDealer = this.state.playerOrder[nextDealerIdx];

    let nextRoundIndex = round.roundIndex + 1;
    let nextWind = round.wind;

    if (nextRoundIndex > 4) {
      nextRoundIndex = 1;
      const windIdx = (WINDS.indexOf(round.wind) + 1) % 4;
      nextWind = WINDS[windIdx];
    }

    return {
      wind: nextWind,
      roundIndex: nextRoundIndex,
      totalRound: round.totalRound + 1,
      maxRounds: this.maxRounds,
      dealer: nextDealer,
    };
  }

  advanceToNextRound(next: NonNullable<SettlementData['nextRound']>): void {
    this.state.round = {
      wind: next.wind,
      roundIndex: next.roundIndex,
      totalRound: next.totalRound,
      maxRounds: this.maxRounds,
    };
    this.state.dealer = next.dealer;

    // Rotate player positions to match new dealer at East
    const dealerIdx = this.state.playerOrder.indexOf(next.dealer);
    for (const pid of this.state.playerOrder) {
      const relIdx = (this.state.playerOrder.indexOf(pid) - dealerIdx + 4) % 4;
      this.state.players[pid].position = WINDS[relIdx];
      this.state.players[pid].isDealer = pid === next.dealer;
    }
  }

  // ── AI auto-play ─────────────────────────────────────────────────────────────

  private async autoDiscard(playerId: PlayerId): Promise<void> {
    const player = this.state.players[playerId];
    if (!player || player.hand.length === 0) return;

    if (this.state.phase === 'player_turn' && this.state.currentTurn === playerId) {
      // Auto-discard last drawn tile
      const tile = player.hand[player.hand.length - 1];
      await this.handleDiscard(playerId, tile.id);
    } else if (this.state.phase === 'waiting_response') {
      await this.handlePass(playerId);
    }
  }

  // Bot seats act after a short "thinking" delay instead of waiting out the full action timer.
  // Stale callbacks are harmless: handle*() guard on current phase/turn/pendingActions.
  private scheduleAiAction(fn: () => Promise<void>): void {
    setTimeout(() => {
      fn().catch(e => logger.error({ e }, 'AI action error'));
    }, AI_THINK_MS);
  }

  private async runAiTurn(playerId: PlayerId): Promise<void> {
    if (this.state.phase !== 'player_turn' || this.state.currentTurn !== playerId) return;
    const player = this.state.players[playerId];
    if (player.hand.length === 0) return;

    if (isWinnable(player.hand, player.melds)) {
      try {
        await this.handleWin(playerId);
        return;
      } catch {
        // insufficient fan — fall through to discard
      }
    }

    const tile = player.hand[player.hand.length - 1];
    await this.handleDiscard(playerId, tile.id);
  }

  private async runAiResponse(playerId: PlayerId): Promise<void> {
    const pending = this.state.pendingActions.find(a => a.playerId === playerId && !a.responded);
    if (!pending) return;

    if (pending.availableActions.includes('win')) {
      try {
        await this.handleWin(playerId);
        return;
      } catch {
        // fall through to pass
      }
    }
    await this.handlePass(playerId);
  }

  // ── Tenpai info ───────────────────────────────────────────────────────────────

  computeTenpaiInfo(playerId: PlayerId): Array<{ tile: Tile; fanTotal: number; remaining: number }> {
    const player = this.state.players[playerId];
    if (!player || player.hand.length !== 13 - player.melds.length * 3) return [];

    const tenpaiTiles = getTenpaiTiles(player.hand, player.melds);
    if (tenpaiTiles.length === 0) return [];

    const visibleCounts = this.computeVisibleTileCounts(playerId);

    return tenpaiTiles.map(tile => {
      const ctx = this.buildWinContext(playerId, tile, 'discard');
      const fanResult = calculateFan(ctx);
      const key = tileKey(tile);
      const seen = visibleCounts.get(key) ?? 0;
      const remaining = Math.max(0, 4 - seen);
      return { tile, fanTotal: fanResult.total, remaining };
    });
  }

  private computeVisibleTileCounts(playerId: PlayerId): Map<string, number> {
    const counts = new Map<string, number>();
    const addTile = (t: Tile) => {
      if (t.suit === 'flower') return;
      const k = tileKey(t);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    };
    for (const pid of this.state.playerOrder) {
      const p = this.state.players[pid];
      if (pid === playerId) {
        for (const t of p.hand) addTile(t);
        for (const m of p.melds) for (const t of m.tiles) addTile(t);
      } else {
        for (const t of p.discards) addTile(t);
        for (const m of p.melds) {
          if (m.type !== 'kong_closed') for (const t of m.tiles) addTile(t);
        }
      }
    }
    return counts;
  }

  // ── Utility ──────────────────────────────────────────────────────────────────

  private buildWinContext(playerId: PlayerId, winTile: Tile, winType: 'self' | 'discard'): WinContext {
    const player = this.state.players[playerId];
    const hand = winType === 'self'
      ? player.hand.slice(0, -1) // exclude last tile (it's the winTile)
      : [...player.hand];

    return {
      hand,
      melds: player.melds,
      winTile,
      winType,
      roundWind: this.state.round.wind,
      seatWind: player.position,
      isLastTile: this.state.isLastTile,
      isAfterKong: this.state.lastDrawIsReplacement,
      isRobbingKong: false,
      flowers: player.flowers,
      visibleTileCounts: this.computeVisibleTileCounts(playerId),
    };
  }

  private findChiCombinations(
    hand: Tile[],
    tile: Tile,
  ): Array<{combination: [string,string]; display: string}> {
    return this._findChiCombinations(hand, tile);
  }

  private _findChiCombinations(
    hand: Tile[],
    tile: Tile,
  ): Array<{combination: [string,string]; display: string}> {
    if (tile.suit === 'wind' || tile.suit === 'dragon' || tile.suit === 'flower') return [];
    const result: Array<{combination: [string,string]; display: string}> = [];

    const offsets = [[-2,-1],[-1,1],[1,2]];
    for (const [a, b] of offsets) {
      const va = tile.value + a;
      const vb = tile.value + b;
      if (va < 1 || va > 9 || vb < 1 || vb > 9) continue;
      const ta = hand.find(t => t.suit === tile.suit && t.value === va);
      const tb = hand.find(t => t.suit === tile.suit && t.value === vb);
      if (ta && tb && ta.id !== tb.id) {
        result.push({
          combination: [ta.id, tb.id],
          display: `${suitChar(tile.suit)}${va}-${vb}`,
        });
      }
    }
    return result;
  }

  private resolveOthers(exceptPlayerId: PlayerId): void {
    for (const a of this.state.pendingActions) {
      if (a.playerId !== exceptPlayerId) {
        a.responded = true;
        a.chosenAction = 'pass';
      }
    }
    this.state.pendingActions = this.state.pendingActions.filter(
      a => a.playerId === exceptPlayerId
    );
  }

  // Remove a claimed discard from the discarder's discard pile (it now belongs to the claimer's meld)
  private removeFromDiscards(discarderId: PlayerId, tile: Tile): void {
    const discarder = this.state.players[discarderId];
    const idx = discarder.discards.findIndex(t => t.id === tile.id);
    if (idx !== -1) discarder.discards.splice(idx, 1);
  }

  private getNextPlayerIdx(currentIdx: number): number {
    return (currentIdx + 1) % this.state.playerOrder.length;
  }

  private getRelativePosition(fromId: PlayerId, toId: PlayerId): 'left' | 'right' | 'opposite' {
    const fromIdx = this.state.playerOrder.indexOf(fromId);
    const toIdx = this.state.playerOrder.indexOf(toId);
    const diff = (toIdx - fromIdx + 4) % 4;
    if (diff === 1) return 'left';
    if (diff === 3) return 'right';
    return 'opposite';
  }

  private replenishFlower(playerId: PlayerId): void {
    let tile = this.deck.drawReplacement();
    while (tile && isFlower(tile)) {
      this.state.players[playerId].flowers.push(tile);
      this.updateFlowerBonus(playerId);
      tile = this.deck.drawReplacement();
    }
    if (tile) {
      this.state.players[playerId].hand.push(tile);
    }
  }

  private updateFlowerBonus(playerId: PlayerId): void {
    const player = this.state.players[playerId];
    const seatVal = WINDS.indexOf(player.position) + 1;
    let bonus = 0;
    for (const f of player.flowers) {
      bonus += (f.value === seatVal || f.value === seatVal + 4) ? 2 : 1;
    }
    player.flowerBonus = bonus;
  }

  private updateWallCounts(): void {
    this.state.wall.remaining = this.deck.remaining;
  }

  private startTimer(ms: number, cb: () => Promise<void>, info: { playerId: PlayerId; timeoutAt: number } | null = null): void {
    this.clearTimer();
    this.currentTimer = info;
    this.timerCallback = cb;
    this.timer = setTimeout(() => {
      cb().catch(e => logger.error({ e }, 'timer callback error'));
    }, ms);
  }

  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.currentTimer = null;
    this.timerCallback = null;
  }

  // Current outstanding action deadline, used to restore the countdown for clients that reconnect mid-timer
  getCurrentTimer(): { playerId: PlayerId; timeoutAt: number } | null {
    return this.currentTimer;
  }

  getLastSettlement(): SettlementData | null {
    return this.lastSettlement;
  }

  // Extend the currently running action timer by extraMs, rescheduling its callback. Returns the new timer info, or null if no timer is active.
  extendCurrentTimer(extraMs: number): { playerId: PlayerId; timeoutAt: number } | null {
    if (!this.currentTimer || !this.timer || !this.timerCallback) return null;
    const cb = this.timerCallback;
    const info = { playerId: this.currentTimer.playerId, timeoutAt: this.currentTimer.timeoutAt + extraMs };
    clearTimeout(this.timer);
    this.currentTimer = info;
    this.timer = setTimeout(() => {
      cb().catch(e => logger.error({ e }, 'timer callback error'));
    }, Math.max(info.timeoutAt - Date.now(), 0));
    return info;
  }

  private emit(event: GameEvent): void {
    this.onEvent(event);
  }

  setPlayerConnected(playerId: PlayerId, connected: boolean): void {
    const p = this.state.players[playerId];
    if (!p) return;
    p.isConnected = connected;
    if (!connected) p.disconnectedAt = Date.now();
    else { delete p.disconnectedAt; p.isAI = false; }
  }

  setPlayerAI(playerId: PlayerId): void {
    const p = this.state.players[playerId];
    if (p) p.isAI = true;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function removeN(hand: Tile[], target: Tile, n: number): Tile[] {
  let removed = 0;
  return hand.filter(t => {
    if (removed < n && sameTile(t, target)) { removed++; return false; }
    return true;
  });
}

function suitChar(suit: string): string {
  const m: Record<string, string> = { man: '万', pin: '饼', sou: '条' };
  return m[suit] ?? '';
}
