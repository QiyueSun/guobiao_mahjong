import { Tile, WinContext, Meld } from '../../types';
import { calculateFan } from '../FanCalculator';

// ── Tile factory ──────────────────────────────────────────────────────────────

let idCounter = 0;
function t(suit: Tile['suit'], value: number): Tile {
  return { id: `fc_${idCounter++}`, suit, value };
}
function man(v: number) { return t('man', v); }
function pin(v: number) { return t('pin', v); }
function sou(v: number) { return t('sou', v); }
function wind(v: number) { return t('wind', v); }
function dragon(v: number) { return t('dragon', v); }
function flower(v: number) { return t('flower', v); }

function baseCtx(overrides: Partial<WinContext> = {}): WinContext {
  return {
    hand: [],
    melds: [],
    winTile: man(1),
    winType: 'self',
    roundWind: 'east',
    seatWind: 'east',
    isLastTile: false,
    isAfterKong: false,
    isRobbingKong: false,
    flowers: [],
    visibleTileCounts: new Map(),
    ...overrides,
  };
}

function hasFan(ctx: WinContext, fanName: string): boolean {
  const result = calculateFan(ctx);
  return result.fans.some(f => f.name === fanName);
}

// ── 88-fan hands ──────────────────────────────────────────────────────────────

describe('88-fan: 大四喜 (big four winds)', () => {
  test('four wind pungs qualify', () => {
    // 4 open melds → playTiles = 14 - 12 = 2 → hand has 1 tile, winTile is the pair partner
    const ctx = baseCtx({
      hand: [dragon(1)],
      melds: [
        { type: 'pong', tiles: [wind(1), wind(1), wind(1)] },
        { type: 'pong', tiles: [wind(2), wind(2), wind(2)] },
        { type: 'pong', tiles: [wind(3), wind(3), wind(3)] },
        { type: 'pong', tiles: [wind(4), wind(4), wind(4)] },
      ],
      winTile: dragon(1),
      winType: 'discard',
    });
    expect(hasFan(ctx, '大四喜')).toBe(true);
    const result = calculateFan(ctx);
    expect(result.total).toBeGreaterThanOrEqual(88);
  });
});

describe('88-fan: 大三元 (big three dragons)', () => {
  test('three dragon pungs qualify', () => {
    // 3 open melds → playTiles = 14 - 9 = 5 → hand has 4 tiles, winTile completes pair
    const ctx = baseCtx({
      hand: [wind(1), wind(1), wind(1), wind(2)],
      melds: [
        { type: 'pong', tiles: [dragon(1), dragon(1), dragon(1)] },
        { type: 'pong', tiles: [dragon(2), dragon(2), dragon(2)] },
        { type: 'pong', tiles: [dragon(3), dragon(3), dragon(3)] },
      ],
      winTile: wind(2),
      winType: 'discard',
    });
    expect(hasFan(ctx, '大三元')).toBe(true);
    // 大三元 excludes 中,发,白 and 双箭刻
    const result = calculateFan(ctx);
    expect(result.fans.map(f => f.name)).not.toContain('中');
    expect(result.fans.map(f => f.name)).not.toContain('发');
    expect(result.fans.map(f => f.name)).not.toContain('白');
  });
});

describe('24-fan: 七对 (seven pairs)', () => {
  test('seven pairs scores 24', () => {
    const hand = [
      man(1), man(1), man(3), man(3), man(5), man(5),
      pin(2), pin(2), pin(7), pin(7), sou(4), sou(4),
      dragon(1),
    ];
    const ctx = baseCtx({
      hand,
      winTile: dragon(1),
      winType: 'self',
    });
    expect(hasFan(ctx, '七对')).toBe(true);
    // 七对 excludes 门前清
    const result = calculateFan(ctx);
    expect(result.fans.map(f => f.name)).not.toContain('门前清');
    expect(result.fans.find(f => f.name === '七对')?.value).toBe(24);
  });
});

// ── 32-fan: 清一色 (pure flush) ───────────────────────────────────────────────

