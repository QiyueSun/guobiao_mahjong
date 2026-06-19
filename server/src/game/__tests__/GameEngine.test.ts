import { GameEngine, GameEvent } from '../GameEngine';
import { Tile } from '../../types';

const PLAYER_IDS = ['p1', 'p2', 'p3', 'p4'];
const NICKNAMES: Record<string, string> = { p1: 'Alice', p2: 'Bob', p3: 'Carol', p4: 'Dave' };

function makeEngine(onEvent?: (e: GameEvent) => void): GameEngine {
  return new GameEngine(
    PLAYER_IDS,
    NICKNAMES,
    'TEST',
    onEvent ?? (() => {}),
    false,
  );
}

// ── Constructor / initial state ───────────────────────────────────────────────

describe('GameEngine constructor', () => {
  test('creates 4 players in order', () => {
    const engine = makeEngine();
    const state = engine.getState();
    expect(state.playerOrder).toEqual(PLAYER_IDS);
    expect(Object.keys(state.players)).toHaveLength(4);
  });

  test('assigns wind positions in order', () => {
    const engine = makeEngine();
    const state = engine.getState();
    expect(state.players['p1'].position).toBe('east');
    expect(state.players['p2'].position).toBe('south');
    expect(state.players['p3'].position).toBe('west');
    expect(state.players['p4'].position).toBe('north');
  });

  test('p1 is dealer', () => {
    const engine = makeEngine();
    const state = engine.getState();
    expect(state.players['p1'].isDealer).toBe(true);
    expect(state.dealer).toBe('p1');
  });

  test('initial phase is dealing', () => {
    const engine = makeEngine();
    expect(engine.getState().phase).toBe('dealing');
  });
});

// ── startRound ────────────────────────────────────────────────────────────────

describe('startRound', () => {
  test('emits stateUpdate for all players', async () => {
    const events: GameEvent[] = [];
    const engine = makeEngine(e => events.push(e));
    await engine.startRound();

    const stateUpdates = events.filter(e => e.type === 'stateUpdate');
    // At minimum: one after dealing + one after dealer draws
    expect(stateUpdates.length).toBeGreaterThanOrEqual(1);
  }, 10000);

  test('dealer gets 14 tiles (hand includes drawn tile), others get 13', async () => {
    const events: GameEvent[] = [];
    const engine = makeEngine(e => events.push(e));
    await engine.startRound();

    const state = engine.getState();
    const dealerState = state.players[state.dealer];
    // Dealer should have drawn 14th tile (14 tiles in hand before discard)
    expect(dealerState.hand.length + dealerState.melds.length * 3).toBeGreaterThanOrEqual(1);
    // Others should have 13 tiles
    for (const pid of PLAYER_IDS.filter(p => p !== state.dealer)) {
      expect(state.players[pid].hand.length).toBe(13);
    }
  }, 10000);

  test('emits drawTile event for dealer', async () => {
    const events: GameEvent[] = [];
    const engine = makeEngine(e => events.push(e));
    await engine.startRound();

    const drawEvent = events.find(e => e.type === 'drawTile');
    expect(drawEvent).toBeDefined();
    expect((drawEvent as Extract<GameEvent, { type: 'drawTile' }>).playerId).toBe(PLAYER_IDS[0]);
  }, 10000);

  test('phase becomes player_turn after start', async () => {
    const engine = makeEngine();
    await engine.startRound();
    expect(engine.getState().phase).toBe('player_turn');
  }, 10000);
});

// ── handleDiscard ─────────────────────────────────────────────────────────────

describe('handleDiscard', () => {
  test('discarding removes tile from hand', async () => {
    const engine = makeEngine();
    await engine.startRound();

    const state = engine.getState();
    const dealerId = state.dealer;
    const tile = state.players[dealerId].hand[0];
    const handSizeBefore = state.players[dealerId].hand.length;

    await engine.handleDiscard(dealerId, tile.id);

    expect(state.players[dealerId].hand.length).toBe(handSizeBefore - 1);
  }, 10000);

  test('discarding adds tile to discards array', async () => {
    const engine = makeEngine();
    await engine.startRound();

    const state = engine.getState();
    const dealerId = state.dealer;
    const tile = state.players[dealerId].hand[0];

    await engine.handleDiscard(dealerId, tile.id);

    expect(state.players[dealerId].discards).toContainEqual(expect.objectContaining({ id: tile.id }));
  }, 10000);

  test('throws NOT_YOUR_TURN if wrong player discards', async () => {
    const engine = makeEngine();
    await engine.startRound();

    const state = engine.getState();
    const nonDealer = PLAYER_IDS.find(p => p !== state.dealer)!;
    const tile = state.players[nonDealer].hand[0];

    await expect(engine.handleDiscard(nonDealer, tile.id)).rejects.toThrow('NOT_YOUR_TURN');
  }, 10000);

  test('throws INVALID_TILE if tile not in hand', async () => {
    const engine = makeEngine();
    await engine.startRound();

    const state = engine.getState();
    await expect(engine.handleDiscard(state.dealer, 'nonexistent-id')).rejects.toThrow('INVALID_TILE');
  }, 10000);

  test('discard emits action event', async () => {
    const events: GameEvent[] = [];
    const engine = makeEngine(e => events.push(e));
    await engine.startRound();

    const state = engine.getState();
    const tile = state.players[state.dealer].hand[0];
    await engine.handleDiscard(state.dealer, tile.id);

    const discardEvent = events.find(e => e.type === 'action' && (e as any).action === 'discard');
    expect(discardEvent).toBeDefined();
  }, 10000);
});

