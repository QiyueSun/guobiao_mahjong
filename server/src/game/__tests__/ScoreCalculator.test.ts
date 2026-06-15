import { calcScoreDeltas } from '../ScoreCalculator';
import { FanResult } from '../../types';

function fanResult(total: number): FanResult {
  return {
    fans: [{ name: '自摸', value: total }],
    flowerBonus: [],
    subtotal: total,
    flowerTotal: 0,
    total,
    winType: 'self',
  };
}

const PLAYERS = ['p1', 'p2', 'p3', 'p4'];

describe('calcScoreDeltas', () => {
  describe('self-draw (摸和)', () => {
    test('winner gains total×3, each other pays total', () => {
      const deltas = calcScoreDeltas('p1', null, fanResult(16), PLAYERS);
      expect(deltas['p1']).toBe(48);  // 16 × 3
      expect(deltas['p2']).toBe(-16);
      expect(deltas['p3']).toBe(-16);
      expect(deltas['p4']).toBe(-16);
    });

    test('zero-sum: all deltas sum to 0', () => {
      const deltas = calcScoreDeltas('p2', null, fanResult(24), PLAYERS);
      const sum = Object.values(deltas).reduce((a, b) => a + b, 0);
      expect(sum).toBe(0);
    });
  });

  describe('discard win (点和)', () => {
    test('winner gains total×3, payer loses total×3', () => {
      const deltas = calcScoreDeltas('p1', 'p3', fanResult(16), PLAYERS);
      expect(deltas['p1']).toBe(48);   // 16 × 3
      expect(deltas['p2']).toBe(0);
      expect(deltas['p3']).toBe(-48);  // -16 × 3
      expect(deltas['p4']).toBe(0);
    });

    test('zero-sum: all deltas sum to 0', () => {
      const deltas = calcScoreDeltas('p4', 'p1', fanResult(32), PLAYERS);
      const sum = Object.values(deltas).reduce((a, b) => a + b, 0);
      expect(sum).toBe(0);
    });
  });

  describe('minimum 8-fan floor', () => {
    test('total < 8 is floored to 8 for self-draw', () => {
      const deltas = calcScoreDeltas('p1', null, fanResult(4), PLAYERS);
      // Floor applies: 8 × 3 = 24 for winner
      expect(deltas['p1']).toBe(24);
      expect(deltas['p2']).toBe(-8);
    });

    test('total < 8 is floored to 8 for discard win', () => {
      const deltas = calcScoreDeltas('p1', 'p2', fanResult(3), PLAYERS);
      expect(deltas['p1']).toBe(24);   // 8 × 3
      expect(deltas['p2']).toBe(-24);
    });

    test('total exactly 8: no change', () => {
      const deltas = calcScoreDeltas('p1', null, fanResult(8), PLAYERS);
      expect(deltas['p1']).toBe(24);
    });

    test('total > 8: no floor applied', () => {
      const deltas = calcScoreDeltas('p1', null, fanResult(48), PLAYERS);
      expect(deltas['p1']).toBe(144);  // 48 × 3
      expect(deltas['p2']).toBe(-48);
    });
  });

  describe('all players receive a delta entry', () => {
    test('returns deltas for all 4 players', () => {
      const deltas = calcScoreDeltas('p1', null, fanResult(10), PLAYERS);
      expect(Object.keys(deltas)).toHaveLength(4);
      expect(deltas).toHaveProperty('p1');
      expect(deltas).toHaveProperty('p2');
      expect(deltas).toHaveProperty('p3');
      expect(deltas).toHaveProperty('p4');
    });
  });
});