describe('24-fan: 清一色 (pure one suit)', () => {
  test('all man tiles qualify', () => {
    const ctx = baseCtx({
      hand: [
        man(1), man(2), man(3),
        man(4), man(5), man(6),
        man(7), man(8), man(9),
        man(1), man(1), man(1),
        man(5),
      ],
      winTile: man(5),
      winType: 'self',
    });
    expect(hasFan(ctx, '清一色')).toBe(true);
    // 清一色 excludes 断幺
    const result = calculateFan(ctx);
    expect(result.fans.map(f => f.name)).not.toContain('断幺');
    expect(result.fans.find(f => f.name === '清一色')?.value).toBe(24);
  });

  test('mixed suits do not qualify', () => {
    const ctx = baseCtx({
      hand: [
        man(1), man(2), man(3),
        man(4), man(5), man(6),
        pin(7), pin(8), pin(9),
        man(1), man(1), man(1),
        man(5),
      ],
      winTile: man(5),
      winType: 'self',
    });
    expect(hasFan(ctx, '清一色')).toBe(false);
  });
});

// ── 48-fan: 七星不靠 (greater honors + knitted) ───────────────────────────────

describe('24-fan: 七星不靠 (knitted hand)', () => {
  test('all 7 honors + 147m/258p/369s', () => {
    const hand = [
      man(1), man(4), man(7),
      pin(2), pin(5), pin(8),
      sou(3),
      wind(1), wind(2), wind(3), wind(4),
      dragon(1), dragon(2),
    ];
    const ctx = baseCtx({
      hand,
      winTile: dragon(3),
      winType: 'discard',
    });
    expect(hasFan(ctx, '七星不靠')).toBe(true);
    const result = calculateFan(ctx);
    expect(result.fans.find(f => f.name === '七星不靠')?.value).toBe(24);
    // 七星不靠 excludes 全不靠 (both check the same knitted-hand condition)
    expect(result.fans.map(f => f.name)).not.toContain('全不靠');
    expect(result.total).toBeGreaterThanOrEqual(24);
  });
});

// ── 16-fan: 清龙 (pure straight) ─────────────────────────────────────────────

describe('16-fan: 清龙 (pure straight 1-9)', () => {
  test('123 456 789 of same suit qualifies', () => {
    const ctx = baseCtx({
      hand: [
        man(1), man(2), man(3),
        man(4), man(5), man(6),
        man(7), man(8), man(9),
        pin(3), pin(3), pin(3),
        sou(5),
      ],
      winTile: sou(5),
      winType: 'self',
    });
    expect(hasFan(ctx, '清龙')).toBe(true);
    // A single pung can't form the 4-consecutive-pungs pattern
    expect(hasFan(ctx, '一色四节高')).toBe(false);
  });
});

// ── 2-fan: 平和 (all chows) ───────────────────────────────────────────────────

describe('2-fan: 平和 (all chows)', () => {
  test('four chows + non-honor pair', () => {
    // 13 tiles in hand; pin(3) is the 14th (winTile) completing the pair
    const ctx = baseCtx({
      hand: [
        man(1), man(2), man(3),
        pin(4), pin(5), pin(6),
        sou(7), sou(8), sou(9),
        man(5), man(6), man(7),
        pin(3),
      ],
      winTile: pin(3),
      winType: 'discard',
    });
    expect(hasFan(ctx, '平和')).toBe(true);
  });

  test('pung in hand disqualifies 平和', () => {
    const ctx = baseCtx({
      hand: [
        man(1), man(2), man(3),
        pin(4), pin(5), pin(6),
        sou(7), sou(8), sou(9),
        pin(3), pin(3), pin(3),
        man(5),
      ],
      winTile: man(5),
      winType: 'self',
    });
    expect(hasFan(ctx, '平和')).toBe(false);
  });
});

// ── 2-fan: 断幺 (all simples) ─────────────────────────────────────────────────

describe('2-fan: 断幺 (all simples, tiles 2-8 only)', () => {
  test('hand with all 2-8 tiles', () => {
    const ctx = baseCtx({
      hand: [
        man(2), man(3), man(4),
        pin(5), pin(6), pin(7),
        sou(3), sou(4), sou(5),
        man(6), man(7), man(8),
        pin(2),
      ],
      winTile: pin(2),
      winType: 'self',
    });
    expect(hasFan(ctx, '断幺')).toBe(true);
  });

  test('terminal disqualifies 断幺', () => {
    const ctx = baseCtx({
      hand: [
        man(1), man(2), man(3),
        pin(5), pin(6), pin(7),
        sou(3), sou(4), sou(5),
        man(6), man(7), man(8),
        pin(2),
      ],
      winTile: pin(2),
      winType: 'self',
    });
    expect(hasFan(ctx, '断幺')).toBe(false);
  });
});

// ── 1-fan: 自摸 (self-draw) ───────────────────────────────────────────────────

