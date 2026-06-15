# Mahjong Project — Claude Context

Four-player real-time Guobiao Mahjong (国标麻将) web game implementing the full 88-fan scoring system.

## Architecture

Monorepo with two packages:

```
mahjong/
├── server/     Node.js 22 + Express + Socket.IO 4 + TypeScript
└── client/     React 18 + Vite + Zustand + TypeScript
```

Redis is required for express-session storage (`connect-redis`) and lightly for room persistence — the `roomManager` is in-memory; Redis is wired via `server/src/redis.ts`. Postgres is required for persistent data (completed-match history, user accounts, OAuth links) via Drizzle ORM — wired in `server/src/db/client.ts`. Live game state stays in-memory/Redis-light; Postgres only stores completed-match summaries and account data.

Test suite: `./test.sh` runs the server's jest suite (101 unit tests covering `FanCalculator`, `winChecker`, `GameEngine`, `ScoreCalculator`). `./e2e.sh` runs Playwright e2e tests against the Docker Compose stack. `./bot.sh` runs an automated bot client for manual full-game testing.

## Dev Setup

**Preferred: use the existing Docker Compose stack.** Before creating any new containers, check `docker ps -a` for a stopped `mahjong` compose stack (containers named `mahjong-redis-1`, `mahjong-server-1`, `mahjong-client-1`). If found, restart it with `docker compose up -d` — do not `docker run` new containers.

```bash
# Start everything (reuses existing containers if present)
docker compose up -d
```

Visit http://localhost:5173.

Manual dev mode (only if Docker Compose is not an option):
```bash
# Redis
docker run -d -p 6379:6379 redis:7-alpine

# Server (port 3001, nodemon hot-reload)
cd server && npm install && npm run dev

# Client (port 5173, Vite with proxy to :3001)
cd client && npm install && npm run dev
```

Vite proxies `/api` and `/socket.io` to `http://localhost:3001`, so the client always talks to its own origin.

Docker Compose (`docker-compose.yml`) runs all three services. Prod variant is `docker-compose.prod.yml`.

## Types (canonical source of truth)

`server/src/types.ts` is the authoritative type file. `client/src/types.ts` mirrors it with minor differences (no `WinContext`, `Decomposition`, `Group`; adds `RoomState`, `DrawTileData`, `ActionBroadcastData`, `CanActData`, `AuthUser`, `GameHistoryEntry`). When adding fields, update both.

