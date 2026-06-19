import { PlayerId, FanResult } from '../types';

const BASE = 8;

export function calcScoreDeltas(
  winner: PlayerId,
  payer: PlayerId | null, // null = self-draw (all pay)
  fanResult: FanResult,
  playerIds: PlayerId[],
): Record<PlayerId, number> {
  // Total payment = fan (including flowers) + 8
  const payment = fanResult.total + BASE;
  const deltas: Record<PlayerId, number> = {};
  for (const pid of playerIds) deltas[pid] = 0;

  if (payer === null) {
    // Self-draw: all 3 others each pay (fan + 8)
    const others = playerIds.filter(p => p !== winner);
    deltas[winner] = payment * others.length;
    for (const p of others) deltas[p] = -payment;
  } else {
    // Discard win: 放炮者 pays (fan + 8), other 2 each pay 8
    const others = playerIds.filter(p => p !== winner && p !== payer);
    deltas[winner] = payment + BASE * others.length;
    deltas[payer] = -payment;
    for (const p of others) deltas[p] = -BASE;
  }

  return deltas;
}
