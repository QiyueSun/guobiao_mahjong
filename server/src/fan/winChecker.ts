import { Tile, Meld, Decomposition, Group } from '../types';

// ── Tile helpers ──────────────────────────────────────────────────────────────

export function tileKey(t: Tile): string {
  return `${t.suit}:${t.value}`;
}

export function sameTile(a: Tile, b: Tile): boolean {
  return a.suit === b.suit && a.value === b.value;
}

export function isTerminal(t: Tile): boolean {
  return (t.suit === 'man' || t.suit === 'pin' || t.suit === 'sou') &&
    (t.value === 1 || t.value === 9);
}

export function isHonor(t: Tile): boolean {
  return t.suit === 'wind' || t.suit === 'dragon';
}

export function isFlower(t: Tile): boolean {
  return t.suit === 'flower';
}

export function isSimple(t: Tile): boolean {
  return !isTerminal(t) && !isHonor(t) && !isFlower(t);
}

export function isNumberSuit(t: Tile): boolean {
  return t.suit === 'man' || t.suit === 'pin' || t.suit === 'sou';
}

// ── Winning check ─────────────────────────────────────────────────────────────

export function isWinnable(handTiles: Tile[], melds: Meld[]): boolean {
  const playTiles = handTiles.filter(t => !isFlower(t));
  const neededGroups = 4 - melds.length;

  if (isSevenPairs(playTiles)) return true;
  if (isKnittedHand(playTiles)) return true;
  return canFormStandard(sortTiles([...playTiles]), neededGroups);
}

// All valid decompositions of a winning hand (hand + win tile combined)
export function decompose(
  handTiles: Tile[],
  winTile: Tile,
  melds: Meld[],
): Decomposition[] {
  const playTiles = [...handTiles.filter(t => !isFlower(t)), winTile];
  const meldTiles = melds.flatMap(m => m.tiles);
  const fullTiles = [...meldTiles, ...playTiles];
  const results: Decomposition[] = [];

  // Seven pairs
  if (isSevenPairs(playTiles)) {
    const groups: Group[] = [];
    const sorted = sortTiles([...playTiles]);
    for (let i = 0; i < sorted.length; i += 2) {
      groups.push({ type: 'pair', tiles: [sorted[i], sorted[i + 1]], concealed: true });
    }
    results.push({
      type: 'seven-pairs',
      groups,
      allTiles: fullTiles,
      concealedTiles: playTiles,
      melds,
    });
  }

  // Knitted hand (七星不靠)
  if (isKnittedHand(playTiles) && melds.length === 0) {
    results.push({
      type: 'knitted',
      groups: [],
      allTiles: fullTiles,
      concealedTiles: playTiles,
      melds: [],
    });
  }

  // Standard (4 melds + 1 pair)
  const meldGroups: Group[] = melds.map(m => ({
    type: meldTypeToGroupType(m.type),
    tiles: m.tiles,
    concealed: m.type === 'kong_closed',
  }));

  const neededGroups = 4 - melds.length;
  const sorted = sortTiles([...playTiles]);
  const standardDecomps = findStandardDecomps(sorted, neededGroups, []);

  for (const groups of standardDecomps) {
    results.push({
      type: 'standard',
      groups: [...meldGroups, ...groups],
      allTiles: fullTiles,
      concealedTiles: playTiles,
      melds,
    });
  }

  return results;
}

function meldTypeToGroupType(mt: string): 'chow' | 'pung' | 'kong' {
  if (mt === 'chi') return 'chow';
  if (mt === 'pong') return 'pung';
  return 'kong';
}

// ── Standard hand decomposition ───────────────────────────────────────────────

