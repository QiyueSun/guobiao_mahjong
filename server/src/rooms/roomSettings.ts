import { RoomSettings } from '../types';

export const ALLOWED_TOTAL_ROUNDS = [4, 8, 16] as const;
export const ALLOWED_ACTION_TIMEOUT_SECONDS = [30, 60, 90] as const;
export const ALLOWED_BOT_COUNTS = [0, 1, 2, 3] as const;

export const DEFAULT_ROOM_SETTINGS: RoomSettings = {
  totalRounds: 16,
  actionTimeoutSeconds: 30,
  botCount: 0,
};