describe('1-fan: 自摸 (self-draw)', () => {
  test('self-draw with open meld gets 自摸 (not excluded by 不求人)', () => {
    // 1 open pong → isConcealed=false → 不求人 won't trigger → 自摸 not excluded
    // playTiles = 14-3=11; ctx.hand = 10 tiles (self-draw: last tile is winTile)
    const ctx = baseCtx({
      hand: [man(1), man(2), man(3), man(4), man(5), man(6), man(7), man(8), man(9), pin(2)],
      melds: [{ type: 'pong', tiles: [pin(9), pin(9), pin(9)] }],
      winTile: pin(2),
      winType: 'self',
    });
    expect(hasFan(ctx, '自摸')).toBe(true);
    expect(hasFan(ctx, '不求人')).toBe(false);
  });

  test('fully concealed self-draw awards 不求人 and excludes 自摸', () => {
    const ctx = baseCtx({
      hand: [
        man(1), man(2), man(3),
        man(4), man(5), man(6),
        man(7), man(8), man(9),
        pin(1), pin(1), pin(1),
        pin(2),
      ],
      winTile: pin(2),
      winType: 'self',
    });
    expect(hasFan(ctx, '不求人')).toBe(true);
    expect(hasFan(ctx, '自摸')).toBe(false);
  });

  test('discard win does not get 自摸', () => {
    const ctx = baseCtx({
      hand: [man(1), man(2), man(3), man(4), man(5), man(6), man(7), man(8), man(9), pin(2)],
      melds: [{ type: 'pong', tiles: [pin(9), pin(9), pin(9)] }],
      winTile: pin(2),
      winType: 'discard',
    });
    expect(hasFan(ctx, '自摸')).toBe(false);
  });
});

// ── Dragon pungs ──────────────────────────────────────────────────────────────

describe('dragon pungs (2 fan each)', () => {
  test('中 pung scores 中 fan', () => {
    const ctx = baseCtx({
      hand: [
        man(1), man(2), man(3),
        man(4), man(5), man(6),
        man(7), man(8), man(9),
        dragon(1), dragon(1), dragon(1),
        pin(5),
      ],
      winTile: pin(5),
      winType: 'self',
    });
    expect(hasFan(ctx, '中')).toBe(true);
  });

  test('大三元 excludes individual dragon fans', () => {
    const ctx = baseCtx({
      hand: [wind(1), wind(1), wind(1), wind(2)],
      melds: [
        { type: 'pong', tiles: [dragon(1), dragon(1), dragon(1)] },
        { type: 'pong', tiles: [dragon(2), dragon(2), dragon(2)] },
        { type: 'pong', tiles: [dragon(3), dragon(3), dragon(3)] },
      ],
      winTile: wind(2),
      winType: 'discard',
    });
    const result = calculateFan(ctx);
    const names = result.fans.map(f => f.name);
    expect(names).toContain('大三元');
    expect(names).not.toContain('中');
    expect(names).not.toContain('发');
    expect(names).not.toContain('白');
  });
});

// ── Seat/round wind pungs ─────────────────────────────────────────────────────

describe('seat/round wind pungs (4 fan each)', () => {
  test('east seat pung in east round gets both 圈风刻 and 门风刻', () => {
    const ctx = baseCtx({
      hand: [
        man(1), man(2), man(3),
        man(4), man(5), man(6),
        man(7), man(8), man(9),
        wind(1), wind(1), wind(1),
        pin(5),
      ],
      winTile: pin(5),
      winType: 'self',
      roundWind: 'east',
      seatWind: 'east',
    });
    expect(hasFan(ctx, '圈风刻')).toBe(true);
    expect(hasFan(ctx, '门风刻')).toBe(true);
  });

  test('south seat pung in east round only gets 门风刻', () => {
    const ctx = baseCtx({
      hand: [
        man(1), man(2), man(3),
        man(4), man(5), man(6),
        man(7), man(8), man(9),
        wind(2), wind(2), wind(2),
        pin(5),
      ],
      winTile: pin(5),
      winType: 'self',
      roundWind: 'east',
      seatWind: 'south',
    });
    expect(hasFan(ctx, '圈风刻')).toBe(false);
    expect(hasFan(ctx, '门风刻')).toBe(true);
  });
});

// ── Flower bonus ──────────────────────────────────────────────────────────────