function findStandardDecomps(
  tiles: Tile[],
  needed: number,
  current: Group[],
): Group[][] {
  if (needed === 0 && tiles.length === 0) return [current];
  if (tiles.length === 0 && needed > 0) return [];

  const results: Group[][] = [];

  if (needed === 0) {
    // All groups formed, remaining tiles must form exactly 1 pair
    if (tiles.length === 2 && sameTile(tiles[0], tiles[1])) {
      results.push([...current, { type: 'pair', tiles, concealed: true }]);
    }
    return results;
  }

  // When we have exactly 2*(needed) + 2 tiles left, one must become the pair
  // Actually: we need `needed` melds + 1 pair from tiles
  // tiles.length should be needed*3 + 2
  if (tiles.length !== needed * 3 + 2) return [];

  // Try every unique tile as the pair candidate
  const triedPairs = new Set<string>();
  for (let i = 0; i < tiles.length; i++) {
    const pairTile = tiles[i];
    const key = tileKey(pairTile);
    if (triedPairs.has(key)) continue;
    const pairIdx = tiles.findIndex((t, j) => j > i && sameTile(t, pairTile));
    if (pairIdx === -1) continue;
    triedPairs.add(key);
    const rest = tiles.filter((_, j) => j !== i && j !== pairIdx);
    const pairGroup: Group = { type: 'pair', tiles: [pairTile, tiles[pairIdx]], concealed: true };
    const meldDecomps = findAllMelds(rest, needed, []);
    for (const meldSet of meldDecomps) {
      results.push([pairGroup, ...meldSet]);
    }
  }

  return results;
}

function findAllMelds(tiles: Tile[], needed: number, current: Group[]): Group[][] {
  if (needed === 0) return tiles.length === 0 ? [current] : [];
  if (tiles.length < 3) return [];

  const results: Group[][] = [];
  const first = tiles[0];

  // Try pung
  if (tiles.filter(t => sameTile(t, first)).length >= 3) {
    const idxs = [0];
    let found = 1;
    for (let i = 1; i < tiles.length && found < 3; i++) {
      if (sameTile(tiles[i], first)) { idxs.push(i); found++; }
    }
    if (found === 3) {
      const meldTiles = idxs.map(i => tiles[i]);
      const rest = tiles.filter((_, i) => !idxs.includes(i));
      const pung: Group = { type: 'pung', tiles: meldTiles, concealed: true };
      const sub = findAllMelds(rest, needed - 1, [...current, pung]);
      results.push(...sub);
    }
  }

  // Try chow (only for number suits)
  if (isNumberSuit(first)) {
    const v2 = tiles.findIndex((t, i) => i > 0 && t.suit === first.suit && t.value === first.value + 1);
    const v3 = tiles.findIndex((t, i) => i > 0 && t.suit === first.suit && t.value === first.value + 2);
    if (v2 !== -1 && v3 !== -1) {
      const chowTiles = [first, tiles[v2], tiles[v3]];
      const rest = tiles.filter((_, i) => i !== 0 && i !== v2 && i !== v3);
      const chow: Group = { type: 'chow', tiles: chowTiles, concealed: true };
      const sub = findAllMelds(rest, needed - 1, [...current, chow]);
      results.push(...sub);
    }
  }

  return results;
}

function canFormStandard(tiles: Tile[], neededMelds: number): boolean {
  if (tiles.length !== neededMelds * 3 + 2) return false;

  // Try each possible pair
  const tried = new Set<string>();
  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i];
    const key = tileKey(t);
    if (tried.has(key)) continue;
    tried.add(key);

    const pairIdx = tiles.findIndex((x, j) => j > i && sameTile(x, t));
    if (pairIdx === -1) continue;

    const rest = tiles.filter((_, j) => j !== i && j !== pairIdx);
    if (canFormMelds(rest, neededMelds)) return true;
  }
  return false;
}

function canFormMelds(tiles: Tile[], needed: number): boolean {
  if (needed === 0) return tiles.length === 0;
  if (tiles.length < 3) return false;

  const sorted = sortTiles([...tiles]);
  const first = sorted[0];

  // Try pung
  if (sorted.filter(t => sameTile(t, first)).length >= 3) {
    let removed = 0;
    const rest = sorted.filter(t => {
      if (removed < 3 && sameTile(t, first)) { removed++; return false; }
      return true;
    });
    if (canFormMelds(rest, needed - 1)) return true;
  }

  // Try chow
  if (isNumberSuit(first)) {
    const v2 = sorted.findIndex((t, i) => i > 0 && t.suit === first.suit && t.value === first.value + 1);
    const v3 = sorted.findIndex((t, i) => i > 0 && t.suit === first.suit && t.value === first.value + 2);
    if (v2 !== -1 && v3 !== -1) {
      const rest = sorted.filter((_, i) => i !== 0 && i !== v2 && i !== v3);
      if (canFormMelds(rest, needed - 1)) return true;
    }
  }

  return false;
}