Key types:
- `Tile` — `{ id: string; suit: Suit; value: number }`. Suits: `man/pin/sou` (1–9), `wind` (1=East…4=North), `dragon` (1=中/2=发/3=白), `flower` (1–8).
- `Meld` — `{ type: MeldType; tiles: Tile[]; claimedFrom? }`. Types: `chi | pong | kong_open | kong_closed | kong_added`.
- `GameState` — authoritative game snapshot. Server sends each player a masked copy (other players' `hand: []`).
- `WinContext` — passed to `calculateFan()`; built by `GameEngine.buildWinContext()`.
- `Decomposition` — output of `decompose()`; used by every fan rule check.

## Server Layer Map

| File | Responsibility |
|------|---------------|
| `server/src/index.ts` | Express + Socket.IO setup, Redis init |
| `server/src/rooms/RoomManager.ts` | In-memory room registry; create/join/close |
| `server/src/rooms/Room.ts` | Room lifecycle: ready-check, disconnect timers, AI takeover |
| `server/src/game/GameEngine.ts` | All game state mutations; emits `GameEvent` objects |
| `server/src/game/Deck.ts` | 144-tile shuffled wall; normal draws from the front, kong/flower replacement draws from the back |
| `server/src/game/ScoreCalculator.ts` | `calcScoreDeltas()` — discard win pays ×3, self-draw each pays ×1 |
| `server/src/fan/winChecker.ts` | `isWinnable`, `decompose`, `getTenpaiTiles`, tile helpers |
| `server/src/fan/FanCalculator.ts` | `calculateFan(ctx: WinContext)` — evaluates all fan rules |
| `server/src/socket/SocketHandler.ts` | Socket event routing; individualized state masking |
| `server/src/db/client.ts` | Postgres pool + Drizzle instance (`getDb()`, `pingDb()`) |
| `server/src/db/schema.ts` | Drizzle schema: `users`, `oauthAccounts`, `players`, `games`, `gamePlayers` |
| `server/src/db/migrate.ts` | Runs `drizzle-orm` migrations on container start (`db:migrate`) |
| `server/src/db/gameHistory.ts` | `recordCompletedGame()` — persists a finished match + per-player ranks |
| `server/src/auth/passport.ts` | Google OAuth strategy + session (de)serialization |
| `server/src/api/authRoutes.ts` | `/api/v1/auth/*` — Google login, callback (account linking), logout, `/me` |
| `server/src/api/routes.ts` | `/api/v1/health` (now also pings Postgres), `/players/:id/history` |

## GameEngine Event Flow

GameEngine never calls Socket.IO directly. It calls `this.onEvent(GameEvent)`, which Room wires to `SocketHandler.handleGameEvent()`.

```
player action (socket event)
  → SocketHandler.withGame()
  → GameEngine.handle*()
  → emits GameEvent(s)
  → Room.onEvent → handleGameEvent()
  → io.to(room) or socket.emit
```

`GameEvent` types: `drawTile | action | canAct | fanHint | settled | stateUpdate`.

`stateUpdate` triggers individualized state sends: each player gets `game:stateUpdate` with only their own `hand` populated, others masked to `[]`.

## Action Priority (after discard)

`win > kong > pong > chi > pass`

Multiple players can be pending. `resolveResponses()` picks the first matching action in priority order. One-炮多响 (multiple wins) is simplified to first winner.

## Fan System

- Minimum 8 fan to win.
- `winChecker.ts` exports pure helpers: `sameTile`, `isTerminal`, `isHonor`, `isFlower`, `isSimple`, `isWinnable`, `decompose`, `isSevenPairs`, `isKnittedHand`, `sortTiles`, `getTenpaiTiles`.
- `FanCalculator.ts` defines `FanRule[]` objects with `{ name, value, check: (d, ctx) => boolean }`. `calculateFan()` tries all decompositions of the hand, evaluates all rules for the best decomposition, applies mutual exclusion, sums up.
- Flower bonus: own-seat flowers score 2 pts each, others score 1 pt. Spring/Summer/Autumn/Winter are values 1–4, Plum/Orchid/Bamboo/Chrysanthemum are 5–8.

## Scoring

Self-draw (摸和): all three others pay `total` each → winner gains `total × 3`.
Discard win (点和): payer pays `total × 3` → winner gains `total × 3`.
Minimum payment floor: 8 fan even if `fanResult.total < 8`.
Dealer retention (连庄): dealer wins or wall exhausted → same dealer, same round wind.
Game ends at `totalRound === 16` (4 winds × 4 rounds).

## Client Layer Map

| File | Responsibility |
|------|---------------|
| `client/src/hooks/useWebSocket.ts` | Singleton Socket.IO connection; maps all socket events to store |
| `client/src/store/gameStore.ts` | Zustand store; single source of UI truth |
| `client/src/components/GameBoard/` | Main game view; player layout, tile click handlers |
| `client/src/components/Lobby/` | Room create/join/ready UI |
| `client/src/components/ActionPanel/` | Chi/Pong/Kong/Win/Pass buttons |
| `client/src/components/DiscardPile/` | Discard grid per player |
| `client/src/components/FanPanel/` | Fan hint display (pre-win preview) |
| `client/src/components/Settlement/` | Round-end scores overlay |
| `client/src/components/TileComponent/` | Single tile renderer |
| `client/src/utils/tiles.ts` | `tileLabel`, `tileColor`, `windLabel`, `sortTiles` |
| `client/src/utils/sounds.ts` | Web Audio API synthesized sound effects (discard, chi/pong, kong, flower, win); gated by `isSoundEnabled()` (`localStorage['mj_sound_enabled']`) |

Socket is a module-level singleton (`let socket: Socket | null`). The hook only initializes once; subsequent calls are no-ops.

Player identity stored in `localStorage` under key `mj_playerId` (survives closing the tab — required for guest history and for linking to a Google account). On reconnect the server auto-restores the room.

`useWebSocket` also fetches `/api/v1/auth/me` on mount and stores the result in `gameStore.authUser` (`AuthUser | null`). The Lobby landing page shows a "使用 Google 登录" button (redirects to `/api/v1/auth/google?playerId=...`) or, when signed in, the user's avatar/name + a logout button, plus a "战绩" (history) button that fetches `/api/v1/players/:playerId/history`.

## Socket Event Reference

**Client → Server**
| Event | Payload |
|-------|---------|
| `room:create` | `{ nickname, settings?: RoomSettings }` |
| `room:join` | `{ roomCode, nickname }` |
| `room:ready` / `room:unready` | — |
| `room:start` | — (host only) |
| `room:next` | — (host only, after settlement) |
| `room:random_seats` | `{ enabled: boolean }` |
| `room:update_settings` | `Partial<RoomSettings>` (host only, while `waiting`) |
| `game:discard` | `{ tileId }` |
| `game:chi` | `{ tileId, combination: [id, id] }` |
| `game:pong` | — |
| `game:kong` | `{ tileId, type: 'closed'|'open'|'added' }` |
| `game:win` | — |
| `game:pass` | — |
| `game:extend_timer` | — (any player; adds 10s to the currently active action timer) |

**Server → Client**
| Event | Audience | Payload |
|-------|----------|---------|
| `session:init` | self | `{ playerId, reconnected }` |
| `room:updated` | room | `RoomState` |
| `game:started` | room | — |
| `game:stateUpdate` | individual | `GameState` (others' hands masked) |
| `game:drawTile` | individual | `DrawTileData` |
| `game:action` | room | `ActionBroadcastData` |
| `game:canAct` | individual | `CanActData` |
| `game:fanHint` | individual | `{ fanHint: FanResult }` |
| `game:turnTimer` | room | `{ playerId, timeoutAt }` |
| `game:settled` | room | `SettlementData` |
| `game:error` | self | `{ code, message }` |

## HTTP API Reference

| Endpoint | Notes |
|----------|-------|
| `GET /api/v1/health` | `{ status, redis, db, uptime, activeRooms, activePlayers }` |
| `GET /api/v1/players/:playerId/history` | Paginated (`limit`/`offset`) past matches; if the player is linked to a `users` row, aggregates history across every `players` row sharing that `userId` (cross-device) |
| `GET /api/v1/auth/google` | Starts Google OAuth (`?playerId=` stashes the guest id in session for linking); 503 if `GOOGLE_CLIENT_ID`/`SECRET` unset |
| `GET /api/v1/auth/google/callback` | Completes OAuth; upserts `players.userId` to link the guest `playerId`, then redirects to `/` |
| `POST /api/v1/auth/logout` | Destroys the session |
| `GET /api/v1/auth/me` | `{ user: AuthUser }` or 401 if not authenticated |

## Key Conventions

- **Server is authoritative.** All rule checks happen server-side. Clients just display and emit intent.
- **No lock files committed.** Use `npm install`, not `npm ci`.
- **Tile identity.** `tile.id` is a UUID (unique instance); `sameTile(a, b)` compares `suit + value` (logical equality). Use `id` for hand splicing; use `sameTile` for matching discards.
- **Chi is left-player only.** Only the player immediately downstream of the discarder can chi.
- **`handCount` vs `hand.length`.** `handCount` is sent to all players; actual `hand` tiles are only in the own-player's `GameState`. Don't use `hand.length` on opponent players client-side.
- **Room settings** (`RoomSettings`: `totalRounds`, `actionTimeoutSeconds`) are chosen by the host at room creation (defaults: 16 rounds / 30s) and editable while the room is `waiting` via `room:update_settings`. Allowed values: `totalRounds` ∈ {4, 8, 16}, `actionTimeoutSeconds` ∈ {30, 60, 90} — see `server/src/rooms/roomSettings.ts`. They're passed into `GameEngine` at `startGame()` and drive `this.actionTimeout` and `this.maxRounds` (replacing the old hardcoded 16-round / `ACTION_TIMEOUT_SECONDS` constants). `DISCONNECT_GRACE_SECONDS` still defaults to 60 via env var.
- **Schema migrations.** `server/src/db/schema.ts` is the source of truth. Run `npm run db:generate` (drizzle-kit) to produce a new migration under `server/src/db/migrations/`, then `npm run db:migrate` (or restart the server container, which runs migrations on boot via the Dockerfile `CMD`).
- **Guest vs. account.** `players.id` is the client's `mj_playerId` (a guest UUID until linked). `players.userId` is nullable; it's set when a guest signs in with Google while that `playerId` is active. History is keyed by `players.id` but aggregated across all `players` rows sharing the same `userId`.
- Run `./test.sh` (jest, 101 tests) after changes to `FanCalculator` or `winChecker` — these carry risk of silent regressions.

## Environment Variables

| Var | Default | Notes |
|-----|---------|-------|
| `PORT` | `3001` | Server port |
| `REDIS_URL` | `redis://localhost:6379` | Also backs the express-session store |
| `DATABASE_URL` | `postgresql://mahjong:mahjong@localhost:5432/mahjong` | Postgres connection string |
| `POSTGRES_PASSWORD` | `mahjong` (dev) | Used by docker-compose to set up the `postgres` service; prod requires a real secret |
| `SESSION_SECRET` | `dev-secret-change-in-prod` | express-session signing secret |
| `SESSION_TTL_SECONDS` | `7200` | Session cookie maxAge |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | — | Google OAuth credentials; if unset, Google login is disabled (`/auth/google` returns 503) |
| `GOOGLE_CALLBACK_URL` | `http://localhost:3001/api/v1/auth/google/callback` | Must match the redirect URI configured in Google Cloud Console |
| `CLIENT_ORIGIN` | `http://localhost:5173` | CORS origin |
| `SHARE_BASE_URL` | `http://localhost:5173` | Room invite URL prefix |
| `DISCONNECT_GRACE_SECONDS` | `60` | Before AI takeover |
| `LOG_LEVEL` | `debug` | Pino log level |