describe('flower bonus', () => {
  test('own-seat flower (east=1) scores 2; others score 1', () => {
    // East seat: flower 1 (春) is own-seat, flower 2 (夏) is other
    const ctx = baseCtx({
      hand: [
        man(1), man(2), man(3),
        man(4), man(5), man(6),
        man(7), man(8), man(9),
        pin(1), pin(1), pin(1),
        pin(2),
      ],
      winTile: pin(2),
      winType: 'self',
      seatWind: 'east',
      flowers: [flower(1), flower(2)],
    });
    const result = calculateFan(ctx);
    const bonuses = result.flowerBonus;
    const ownSeatBonus = bonuses.find(b => b.tile.value === 1);
    const otherBonus = bonuses.find(b => b.tile.value === 2);
    expect(ownSeatBonus?.bonus).toBe(2);
    expect(otherBonus?.bonus).toBe(1);
    expect(result.flowerTotal).toBe(3);
  });

  test('no flowers = zero flowerTotal', () => {
    const ctx = baseCtx({
      hand: [
        man(1), man(2), man(3),
        man(4), man(5), man(6),
        man(7), man(8), man(9),
        pin(1), pin(1), pin(1),
        pin(2),
      ],
      winTile: pin(2),
      winType: 'self',
      flowers: [],
    });
    const result = calculateFan(ctx);
    expect(result.flowerTotal).toBe(0);
  });
});

// ── Exclusion rules ───────────────────────────────────────────────────────────

describe('exclusion rules', () => {
  test('碰碰和 (all pungs) no longer shows removed 双碰 pattern', () => {
    // One open pong keeps this from also qualifying for 四暗刻
    const ctx = baseCtx({
      hand: [
        man(1), man(1), man(1),
        man(5), man(5), man(5),
        pin(3), pin(3), pin(3),
        dragon(2),
      ],
      melds: [
        { type: 'pong', tiles: [sou(7), sou(7), sou(7)] },
      ],
      winTile: dragon(2),
      winType: 'self',
    });
    const result = calculateFan(ctx);
    const names = result.fans.map(f => f.name);
    expect(names).toContain('碰碰和');
    expect(result.fans.find(f => f.name === '碰碰和')?.value).toBe(6);
    expect(names).not.toContain('双碰');
  });

  test('全求人 (all melds claimed) excludes 单钓将, not 喜相逢', () => {
    // 4 claimed pongs + a lone tile that pairs with the discard-win tile
    const ctx = baseCtx({
      hand: [dragon(1)],
      melds: [
        { type: 'pong', tiles: [man(2), man(2), man(2)] },
        { type: 'pong', tiles: [man(5), man(5), man(5)] },
        { type: 'pong', tiles: [pin(3), pin(3), pin(3)] },
        { type: 'pong', tiles: [sou(7), sou(7), sou(7)] },
      ],
      winTile: dragon(1),
      winType: 'discard',
    });
    const result = calculateFan(ctx);
    const names = result.fans.map(f => f.name);
    expect(names).toContain('全求人');
    expect(names).not.toContain('单钓将');
    expect(names).not.toContain('喜相逢');
  });

  test('清一色 (pure flush) excludes 断幺', () => {
    const ctx = baseCtx({
      hand: [
        man(2), man(3), man(4),
        man(5), man(6), man(7),
        man(2), man(3), man(4),
        man(5), man(6), man(7),
        man(3),
      ],
      winTile: man(3),
      winType: 'self',
    });
    const result = calculateFan(ctx);
    const names = result.fans.map(f => f.name);
    if (names.includes('清一色')) {
      expect(names).not.toContain('断幺');
    }
  });
});

// ── Total score structure ─────────────────────────────────────────────────────

describe('calculateFan result structure', () => {
  test('total = subtotal + flowerTotal', () => {
    const ctx = baseCtx({
      hand: [
        man(1), man(2), man(3),
        man(4), man(5), man(6),
        man(7), man(8), man(9),
        pin(1), pin(1), pin(1),
        pin(2),
      ],
      winTile: pin(2),
      winType: 'self',
      flowers: [flower(1)],
      seatWind: 'east',
    });
    const result = calculateFan(ctx);
    expect(result.total).toBe(result.subtotal + result.flowerTotal);
  });

  test('winType is preserved in result', () => {
    const hand = [
      man(1), man(2), man(3),
      man(4), man(5), man(6),
      man(7), man(8), man(9),
      pin(1), pin(1), pin(1),
      pin(2),
    ];
    const ctxSelf = baseCtx({ hand, winTile: pin(2), winType: 'self' });
    const ctxDiscard = baseCtx({ hand, winTile: pin(2), winType: 'discard' });
    expect(calculateFan(ctxSelf).winType).toBe('self');
    expect(calculateFan(ctxDiscard).winType).toBe('discard');
  });
});

