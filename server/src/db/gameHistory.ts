import { getDb } from './client';
import { games, gamePlayers, players as playersTable } from './schema';
import { GameState, SettlementData, PlayerId } from '../types';

interface RoomLike {
  code: string;
  createdAt: number;
  nicknames: Record<PlayerId, string>;
}

export async function recordCompletedGame(
  room: RoomLike,
  state: GameState,
  _settlement: SettlementData,
): Promise<void> {
  const db = getDb();
  const now = new Date();

  for (const pid of state.playerOrder) {
    const nickname = room.nicknames[pid] ?? state.players[pid]?.nickname ?? '';
    await db
      .insert(playersTable)
      .values({ id: pid, nickname, lastSeenAt: now })
      .onConflictDoUpdate({
        target: playersTable.id,
        set: { nickname, lastSeenAt: now },
      });
  }

  const [game] = await db
    .insert(games)
    .values({
      roomCode: room.code,
      startedAt: new Date(room.createdAt),
      endedAt: now,
      totalRoundsPlayed: state.round.totalRound,
      maxRounds: state.round.maxRounds,
    })
    .returning();

  const ranked = state.playerOrder
    .map((pid) => ({ pid, score: state.players[pid]?.score ?? 0 }))
    .sort((a, b) => b.score - a.score);

  await db.insert(gamePlayers).values(
    ranked.map((r, idx) => ({
      gameId: game.id,
      playerId: r.pid,
      finalScore: r.score,
      rank: idx + 1,
    })),
  );
}
