import {
  Tile, Meld, WinContext, FanResult, FanEntry, FlowerBonusEntry,
  Decomposition, Group,
} from '../types';
import {
  tileKey, sameTile, isTerminal, isHonor, isSimple, isNumberSuit,
  decompose, getTenpaiTiles,
} from './winChecker';

// ── 番型规则类型定义 ──────────────────────────────────────────────────────────

interface FanRule {
  name: string;   // 番型名称
  value: number;  // 单次番数
  // 返回命中次数（0 = 未命中）。多数番型为 0/1，部分番型（一般高、幺九刻等）可计数。
  match: (d: Decomposition, ctx: WinContext, matched: Set<string>) => number;
  // 命中后追加到排除集合的番型名称
  exclude?: (d: Decomposition, ctx: WinContext, matched: Set<string>) => string[];
}

// 布尔判断 → 命中次数
function b(x: boolean): number {
  return x ? 1 : 0;
}

// ── 通用辅助函数 ──────────────────────────────────────────────────────────────

// 是否为刻子（含杠）
function isPung(g: Group): boolean {
  return g.type === 'pung' || g.type === 'kong';
}

// 和牌中所有牌（含将、雀头）
function allTiles(d: Decomposition): Tile[] {
  return d.allTiles;
}

// 风牌数值：东1 南2 西3 北4
function windValue(w: string): number {
  const m: Record<string, number> = { east: 1, south: 2, west: 3, north: 4 };
  return m[w] ?? 0;
}

// 绿一色用牌：条2346发
function isGreenTile(t: Tile): boolean {
  if (t.suit === 'sou' && [2, 3, 4, 6, 8].includes(t.value)) return true;
  if (t.suit === 'dragon' && t.value === 2) return true; // 发
  return false;
}

// 将牌（雀头）
function getPair(d: Decomposition): Group | undefined {
  return d.groups.find(g => g.type === 'pair');
}

// 顺子列表
function getChows(d: Decomposition): Group[] {
  return d.groups.filter(g => g.type === 'chow');
}

// 刻子列表（含杠）
function getPungs(d: Decomposition): Group[] {
  return d.groups.filter(g => isPung(g));
}

// 杠子列表（明杠+暗杠+加杠，均来自 meldGroups）
function getKongs(d: Decomposition): Group[] {
  return d.groups.filter(g => g.type === 'kong');
}

// 明副露列表（不含暗杠）
function getOpenMelds(ctx: WinContext): Meld[] {
  return ctx.melds.filter(m => m.type !== 'kong_closed');
}

// 是否门清（无明副露，暗杠除外）
function isConcealed(ctx: WinContext): boolean {
  return ctx.melds.every(m => m.type === 'kong_closed');
}

// 某刻子组在本次和牌中是否仍算"暗刻"
function isConcealedPung(g: Group, ctx: WinContext): boolean {
  if (!isPung(g)) return false;
  if (g.type === 'kong') return g.concealed; // 杠子组已携带正确的暗/明信息
  if (!g.concealed) return false; // 来自吃/碰副露的明刻（meldGroups 中的 pong）
  if (ctx.winType !== 'discard') return true;
  // 点和：若和牌张属于此刻子，则该刻子视为明刻（除非和牌张是单钓将的将牌，
  // 此时该刻子本身不含和牌张，仍为暗刻）
  return !g.tiles.some(t => sameTile(t, ctx.winTile));
}

// 暗刻数量（含暗杠归为 isConcealedPung 的杠子组）
function concealedPungsIn(d: Decomposition, ctx: WinContext): number {
  return getPungs(d).filter(g => isConcealedPung(g, ctx)).length;
}

// 暗杠数量
function concealedKongCount(d: Decomposition): number {
  return getKongs(d).filter(g => g.concealed).length;
}

// 明杠数量（含加杠）
function openKongCount(d: Decomposition): number {
  return getKongs(d).filter(g => !g.concealed).length;
}

// 顺子标识：花色:首张值，如 "man:1" 表示123万
function chowKey(g: Group): string {
  return `${g.tiles[0].suit}:${g.tiles[0].value}`;
}

// 统计出现最多的key次数
function countMax(keys: string[]): number {
  const counts = new Map<string, number>();
  for (const k of keys) counts.set(k, (counts.get(k) ?? 0) + 1);
  return Math.max(0, ...[...counts.values()]);
}

