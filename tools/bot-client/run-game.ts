#!/usr/bin/env ts-node
/**
 * Bot game runner for manual testing.
 *
 * Usage:
 *   npx ts-node run-game.ts [options]
 *
 * Options:
 *   --server   Server URL     (default: http://localhost:3001)
 *   --bots     Bot count      (default: 3 — leave 1 seat for a human browser tab)
 *   --rounds   Rounds to play (default: 1)
 *   --delay    Action delay ms(default: 600)
 *
 * Examples:
 *   # 3 bots + 1 human (open http://localhost:5173 in a browser and join the room)
 *   npx ts-node run-game.ts --bots 3
 *
 *   # Fully automated 4-bot game
 *   npx ts-node run-game.ts --bots 4
 *
 *   # Fast 4-bot game, 2 rounds
 *   npx ts-node run-game.ts --bots 4 --rounds 2 --delay 200
 */

import { BotPlayer } from './BotPlayer';

function parseArgs(): { server: string; bots: number; rounds: number; delay: number } {
  const args = process.argv.slice(2);
  const get = (flag: string, def: string) => {
    const i = args.indexOf(flag);
    return i !== -1 && args[i + 1] ? args[i + 1] : def;
  };
  return {
    server: get('--server', 'http://mahjong-server-1:3001'),
    bots: parseInt(get('--bots', '3'), 10),
    rounds: parseInt(get('--rounds', '16'), 10),
    delay: parseInt(get('--delay', '600'), 10),
  };
}

async function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

async function main(): Promise<void> {
  const { server, bots, rounds, delay } = parseArgs();

  if (bots < 1 || bots > 4) {
    console.error('--bots must be 1–4');
    process.exit(1);
  }

  const tag = (name: string) => (msg: string) =>
    console.log(`[${new Date().toLocaleTimeString()}] [${name}] ${msg}`);

  const names = ['机器人一', '机器人二', '机器人三', '机器人四'].slice(0, bots);
  const players = names.map(
    (name, i) => new BotPlayer({ serverUrl: server, nickname: name, delayMs: delay, onLog: tag(name) }, rounds),
  );

  // Bot 0 creates the room
  players[0].createRoom();
  const roomCode = await players[0].waitForRoomCode();
  console.log(`\n房间号: ${roomCode}\n`);

  if (bots < 4) {
    console.log(`请在浏览器中访问 http://localhost:5173 并加入房间号 ${roomCode}`);
    console.log(`等待人类玩家加入...\n`);
  }

  // Remaining bots join
  for (let i = 1; i < bots; i++) {
    await sleep(300);
    players[i].joinRoom(roomCode);
  }

  // Wait for all bots to finish
  await Promise.all(players.map(p => p.waitForDisconnect()));
  console.log('\n所有机器人已完成，游戏结束。');
}

main().catch(e => { console.error(e); process.exit(1); });
