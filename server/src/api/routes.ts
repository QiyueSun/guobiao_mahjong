import { Router, Request, Response } from 'express';
import { eq, desc, inArray } from 'drizzle-orm';
import { roomManager } from '../rooms/RoomManager';
import { getRedis } from '../redis';
import { getDb, pingDb } from '../db/client';
import { games, gamePlayers, players as playersTable } from '../db/schema';

const router = Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

router.get('/health', async (_req: Request, res: Response) => {
  let redisStatus = 'ok';
  try {
    await getRedis().ping();
  } catch {
    redisStatus = 'error';
  }

  const dbStatus = (await pingDb()) ? 'ok' : 'error';

  res.json({
    status: 'ok',
    redis: redisStatus,
    db: dbStatus,
    uptime: Math.floor(process.uptime()),
    activeRooms: roomManager.activeRoomCount(),
    activePlayers: roomManager.activePlayerCount(),
  });
});

router.get('/rooms/:code', (req: Request, res: Response) => {
  const room = roomManager.getRoom(req.params.code.toUpperCase());
  if (!room) {
    res.status(404).json({ code: 'ROOM_NOT_FOUND', message: '房间不存在或已过期' });
    return;
  }

  res.json({
    roomCode: room.code,
    phase: room.phase,
    playerCount: room.playerIds.length,
    maxPlayers: 4,
    createdAt: new Date(room.createdAt).toISOString(),
  });
});

router.get('/players/:playerId/history', async (req: Request, res: Response) => {
  const { playerId } = req.params;
  if (!UUID_RE.test(playerId)) {
    res.status(400).json({ code: 'INVALID_PLAYER_ID', message: '无效的玩家ID' });
    return;
  }

  const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? '20'), 10) || 20, 1), 100);
  const offset = Math.max(parseInt(String(req.query.offset ?? '0'), 10) || 0, 0);

  const db = getDb();

  // If this player is linked to an account, include games from every player
  // record linked to that same account (cross-device history).
  const [player] = await db.select().from(playersTable).where(eq(playersTable.id, playerId));
  let playerIds = [playerId];
  if (player?.userId) {
    const linked = await db.select({ id: playersTable.id }).from(playersTable)
      .where(eq(playersTable.userId, player.userId));
    playerIds = linked.map(p => p.id);
  }

  const rows = await db
    .select({
      gameId: games.id,
      roomCode: games.roomCode,
      startedAt: games.startedAt,
      endedAt: games.endedAt,
      totalRoundsPlayed: games.totalRoundsPlayed,
      maxRounds: games.maxRounds,
      finalScore: gamePlayers.finalScore,
      rank: gamePlayers.rank,
    })
    .from(gamePlayers)
    .innerJoin(games, eq(gamePlayers.gameId, games.id))
    .where(inArray(gamePlayers.playerId, playerIds))
    .orderBy(desc(games.endedAt))
    .limit(limit)
    .offset(offset);

  res.json({ games: rows });
});

export default router;
