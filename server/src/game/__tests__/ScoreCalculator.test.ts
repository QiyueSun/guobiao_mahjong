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

// New formula: payment = fan + 8
// 自摸: all 3 others pay (fan + 8); winner gains (fan + 8) × 3
// 点和: 放炮者 pays (fan + 8); other 2 pay 8; winner gains (fan + 8) + 8 + 8

describe('calcScoreDeltas', () => {
  describe('self-draw (摸和)', () => {
    test('each other pays (fan+8), winner gains that × 3', () => {
      const deltas = calcScoreDeltas('p1', null, fanResult(16), PLAYERS);
      const payment = 16 + 8; // 24
      expect(deltas['p1']).toBe(payment * 3);   // 72
      expect(deltas['p2']).toBe(-payment);       // -24
      expect(deltas['p3']).toBe(-payment);       // -24
      expect(deltas['p4']).toBe(-payment);       // -24
    });

    test('zero-sum: all deltas sum to 0', () => {
      const deltas = calcScoreDeltas('p2', null, fanResult(24), PLAYERS);
      const sum = Object.values(deltas).reduce((a, b) => a + b, 0);
      expect(sum).toBe(0);
    });
  });

  describe('discard win (点和)', () => {
    test('放炮者 pays (fan+8); other 2 pay 8; winner gains (fan+8)+16', () => {
      const deltas = calcScoreDeltas('p1', 'p3', fanResult(16), PLAYERS);
      const payment = 16 + 8; // 24
      expect(deltas['p1']).toBe(payment + 8 + 8); // 40
      expect(deltas['p2']).toBe(-8);
      expect(deltas['p3']).toBe(-payment);         // -24
      expect(deltas['p4']).toBe(-8);
    });

    test('zero-sum: all deltas sum to 0', () => {
      const deltas = calcScoreDeltas('p4', 'p1', fanResult(32), PLAYERS);
      const sum = Object.values(deltas).reduce((a, b) => a + b, 0);
      expect(sum).toBe(0);
    });
  });

  describe('base payment of +8', () => {
    test('fan=0: payment is 8 (self-draw)', () => {
      const deltas = calcScoreDeltas('p1', null, fanResult(0), PLAYERS);
      expect(deltas['p1']).toBe(24);   // 8 × 3
      expect(deltas['p2']).toBe(-8);
    });

    test('fan=0: payment is 8 (discard win)', () => {
      const deltas = calcScoreDeltas('p1', 'p2', fanResult(0), PLAYERS);
      expect(deltas['p1']).toBe(8 + 8 + 8); // 24
      expect(deltas['p2']).toBe(-8);
      expect(deltas['p3']).toBe(-8);
      expect(deltas['p4']).toBe(-8);
    });

    test('fan=8 (minimum win): payment is 16', () => {
      const deltas = calcScoreDeltas('p1', null, fanResult(8), PLAYERS);
      expect(deltas['p1']).toBe((8 + 8) * 3); // 48
    });

    test('fan=48: payment is 56 (self-draw)', () => {
      const deltas = calcScoreDeltas('p1', null, fanResult(48), PLAYERS);
      const payment = 48 + 8; // 56
      expect(deltas['p1']).toBe(payment * 3); // 168
      expect(deltas['p2']).toBe(-payment);    // -56
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
