import { Tile, Wind } from '../types';

const MAN_CHARS = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
const WINDS = ['东', '南', '西', '北'];
const DRAGONS = ['中', '发', '白'];
const FLOWERS = ['春', '夏', '秋', '冬', '梅', '兰', '竹', '菊'];

export function tileLabel(tile: Tile): string {
  switch (tile.suit) {
    case 'man':    return MAN_CHARS[tile.value - 1] + '万';
    case 'pin':    return MAN_CHARS[tile.value - 1] + '饼';
    case 'sou':    return MAN_CHARS[tile.value - 1] + '条';
    case 'wind':   return WINDS[tile.value - 1];
    case 'dragon': return DRAGONS[tile.value - 1];
    case 'flower': return FLOWERS[tile.value - 1];
    default:       return '?';
  }
}

export function tileColor(tile: Tile): string {
  if (tile.suit === 'dragon' && tile.value === 1) return '#c0392b'; // 中 red
  if (tile.suit === 'dragon' && tile.value === 2) return '#27ae60'; // 发 green
  if (tile.suit === 'wind') return '#2c3e50';
  if (tile.suit === 'flower') return '#8e44ad';
  return '#2c3e50';
}

export function windLabel(wind: Wind): string {
  const map: Record<Wind, string> = { east: '东', south: '南', west: '西', north: '北' };
  return map[wind];
}

export function sortTiles(tiles: Tile[]): Tile[] {
  const suitOrder: Record<string, number> = { man: 0, pin: 1, sou: 2, wind: 3, dragon: 4, flower: 5 };
  return [...tiles].sort((a, b) => {
    const s = suitOrder[a.suit] - suitOrder[b.suit];
    return s !== 0 ? s : a.value - b.value;
  });
}

export function isHonor(tile: Tile): boolean {
  return tile.suit === 'wind' || tile.suit === 'dragon';
}

export function suitLabel(suit: string): string {
  const m: Record<string, string> = { man: '万', pin: '饼', sou: '条' };
  return m[suit] ?? '';
}
