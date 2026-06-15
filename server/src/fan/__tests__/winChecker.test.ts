import { Tile, Meld } from '../../types';
import {
  isWinnable,
  decompose,
  getTenpaiTiles,
  isSevenPairs,
  isKnittedHand,
  sameTile,
  sortTiles,
  isTerminal,
  isHonor,
  isSimple,
} from '../winChecker';

// ── Tile factory ──────────────────────────────────────────────────────────────

let idCounter = 0;
function t(suit: Tile['suit'], value: number): Tile {
  return { id: `test_${idCounter++}`, suit, value };
}
function man(v: number) { return t('man', v); }
function pin(v: number) { return t('pin', v); }
function sou(v: number) { return t('sou', v); }
function wind(v: number) { return t('wind', v); }
function dragon(v: number) { return t('dragon', v); }

// ── Tile helpers ──────────────────────────────────────────────────────────────

describe('tile helpers', () => {
  test('sameTile matches suit+value, ignores id', () => {
    expect(sameTile(man(1), man(1))).toBe(true);
    expect(sameTile(man(1), man(2))).toBe(false);
    expect(sameTile(man(1), pin(1))).toBe(false);
  });

  test('isTerminal identifies 1s and 9s of number suits', () => {
    expect(isTerminal(man(1))).toBe(true);
    expect(isTerminal(man(9))).toBe(true);
    expect(isTerminal(man(5))).toBe(false);
    expect(isTerminal(wind(1))).toBe(false);
  });

  test('isHonor identifies winds and dragons', () => {
    expect(isHonor(wind(1))).toBe(true);
    expect(isHonor(dragon(2))).toBe(true);
    expect(isHonor(man(1))).toBe(false);
  });

  test('isSimple identifies 2-8 of number suits', () => {
    expect(isSimple(man(5))).toBe(true);
    expect(isSimple(man(1))).toBe(false);
    expect(isSimple(wind(3))).toBe(false);
  });
});

// ── isWinnable ────────────────────────────────────────────────────────────────

describe('isWinnable', () => {
  test('standard hand: 4 melds + pair', () => {
    // 123 456 789 111 + 22 (man)
    const hand = [
      man(1), man(2), man(3),
      man(4), man(5), man(6),
      man(7), man(8), man(9),
      man(1), man(1), man(1),
      man(2), man(2),
    ];
    expect(isWinnable(hand, [])).toBe(true);
  });

  test('seven pairs', () => {
    const hand = [
      man(1), man(1),
      man(2), man(2),
      man(3), man(3),
      pin(4), pin(4),
      pin(5), pin(5),
      sou(6), sou(6),
      wind(1), wind(1),
    ];
    expect(isWinnable(hand, [])).toBe(true);
  });

  test('not winnable: missing pair', () => {
    const hand = [
      man(1), man(2), man(3),
      man(4), man(5), man(6),
      man(7), man(8), man(9),
      pin(1), pin(2), pin(3),
      pin(4), pin(5),
    ];
    expect(isWinnable(hand, [])).toBe(false);
  });

  test('partial melds already set', () => {
    const meld: Meld = { type: 'pong', tiles: [pin(9), pin(9), pin(9)] };
    // Need 3 more groups + pair from hand (10 tiles)
    const hand = [
      man(1), man(2), man(3),
      sou(4), sou(5), sou(6),
      wind(2), wind(2), wind(2),
      dragon(1), dragon(1),
    ];
    expect(isWinnable(hand, [meld])).toBe(true);
  });

  test('honors only: all-winds winning hand', () => {
    const hand = [
      wind(1), wind(1), wind(1),
      wind(2), wind(2), wind(2),
      wind(3), wind(3), wind(3),
      wind(4), wind(4), wind(4),
      dragon(1), dragon(1),
    ];
    expect(isWinnable(hand, [])).toBe(true);
  });
});

// ── decompose ─────────────────────────────────────────────────────────────────

describe('decompose', () => {
  test('standard: 3 chows + 1 pung + pair', () => {
    // hand = 13 tiles, winTile = 14th → 123 456 789m + 111p + 22p
    const hand = [
      man(1), man(2), man(3),
      man(4), man(5), man(6),
      man(7), man(8), man(9),
      pin(1), pin(1), pin(1),
      pin(2),
    ];
    const winTile = pin(2);  // second pin2 completes the pair
    const decomps = decompose(hand, winTile, []);
    expect(decomps.length).toBeGreaterThan(0);
    const standard = decomps.find(d => d.type === 'standard');
    expect(standard).toBeDefined();
    expect(standard!.groups.length).toBe(5); // 4 groups + 1 pair
  });

  test('seven pairs decomposition', () => {
    const hand = [
      man(1), man(1), man(2), man(2), man(3), man(3),
      pin(4), pin(4), pin(5), pin(5), sou(6), sou(6),
      wind(1),
    ];
    const winTile = wind(1);
    const decomps = decompose(hand, winTile, []);
    const sevenPairDecomp = decomps.find(d => d.type === 'seven-pairs');
    expect(sevenPairDecomp).toBeDefined();
    expect(sevenPairDecomp!.groups.length).toBe(7);
    expect(sevenPairDecomp!.groups.every(g => g.type === 'pair')).toBe(true);
  });

  test('returns multiple decompositions when ambiguous', () => {
    // 111m 234m 678m 456p 99p — pair is pin9
    const hand = [
      man(1), man(1), man(1),
      man(2), man(3), man(4),
      man(6), man(7), man(8),
      pin(4), pin(5), pin(6),
      pin(9),
    ];
    const winTile = pin(9);
    const decomps = decompose(hand, winTile, []);
    expect(decomps.length).toBeGreaterThan(0);
  });
});

