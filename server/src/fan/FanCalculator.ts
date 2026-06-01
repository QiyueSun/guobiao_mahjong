import {
  Tile, Meld, WinContext, FanResult, FanEntry, FlowerBonusEntry,
  Decomposition, Group,
} from '../types';
import {
  tileKey, sameTile, isTerminal, isHonor, isSimple, isNumberSuit,
  decompose, isSevenPairs, isKnittedHand, sortTiles,
} from './winChecker';

// ── Fan rule definition ───────────────────────────────────────────────────────

type FanCheck = (d: Decomposition, ctx: WinContext) => boolean;

interface FanRule {
  name: string;
  value: number;
  check: FanCheck;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function allGroupsOf(d: Decomposition, ...types: Group['type'][]): Group[] {
  return d.groups.filter(g => types.includes(g.type));
}

function isPung(g: Group): boolean {
  return g.type === 'pung' || g.type === 'kong';
}

function allTiles(d: Decomposition): Tile[] {
  return d.allTiles;
}

function groupTiles(d: Decomposition): Tile[] {
  return d.groups.flatMap(g => g.tiles);
}

function windValue(w: string): number {
  const m: Record<string, number> = { east: 1, south: 2, west: 3, north: 4 };
  return m[w] ?? 0;
}

function isGreenTile(t: Tile): boolean {
  if (t.suit === 'sou' && [2, 3, 4, 6, 8].includes(t.value)) return true;
  if (t.suit === 'dragon' && t.value === 2) return true; // 发
  return false;
}

function concealedPungsIn(d: Decomposition): number {
  return d.groups.filter(g => isPung(g) && g.concealed).length;
}

function getPair(d: Decomposition): Group | undefined {
  return d.groups.find(g => g.type === 'pair');
}

function getChows(d: Decomposition): Group[] {
  return d.groups.filter(g => g.type === 'chow');
}

function getPungs(d: Decomposition): Group[] {
  return d.groups.filter(g => isPung(g));
}

function getKongs(d: Decomposition): Group[] {
  return d.groups.filter(g => g.type === 'kong');
}

function getOpenMelds(ctx: WinContext): Meld[] {
  return ctx.melds.filter(m => m.type !== 'kong_closed');
}

function isConcealed(ctx: WinContext): boolean {
  return ctx.melds.every(m => m.type === 'kong_closed');
}

// ── Individual fan rules ──────────────────────────────────────────────────────

// 88 fan
function bigFourWinds(d: Decomposition, ctx: WinContext): boolean {
  const pungs = getPungs(d);
  const windPungs = pungs.filter(g => g.tiles[0].suit === 'wind');
  return windPungs.length >= 4;
}

function bigThreeDragons(d: Decomposition, _ctx: WinContext): boolean {
  const pungs = getPungs(d);
  const dragonPungs = pungs.filter(g => g.tiles[0].suit === 'dragon');
  return dragonPungs.length >= 3;
}

function nineGates(d: Decomposition, ctx: WinContext): boolean {
  if (!isConcealed(ctx)) return false;
  const tiles = allTiles(d);
  if (new Set(tiles.map(t => t.suit)).size !== 1) return false;
  const suit = tiles[0].suit;
  if (!isNumberSuit(tiles[0])) return false;
  const counts = new Array(10).fill(0);
  for (const t of tiles) counts[t.value]++;
  return counts[1] >= 3 && counts[9] >= 3 &&
    counts[2] >= 1 && counts[3] >= 1 && counts[4] >= 1 &&
    counts[5] >= 1 && counts[6] >= 1 && counts[7] >= 1 && counts[8] >= 1;
}

function fourConcealedPungs(d: Decomposition, ctx: WinContext): boolean {
  if (d.type === 'seven-pairs') return false;
  return concealedPungsIn(d) >= 4 && ctx.winType === 'self';
}

function allHonors(d: Decomposition, _ctx: WinContext): boolean {
  return allTiles(d).every(isHonor);
}

function allGreen(d: Decomposition, _ctx: WinContext): boolean {
  return allTiles(d).every(isGreenTile);
}

function allTerminalsPure(d: Decomposition, _ctx: WinContext): boolean {
  return allTiles(d).every(isTerminal);
}

// 64 fan
function littleFourWinds(d: Decomposition, _ctx: WinContext): boolean {
  const pungs = getPungs(d);
  const pair = getPair(d);
  const windPungs = pungs.filter(g => g.tiles[0].suit === 'wind').length;
  const windPair = pair && pair.tiles[0].suit === 'wind';
  return windPungs === 3 && !!windPair;
}

function littleThreeDragons(d: Decomposition, _ctx: WinContext): boolean {
  const pungs = getPungs(d);
  const pair = getPair(d);
  const dragonPungs = pungs.filter(g => g.tiles[0].suit === 'dragon').length;
  const dragonPair = pair && pair.tiles[0].suit === 'dragon';
  return dragonPungs === 2 && !!dragonPair;
}

function fourKongs(d: Decomposition, ctx: WinContext): boolean {
  const allKongs = [...getKongs(d), ...ctx.melds.filter(m =>
    m.type === 'kong_open' || m.type === 'kong_closed' || m.type === 'kong_added'
  )];
  return allKongs.length >= 4;
}

function allPungs(d: Decomposition, _ctx: WinContext): boolean {
  const nonPair = d.groups.filter(g => g.type !== 'pair');
  return nonPair.every(g => isPung(g));
}

// 48 fan
function mixedTerminals(d: Decomposition, _ctx: WinContext): boolean {
  const tiles = allTiles(d);
  return tiles.every(t => isTerminal(t) || isHonor(t));
}

function sevenPairsCheck(d: Decomposition, _ctx: WinContext): boolean {
  return d.type === 'seven-pairs';
}

function greaterHonorsKnitted(d: Decomposition, _ctx: WinContext): boolean {
  return d.type === 'knitted';
}

function allEvenPungs(d: Decomposition, _ctx: WinContext): boolean {
  const tiles = allTiles(d);
  return tiles.every(t => isNumberSuit(t) && t.value % 2 === 0) &&
    d.groups.every(g => g.type !== 'chow');
}

// 32 fan
function pureFlush(d: Decomposition, _ctx: WinContext): boolean {
  const tiles = allTiles(d).filter(t => !isHonor(t));
  if (tiles.length !== allTiles(d).length) return false; // has honors
  const suits = new Set(tiles.map(t => t.suit));
  return suits.size === 1;
}

function pureTriplechow(d: Decomposition, _ctx: WinContext): boolean {
  const chows = getChows(d);
  if (chows.length < 3) return false;
  const keys = chows.map(c => chowKey(c));
  return countMax(keys) >= 3;
}

function fourShiftedChows(d: Decomposition, _ctx: WinContext): boolean {
  const chows = getChows(d);
  if (chows.length < 4) return false;
  return hasShiftedSequence(chows, 4, 1) || hasShiftedSequence(chows, 4, 2);
}

function threeKongs(d: Decomposition, ctx: WinContext): boolean {
  const kongCount = getKongs(d).length +
    ctx.melds.filter(m => m.type.startsWith('kong')).length;
  return kongCount >= 3;
}

function mixedDoubledChow(d: Decomposition, _ctx: WinContext): boolean {
  const chows = getChows(d);
  if (chows.length < 2) return false;
  for (let i = 0; i < chows.length; i++) {
    for (let j = i + 1; j < chows.length; j++) {
      const a = chows[i].tiles[0];
      const b = chows[j].tiles[0];
      if (a.value === b.value && a.suit !== b.suit) return true;
    }
  }
  return false;
}

// 24 fan
function upperFour(d: Decomposition, _ctx: WinContext): boolean {
  return allTiles(d).filter(isNumberSuit).every(t => t.value >= 6);
}

function lowerFour(d: Decomposition, _ctx: WinContext): boolean {
  return allTiles(d).filter(isNumberSuit).every(t => t.value <= 4);
}

function tripleIdenticalPungs(d: Decomposition, _ctx: WinContext): boolean {
  const pungs = getPungs(d);
  if (pungs.length < 3) return false;
  for (let i = 0; i < pungs.length - 2; i++) {
    const v = pungs[i].tiles[0].value;
    const suits = pungs.slice(i).filter(p => p.tiles[0].value === v).map(p => p.tiles[0].suit);
    if (new Set(suits).size >= 3) return true;
  }
  return false;
}

function threeConcealedPungs(d: Decomposition, ctx: WinContext): boolean {
  return concealedPungsIn(d) >= 3;
}

function upperTiles(d: Decomposition, _ctx: WinContext): boolean {
  return allTiles(d).filter(isNumberSuit).every(t => t.value >= 7);
}

function middleTiles(d: Decomposition, _ctx: WinContext): boolean {
  return allTiles(d).filter(isNumberSuit).every(t => t.value >= 4 && t.value <= 6);
}

function lowerTiles(d: Decomposition, _ctx: WinContext): boolean {
  return allTiles(d).filter(isNumberSuit).every(t => t.value <= 3);
}

function allWithFives(d: Decomposition, _ctx: WinContext): boolean {
  return d.groups.every(g => g.tiles.some(t => isNumberSuit(t) && t.value === 5));
}

function pureFourIdenticalChows(d: Decomposition, _ctx: WinContext): boolean {
  const keys = getChows(d).map(chowKey);
  return countMax(keys) >= 4;
}

function pureFourSteppedChows(d: Decomposition, _ctx: WinContext): boolean {
  const chows = getChows(d);
  if (chows.length < 4) return false;
  return hasShiftedSequence(chows, 4, 3);
}

// 16 fan
function pureStraight(d: Decomposition, _ctx: WinContext): boolean {
  const chows = getChows(d);
  if (chows.length < 3) return false;
  const suits = ['man', 'pin', 'sou'] as const;
  for (const suit of suits) {
    const suitChows = chows.filter(c => c.tiles[0].suit === suit).map(c => c.tiles[0].value).sort((a,b)=>a-b);
    if (suitChows.length >= 3) {
      for (let i = 0; i <= suitChows.length - 3; i++) {
        if (suitChows[i] === 1 && suitChows[i+1] === 4 && suitChows[i+2] === 7) return true;
      }
    }
  }
  return false;
}

function allTerminalMelds(d: Decomposition, _ctx: WinContext): boolean {
  return d.groups.every(g => g.tiles.some(t => isTerminal(t) || isHonor(t)));
}

function threeWindPungs(d: Decomposition, _ctx: WinContext): boolean {
  return getPungs(d).filter(g => g.tiles[0].suit === 'wind').length >= 3;
}

function mixedStraight(d: Decomposition, _ctx: WinContext): boolean {
  const chows = getChows(d);
  if (chows.length < 3) return false;
  const suits = ['man', 'pin', 'sou'];
  const suitsPresent = new Set(chows.map(c => c.tiles[0].suit));
  if (suitsPresent.size < 3) return false;
  for (const s1 of suits) {
    for (const s2 of suits) {
      for (const s3 of suits) {
        if (s1 === s2 || s2 === s3 || s1 === s3) continue;
        const c1 = chows.find(c => c.tiles[0].suit === s1 && c.tiles[0].value === 1);
        const c2 = chows.find(c => c.tiles[0].suit === s2 && c.tiles[0].value === 4);
        const c3 = chows.find(c => c.tiles[0].suit === s3 && c.tiles[0].value === 7);
        if (c1 && c2 && c3) return true;
      }
    }
  }
  return false;
}

function triColorStraight(d: Decomposition, _ctx: WinContext): boolean {
  const chows = getChows(d);
  if (chows.length < 3) return false;
  const byVal = new Map<number, Set<string>>();
  for (const c of chows) {
    const v = c.tiles[0].value;
    if (!byVal.has(v)) byVal.set(v, new Set());
    byVal.get(v)!.add(c.tiles[0].suit);
  }
  for (const suits of byVal.values()) {
    if (suits.size >= 3) return true;
  }
  return false;
}

// 12 fan
function bigThreeWinds(d: Decomposition, _ctx: WinContext): boolean {
  const windPungs = getPungs(d).filter(g => g.tiles[0].suit === 'wind').length;
  return windPungs >= 3;
}

function reversibleTiles(d: Decomposition, _ctx: WinContext): boolean {
  const reversible = new Set(['pin:2', 'pin:4', 'pin:5', 'pin:6', 'pin:8', 'pin:9',
    'sou:2', 'sou:4', 'sou:5', 'sou:6', 'sou:8', 'sou:9',
    'dragon:3']); // 白 is reversible
  return allTiles(d).every(t => reversible.has(tileKey(t)));
}

function tripleHomogeneousChow(d: Decomposition, _ctx: WinContext): boolean {
  const chows = getChows(d);
  if (chows.length < 3) return false;
  const suitsNeeded = new Set(['man', 'pin', 'sou']);
  const byVal = new Map<number, Set<string>>();
  for (const c of chows) {
    const v = c.tiles[0].value;
    if (!byVal.has(v)) byVal.set(v, new Set());
    byVal.get(v)!.add(c.tiles[0].suit);
  }
  for (const suits of byVal.values()) {
    if (suitsNeeded.size === [...suits].filter(s => suitsNeeded.has(s)).length) return true;
  }
  return false;
}

function halfFlush(d: Decomposition, _ctx: WinContext): boolean {
  const tiles = allTiles(d);
  const numTiles = tiles.filter(isNumberSuit);
  const honorTiles = tiles.filter(isHonor);
  if (honorTiles.length === 0) return false;
  if (numTiles.length === 0) return false;
  const suits = new Set(numTiles.map(t => t.suit));
  return suits.size === 1;
}

function noHonors(d: Decomposition, _ctx: WinContext): boolean {
  return allTiles(d).every(t => !isHonor(t));
}

// 8 fan
function heavenlyHand(_d: Decomposition, ctx: WinContext): boolean {
  return !!ctx.isTenpaiStart && ctx.winType === 'self';
}

function earthlyHand(_d: Decomposition, ctx: WinContext): boolean {
  return !!ctx.isTenpaiStart && ctx.winType === 'discard';
}

function selfReliant(d: Decomposition, ctx: WinContext): boolean {
  return isConcealed(ctx) && ctx.winType === 'self';
}

function twoConcealedKongs(d: Decomposition, _ctx: WinContext): boolean {
  return d.groups.filter(g => g.type === 'kong' && g.concealed).length >= 2;
}

function twoDragonPungs(d: Decomposition, _ctx: WinContext): boolean {
  return getPungs(d).filter(g => g.tiles[0].suit === 'dragon').length >= 2;
}

// 6 fan
function allClaimed(d: Decomposition, ctx: WinContext): boolean {
  return getOpenMelds(ctx).length === 4 && ctx.winType === 'discard';
}

function twoMeldedKongs(d: Decomposition, ctx: WinContext): boolean {
  const openKongs = ctx.melds.filter(m => m.type === 'kong_open' || m.type === 'kong_added').length;
  return openKongs >= 2;
}

function lesserHonorsKnitted(d: Decomposition, _ctx: WinContext): boolean {
  if (d.type !== 'knitted') return false;
  return true; // basic knitted without all 7 honors
}

// 4 fan
function edgeWait(_d: Decomposition, ctx: WinContext): boolean {
  const t = ctx.winTile;
  if (!isNumberSuit(t)) return false;
  // 3 completing 1-2-3 or 7 completing 7-8-9
  return t.value === 3 || t.value === 7;
}

function closedWait(_d: Decomposition, ctx: WinContext): boolean {
  // kanchan: waiting for middle tile of a chow
  const t = ctx.winTile;
  if (!isNumberSuit(t)) return false;
  // Hard to determine without full context; approximate
  return false; // placeholder
}

function singleWait(d: Decomposition, ctx: WinContext): boolean {
  const pair = getPair(d);
  return !!pair && sameTile(pair.tiles[0], ctx.winTile);
}

function prevailingWindPung(d: Decomposition, ctx: WinContext): boolean {
  const rv = windValue(ctx.roundWind);
  return getPungs(d).some(g => g.tiles[0].suit === 'wind' && g.tiles[0].value === rv);
}

function seatWindPung(d: Decomposition, ctx: WinContext): boolean {
  const sv = windValue(ctx.seatWind);
  return getPungs(d).some(g => g.tiles[0].suit === 'wind' && g.tiles[0].value === sv);
}

function kongDraw(_d: Decomposition, ctx: WinContext): boolean {
  return ctx.isAfterKong && ctx.winType === 'self';
}

function seabedMoon(_d: Decomposition, ctx: WinContext): boolean {
  return ctx.isLastTile && ctx.winType === 'self';
}

function riverBottom(_d: Decomposition, ctx: WinContext): boolean {
  return ctx.isLastTile && ctx.winType === 'discard';
}

function robbingKong(_d: Decomposition, ctx: WinContext): boolean {
  return ctx.isRobbingKong;
}

function doublePungCheck(d: Decomposition, _ctx: WinContext): boolean {
  const pungs = getPungs(d);
  const byVal = new Map<number, number>();
  for (const p of pungs) {
    if (isNumberSuit(p.tiles[0])) {
      const v = p.tiles[0].value;
      byVal.set(v, (byVal.get(v) ?? 0) + 1);
    }
  }
  for (const c of byVal.values()) {
    if (c >= 2) return true;
  }
  return false;
}

// 2 fan
function concealedHand(_d: Decomposition, ctx: WinContext): boolean {
  return isConcealed(ctx);
}

function allChows(d: Decomposition, ctx: WinContext): boolean {
  const nonPair = d.groups.filter(g => g.type !== 'pair');
  if (!nonPair.every(g => g.type === 'chow')) return false;
  const pair = getPair(d);
  if (!pair) return false;
  const pairTile = pair.tiles[0];
  // pair must not be a value tile (wind/dragon or round/seat wind)
  if (isHonor(pairTile)) return false;
  return true;
}

function pureDoubleChow(d: Decomposition, _ctx: WinContext): boolean {
  const keys = getChows(d).map(chowKey);
  return countMax(keys) >= 2;
}

function mixedDoubleChow(d: Decomposition, _ctx: WinContext): boolean {
  const chows = getChows(d);
  for (let i = 0; i < chows.length; i++) {
    for (let j = i + 1; j < chows.length; j++) {
      const a = chows[i].tiles[0];
      const b = chows[j].tiles[0];
      if (a.value === b.value && a.suit !== b.suit) return true;
    }
  }
  return false;
}

function shortStraight(d: Decomposition, _ctx: WinContext): boolean {
  const chows = getChows(d);
  for (let i = 0; i < chows.length; i++) {
    for (let j = i + 1; j < chows.length; j++) {
      const a = chows[i].tiles[0];
      const b = chows[j].tiles[0];
      if (a.suit === b.suit && Math.abs(a.value - b.value) === 3) return true;
    }
  }
  return false;
}

function terminalChows(d: Decomposition, _ctx: WinContext): boolean {
  const chows = getChows(d);
  const suits = ['man', 'pin', 'sou'] as const;
  for (const suit of suits) {
    const has1 = chows.some(c => c.tiles[0].suit === suit && c.tiles[0].value === 1);
    const has7 = chows.some(c => c.tiles[0].suit === suit && c.tiles[0].value === 7);
    if (has1 && has7) return true;
  }
  return false;
}

function terminalPung(d: Decomposition, _ctx: WinContext): boolean {
  return getPungs(d).some(g => isTerminal(g.tiles[0]));
}

function allSimples(d: Decomposition, _ctx: WinContext): boolean {
  return allTiles(d).every(isSimple);
}

function tileHog(d: Decomposition, _ctx: WinContext): boolean {
  const counts = new Map<string, number>();
  for (const t of allTiles(d)) {
    const k = tileKey(t);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts.values()].some(c => c >= 4);
}

function selfDraw(_d: Decomposition, ctx: WinContext): boolean {
  return ctx.winType === 'self';
}

// Dragon pungs (individual)
function dragonPung(value: number): FanCheck {
  return (d) => getPungs(d).some(g => g.tiles[0].suit === 'dragon' && g.tiles[0].value === value);
}

// ── Three shifted chows (一色三步高) ──────────────────────────────────────────

function pureThreeShiftedChows(d: Decomposition, _ctx: WinContext): boolean {
  const chows = getChows(d);
  if (chows.length < 3) return false;
  return hasShiftedSequence(chows, 3, 1) || hasShiftedSequence(chows, 3, 2);
}

// ── All fan rules ─────────────────────────────────────────────────────────────

const ALL_RULES: FanRule[] = [
  // 88
  { name: '大四喜',  value: 88, check: bigFourWinds },
  { name: '大三元',  value: 88, check: bigThreeDragons },
  { name: '九莲宝灯', value: 88, check: nineGates },
  { name: '四暗刻',  value: 88, check: fourConcealedPungs },
  { name: '字一色',  value: 88, check: allHonors },
  { name: '绿一色',  value: 88, check: allGreen },
  { name: '清幺九',  value: 88, check: allTerminalsPure },
  // 64
  { name: '小四喜',  value: 64, check: littleFourWinds },
  { name: '小三元',  value: 64, check: littleThreeDragons },
  { name: '四杠',    value: 64, check: fourKongs },
  { name: '碰碰和',  value: 64, check: allPungs },
  // 48
  { name: '混幺九',  value: 48, check: mixedTerminals },
  { name: '七对',    value: 48, check: sevenPairsCheck },
  { name: '七星不靠', value: 48, check: greaterHonorsKnitted },
  { name: '全双刻',  value: 48, check: allEvenPungs },
  // 32
  { name: '清一色',  value: 32, check: pureFlush },
  { name: '一色三同顺', value: 32, check: pureTriplechow },
  { name: '一色四步高', value: 32, check: fourShiftedChows },
  { name: '三杠',    value: 32, check: threeKongs },
  { name: '混双刻',  value: 32, check: mixedDoubledChow },
  // 24
  { name: '大于五',  value: 24, check: upperFour },
  { name: '小于五',  value: 24, check: lowerFour },
  { name: '三同刻',  value: 24, check: tripleIdenticalPungs },
  { name: '三暗刻',  value: 24, check: threeConcealedPungs },
  { name: '全大',    value: 24, check: upperTiles },
  { name: '全中',    value: 24, check: middleTiles },
  { name: '全小',    value: 24, check: lowerTiles },
  { name: '全带五',  value: 24, check: allWithFives },
  { name: '一色四同顺', value: 24, check: pureFourIdenticalChows },
  { name: '一色四节高', value: 24, check: pureFourSteppedChows },
  // 16
  { name: '清龙',    value: 16, check: pureStraight },
  { name: '全带幺',  value: 16, check: allTerminalMelds },
  { name: '三风刻',  value: 16, check: threeWindPungs },
  { name: '花龙',    value: 16, check: mixedStraight },
  // 12
  { name: '大三风',  value: 12, check: bigThreeWinds },
  { name: '推不倒',  value: 12, check: reversibleTiles },
  { name: '三色三同顺', value: 12, check: tripleHomogeneousChow },
  { name: '混一色',  value: 8,  check: halfFlush },
  // 8
  { name: '天和',    value: 8,  check: heavenlyHand },
  { name: '地和',    value: 8,  check: earthlyHand },
  { name: '不求人',  value: 8,  check: selfReliant },
  { name: '双暗杠',  value: 8,  check: twoConcealedKongs },
  { name: '双箭刻',  value: 8,  check: twoDragonPungs },
  // 6
  { name: '全求人',  value: 6,  check: allClaimed },
  { name: '双明杠',  value: 6,  check: twoMeldedKongs },
  // 4
  { name: '边张',    value: 4,  check: edgeWait },
  { name: '单钓将',  value: 4,  check: singleWait },
  { name: '圈风刻',  value: 4,  check: prevailingWindPung },
  { name: '门风刻',  value: 4,  check: seatWindPung },
  { name: '岭上开花', value: 4,  check: kongDraw },
  { name: '海底捞月', value: 4,  check: seabedMoon },
  { name: '河底捞鱼', value: 4,  check: riverBottom },
  { name: '抢杠和',  value: 4,  check: robbingKong },
  // 2
  { name: '门前清',  value: 2,  check: concealedHand },
  { name: '平和',    value: 2,  check: allChows },
  { name: '一般高',  value: 2,  check: pureDoubleChow },
  { name: '喜相逢',  value: 2,  check: mixedDoubleChow },
  { name: '连六',    value: 2,  check: shortStraight },
  { name: '老少副',  value: 2,  check: terminalChows },
  { name: '幺九刻',  value: 2,  check: terminalPung },
  { name: '双碰',    value: 2,  check: doublePungCheck },
  { name: '断幺',    value: 2,  check: allSimples },
  { name: '四归一',  value: 2,  check: tileHog },
  { name: '一色三步高', value: 16, check: pureThreeShiftedChows },
  { name: '三色三步高', value: 8,  check: triColorSteppedChow },
  // 1
  { name: '自摸',    value: 1,  check: selfDraw },
  // Dragon pungs (2 fan each)
  { name: '中',      value: 2,  check: dragonPung(1) },
  { name: '发',      value: 2,  check: dragonPung(2) },
  { name: '白',      value: 2,  check: dragonPung(3) },
];

function triColorSteppedChow(d: Decomposition, _ctx: WinContext): boolean {
  const chows = getChows(d);
  if (chows.length < 3) return false;
  const byVal = new Map<number, Set<string>>();
  for (const c of chows) {
    const v = c.tiles[0].value;
    if (!byVal.has(v)) byVal.set(v, new Set());
    byVal.get(v)!.add(c.tiles[0].suit);
  }
  const vals = [...byVal.keys()].sort((a,b)=>a-b);
  for (let i = 0; i < vals.length - 2; i++) {
    if (vals[i+1] - vals[i] === 1 && vals[i+2] - vals[i+1] === 1) {
      const sets = [byVal.get(vals[i])!, byVal.get(vals[i+1])!, byVal.get(vals[i+2])!];
      if (sets.every(s => s.size >= 1) && new Set([...sets[0],...sets[1],...sets[2]]).size >= 3)
        return true;
    }
  }
  return false;
}

// ── Exclusion rules ───────────────────────────────────────────────────────────
// Maps a fan name to the set of fan names it implies/supersedes

const EXCLUSIONS: Record<string, string[]> = {
  '大四喜': ['小四喜', '三风刻', '双碰', '圈风刻', '门风刻', '碰碰和'],
  '大三元': ['小三元', '双箭刻', '中', '发', '白'],
  '小三元': ['双箭刻'],
  '字一色': ['混幺九', '碰碰和'],
  '绿一色': ['混一色', '清一色'],
  '清幺九': ['混幺九', '碰碰和', '清一色'],
  '四暗刻': ['三暗刻', '碰碰和', '不求人', '门前清'],
  '九莲宝灯': ['清一色', '不求人', '门前清', '自摸'],
  '小四喜': ['三风刻'],
  '四杠': ['三杠'],
  '碰碰和': ['双碰'],
  '混幺九': ['幺九刻'],
  '清一色': ['断幺'],
  '七对': ['门前清'],
  '一色四步高': ['一色三步高', '连六'],
  '一色三同顺': ['一般高'],
  '全带幺': ['幺九刻'],
  '三杠': ['双明杠'],
  '清龙': ['连六', '老少副'],
  '不求人': ['门前清', '自摸'],
  '全求人': ['喜相逢'],
  '混一色': ['断幺'],
  '三暗刻': ['双暗杠'],
  '双箭刻': ['中', '发', '白'],
};

// ── Flower bonus ──────────────────────────────────────────────────────────────

function calculateFlowerBonus(flowers: Tile[], seatWind: string): FlowerBonusEntry[] {
  const entries: FlowerBonusEntry[] = [];
  const seatWindVal = windValue(seatWind);

  // Flowers 1-4 = 春夏秋冬, correspond to seats East(1) South(2) West(3) North(4)
  // Flowers 5-8 = 梅兰竹菊, same correspondence
  for (const f of flowers) {
    const seatFlower = f.value === seatWindVal || f.value === seatWindVal + 4;
    entries.push({ tile: f, bonus: seatFlower ? 2 : 1 });
  }
  return entries;
}

// ── Main calculate function ───────────────────────────────────────────────────

export function calculateFan(ctx: WinContext): FanResult {
  const decompositions = decompose(ctx.hand, ctx.winTile, ctx.melds);

  let best: { fans: FanEntry[]; total: number } = { fans: [], total: 0 };

  for (const d of decompositions) {
    const rawFans: FanEntry[] = [];

    for (const rule of ALL_RULES) {
      if (rule.check(d, ctx)) {
        rawFans.push({ name: rule.name, value: rule.value });
      }
    }

    const filtered = applyExclusions(rawFans);
    const subtotal = filtered.reduce((s, f) => s + f.value, 0);

    if (subtotal > best.total) {
      best = { fans: filtered, total: subtotal };
    }
  }

  const flowerBonus = calculateFlowerBonus(ctx.flowers, ctx.seatWind);
  const flowerTotal = flowerBonus.reduce((s, f) => s + f.bonus, 0);

  return {
    fans: best.fans,
    flowerBonus,
    subtotal: best.total,
    flowerTotal,
    total: best.total + flowerTotal,
    winType: ctx.winType,
  };
}

function applyExclusions(fans: FanEntry[]): FanEntry[] {
  const present = new Set(fans.map(f => f.name));
  const excluded = new Set<string>();

  for (const fan of fans) {
    const ex = EXCLUSIONS[fan.name];
    if (ex) {
      for (const e of ex) excluded.add(e);
    }
  }

  return fans.filter(f => !excluded.has(f.name));
}

// ── Helper utilities ──────────────────────────────────────────────────────────

function chowKey(g: Group): string {
  return `${g.tiles[0].suit}:${g.tiles[0].value}`;
}

function countMax(keys: string[]): number {
  const counts = new Map<string, number>();
  for (const k of keys) counts.set(k, (counts.get(k) ?? 0) + 1);
  return Math.max(0, ...[...counts.values()]);
}

function hasShiftedSequence(chows: Group[], length: number, step: number): boolean {
  const suits = ['man', 'pin', 'sou'] as const;
  for (const suit of suits) {
    const vals = chows
      .filter(c => c.tiles[0].suit === suit)
      .map(c => c.tiles[0].value)
      .sort((a,b)=>a-b);

    for (let i = 0; i <= vals.length - length; i++) {
      let ok = true;
      for (let j = 1; j < length; j++) {
        if (vals[i + j] - vals[i + j - 1] !== step) { ok = false; break; }
      }
      if (ok) return true;
    }
  }
  return false;
}