// 判断同花色牌组（顺子或刻子均可）中是否存在length个、步长为step的递进序列
function hasShiftedSequence(groups: Group[], length: number, step: number): boolean {
  const suits = ['man', 'pin', 'sou'] as const;
  for (const suit of suits) {
    const vals = groups
      .filter(g => g.tiles[0].suit === suit)
      .map(g => g.tiles[0].value)
      .sort((a, b2) => a - b2);

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

// 同花色刻子（含杠）的递进序列判断
function hasShiftedPungSequence(d: Decomposition, length: number, step: number): boolean {
  return hasShiftedSequence(getPungs(d), length, step);
}

// 顺子内各张牌值（升序）
function chowValues(g: Group): number[] {
  return g.tiles.map(t => t.value).sort((a, b2) => a - b2);
}

// 听牌列表缓存（同一 ctx 内多个规则共用，避免重复计算）
const tenpaiCache = new WeakMap<WinContext, Tile[]>();
function getTings(ctx: WinContext): Tile[] {
  let tings = tenpaiCache.get(ctx);
  if (!tings) {
    tings = getTenpaiTiles(ctx.hand, ctx.melds);
    tenpaiCache.set(ctx, tings);
  }
  return tings;
}

// ── 各番型判断函数 ────────────────────────────────────────────────────────────

// 大四喜：四组风刻
function bigFourWinds(d: Decomposition): boolean {
  return getPungs(d).filter(g => g.tiles[0].suit === 'wind').length >= 4;
}

// 大三元：中发白三元全刻
function bigThreeDragons(d: Decomposition): boolean {
  return getPungs(d).filter(g => g.tiles[0].suit === 'dragon').length >= 3;
}

// 九莲宝灯：门清同色1112345678999+任意一张
function nineGates(d: Decomposition, ctx: WinContext): boolean {
  if (!isConcealed(ctx)) return false;
  const tiles = allTiles(d);
  if (new Set(tiles.map(t => t.suit)).size !== 1) return false;
  if (!isNumberSuit(tiles[0])) return false;
  const counts = new Array(10).fill(0);
  for (const t of tiles) counts[t.value]++;
  return counts[1] >= 3 && counts[9] >= 3 &&
    counts[2] >= 1 && counts[3] >= 1 && counts[4] >= 1 &&
    counts[5] >= 1 && counts[6] >= 1 && counts[7] >= 1 && counts[8] >= 1;
}

// 字一色：全部字牌
function allHonors(d: Decomposition): boolean {
  return allTiles(d).every(isHonor);
}

// 绿一色：全部绿牌（条2346发）
function allGreen(d: Decomposition): boolean {
  return allTiles(d).every(isGreenTile);
}

// 清幺九：全部1或9
function allTerminalsPure(d: Decomposition): boolean {
  return allTiles(d).every(isTerminal);
}

// 小四喜：三组风刻+将为风
function littleFourWinds(d: Decomposition): boolean {
  const pair = getPair(d);
  const windPungs = getPungs(d).filter(g => g.tiles[0].suit === 'wind').length;
  return windPungs === 3 && !!pair && pair.tiles[0].suit === 'wind';
}

// 小三元：两组三元刻+将为三元
function littleThreeDragons(d: Decomposition): boolean {
  const pair = getPair(d);
  const dragonPungs = getPungs(d).filter(g => g.tiles[0].suit === 'dragon').length;
  return dragonPungs === 2 && !!pair && pair.tiles[0].suit === 'dragon';
}

// 碰碰和：全部刻子
function allPungs(d: Decomposition): boolean {
  const nonPair = d.groups.filter(g => g.type !== 'pair');
  return nonPair.length > 0 && nonPair.every(g => isPung(g));
}

// 混幺九：全部1、9、字牌
function mixedTerminals(d: Decomposition): boolean {
  return allTiles(d).every(t => isTerminal(t) || isHonor(t));
}

// 全双刻：全部偶数刻子
function allEvenPungs(d: Decomposition): boolean {
  const tiles = allTiles(d);
  return tiles.every(t => isNumberSuit(t) && t.value % 2 === 0) &&
    d.groups.every(g => g.type !== 'chow');
}

// 清一色：同一花色数牌
function pureFlush(d: Decomposition): boolean {
  const tiles = allTiles(d).filter(t => !isHonor(t));
  if (tiles.length !== allTiles(d).length) return false;
  return new Set(tiles.map(t => t.suit)).size === 1;
}

// 一色三同顺：同花色同数值三顺
function pureTriplechow(d: Decomposition): boolean {
  const chows = getChows(d);
  if (chows.length < 3) return false;
  return countMax(chows.map(chowKey)) >= 3;
}

// 一色四同顺：同花色同数值四顺
function pureFourIdenticalChows(d: Decomposition): boolean {
  const chows = getChows(d);
  if (chows.length < 4) return false;
  return countMax(chows.map(chowKey)) >= 4;
}

// 一色四节高：同花色四个连续数值的刻子（如345-456-567-678形式中任取4个连续值）
function fourConsecutivePungs(d: Decomposition): boolean {
  return hasShiftedPungSequence(d, 4, 1);
}

// 一色三节高：同花色三个连续数值的刻子
function threeConsecutivePungs(d: Decomposition): boolean {
  return hasShiftedPungSequence(d, 3, 1);
}

// 三杠/四杠：杠子数量
function kongCountAtLeast(d: Decomposition, n: number): boolean {
  return getKongs(d).length >= n;
}

// 三同刻：三种花色相同数值的刻子
function tripleIdenticalPungs(d: Decomposition): boolean {
  const pungs = getPungs(d).filter(g => isNumberSuit(g.tiles[0]));
  if (pungs.length < 3) return false;
  for (let i = 0; i < pungs.length; i++) {
    const v = pungs[i].tiles[0].value;
    const suits = new Set(pungs.filter(p => p.tiles[0].value === v).map(p => p.tiles[0].suit));
    if (suits.size >= 3) return true;
  }
  return false;
}

// 全大：全部数牌7-9
function upperTiles(d: Decomposition): boolean {
  return allTiles(d).filter(isNumberSuit).every(t => t.value >= 7);
}

// 全中：全部数牌4-6
function middleTiles(d: Decomposition): boolean {
  return allTiles(d).filter(isNumberSuit).every(t => t.value >= 4 && t.value <= 6);
}

// 全小：全部数牌1-3
function lowerTiles(d: Decomposition): boolean {
  return allTiles(d).filter(isNumberSuit).every(t => t.value <= 3);
}

// 全带五：每组都含5
function allWithFives(d: Decomposition): boolean {
  return d.groups.every(g => g.tiles.some(t => isNumberSuit(t) && t.value === 5));
}

// 清龙：同花色123-456-789
function pureStraight(d: Decomposition): boolean {
  const chows = getChows(d);
  if (chows.length < 3) return false;
  const suits = ['man', 'pin', 'sou'] as const;
  for (const suit of suits) {
    const vals = chows.filter(c => c.tiles[0].suit === suit).map(c => c.tiles[0].value).sort((a, c) => a - c);
    for (let i = 0; i <= vals.length - 3; i++) {
      if (vals[i] === 1 && vals[i + 1] === 4 && vals[i + 2] === 7) return true;
    }
  }
  return false;
}

// 全带幺：每组都含幺九或字牌
function allTerminalMelds(d: Decomposition): boolean {
  return d.groups.every(g => g.tiles.some(t => isTerminal(t) || isHonor(t)));
}

// 三风刻：三组风刻
function threeWindPungs(d: Decomposition): boolean {
  return getPungs(d).filter(g => g.tiles[0].suit === 'wind').length >= 3;
}

// 花龙：三种花色各含123/456/789之一，合计覆盖1-9
function mixedStraight(d: Decomposition): boolean {
  const chows = getChows(d);
  if (chows.length < 3) return false;
  const suits = ['man', 'pin', 'sou'];
  if (new Set(chows.map(c => c.tiles[0].suit)).size < 3) return false;
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

// 大于五：全部数牌6-9
function upperFour(d: Decomposition): boolean {
  return allTiles(d).filter(isNumberSuit).every(t => t.value >= 6);
}

// 小于五：全部数牌1-4
function lowerFour(d: Decomposition): boolean {
  return allTiles(d).filter(isNumberSuit).every(t => t.value <= 4);
}

// 推不倒：全部可逆牌（饼2456899，条2456899，白板）
function reversibleTiles(d: Decomposition): boolean {
  const reversible = new Set([
    'pin:2', 'pin:4', 'pin:5', 'pin:6', 'pin:8', 'pin:9',
    'sou:2', 'sou:4', 'sou:5', 'sou:6', 'sou:8', 'sou:9',
    'dragon:3',
  ]);
  return allTiles(d).every(t => reversible.has(tileKey(t)));
}

// 三色三同顺：三种花色相同数值的顺子
function tripleHomogeneousChow(d: Decomposition): boolean {
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

// 三色三步高：三种花色顺子首张依次递增1（如万123-饼234-条345）
function triColorSteppedChow(d: Decomposition): boolean {
  const chows = getChows(d);
  if (chows.length < 3) return false;
  const byVal = new Map<number, Set<string>>();
  for (const c of chows) {
    const v = c.tiles[0].value;
    if (!byVal.has(v)) byVal.set(v, new Set());
    byVal.get(v)!.add(c.tiles[0].suit);
  }
  const vals = [...byVal.keys()].sort((a, c) => a - c);
  for (let i = 0; i < vals.length - 2; i++) {
    if (vals[i + 1] - vals[i] === 1 && vals[i + 2] - vals[i + 1] === 1) {
      const sets = [byVal.get(vals[i])!, byVal.get(vals[i + 1])!, byVal.get(vals[i + 2])!];
      if (sets.every(s => s.size >= 1) && new Set([...sets[0], ...sets[1], ...sets[2]]).size >= 3) {
        return true;
      }
    }
  }
  return false;
}

// 三色三节高：三种花色相同步进的连续刻子（如万222-饼333-条444）
function tripleColorSteppedPungs(d: Decomposition): boolean {
  const pungs = getPungs(d).filter(g => isNumberSuit(g.tiles[0]));
  if (pungs.length < 3) return false;
  const byVal = new Map<number, Set<string>>();
  for (const p of pungs) {
    const v = p.tiles[0].value;
    if (!byVal.has(v)) byVal.set(v, new Set());
    byVal.get(v)!.add(p.tiles[0].suit);
  }
  const vals = [...byVal.keys()].sort((a, c) => a - c);
  for (let i = 0; i < vals.length - 2; i++) {
    if (vals[i + 1] - vals[i] === 1 && vals[i + 2] - vals[i + 1] === 1) {
      const sets = [byVal.get(vals[i])!, byVal.get(vals[i + 1])!, byVal.get(vals[i + 2])!];
      if (sets.every(s => s.size >= 1) && new Set([...sets[0], ...sets[1], ...sets[2]]).size >= 3) {
        return true;
      }
    }
  }
  return false;
}

// 混一色：同一花色数牌+字牌
function halfFlush(d: Decomposition): boolean {
  const tiles = allTiles(d);
  const numTiles = tiles.filter(isNumberSuit);
  const honorTiles = tiles.filter(isHonor);
  if (honorTiles.length === 0 || numTiles.length === 0) return false;
  return new Set(numTiles.map(t => t.suit)).size === 1;
}

// 无字：不含字牌
function noHonors(d: Decomposition): boolean {
  return allTiles(d).every(t => !isHonor(t));
}

// 缺一门：数牌恰好缺一种花色（另两种都有）
function missingOneSuit(d: Decomposition): boolean {
  const suits = new Set(allTiles(d).filter(isNumberSuit).map(t => t.suit));
  return suits.size === 2;
}

// 五门齐：万/饼/条/风/箭五门俱全
function allFiveFamilies(d: Decomposition): boolean {
  const suits = new Set(allTiles(d).map(t => t.suit));
  const families: Tile['suit'][] = ['man', 'pin', 'sou', 'wind', 'dragon'];
  return families.every(s => suits.has(s));
}

// 双同刻：相同数值的刻子出现在两种不同数牌花色（如222万+222饼），最多计2次
function shuangTongKeCount(d: Decomposition): number {
  const pungs = getPungs(d).filter(g => isNumberSuit(g.tiles[0]));
  const byValue = new Map<number, Set<string>>();
  for (const p of pungs) {
    const v = p.tiles[0].value;
    if (!byValue.has(v)) byValue.set(v, new Set());
    byValue.get(v)!.add(p.tiles[0].suit);
  }
  let count = 0;
  for (const suits of byValue.values()) {
    if (suits.size >= 2) count++;
  }
  return Math.min(count, 2);
}

// 一色双龙会：同花色123、123、789、789 + 将牌为5
function pureDoubleDragonMeeting(d: Decomposition): boolean {
  const chows = getChows(d);
  const pair = getPair(d);
  if (!pair) return false;
  for (const suit of ['man', 'pin', 'sou'] as const) {
    const ones = chows.filter(c => c.tiles[0].suit === suit && c.tiles[0].value === 1).length;
    const sevens = chows.filter(c => c.tiles[0].suit === suit && c.tiles[0].value === 7).length;
    if (ones >= 2 && sevens >= 2 && pair.tiles[0].suit === suit && pair.tiles[0].value === 5) {
      return true;
    }
  }
  return false;
}

// 三色双龙会：两种花色各含123和789，第三种花色将牌为5
function mixedDoubleDragonMeeting(d: Decomposition): boolean {
  const chows = getChows(d);
  const pair = getPair(d);
  if (!pair || chows.length < 4) return false;
  const suits = ['man', 'pin', 'sou'] as const;
  if (!isNumberSuit(pair.tiles[0]) || pair.tiles[0].value !== 5) return false;
  const otherSuits = suits.filter(s => s !== pair.tiles[0].suit);
  if (otherSuits.length !== 2) return false;
  const has123 = (s: string) => chows.some(c => c.tiles[0].suit === s && c.tiles[0].value === 1);
  const has789 = (s: string) => chows.some(c => c.tiles[0].suit === s && c.tiles[0].value === 7);
  return otherSuits.every(s => has123(s) && has789(s));
}

// 和绝张：和牌张为该牌的最后一张（场上已现4张）
function isLastTileOfKind(ctx: WinContext): boolean {
  return (ctx.visibleTileCounts.get(tileKey(ctx.winTile)) ?? 0) === 4;
}

// 连七对：七对且同花色、数值连续
function sevenConsecutivePairs(d: Decomposition): boolean {
  if (d.type !== 'seven-pairs') return false;
  const pairs = d.groups.filter(g => g.type === 'pair');
  if (pairs.length !== 7) return false;
  if (new Set(pairs.map(p => p.tiles[0].suit)).size !== 1) return false;
  if (!isNumberSuit(pairs[0].tiles[0])) return false;
  const values = pairs.map(p => p.tiles[0].value).sort((a, c) => a - c);
  for (let i = 0; i < 7; i++) {
    if (values[i] !== values[0] + i) return false;
  }
  return true;
}

// 不求人：门清自摸
function selfReliant(ctx: WinContext): boolean {
  return isConcealed(ctx) && ctx.winType === 'self';
}

// 双暗杠：两个暗杠
function twoConcealedKongs(d: Decomposition): boolean {
  return concealedKongCount(d) === 2;
}

// 双明杠：两个明杠（含加杠）
function twoMeldedKongs(d: Decomposition): boolean {
  return openKongCount(d) === 2;
}

// 明暗杠：至少一个明杠和一个暗杠
function mixedKongs(d: Decomposition): boolean {
  return concealedKongCount(d) >= 1 && openKongCount(d) >= 1;
}

// 双暗刻：恰好两组暗刻
function twoConcealedPungs(d: Decomposition, ctx: WinContext): boolean {
  return concealedPungsIn(d, ctx) === 2;
}

// 三暗刻：三组及以上暗刻
function threeConcealedPungs(d: Decomposition, ctx: WinContext): boolean {
  return concealedPungsIn(d, ctx) >= 3;
}

// 四暗刻：四组暗刻
function fourConcealedPungs(d: Decomposition, ctx: WinContext): boolean {
  return concealedPungsIn(d, ctx) === 4;
}

// 全求人：四副露点和
function allClaimed(ctx: WinContext): boolean {
  return getOpenMelds(ctx).length === 4 && ctx.winType === 'discard';
}

// 全不靠（七星不靠的现行实现等价；待全不靠泛化后拆分）
function knittedHand(d: Decomposition): boolean {
  return d.type === 'knitted';
}

// 边张：单张听牌，和牌张完成123的3或789的7
function isEdgeWait(d: Decomposition, ctx: WinContext): boolean {
  if (getTings(ctx).length !== 1) return false;
  if (!isNumberSuit(ctx.winTile)) return false;
  if (ctx.winTile.value !== 3 && ctx.winTile.value !== 7) return false;
  return d.groups.some(g => {
    if (g.type !== 'chow' || !g.tiles.some(t => sameTile(t, ctx.winTile))) return false;
    const vals = chowValues(g);
    return (ctx.winTile.value === 3 && vals[0] === 1) || (ctx.winTile.value === 7 && vals[0] === 7);
  });
}

// 坎张：单张听牌，和牌张为顺子中间张
function isClosedWait(d: Decomposition, ctx: WinContext): boolean {
  if (getTings(ctx).length !== 1) return false;
  return d.groups.some(g => {
    if (g.type !== 'chow' || !g.tiles.some(t => sameTile(t, ctx.winTile))) return false;
    return chowValues(g)[1] === ctx.winTile.value;
  });
}

// 单钓将：单张听牌，和牌张为将牌
function isSingleWait(d: Decomposition, ctx: WinContext): boolean {
  if (getTings(ctx).length !== 1) return false;
  const pair = getPair(d);
  return !!pair && pair.tiles.some(t => sameTile(t, ctx.winTile));
}

// 圈风刻：刻子与圈风相同
function prevailingWindPung(d: Decomposition, ctx: WinContext): boolean {
  const rv = windValue(ctx.roundWind);
  return getPungs(d).some(g => g.tiles[0].suit === 'wind' && g.tiles[0].value === rv);
}

// 门风刻：刻子与门风相同
function seatWindPung(d: Decomposition, ctx: WinContext): boolean {
  const sv = windValue(ctx.seatWind);
  return getPungs(d).some(g => g.tiles[0].suit === 'wind' && g.tiles[0].value === sv);
}

// 杠上开花：杠后摸牌自摸
function kongDraw(ctx: WinContext): boolean {
  return ctx.isAfterKong && ctx.winType === 'self';
}

// 妙手回春：海底自摸（最后一张牌自摸）
function lastTileSelfDraw(ctx: WinContext): boolean {
  return ctx.isLastTile && ctx.winType === 'self';
}

// 海底捞月：最后一张牌点和
function lastTileDiscardWin(ctx: WinContext): boolean {
  return ctx.isLastTile && ctx.winType === 'discard';
}

// 天和：庄家起手即听，自摸（待天和/地和游戏流程实现，目前不可达）
function heavenlyHand(ctx: WinContext): boolean {
  return !!ctx.isTenpaiStart && ctx.winType === 'self';
}

// 地和：庄家起手即听，点和（同上，目前不可达）
function earthlyHand(ctx: WinContext): boolean {
  return !!ctx.isTenpaiStart && ctx.winType === 'discard';
}

// 抢杠和：和别人加杠的牌（待抢杠流程实现，目前不可达）
function robbingKong(ctx: WinContext): boolean {
  return ctx.isRobbingKong;
}

// 门前清：无明副露（暗杠不计）
function concealedHand(ctx: WinContext): boolean {
  return isConcealed(ctx);
}

// 平和：全顺子且将牌非字牌
function allChows(d: Decomposition): boolean {
  const nonPair = d.groups.filter(g => g.type !== 'pair');
  if (nonPair.length === 0 || !nonPair.every(g => g.type === 'chow')) return false;
  const pair = getPair(d);
  return !!pair && !isHonor(pair.tiles[0]);
}

// 一般高：同花色同数值两顺，最多计2次（即"二般高"）
function pureDoubleChowCount(d: Decomposition): number {
  const keys = getChows(d).map(chowKey);
  const counts = new Map<string, number>();
  for (const k of keys) counts.set(k, (counts.get(k) ?? 0) + 1);
  let count = 0;
  for (const c of counts.values()) {
    if (c >= 2) count++;
  }
  return count;
}

// 喜相逢：不同花色相同数值两顺
function mixedDoubleChow(d: Decomposition): boolean {
  const chows = getChows(d);
  for (let i = 0; i < chows.length; i++) {
    for (let j = i + 1; j < chows.length; j++) {
      const a = chows[i].tiles[0];
      const c = chows[j].tiles[0];
      if (a.value === c.value && a.suit !== c.suit) return true;
    }
  }
  return false;
}

// 连六：同花色首张相差3的两顺（如123+456）
function shortStraight(d: Decomposition): boolean {
  const chows = getChows(d);
  for (let i = 0; i < chows.length; i++) {
    for (let j = i + 1; j < chows.length; j++) {
      const a = chows[i].tiles[0];
      const c = chows[j].tiles[0];
      if (a.suit === c.suit && Math.abs(a.value - c.value) === 3) return true;
    }
  }
  return false;
}

// 老少副：同花色123和789
function terminalChows(d: Decomposition): boolean {
  const chows = getChows(d);
  const suits = ['man', 'pin', 'sou'] as const;
  for (const suit of suits) {
    const has1 = chows.some(c => c.tiles[0].suit === suit && c.tiles[0].value === 1);
    const has7 = chows.some(c => c.tiles[0].suit === suit && c.tiles[0].value === 7);
    if (has1 && has7) return true;
  }
  return false;
}

// 幺九刻：含1、9或字牌的刻子数量（0-4）
function terminalPungCount(d: Decomposition): number {
  return getPungs(d).filter(g => isTerminal(g.tiles[0]) || isHonor(g.tiles[0])).length;
}

// 断幺：全部中张（2-8，无字牌）
function allSimples(d: Decomposition): boolean {
  return allTiles(d).every(isSimple);
}

// 四归一：手中某张牌凑齐4张但未形成杠，最多计2次
function tileHogCount(d: Decomposition): number {
  const counts = new Map<string, number>();
  for (const t of allTiles(d)) {
    const k = tileKey(t);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const kongKeys = new Set(getKongs(d).map(g => tileKey(g.tiles[0])));
  let count = 0;
  for (const [k, c] of counts) {
    if (c >= 4 && !kongKeys.has(k)) count++;
  }
  return Math.min(count, 2);
}

// 自摸
function selfDraw(ctx: WinContext): boolean {
  return ctx.winType === 'self';
}

// 一色四步高：同花色间隔相同的四顺
function fourShiftedChows(d: Decomposition): boolean {
  const chows = getChows(d);
  if (chows.length < 4) return false;
  return hasShiftedSequence(chows, 4, 1) || hasShiftedSequence(chows, 4, 2);
}

// 一色三步高：同花色间隔相同的三顺
function pureThreeShiftedChows(d: Decomposition): boolean {
  const chows = getChows(d);
  if (chows.length < 3) return false;
  return hasShiftedSequence(chows, 3, 1) || hasShiftedSequence(chows, 3, 2);
}

// 中/发/白各2番（按dragon.value区分：1=中 2=发 3=白）
function dragonPung(d: Decomposition, value: number): boolean {
  return getPungs(d).some(g => g.tiles[0].suit === 'dragon' && g.tiles[0].value === value);
}

// 双箭刻：两组三元刻
function twoDragonPungs(d: Decomposition): boolean {
  return getPungs(d).filter(g => g.tiles[0].suit === 'dragon').length >= 2;
}

// ── 全部番型规则表（按番值降序排列） ──────────────────────────────────────────

const ALL_RULES: FanRule[] = [
  // 88番
  { name: '连七对', value: 88, match: (d) => b(sevenConsecutivePairs(d)),
    exclude: () => ['七对', '清一色', '门前清', '单钓将'] },
  { name: '大四喜', value: 88, match: (d) => b(bigFourWinds(d)),
    exclude: () => ['小四喜', '三风刻', '圈风刻', '门风刻', '碰碰和', '幺九刻'] },
  { name: '大三元', value: 88, match: (d) => b(bigThreeDragons(d)),
    exclude: () => ['小三元', '双箭刻', '中', '发', '白', '幺九刻'] },
  { name: '绿一色', value: 88, match: (d) => b(allGreen(d)),
    exclude: () => ['混一色', '清一色'] },
  { name: '九莲宝灯', value: 88, match: (d, ctx) => b(nineGates(d, ctx)),
    exclude: () => ['清一色', '不求人', '门前清', '自摸'] },
  { name: '四杠', value: 88, match: (d) => b(kongCountAtLeast(d, 4)),
    exclude: () => ['三杠', '双暗杠', '双明杠', '明暗杠', '暗杠', '明杠'] },

  // 64番
  { name: '一色双龙会', value: 64, match: (d) => b(pureDoubleDragonMeeting(d)),
    exclude: () => ['清一色', '一般高', '老少副', '连六', '喜相逢'] },
  { name: '一色四同顺', value: 48, match: (d) => b(pureFourIdenticalChows(d)),
    exclude: () => ['一色三同顺', '一般高'] },
  { name: '一色四节高', value: 48, match: (d) => b(fourConsecutivePungs(d)),
    exclude: () => ['一色三同顺', '一色三节高', '碰碰和'] },
  { name: '四暗刻', value: 64, match: (d, ctx) => b(fourConcealedPungs(d, ctx)),
    exclude: () => ['三暗刻', '双暗刻', '碰碰和', '不求人', '门前清'] },
  { name: '字一色', value: 64, match: (d) => b(allHonors(d)),
    exclude: () => ['混幺九', '碰碰和'] },
  { name: '清幺九', value: 64, match: (d) => b(allTerminalsPure(d)),
    exclude: () => ['混幺九', '碰碰和', '清一色'] },
  { name: '小四喜', value: 64, match: (d) => b(littleFourWinds(d)),
    exclude: () => ['三风刻', '幺九刻'] },
  { name: '小三元', value: 64, match: (d) => b(littleThreeDragons(d)),
    exclude: () => ['双箭刻', '幺九刻'] },

  // 32番
  { name: '三杠', value: 32, match: (d) => b(kongCountAtLeast(d, 3)),
    exclude: () => ['双暗杠', '双明杠', '明暗杠', '暗杠', '明杠'] },
  { name: '一色四步高', value: 32, match: (d) => b(fourShiftedChows(d)),
    exclude: () => ['一色三步高', '连六'] },

  // 24番
  { name: '七对', value: 24, match: (d) => b(d.type === 'seven-pairs'),
    exclude: () => ['门前清'] },
  { name: '七星不靠', value: 24, match: (d) => b(knittedHand(d)),
    exclude: () => ['全不靠'] },
  { name: '全双刻', value: 24, match: (d) => b(allEvenPungs(d)) },
  { name: '一色三节高', value: 24, match: (d) => b(threeConsecutivePungs(d)) },
  { name: '清一色', value: 24, match: (d) => b(pureFlush(d)),
    exclude: () => ['断幺'] },
  { name: '一色三同顺', value: 24, match: (d) => b(pureTriplechow(d)),
    exclude: () => ['一般高'] },
  { name: '全大', value: 24, match: (d) => b(upperTiles(d)) },
  { name: '全中', value: 24, match: (d) => b(middleTiles(d)) },
  { name: '全小', value: 24, match: (d) => b(lowerTiles(d)) },

  // 16番
  { name: '全带五', value: 16, match: (d) => b(allWithFives(d)) },
  { name: '三同刻', value: 16, match: (d) => b(tripleIdenticalPungs(d)) },
  { name: '三暗刻', value: 16, match: (d, ctx) => b(threeConcealedPungs(d, ctx)),
    exclude: () => ['双暗刻'] },
  { name: '清龙', value: 16, match: (d) => b(pureStraight(d)),
    exclude: () => ['连六', '老少副'] },
  { name: '三色双龙会', value: 16, match: (d) => b(mixedDoubleDragonMeeting(d)) },
  { name: '一色三步高', value: 16, match: (d) => b(pureThreeShiftedChows(d)) },

  // 12番
  { name: '大于五', value: 12, match: (d) => b(upperFour(d)) },
  { name: '小于五', value: 12, match: (d) => b(lowerFour(d)) },
  { name: '三风刻', value: 12, match: (d) => b(threeWindPungs(d)),
    exclude: () => ['幺九刻'] },

  // 8番
  { name: '混一色', value: 6, match: (d) => b(halfFlush(d)),
    exclude: () => ['断幺'] },
  { name: '天和', value: 8, match: (_d, ctx) => b(heavenlyHand(ctx)) },
  { name: '地和', value: 8, match: (_d, ctx) => b(earthlyHand(ctx)) },
  { name: '花龙', value: 8, match: (d) => b(mixedStraight(d)) },
  { name: '推不倒', value: 8, match: (d) => b(reversibleTiles(d)) },
  { name: '三色三同顺', value: 8, match: (d) => b(tripleHomogeneousChow(d)) },
  { name: '三色三节高', value: 8, match: (d) => b(tripleColorSteppedPungs(d)) },
  { name: '双暗杠', value: 8, match: (d) => b(twoConcealedKongs(d)),
    exclude: () => ['暗杠'] },
  { name: '杠上开花', value: 8, match: (_d, ctx) => b(kongDraw(ctx)),
    exclude: () => ['自摸'] },
  { name: '妙手回春', value: 8, match: (_d, ctx) => b(lastTileSelfDraw(ctx)),
    exclude: () => ['自摸'] },
  { name: '海底捞月', value: 8, match: (_d, ctx) => b(lastTileDiscardWin(ctx)) },
  { name: '抢杠和', value: 8, match: (_d, ctx) => b(robbingKong(ctx)) },

  // 6番
  { name: '碰碰和', value: 6, match: (d) => b(allPungs(d)) },
  { name: '全求人', value: 6, match: (_d, ctx) => b(allClaimed(ctx)),
    exclude: () => ['单钓将'] },
  { name: '双箭刻', value: 6, match: (d) => b(twoDragonPungs(d)),
    exclude: () => ['中', '发', '白', '幺九刻'] },
  { name: '明暗杠', value: 6, match: (d) => b(mixedKongs(d)),
    exclude: () => ['暗杠', '明杠'] },
  { name: '五门齐', value: 6, match: (d) => b(allFiveFamilies(d)) },
  { name: '全不靠', value: 6, match: (d) => b(knittedHand(d)) },
  { name: '三色三步高', value: 6, match: (d) => b(triColorSteppedChow(d)) },

  // 4番
  { name: '全带幺', value: 4, match: (d) => b(allTerminalMelds(d)),
    exclude: () => ['幺九刻'] },
  { name: '不求人', value: 4, match: (_d, ctx) => b(selfReliant(ctx)),
    exclude: () => ['门前清', '自摸'] },
  { name: '双明杠', value: 4, match: (d) => b(twoMeldedKongs(d)),
    exclude: () => ['明杠'] },
  { name: '和绝张', value: 4, match: (_d, ctx) => b(isLastTileOfKind(ctx)) },

  // 2番
  { name: '圈风刻', value: 2, match: (d, ctx) => b(prevailingWindPung(d, ctx)),
    exclude: () => ['幺九刻'] },
  { name: '门风刻', value: 2, match: (d, ctx) => b(seatWindPung(d, ctx)),
    exclude: () => ['幺九刻'] },
  { name: '门前清', value: 2, match: (_d, ctx) => b(concealedHand(ctx)) },
  { name: '平和', value: 2, match: (d) => b(allChows(d)) },
  { name: '断幺', value: 2, match: (d) => b(allSimples(d)) },
  { name: '四归一', value: 2, match: (d) => tileHogCount(d) },
  { name: '双同刻', value: 2, match: (d) => shuangTongKeCount(d) },
  { name: '双暗刻', value: 2, match: (d, ctx) => b(twoConcealedPungs(d, ctx)) },
  { name: '中', value: 2, match: (d) => b(dragonPung(d, 1)),
    exclude: () => ['幺九刻'] },
  { name: '发', value: 2, match: (d) => b(dragonPung(d, 2)),
    exclude: () => ['幺九刻'] },
  { name: '白', value: 2, match: (d) => b(dragonPung(d, 3)),
    exclude: () => ['幺九刻'] },

  // 1番
  { name: '无字', value: 1, match: (d) => b(noHonors(d)) },
  { name: '缺一门', value: 1, match: (d) => b(missingOneSuit(d)) },
  { name: '边张', value: 1, match: (d, ctx) => b(isEdgeWait(d, ctx)) },
  { name: '坎张', value: 1, match: (d, ctx) => b(isClosedWait(d, ctx)) },
  { name: '单钓将', value: 1, match: (d, ctx) => b(isSingleWait(d, ctx)) },
  { name: '连六', value: 1, match: (d) => b(shortStraight(d)) },
  { name: '老少副', value: 1, match: (d) => b(terminalChows(d)) },
  { name: '幺九刻', value: 1, match: (d) => terminalPungCount(d) },
  { name: '暗杠', value: 1, match: (d) => concealedKongCount(d) },
  { name: '明杠', value: 1, match: (d) => openKongCount(d) },
  { name: '一般高', value: 1, match: (d) => pureDoubleChowCount(d) },
  { name: '喜相逢', value: 1, match: (d) => b(mixedDoubleChow(d)) },
  { name: '自摸', value: 1, match: (_d, ctx) => b(selfDraw(ctx)) },
];

const SORTED_RULES = [...ALL_RULES].sort((a, c) => c.value - a.value);

// ── 花牌加分 ──────────────────────────────────────────────────────────────────

// 本座花（春夏秋冬1-4 / 梅兰竹菊5-8 与门风相对应）记2分，其余花牌记1分
function calculateFlowerBonus(flowers: Tile[], seatWind: string): FlowerBonusEntry[] {
  const seatValue = windValue(seatWind);
  return flowers.map(f => ({
    tile: f,
    bonus: (f.value === seatValue || f.value === seatValue + 4) ? 2 : 1,
  }));
}

// ── 主计算入口 ────────────────────────────────────────────────────────────────

export function calculateFan(ctx: WinContext): FanResult {
  // 枚举所有可能的拆牌方式，取得分最高的一种
  const decompositions = decompose(ctx.hand, ctx.winTile, ctx.melds);

  let best: { fans: FanEntry[]; subtotal: number } = {
    fans: [{ name: '无番和', value: 8 }],
    subtotal: 0,
  };

  for (const d of decompositions) {
    const fans: FanEntry[] = [];
    const matched = new Set<string>();
    const excluded = new Set<string>();

    for (const rule of SORTED_RULES) {
      if (excluded.has(rule.name)) continue;
      const count = rule.match(d, ctx, matched);
      if (count > 0) {
        const entry: FanEntry = { name: rule.name, value: rule.value * count };
        if (count > 1) entry.count = count;
        fans.push(entry);
        matched.add(rule.name);
        if (rule.exclude) {
          for (const ex of rule.exclude(d, ctx, matched)) excluded.add(ex);
        }
      }
    }

    const subtotal = fans.reduce((s, f) => s + f.value, 0);
    if (fans.length === 0) {
      fans.push({ name: '无番和', value: 8 });
    }

    if (subtotal > best.subtotal) {
      best = { fans, subtotal };
    }
  }

  const flowerBonus = calculateFlowerBonus(ctx.flowers, ctx.seatWind);
  const flowerTotal = flowerBonus.reduce((s, f) => s + f.bonus, 0);

  return {
    fans: best.fans,
    flowerBonus,
    subtotal: best.subtotal,
    flowerTotal,
    total: best.subtotal + flowerTotal,
    winType: ctx.winType,
  };
}