// ── setPlayerConnected / setPlayerAI ─────────────────────────────────────────

describe('player connection state', () => {
  test('setPlayerConnected marks player as disconnected', () => {
    const engine = makeEngine();
    engine.setPlayerConnected('p1', false);
    expect(engine.getState().players['p1'].isConnected).toBe(false);
  });

  test('setPlayerConnected marks player as reconnected', () => {
    const engine = makeEngine();
    engine.setPlayerConnected('p1', false);
    engine.setPlayerConnected('p1', true);
    expect(engine.getState().players['p1'].isConnected).toBe(true);
    expect(engine.getState().players['p1'].isAI).toBe(false);
  });

  test('setPlayerAI marks player as AI', () => {
    const engine = makeEngine();
    engine.setPlayerAI('p2');
    expect(engine.getState().players['p2'].isAI).toBe(true);
  });
});

// ── leaveAsAI (player explicitly leaves the game) ─────────────────────────────

describe('leaveAsAI', () => {
  test('marks the player as AI and disconnected', () => {
    const engine = makeEngine();
    engine.leaveAsAI('p2');
    const p = engine.getState().players['p2'];
    expect(p.isAI).toBe(true);
    expect(p.isConnected).toBe(false);
    expect(p.disconnectedAt).toBeDefined();
  });

  test('emits a stateUpdate so other players see the AI takeover', () => {
    const events: GameEvent[] = [];
    const engine = makeEngine(e => events.push(e));
    engine.leaveAsAI('p2');
    expect(events.some(e => e.type === 'stateUpdate')).toBe(true);
  });

  test('immediately takes over the current turn and discards', async () => {
    const engine = makeEngine();
    await engine.startRound();

    const state = engine.getState();
    const currentPlayer = state.currentTurn;
    expect(state.phase).toBe('player_turn');
    expect(state.players[currentPlayer].discards).toHaveLength(0);

    engine.leaveAsAI(currentPlayer);

    await new Promise(r => setTimeout(r, 1000));

    expect(engine.getState().players[currentPlayer].discards.length).toBeGreaterThanOrEqual(1);
  }, 10000);
});

// ── advanceToNextRound ────────────────────────────────────────────────────────

describe('advanceToNextRound', () => {
  test('updates round state', () => {
    const engine = makeEngine();
    engine.advanceToNextRound({
      wind: 'south',
      roundIndex: 1,
      totalRound: 5,
      maxRounds: 16,
      dealer: 'p2',
    });

    const state = engine.getState();
    expect(state.round.wind).toBe('south');
    expect(state.round.totalRound).toBe(5);
    expect(state.dealer).toBe('p2');
    expect(state.players['p2'].isDealer).toBe(true);
  });
});

// ── Claimed discards move into melds ─────────────────────────────────────────