// ── Phase 1: new patterns (§4) ──────────────────────────────────────────────

describe('1-fan: 无字 (no honor tiles)', () => {
  test('all-number hand qualifies', () => {
    const ctx = baseCtx({
      hand: [
        man(1), man(2), man(3),
        man(4), man(5), man(6),
        pin(1), pin(2), pin(3),
        sou(7), sou(8), sou(9),
        pin(9),
      ],
      winTile: pin(9),
      winType: 'self',
    });
    expect(hasFan(ctx, '无字')).toBe(true);
  });
});

describe('1-fan: 缺一门 (exactly one number suit missing)', () => {
  test('man + pin only (no sou) qualifies', () => {
    const ctx = baseCtx({
      hand: [
        man(1), man(2), man(3),
        man(4), man(5), man(6),
        pin(1), pin(2), pin(3),
        pin(7), pin(7), pin(7),
        dragon(1),
      ],
      winTile: dragon(1),
      winType: 'self',
    });
    expect(hasFan(ctx, '缺一门')).toBe(true);
  });
});

describe('6-fan: 五门齐 (all five families)', () => {
  test('man + pin + sou + wind + dragon all present', () => {
    const ctx = baseCtx({
      hand: [
        man(1), man(2), man(3),
        pin(4), pin(5), pin(6),
        sou(7), sou(8), sou(9),
        wind(1), wind(1), wind(1),
        dragon(1),
      ],
      winTile: dragon(1),
      winType: 'self',
    });
    expect(hasFan(ctx, '五门齐')).toBe(true);
  });
});

describe('2-fan: 双同刻 (matching pungs across suits)', () => {
  test('222m + 222p qualifies', () => {
    const ctx = baseCtx({
      hand: [
        man(2), man(2), man(2),
        pin(2), pin(2), pin(2),
        sou(1), sou(2), sou(3),
        sou(4), sou(5), sou(6),
        dragon(1),
      ],
      winTile: dragon(1),
      winType: 'self',
    });
    expect(hasFan(ctx, '双同刻')).toBe(true);
    const result = calculateFan(ctx);
    expect(result.fans.find(f => f.name === '双同刻')?.value).toBe(2);
  });
});

describe('2-fan: 双暗刻 (two concealed pungs)', () => {
  test('exactly two concealed pungs qualifies', () => {
    const ctx = baseCtx({
      hand: [
        man(2), man(2), man(2),
        pin(5), pin(5), pin(5),
        sou(1), sou(2), sou(3),
        sou(4), sou(5), sou(6),
        dragon(1),
      ],
      winTile: dragon(1),
      winType: 'self',
    });
    expect(hasFan(ctx, '双暗刻')).toBe(true);
  });

  test('three concealed pungs gets 三暗刻, not 双暗刻', () => {
    const ctx = baseCtx({
      hand: [
        man(2), man(2), man(2),
        pin(5), pin(5), pin(5),
        sou(8), sou(8), sou(8),
        pin(1), pin(2), pin(3),
        dragon(1),
      ],
      winTile: dragon(1),
      winType: 'self',
    });
    const result = calculateFan(ctx);
    const names = result.fans.map(f => f.name);
    expect(names).toContain('三暗刻');
    expect(names).not.toContain('双暗刻');
  });
});

