import { PlayerId, FanResult } from '../types';

const MIN_FAN = 8;

export function calcScoreDeltas(
  winner: PlayerId,
  payer: PlayerId | null, // null = self-draw (all pay)
  fanResult: FanResult,
  playerIds: PlayerId[],
): Record<PlayerId, number> {
  const total = Math.max(MIN_FAN, fanResult.total);
  const deltas: Record<PlayerId, number> = {};
  for (const pid of playerIds) deltas[pid] = 0;

  if (payer === null) {
    // Self-draw: each other player pays `total`
    const others = playerIds.filter(p => p !== winner);
    deltas[winner] = total * others.length;
    for (const p of others) deltas[p] = -total;
  } else {
    // Discard win: only the payer pays (3× total)
    deltas[winner] = total * 3;
    deltas[payer] = -total * 3;
  }

  return deltas;
}