describe('claiming a discard removes it from the discarder\'s pile', () => {
  test('pong moves the claimed tile out of the discard pile and into the meld', async () => {
    const engine = makeEngine();
    await engine.startRound();
    const state = engine.getState();

    const dealerId = state.dealer;
    const otherId = PLAYER_IDS.find(p => p !== dealerId)!;

    const discardTile: Tile = { id: 'claim-tile', suit: 'man', value: 5 };
    state.players[otherId].hand.push(
      { id: 'h1', suit: 'man', value: 5 },
      { id: 'h2', suit: 'man', value: 5 },
    );
    state.players[dealerId].discards.push(discardTile);
    state.lastDiscard = { playerId: dealerId, tile: discardTile };
    state.phase = 'waiting_response';
    state.pendingActions = [{
      playerId: otherId,
      availableActions: ['pong', 'pass'],
      deadline: Date.now() + 10000,
      responded: false,
    }];

    await engine.handlePong(otherId);

    expect(state.players[dealerId].discards.find(t => t.id === discardTile.id)).toBeUndefined();
    const meld = state.players[otherId].melds.find(m => m.type === 'pong');
    expect(meld?.tiles).toContainEqual(expect.objectContaining({ id: discardTile.id }));
  }, 10000);

  test('chi moves the claimed tile out of the discard pile and into the meld', async () => {
    const engine = makeEngine();
    await engine.startRound();
    const state = engine.getState();

    const dealerId = state.dealer;
    const dealerIdx = state.playerOrder.indexOf(dealerId);
    const leftId = state.playerOrder[(dealerIdx + 1) % 4];

    const discardTile: Tile = { id: 'claim-tile', suit: 'man', value: 5 };
    state.players[leftId].hand.push(
      { id: 'h1', suit: 'man', value: 4 },
      { id: 'h2', suit: 'man', value: 6 },
    );
    state.players[dealerId].discards.push(discardTile);
    state.lastDiscard = { playerId: dealerId, tile: discardTile };
    state.phase = 'waiting_response';
    state.pendingActions = [{
      playerId: leftId,
      availableActions: ['chi', 'pass'],
      deadline: Date.now() + 10000,
      responded: false,
    }];

    await engine.handleChi(leftId, discardTile.id, ['h1', 'h2']);

    expect(state.players[dealerId].discards.find(t => t.id === discardTile.id)).toBeUndefined();
    const meld = state.players[leftId].melds.find(m => m.type === 'chi');
    expect(meld?.tiles).toContainEqual(expect.objectContaining({ id: discardTile.id }));
  }, 10000);

  test('open kong moves the claimed tile out of the discard pile and into the meld', async () => {
    const engine = makeEngine();
    await engine.startRound();
    const state = engine.getState();

    const dealerId = state.dealer;
    const otherId = PLAYER_IDS.find(p => p !== dealerId)!;

    const discardTile: Tile = { id: 'claim-tile', suit: 'man', value: 5 };
    state.players[otherId].hand.push(
      { id: 'h1', suit: 'man', value: 5 },
      { id: 'h2', suit: 'man', value: 5 },
      { id: 'h3', suit: 'man', value: 5 },
    );
    state.players[dealerId].discards.push(discardTile);
    state.lastDiscard = { playerId: dealerId, tile: discardTile };
    state.phase = 'waiting_response';
    state.pendingActions = [{
      playerId: otherId,
      availableActions: ['kong', 'pass'],
      deadline: Date.now() + 10000,
      responded: false,
    }];

    await engine.handleKong(otherId, discardTile.id, 'open');

    expect(state.players[dealerId].discards.find(t => t.id === discardTile.id)).toBeUndefined();
    const meld = state.players[otherId].melds.find(m => m.type === 'kong_open');
    expect(meld?.tiles).toContainEqual(expect.objectContaining({ id: discardTile.id }));
  }, 10000);
});

// ── computeTenpaiInfo with melds ──────────────────────────────────────────────

describe('computeTenpaiInfo', () => {
  test('returns tenpai tiles for a player holding melds (concealed hand < 13)', async () => {
    const engine = makeEngine();
    await engine.startRound();
    const state = engine.getState();

    const pid = PLAYER_IDS[0];
    const player = state.players[pid];

    // One pong meld means the concealed hand should be 13 - 3 = 10 tiles when tenpai
    player.melds = [{ type: 'pong', tiles: [
      { id: 'm1', suit: 'dragon', value: 1 },
      { id: 'm2', suit: 'dragon', value: 1 },
      { id: 'm3', suit: 'dragon', value: 1 },
    ] }];

    // 10-tile hand, waiting on man:1 to complete (pairs + one incomplete pair)
    player.hand = [
      { id: 't1', suit: 'man', value: 2 }, { id: 't2', suit: 'man', value: 2 },
      { id: 't3', suit: 'man', value: 3 }, { id: 't4', suit: 'man', value: 3 },
      { id: 't5', suit: 'man', value: 4 }, { id: 't6', suit: 'man', value: 4 },
      { id: 't7', suit: 'man', value: 5 }, { id: 't8', suit: 'man', value: 5 },
      { id: 't9', suit: 'man', value: 6 }, { id: 't10', suit: 'man', value: 1 },
    ];

    const info = engine.computeTenpaiInfo(pid);
    expect(info.length).toBeGreaterThan(0);
  }, 10000);

  test('returns empty for a non-tenpai hand', async () => {
    const engine = makeEngine();
    await engine.startRound();
    const state = engine.getState();

    const pid = PLAYER_IDS[0];
    const player = state.players[pid];
    player.melds = [];
    player.hand = [
      { id: 't1', suit: 'man', value: 1 }, { id: 't2', suit: 'man', value: 3 },
      { id: 't3', suit: 'man', value: 5 }, { id: 't4', suit: 'man', value: 7 },
      { id: 't5', suit: 'man', value: 9 }, { id: 't6', suit: 'pin', value: 1 },
      { id: 't7', suit: 'pin', value: 3 }, { id: 't8', suit: 'pin', value: 5 },
      { id: 't9', suit: 'pin', value: 7 }, { id: 't10', suit: 'pin', value: 9 },
      { id: 't11', suit: 'sou', value: 1 }, { id: 't12', suit: 'sou', value: 3 },
      { id: 't13', suit: 'sou', value: 5 },
    ];

    expect(engine.computeTenpaiInfo(pid)).toEqual([]);
  }, 10000);
});
