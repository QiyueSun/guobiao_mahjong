import { Router, Request, Response } from 'express';
import { roomManager } from '../rooms/RoomManager';
import { getRedis } from '../redis';

const router = Router();

router.get('/health', async (_req: Request, res: Response) => {
  let redisStatus = 'ok';
  try {
    await getRedis().ping();
  } catch {
    redisStatus = 'error';
  }

  res.json({
    status: 'ok',
    redis: redisStatus,
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

export default router;