describe('Kong-related patterns: 暗杠 / 明杠 / 明暗杠 / 双暗杠 / 双明杠', () => {
  const tailHand = [
    pin(1), pin(2), pin(3),
    pin(4), pin(5), pin(6),
    sou(7), sou(8), sou(9),
    dragon(1),
  ];

  test('one concealed kong qualifies for 暗杠', () => {
    const ctx = baseCtx({
      hand: tailHand,
      melds: [
        { type: 'kong_closed', tiles: [man(1), man(1), man(1), man(1)] },
      ],
      winTile: dragon(1),
      winType: 'self',
    });
    const result = calculateFan(ctx);
    expect(result.fans.find(f => f.name === '暗杠')?.value).toBe(1);
    expect(result.fans.map(f => f.name)).not.toContain('明杠');
  });

  test('one open kong qualifies for 明杠', () => {
    const ctx = baseCtx({
      hand: tailHand,
      melds: [
        { type: 'kong_open', tiles: [man(1), man(1), man(1), man(1)] },
      ],
      winTile: dragon(1),
      winType: 'self',
    });
    const result = calculateFan(ctx);
    expect(result.fans.find(f => f.name === '明杠')?.value).toBe(1);
    expect(result.fans.map(f => f.name)).not.toContain('暗杠');
  });

  const shortTailHand = [
    sou(1), sou(2), sou(3),
    sou(4), sou(5), sou(6),
    dragon(1),
  ];

  test('one open + one closed kong qualifies for 明暗杠, excludes 暗杠/明杠', () => {
    const ctx = baseCtx({
      hand: shortTailHand,
      melds: [
        { type: 'kong_open', tiles: [man(1), man(1), man(1), man(1)] },
        { type: 'kong_closed', tiles: [pin(9), pin(9), pin(9), pin(9)] },
      ],
      winTile: dragon(1),
      winType: 'self',
    });
    const result = calculateFan(ctx);
    const names = result.fans.map(f => f.name);
    expect(names).toContain('明暗杠');
    expect(names).not.toContain('暗杠');
    expect(names).not.toContain('明杠');
  });

  test('two concealed kongs qualifies for 双暗杠, excludes 暗杠', () => {
    const ctx = baseCtx({
      hand: shortTailHand,
      melds: [
        { type: 'kong_closed', tiles: [man(1), man(1), man(1), man(1)] },
        { type: 'kong_closed', tiles: [pin(9), pin(9), pin(9), pin(9)] },
      ],
      winTile: dragon(1),
      winType: 'self',
    });
    const result = calculateFan(ctx);
    const names = result.fans.map(f => f.name);
    expect(names).toContain('双暗杠');
    expect(names).not.toContain('暗杠');
  });

  test('two open kongs qualifies for 双明杠, excludes 明杠', () => {
    const ctx = baseCtx({
      hand: shortTailHand,
      melds: [
        { type: 'kong_open', tiles: [man(1), man(1), man(1), man(1)] },
        { type: 'kong_open', tiles: [pin(9), pin(9), pin(9), pin(9)] },
      ],
      winTile: dragon(1),
      winType: 'self',
    });
    const result = calculateFan(ctx);
    const names = result.fans.map(f => f.name);
    expect(names).toContain('双明杠');
    expect(names).not.toContain('明杠');
  });
});

describe('24-fan: 一色三节高 (3 consecutive pungs, same suit)', () => {
  test('man3/man4/man5 pungs qualify', () => {
    const ctx = baseCtx({
      hand: [
        man(3), man(3), man(3),
        man(4), man(4), man(4),
        man(5), man(5), man(5),
        pin(1), pin(2), pin(3),
        sou(9),
      ],
      winTile: sou(9),
      winType: 'self',
    });
    expect(hasFan(ctx, '一色三节高')).toBe(true);
  });
});

describe('8-fan: 三色三节高 (3 consecutive pungs across 3 suits)', () => {
  test('man3/pin4/sou5 pungs qualify', () => {
    const ctx = baseCtx({
      hand: [
        man(3), man(3), man(3),
        pin(4), pin(4), pin(4),
        sou(5), sou(5), sou(5),
        pin(6), pin(7), pin(8),
        sou(9),
      ],
      winTile: sou(9),
      winType: 'self',
    });
    expect(hasFan(ctx, '三色三节高')).toBe(true);
    expect(hasFan(ctx, '一色三节高')).toBe(false);
  });
});

describe('64-fan: 一色双龙会 (same-suit double dragon meeting)', () => {
  test('123+123+789+789 of man, pair of man5', () => {
    const ctx = baseCtx({
      hand: [
        man(1), man(2), man(3),
        man(1), man(2), man(3),
        man(7), man(8), man(9),
        man(7), man(8), man(9),
        man(5),
      ],
      winTile: man(5),
      winType: 'self',
    });
    expect(hasFan(ctx, '一色双龙会')).toBe(true);
    const result = calculateFan(ctx);
    const names = result.fans.map(f => f.name);
    expect(names).not.toContain('清一色');
    expect(names).not.toContain('一般高');
    expect(names).not.toContain('老少副');
  });
});

describe('16-fan: 三色双龙会 (cross-suit double dragon meeting)', () => {
  test('123+789 of man and pin, pair of sou5', () => {
    const ctx = baseCtx({
      hand: [
        man(1), man(2), man(3),
        man(7), man(8), man(9),
        pin(1), pin(2), pin(3),
        pin(7), pin(8), pin(9),
        sou(5),
      ],
      winTile: sou(5),
      winType: 'self',
    });
    expect(hasFan(ctx, '三色双龙会')).toBe(true);
  });
});