// ── isSevenPairs ──────────────────────────────────────────────────────────────

describe('isSevenPairs', () => {
  test('valid seven pairs', () => {
    const tiles = [
      man(1), man(1), man(3), man(3), man(5), man(5),
      pin(2), pin(2), pin(7), pin(7), sou(4), sou(4),
      dragon(1), dragon(1),
    ];
    expect(isSevenPairs(tiles)).toBe(true);
  });

  test('rejects if any tile count is not exactly 2', () => {
    const tiles = [
      man(1), man(1), man(1), man(3), man(5), man(5),
      pin(2), pin(2), pin(7), pin(7), sou(4), sou(4),
      dragon(1), dragon(1),
    ];
    expect(isSevenPairs(tiles)).toBe(false);
  });

  test('rejects wrong tile count', () => {
    expect(isSevenPairs([man(1), man(1)])).toBe(false);
  });
});

// ── isKnittedHand ─────────────────────────────────────────────────────────────

describe('isKnittedHand', () => {
  test('invalid knitted: sou tile outside any available pattern', () => {
    // man uses {1,4,7}, pin uses {2,5,8} → sou must use {3,6,9}
    // sou(4) is in {1,4,7} (taken by man), not in {2,5,8} or {3,6,9} → fails
    const tiles = [
      man(1), man(4), man(7),
      pin(2), pin(5), pin(8),
      sou(4), // 4 only belongs to {1,4,7} already assigned to man
      wind(1), wind(2), wind(3), wind(4),
      dragon(1), dragon(2), dragon(3),
    ];
    expect(isKnittedHand(tiles)).toBe(false);
  });

  test('valid knitted hand: all 7 honors + 147m 258p 369s', () => {
    const tiles = [
      man(1), man(4), man(7),
      pin(2), pin(5), pin(8),
      sou(3),
      wind(1), wind(2), wind(3), wind(4),
      dragon(1), dragon(2), dragon(3),
    ];
    expect(isKnittedHand(tiles)).toBe(true);
  });

  test('invalid: honors are not all 7 different', () => {
    const tiles = [
      man(1), man(4), man(7),
      pin(2), pin(5), pin(8),
      sou(3),
      wind(1), wind(2), wind(3), wind(4),
      dragon(1), dragon(1), dragon(3), // dragon(1) repeated instead of dragon(2)
    ];
    expect(isKnittedHand(tiles)).toBe(false);
  });
});

// ── getTenpaiTiles ────────────────────────────────────────────────────────────

describe('getTenpaiTiles', () => {
  test('single-sided wait (tanki): waiting for pair', () => {
    // 123 456 789m 111p + wind(1) → waiting for wind(1)
    const hand = [
      man(1), man(2), man(3),
      man(4), man(5), man(6),
      man(7), man(8), man(9),
      pin(1), pin(1), pin(1),
      wind(1),
    ];
    const waits = getTenpaiTiles(hand, []);
    expect(waits.some(t => sameTile(t, wind(1)))).toBe(true);
  });

  test('two-sided wait (ryanmen): 23s waits for 1s or 4s', () => {
    // 13-tile tenpai: 123m 456m 123p + 99p (pair) + 23s
    const hand = [
      man(1), man(2), man(3),
      man(4), man(5), man(6),
      pin(1), pin(2), pin(3),
      pin(9), pin(9),
      sou(2), sou(3),
    ];
    const waits = getTenpaiTiles(hand, []);
    expect(waits.some(t => sameTile(t, sou(1)))).toBe(true);
    expect(waits.some(t => sameTile(t, sou(4)))).toBe(true);
  });

  test('not tenpai: returns empty array', () => {
    // 13 tiles with no valid completion
    const hand = [
      man(1), man(3), man(5), man(7), man(9),
      pin(1), pin(3), pin(5), pin(7), pin(9),
      sou(1), sou(3), sou(5),
    ];
    const waits = getTenpaiTiles(hand, []);
    expect(waits.length).toBe(0);
  });
});

// ── sortTiles ─────────────────────────────────────────────────────────────────

describe('sortTiles', () => {
  test('sorts by suit then value', () => {
    const tiles = [dragon(1), wind(3), sou(5), pin(2), man(8)];
    const sorted = sortTiles([...tiles]);
    expect(sorted[0]).toEqual(expect.objectContaining({ suit: 'man', value: 8 }));
    expect(sorted[1]).toEqual(expect.objectContaining({ suit: 'pin', value: 2 }));
    expect(sorted[2]).toEqual(expect.objectContaining({ suit: 'sou', value: 5 }));
    expect(sorted[3]).toEqual(expect.objectContaining({ suit: 'wind', value: 3 }));
    expect(sorted[4]).toEqual(expect.objectContaining({ suit: 'dragon', value: 1 }));
  });
});
