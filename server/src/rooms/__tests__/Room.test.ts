import { Room } from '../Room';

const PLAYER_IDS = ['p1', 'p2', 'p3', 'p4'];

function makeRoom(): Room {
  const room = new Room('TEST', 'p1', 'Alice');
  room.addPlayer('p2', 'Bob');
  room.addPlayer('p3', 'Carol');
  room.addPlayer('p4', 'Dave');
  for (const p of PLAYER_IDS) room.setReady(p, true);
  room.startGame();
  return room;
}

describe('Room.beginRound', () => {
  test('does not change round on the very first deal (no prior settlement)', async () => {
    const room = makeRoom();
    await room.beginRound();

    const state = room.engine!.getState();
    expect(state.round.wind).toBe('east');
    expect(state.round.totalRound).toBe(1);
    expect(state.dealer).toBe('p1');
  }, 15000);

  test('advances round/dealer/positions using the last settlement\'s nextRound', async () => {
    const room = makeRoom();
    await room.beginRound();

    const engine = room.engine!;
    // Simulate a settled round whose computed next round rotates the dealer to south wind
    (engine as unknown as { lastSettlement: unknown }).lastSettlement = {
      winner: 'p2',
      winType: 'discard',
      fanDetail: null,
      scores: {},
      hands: {},
      isTenpai: {},
      nextRound: { wind: 'south', roundIndex: 1, totalRound: 2, maxRounds: 16, dealer: 'p2' },
    };

    await room.beginRound();

    const state = engine.getState();
    expect(state.round.wind).toBe('south');
    expect(state.round.totalRound).toBe(2);
    expect(state.dealer).toBe('p2');
    expect(state.players['p2'].isDealer).toBe(true);
    expect(state.players['p2'].position).toBe('east');
  }, 15000);
});