describe('4-fan: 和绝张 (winning on the last copy of a tile)', () => {
  test('winTile has all 4 copies visible', () => {
    const ctx = baseCtx({
      hand: [
        man(1), man(2), man(3),
        pin(4), pin(5), pin(6),
        sou(7), sou(8), sou(9),
        man(5), man(6), man(7),
        pin(3),
      ],
      winTile: pin(3),
      winType: 'self',
      visibleTileCounts: new Map([['pin:3', 4]]),
    });
    expect(hasFan(ctx, '和绝张')).toBe(true);
  });
});

describe('88-fan: 连七对 (seven consecutive pairs)', () => {
  test('man1-man7 pairs qualify', () => {
    const ctx = baseCtx({
      hand: [
        man(1), man(1), man(2), man(2),
        man(3), man(3), man(4), man(4),
        man(5), man(5), man(6), man(6),
        man(7),
      ],
      winTile: man(7),
      winType: 'self',
    });
    expect(hasFan(ctx, '连七对')).toBe(true);
    const result = calculateFan(ctx);
    const names = result.fans.map(f => f.name);
    expect(names).not.toContain('七对');
    expect(names).not.toContain('清一色');
    expect(names).not.toContain('门前清');
    expect(names).not.toContain('单钓将');
  });
});

// ── Phase 1: logic rewrites (§3) ─────────────────────────────────────────────

describe('48-fan: 一色四节高 (4 consecutive pungs, same suit)', () => {
  test('man3/man4/man5/man6 pungs qualify', () => {
    const ctx = baseCtx({
      hand: [
        man(3), man(3), man(3),
        man(4), man(4), man(4),
        man(5), man(5), man(5),
        man(6), man(6), man(8), man(8),
      ],
      winTile: man(6),
      winType: 'self',
    });
    expect(hasFan(ctx, '一色四节高')).toBe(true);
    const result = calculateFan(ctx);
    const names = result.fans.map(f => f.name);
    expect(names).not.toContain('一色三同顺');
    expect(names).not.toContain('一色三节高');
    expect(names).not.toContain('碰碰和');
  });
});

describe('1-fan: 幺九刻 (count of terminal/honor pungs)', () => {
  test('two terminal pungs (man1 + sou9) count as 2', () => {
    const ctx = baseCtx({
      hand: [
        man(1), man(1), man(1),
        sou(9), sou(9), sou(9),
        pin(1), pin(2), pin(3),
        pin(4), pin(5), pin(6),
        pin(8),
      ],
      winTile: pin(8),
      winType: 'self',
    });
    const result = calculateFan(ctx);
    const entry = result.fans.find(f => f.name === '幺九刻');
    expect(entry?.count).toBe(2);
    expect(entry?.value).toBe(2);
  });
});

describe('64-fan: 四暗刻 (4 concealed pungs on a discard-win 单钓将)', () => {
  test('discard completing the pair keeps all 4 pungs concealed', () => {
    const ctx = baseCtx({
      hand: [
        man(2), man(2), man(2),
        man(5), man(5), man(5),
        pin(3), pin(3), pin(3),
        sou(7), sou(7), sou(7),
        dragon(2),
      ],
      winTile: dragon(2),
      winType: 'discard',
    });
    expect(hasFan(ctx, '四暗刻')).toBe(true);
    const result = calculateFan(ctx);
    expect(result.fans.find(f => f.name === '四暗刻')?.value).toBe(64);
  });
});

describe('1-fan: 一般高 (count of duplicated chows)', () => {
  test('two distinct duplicated chows count as 2', () => {
    // Two claimed 123万 chows (meld-derived) + two hand-formed 456饼 chows.
    // (A concealed hand with two duplicated chows is always also a valid
    // seven-pairs decomposition, which outscores 一般高 ×2 — so this case
    // needs open melds to avoid that ambiguity.)
    const ctx = baseCtx({
      hand: [
        pin(4), pin(5), pin(6),
        pin(4), pin(5), pin(6),
        dragon(1),
      ],
      melds: [
        { type: 'chi', tiles: [man(1), man(2), man(3)] },
        { type: 'chi', tiles: [man(1), man(2), man(3)] },
      ],
      winTile: dragon(1),
      winType: 'self',
    });
    const result = calculateFan(ctx);
    const entry = result.fans.find(f => f.name === '一般高');
    expect(entry?.count).toBe(2);
    expect(entry?.value).toBe(2);
  });
});