// ── Seven pairs ───────────────────────────────────────────────────────────────

export function isSevenPairs(tiles: Tile[]): boolean {
  if (tiles.length !== 14) return false;
  const counts = new Map<string, number>();
  for (const t of tiles) {
    const k = tileKey(t);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  for (const v of counts.values()) {
    if (v !== 2) return false;
  }
  return counts.size === 7;
}

// ── Knitted hand (七星不靠 / greater honors + knitted tiles) ──────────────────

export function isKnittedHand(tiles: Tile[]): boolean {
  if (tiles.length !== 14) return false;

  const honors = tiles.filter(isHonor);
  const numbers = tiles.filter(t => !isHonor(t));

  // Need all 7 different honor tiles
  if (honors.length !== 7) return false;
  const honorSet = new Set(honors.map(tileKey));
  if (honorSet.size !== 7) return false;
  // Must have all winds + all dragons
  const allHonorKeys = ['wind:1','wind:2','wind:3','wind:4','dragon:1','dragon:2','dragon:3'];
  if (!allHonorKeys.every(k => honorSet.has(k))) return false;

  // Remaining 7 number tiles: each suit uses one arithmetic pattern {1,4,7}/{2,5,8}/{3,6,9};
  // suits may contribute partial sets (e.g. only 1 tile from its pattern).
  const patterns = [
    [1, 4, 7], [2, 5, 8], [3, 6, 9],
  ];
  const suits = ['man', 'pin', 'sou'] as const;

  for (const perm of permutations(patterns)) {
    let match = true;
    for (let s = 0; s < 3; s++) {
      const suit = suits[s];
      const allowed = new Set(perm[s]);
      const suitValues = numbers.filter(t => t.suit === suit).map(t => t.value);
      // All tiles in this suit must come from the assigned pattern; no duplicates within suit
      if (new Set(suitValues).size !== suitValues.length) { match = false; break; }
      if (!suitValues.every(v => allowed.has(v))) { match = false; break; }
    }
    if (match) return true;
  }

  return false;
}

function permutations<T>(arr: T[]): T[][] {
  if (arr.length <= 1) return [arr];
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i++) {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
    for (const p of permutations(rest)) {
      result.push([arr[i], ...p]);
    }
  }
  return result;
}

// ── Tenpai check: what tiles complete a hand ─────────────────────────────────

export function getTenpaiTiles(hand: Tile[], melds: Meld[]): Tile[] {
  const candidates: Tile[] = [];
  const tried = new Set<string>();

  // Try every possible tile as the winning tile
  const allPossible = generateAllTileTypes();
  for (const t of allPossible) {
    const key = tileKey(t);
    if (tried.has(key)) continue;
    tried.add(key);
    if (isWinnable([...hand, t], melds)) {
      candidates.push(t);
    }
  }
  return candidates;
}

function generateAllTileTypes(): Tile[] {
  const tiles: Tile[] = [];
  for (const suit of ['man', 'pin', 'sou'] as const) {
    for (let v = 1; v <= 9; v++) {
      tiles.push({ id: `${suit[0]}${v}_x`, suit, value: v });
    }
  }
  for (let v = 1; v <= 4; v++) {
    tiles.push({ id: `w${v}_x`, suit: 'wind', value: v });
  }
  for (let v = 1; v <= 3; v++) {
    tiles.push({ id: `d${v}_x`, suit: 'dragon', value: v });
  }
  return tiles;
}

// ── Sort tiles ────────────────────────────────────────────────────────────────

const SUIT_ORDER: Record<string, number> = {
  man: 0, pin: 1, sou: 2, wind: 3, dragon: 4, flower: 5,
};

export function sortTiles(tiles: Tile[]): Tile[] {
  return tiles.sort((a, b) => {
    const so = SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit];
    return so !== 0 ? so : a.value - b.value;
  });
}