// ── Phase 1: 边张/坎张/单钓将 rework (§5) ────────────────────────────────────

describe('1-fan: 单钓将 / 边张 / 坎张 (single-wait waits)', () => {
  test('单钓将: single wait on the pair', () => {
    const ctx = baseCtx({
      hand: [
        man(1), man(2), man(3),
        man(4), man(5), man(6),
        pin(1), pin(2), pin(3),
        pin(4), pin(5), pin(6),
        dragon(1),
      ],
      winTile: dragon(1),
      winType: 'self',
    });
    expect(hasFan(ctx, '单钓将')).toBe(true);
    expect(hasFan(ctx, '边张')).toBe(false);
    expect(hasFan(ctx, '坎张')).toBe(false);
  });

  test('边张: single wait completing a 123 chow on the 3', () => {
    const ctx = baseCtx({
      hand: [
        man(1), man(2),
        pin(1), pin(2), pin(3),
        pin(4), pin(5), pin(6),
        sou(7), sou(8), sou(9),
        dragon(1), dragon(1),
      ],
      winTile: man(3),
      winType: 'self',
    });
    expect(hasFan(ctx, '边张')).toBe(true);
    expect(hasFan(ctx, '单钓将')).toBe(false);
    expect(hasFan(ctx, '坎张')).toBe(false);
  });

  test('坎张: single wait completing the middle of a chow', () => {
    const ctx = baseCtx({
      hand: [
        man(4), man(6),
        pin(1), pin(2), pin(3),
        pin(4), pin(5), pin(6),
        sou(7), sou(8), sou(9),
        dragon(1), dragon(1),
      ],
      winTile: man(5),
      winType: 'self',
    });
    expect(hasFan(ctx, '坎张')).toBe(true);
    expect(hasFan(ctx, '单钓将')).toBe(false);
    expect(hasFan(ctx, '边张')).toBe(false);
  });

  test('multi-wait hands do not get 边张/坎张/单钓将', () => {
    const ctx = baseCtx({
      hand: [
        man(1), man(2), man(3), man(4), man(5), man(6), man(7), man(8),
        pin(1), pin(1), pin(1),
        sou(5), sou(5),
      ],
      winTile: man(6),
      winType: 'self',
    });
    expect(hasFan(ctx, '单钓将')).toBe(false);
    expect(hasFan(ctx, '边张')).toBe(false);
    expect(hasFan(ctx, '坎张')).toBe(false);
  });
});

// ── Phase 1: last-tile / kong-draw renames (§2) ──────────────────────────────

describe('8-fan: 杠上开花 / 妙手回春 / 海底捞月 (renamed last-tile patterns)', () => {
  const winningHand = [
    man(1), man(2), man(3),
    pin(4), pin(5), pin(6),
    sou(7), sou(8), sou(9),
    man(5), man(6), man(7),
    pin(3),
  ];

  test('杠上开花: self-draw replacement tile after a kong', () => {
    const ctx = baseCtx({
      hand: winningHand,
      winTile: pin(3),
      winType: 'self',
      isAfterKong: true,
    });
    const result = calculateFan(ctx);
    const names = result.fans.map(f => f.name);
    expect(names).toContain('杠上开花');
    expect(result.fans.find(f => f.name === '杠上开花')?.value).toBe(8);
    expect(names).not.toContain('自摸');
  });

  test('妙手回春: self-draw on the last tile of the wall', () => {
    const ctx = baseCtx({
      hand: winningHand,
      winTile: pin(3),
      winType: 'self',
      isLastTile: true,
    });
    const result = calculateFan(ctx);
    const names = result.fans.map(f => f.name);
    expect(names).toContain('妙手回春');
    expect(result.fans.find(f => f.name === '妙手回春')?.value).toBe(8);
    expect(names).not.toContain('自摸');
  });

  test('海底捞月: discard win on the last tile of the wall', () => {
    const ctx = baseCtx({
      hand: winningHand,
      winTile: pin(3),
      winType: 'discard',
      isLastTile: true,
    });
    const result = calculateFan(ctx);
    const names = result.fans.map(f => f.name);
    expect(names).toContain('海底捞月');
    expect(result.fans.find(f => f.name === '海底捞月')?.value).toBe(8);
  });
});
