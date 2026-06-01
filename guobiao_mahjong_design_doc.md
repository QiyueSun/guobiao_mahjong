# 国标麻将网页游戏 Design Doc

**版本**: v1.2  
**日期**: 2026-05-31  
**状态**: 草稿

---

## 1. 项目概述

### 1.1 背景与目标

开发一款基于浏览器的多人在线国标麻将（中国麻将竞赛规则）游戏，支持四人实时对战、完整的国标番型判定，以及实时算番提示。玩家可在不安装任何客户端的情况下，通过分享房间链接邀请好友加入。

### 1.2 核心价值主张

- **零门槛**：浏览器直接游玩，无需下载
- **私密对局**：房间制，仅限受邀好友进入
- **规则完整**：严格遵守《国家体育总局麻将竞赛规则》（88番）
- **教学友好**：实时算番提示，帮助玩家学习番型

### 1.3 目标用户

- 熟悉麻将但想学习国标规则的玩家
- 希望与异地好友在线对局的麻将爱好者
- 对国标麻将规则感兴趣的学习者

---

## 2. 功能需求

### 2.1 房间系统

#### 2.1.1 创建房间

- 玩家点击「创建房间」后，系统生成唯一的 6 位房间码（如 `AJ8K2M`）
- 同时生成可分享的房间链接（如 `https://mahjong.example.com/room/AJ8K2M`）
- 创建者自动成为房主（东风位），等待其他玩家加入
- 房间有效期：无人操作 30 分钟后自动关闭

#### 2.1.2 加入房间

- 支持两种方式加入：
  1. 直接访问分享链接
  2. 在主页输入房间码
- 房间满员（4人）时拒绝加入并提示
- 支持断线重连：同一浏览器 Session 内可重新进入进行中的房间

#### 2.1.3 房间大厅

- 显示当前在线玩家列表（昵称 + 座位方位：东/南/西/北）
- 玩家可设置昵称（最多8个字符）
- 房主可踢出未准备的玩家
- 所有玩家点击「准备」后，房主点击「开始游戏」

#### 2.1.4 座位分配

- 默认按加入顺序分配座位（东→南→西→北）
- 房主可开启「随机座位」选项

### 2.2 游戏核心逻辑

#### 2.2.1 国标麻将基本规则

遵循国家体育总局《麻将竞赛规则》，主要规则如下：

| 规则项 | 说明 |
|--------|------|
| 牌型 | 万/条/饼各1-9，东南西北中发白风牌，共136张 |
| 起手 | 庄家13+1张，闲家13张 |
| 圈风/门风 | 东风圈，庄家为东风 |
| 和牌要求 | 最低8番起和 |
| 花牌 | 使用花牌（春夏秋冬梅兰竹菊，共8张，牌堆共144张） |
| 流局 | 牌墙摸完未和牌则流局 |
| 杠 | 支持明杠、暗杠、补杠 |

#### 2.2.2 操作流程

```
摸牌 → [玩家操作] → 打牌
                ↓
    其他玩家可选择：吃/碰/杠/和
                ↓
    优先级：和 > 杠 > 碰 > 吃（仅上家）
```

操作超时时间：默认 **20 秒**，超时自动打出摸入的牌（或系统随机打牌）。

#### 2.2.3 花牌规则

花牌共 8 张（春夏秋冬 + 梅兰竹菊），加入后牌堆共 144 张。

**补牌流程**

```
摸牌时抽到花牌
  ↓
自动亮出花牌（所有玩家可见）并记录
  ↓
从牌尾（岭上牌区）自动补摸一张
  ↓
若补摸的仍是花牌，重复上述流程
  ↓
直至摸到非花牌，继续正常回合
```

补牌过程无需玩家手动操作，服务端自动处理并广播花牌展示动画。

**花牌与积分**

- 花牌**不计入**和牌所需的最低 8 番判定
- 和牌时，每张花牌额外计 **1 番**（累加至总番数，参与翻番计分）
- 座花（对应自己座位的花牌，如东家摸到「春」）额外再加 **1 番**
- 花牌番数在结算界面单独一行展示，清晰区分于正式番型

**数据结构扩展**

```typescript
interface PlayerState {
  // ...原有字段...
  flowers: Tile[];       // 已亮出的花牌列表
  flowerBonus: number;   // 本局花牌额外番数（含座花加成）
}
```

#### 2.2.4 操作按钮逻辑

- **打牌**：选中手牌后点击打出，或直接双击手牌
- **吃**：仅可吃上家打出的牌，系统高亮可吃的组合供玩家选择
- **碰**：碰任意玩家打出的牌
- **杠**：明杠（碰后补杠或手中4张）、暗杠（摸牌后手中4张）
- **和**：系统自动检测当前手牌是否可和，并显示最高番数
- **过**：放弃当前可操作权

### 2.3 算番系统

#### 2.3.1 88番番型完整支持

按国标麻将官方规则，实现全部 81 个基础番型的判定：

**88番**
- 大四喜、大三元、九莲宝灯、四暗刻、字一色、绿一色、清幺九

**64番**
- 小四喜、小三元、字一色、四杠、碰碰和

**48番**
- 混幺九、七对、七星不靠、全双刻

**32番**
- 清一色、一色三同顺、一色四步高等

**24番及以下**
- 门前清、平和、一般高、喜相逢等

完整番型列表共81项，涵盖组合型、特殊型、雀头相关等所有分类。

#### 2.3.2 实时算番提示

**摸牌阶段提示**

玩家摸牌后，如手牌可和（含自摸），右侧显示番型面板：

```
┌─────────────────────┐
│  🀄 自摸 · 可和！    │
│                     │
│  最高番数: 32番      │
├─────────────────────┤
│  ✦ 清一色     24番  │
│  ✦ 门前清      2番  │
│  ✦ 平和        2番  │
│  ✦ 自摸        1番  │
│  ✦ 无字        1番  │
│  ✦ 不求人      2番  │
├─────────────────────┤
│  [和牌]   [继续打牌] │
└─────────────────────┘
```

**打牌阶段提示（听牌提示）**

玩家手牌处于听牌状态时，在对应手牌下方显示听牌标记，并可展开查看：
- 听哪些牌
- 和牌后的预估番型与番数

**他家打牌时的操作提示**

其他玩家打牌时，若当前玩家可操作，弹出操作面板并显示：
- 和牌：标注和牌番型（含点炮荣和规则）
- 碰/杠后的番型变化预估

#### 2.3.3 番型说明弹窗

点击任意番型名称，弹出说明卡片：
- 番型名称与番数
- 图示（用牌图展示示例牌型）
- 文字说明与条件

#### 2.3.4 和牌结算界面

和牌后展示结算界面：

```
┌──────────────────────────────────┐
│         🎉 张三 和牌！            │
├──────────────────────────────────┤
│  和牌方式：荣和（李四打出）        │
│  番型明细：                        │
│    清一色              24番        │
│    平和                 2番        │
│    门前清               2番        │
│    无字                 1番        │
│    不求人               2番        │
│  ─────────────────────────────   │
│  花牌加成：                         │
│    🌸 春（座花）         2番        │
│    🌺 菊                 1番        │
│  ─────────────────────────────   │
│  合计：34番 → 按 32番计算          │
│                                    │
│  积分变化：                         │
│  张三   +96分   李四   -32分        │
│  王五   -32分   赵六   -32分        │
├──────────────────────────────────┤
│         [继续下局]                  │
└──────────────────────────────────┘
```

### 2.4 积分系统

#### 2.4.1 计分规则（国标标准）

- 基础分：32分
- 按番数翻番：每番翻一倍（上限为无限翻或设定上限）
- 自摸：所有人支付
- 荣和：点炮者支付全部，其余人不付
- 流局：不计分

#### 2.4.2 局分与场分

- 每场固定进行 **4 圈 × 4 局 = 16 局**，依次经历东风圈、南风圈、西风圈、北风圈
- 每圈内庄家依次轮转，每人坐庄一局（杠开、和牌连庄规则另计）
- 记录每局积分变动，显示全场累计分数排行
- 16 局全部结束后进入最终结算，不可提前终止（房主可发起全员投票解散）

**圈局推进规则**

| 场况 | 下一局处理 |
|------|-----------|
| 庄家和牌或自摸 | 庄家连庄，本圈局数不推进 |
| 闲家和牌 | 庄家轮转至下家，局数 +1 |
| 流局 | 庄家连庄（荒牌连庄），本圈局数不推进 |
| 本圈4局结束 | 进入下一风圈，座位方位随之轮转 |

---

## 3. 技术架构

### 3.1 技术选型

| 层次 | 技术方案 | 理由 |
|------|----------|------|
| 前端框架 | React + TypeScript | 组件化管理复杂 UI，类型安全 |
| 实时通信 | WebSocket (Socket.IO) | 低延迟双向通信，断线重连支持 |
| 后端 | Node.js + Express | 与前端同语言，生态丰富 |
| 游戏状态 | 服务端权威 (Server Authority) | 防止作弊，保证一致性 |
| 持久化 | Redis | 房间状态、会话存储，TTL 支持 |
| 部署 | Docker + Nginx | 容器化，易于扩展 |

### 3.2 系统架构图

```
用户浏览器 (React)
    │
    │ WebSocket / HTTPS
    ▼
Nginx (负载均衡 / SSL 终止)
    │
    ▼
Node.js 游戏服务器
    ├── 房间管理模块
    ├── 游戏逻辑引擎
    ├── 算番模块
    └── WebSocket 事件处理
    │
    ▼
Redis (房间状态 / 会话)
```

### 3.3 前端模块划分

```
src/
├── components/
│   ├── GameBoard/          # 主游戏桌面
│   ├── PlayerHand/         # 玩家手牌区
│   ├── ActionPanel/        # 操作按钮面板
│   ├── FanPanel/           # 算番提示面板
│   ├── DiscardPile/        # 弃牌区
│   ├── Lobby/              # 房间大厅
│   └── Settlement/         # 结算界面
├── hooks/
│   ├── useWebSocket.ts     # WebSocket 连接管理
│   ├── useGameState.ts     # 游戏状态管理
│   └── useTimer.ts         # 操作计时器
├── engine/
│   ├── mahjong.ts          # 牌型基础定义
│   ├── fanCalculator.ts    # 算番引擎
│   ├── winChecker.ts       # 和牌检测
│   └── tenpaiChecker.ts    # 听牌检测
└── store/
    └── gameSlice.ts        # Redux/Zustand 状态
```

### 3.4 后端模块划分

```
server/
├── rooms/
│   ├── RoomManager.ts      # 房间创建/加入/销毁
│   └── Room.ts             # 单个房间状态
├── game/
│   ├── GameEngine.ts       # 游戏主循环
│   ├── Deck.ts             # 牌墙管理
│   ├── TurnManager.ts      # 回合/操作权管理
│   └── ScoreCalculator.ts  # 积分结算
├── fan/
│   ├── FanCalculator.ts    # 88番判定核心算法
│   └── fanRules/           # 各番型规则定义
└── socket/
    └── SocketHandler.ts    # WebSocket 事件路由
```

### 3.5 WebSocket 事件协议

#### 客户端 → 服务端

| 事件名 | 数据 | 说明 |
|--------|------|------|
| `room:create` | `{ nickname }` | 创建房间 |
| `room:join` | `{ roomCode, nickname }` | 加入房间 |
| `room:ready` | — | 玩家准备 |
| `room:start` | — | 房主开始游戏 |
| `game:discard` | `{ tileId }` | 打牌 |
| `game:chi` | `{ tileId, combination }` | 吃牌 |
| `game:pong` | `{ tileId }` | 碰牌 |
| `game:kong` | `{ tileId, type }` | 杠牌 |
| `game:win` | — | 宣告和牌 |
| `game:pass` | — | 放弃操作 |

#### 服务端 → 客户端

| 事件名 | 数据 | 说明 |
|--------|------|------|
| `room:updated` | `RoomState` | 房间状态变更 |
| `game:stateUpdate` | `GameState` | 游戏状态全量推送 |
| `game:drawTile` | `{ tile }` | 摸牌（仅发给本人） |
| `game:action` | `{ player, action, tile }` | 广播他人操作 |
| `game:canAct` | `{ actions }` | 通知玩家可操作项 |
| `game:fanHint` | `{ fans, total }` | 推送算番提示 |
| `game:settled` | `SettlementData` | 结算数据 |
| `game:error` | `{ code, message }` | 错误通知 |

### 3.6 REST HTTP API

HTTP API 仅用于房间预验证和健康检查；游戏核心逻辑全部通过 WebSocket 完成。

**Base URL**: `/api/v1`

#### 3.6.1 房间接口

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/rooms` | 创建新房间 |
| `GET` | `/rooms/:code` | 查询房间元信息（不含手牌） |
| `GET` | `/health` | 服务健康检查 |

**POST /rooms**

请求：
```json
{ "nickname": "张三" }
```

响应 `201 Created`：
```json
{
  "roomCode": "AJ8K2M",
  "shareUrl": "https://mahjong.example.com/room/AJ8K2M",
  "sessionToken": "eyJ...",
  "expiresAt": "2026-05-31T12:30:00Z"
}
```

`sessionToken` 写入 `HttpOnly` Cookie（`mj_session`），同时在响应体中返回供 SPA 首次使用。

**GET /rooms/:code**

响应 `200 OK`：
```json
{
  "roomCode": "AJ8K2M",
  "phase": "waiting",
  "playerCount": 2,
  "maxPlayers": 4,
  "createdAt": "2026-05-31T10:00:00Z"
}
```

错误响应：

| HTTP 状态码 | code | 说明 |
|------------|------|------|
| `404` | `ROOM_NOT_FOUND` | 房间不存在或已过期 |
| `409` | `ROOM_FULL` | 房间已满 |
| `400` | `GAME_IN_PROGRESS` | 游戏已开始，拒绝新玩家 |

**GET /health**

响应 `200 OK`：
```json
{
  "status": "ok",
  "redis": "ok",
  "uptime": 3612,
  "activeRooms": 5,
  "activePlayers": 14
}
```

#### 3.6.2 认证模型

- 玩家身份通过 `mj_session`（`HttpOnly; SameSite=Strict`）Cookie 标识
- 每个 Session 对应 Redis 中一条记录，TTL 为 2 小时（游戏结束后延长至 10 分钟供结算查看）
- WebSocket 握手时携带同一 Cookie，服务端通过中间件解析并挂载 `socket.data.playerId`
- Session 数据结构：

```typescript
interface SessionData {
  playerId: string;      // uuid v4
  nickname: string;
  roomCode: string | null;
  lastSeen: number;      // Unix ms
}
```

### 3.7 WebSocket 协议详细规范

#### 3.7.1 连接与握手

```
客户端连接 URL: wss://mahjong.example.com/socket.io/?roomCode=AJ8K2M
```

握手成功后服务端立即推送：

```json
{
  "event": "session:init",
  "data": {
    "playerId": "uuid",
    "roomCode": "AJ8K2M",
    "reconnected": false
  }
}
```

若为断线重连（`reconnected: true`），服务端随后推送完整 `game:stateUpdate`。

#### 3.7.2 消息格式规范

所有 WebSocket 消息遵循统一信封格式：

**客户端 → 服务端**
```typescript
interface ClientMessage<T> {
  seq: number;        // 单调递增序列号，用于防重放
  event: string;
  data: T;
}
```

**服务端 → 客户端**
```typescript
interface ServerMessage<T> {
  event: string;
  data: T;
  ts: number;         // 服务端时间戳 Unix ms
  ackSeq?: number;    // 对应客户端 seq（操作确认时）
}
```

#### 3.7.3 客户端 → 服务端事件详细定义

```typescript
// 创建房间
interface RoomCreatePayload {
  nickname: string;                   // 1-8个字符
}

// 加入房间
interface RoomJoinPayload {
  roomCode: string;                   // 6位大写字母数字
  nickname: string;
}

// 打牌
interface GameDiscardPayload {
  tileId: string;                     // 如 "m1", "b9", "z1"（东）
  seq: number;                        // actionSequence，防重放
}

// 吃牌
interface GameChiPayload {
  tileId: string;                     // 被吃的牌
  combination: [string, string];      // 手牌中配合的两张牌 id
  seq: number;
}

// 碰牌
interface GamePongPayload {
  tileId: string;
  seq: number;
}

// 杠牌
interface GameKongPayload {
  tileId: string;
  type: 'open'    // 明杠：碰后补杠
      | 'closed'  // 暗杠：手中4张
      | 'added';  // 加杠：已碰后补第4张
  seq: number;
}

// 宣告和牌
interface GameWinPayload {
  seq: number;
}

// 放弃操作
interface GamePassPayload {
  seq: number;
}
```

#### 3.7.4 服务端 → 客户端事件详细定义

```typescript
// 摸牌（仅发送给当前回合玩家）
interface DrawTileData {
  tile: Tile;
  isFlower: boolean;               // 是否为花牌
  flowerChain: Tile[];             // 连续摸到的花牌序列（含本张）
  replacementFrom: 'wall' | 'deadWall';
  wallRemaining: number;
  canWin: boolean;                 // 摸牌后是否可和
  fanHint?: FanHintData;           // 可和时附带番型预览
}

// 通知可操作项
interface CanActData {
  actions: Array<{
    type: 'chi' | 'pong' | 'kong' | 'win' | 'pass';
    options?: ChiOption[];         // type=chi 时列出所有可吃组合
    fanHint?: FanHintData;         // type=win 时附带番型
  }>;
  timeoutAt: number;               // 操作截止时间戳 Unix ms
}

interface ChiOption {
  combination: [string, string];   // 手牌中的两张牌 id
  display: string;                 // 如 "2万-3万"
}

// 算番提示
interface FanHintData {
  fans: Array<{
    name: string;                  // 番型名，如 "清一色"
    score: number;                 // 番数
    tiles?: string[];              // 构成该番型的牌（可选，用于高亮）
  }>;
  flowerBonus: Array<{
    tile: Tile;
    bonus: number;                 // 1 或 2（座花）
  }>;
  subtotal: number;                // 番型小计（不含花牌）
  flowerTotal: number;             // 花牌加成合计
  total: number;                   // 最终总番数
  winType: 'self' | 'discard';
}

// 广播他人操作
interface ActionBroadcastData {
  playerId: string;
  action: 'discard' | 'chi' | 'pong' | 'kong' | 'win' | 'pass' | 'draw';
  tile?: Tile;
  meld?: Meld;                     // 吃/碰/杠后展示的面子
  flowerRevealed?: Tile[];         // 亮出的花牌
}

// 结算数据
interface SettlementData {
  winner: string | null;           // null 表示流局
  winType: 'self' | 'discard' | 'draw' | null;
  payer?: string;                  // 荣和时的点炮者
  fanDetail: FanHintData;
  scores: Record<string, {
    before: number;
    delta: number;
    after: number;
  }>;
  hands: Record<string, Tile[]>;   // 流局时亮牌
  isTenpai: Record<string, boolean>;
  nextRound: {
    wind: 'east' | 'south' | 'west' | 'north';
    roundIndex: number;
    totalRound: number;
    dealer: string;
  } | null;                        // null 表示全场结束
}
```

#### 3.7.5 错误事件

```typescript
interface GameErrorData {
  code: ErrorCode;
  message: string;
  seq?: number;                    // 引发错误的客户端 seq
}

enum ErrorCode {
  INVALID_ACTION     = 'INVALID_ACTION',      // 操作不合法
  NOT_YOUR_TURN      = 'NOT_YOUR_TURN',       // 非当前操作权
  TIMEOUT            = 'TIMEOUT',             // 操作已超时
  INVALID_TILE       = 'INVALID_TILE',        // 牌 id 不存在于手牌
  SEQ_REPLAY         = 'SEQ_REPLAY',          // 序列号重放
  ROOM_CLOSED        = 'ROOM_CLOSED',         // 房间已关闭
  INSUFFICIENT_FAN   = 'INSUFFICIENT_FAN',    // 番数不足8番
}
```

### 3.8 游戏状态数据结构

```typescript
interface GameState {
  phase: 'waiting' | 'playing' | 'settled';
  round: {
    wind: 'east' | 'south' | 'west' | 'north';  // 当前圈风
    roundIndex: number;   // 当前圈内第几局（1-4）
    totalRound: number;   // 全场总局数（1-16）
  };
  dealer: PlayerId;
  currentTurn: PlayerId;
  wall: {
    remaining: number;  // 剩余牌数（不暴露具体牌）
    deadWall: number;   // 岭上牌数（用于花牌补牌）
  };
  players: Record<PlayerId, PlayerState>;
  lastDiscard: { playerId: PlayerId; tile: Tile } | null;
  pendingActions: PendingAction[];  // 当前等待中的操作
}

interface PlayerState {
  id: PlayerId;
  nickname: string;
  position: 'east' | 'south' | 'west' | 'north';
  hand: Tile[];          // 仅对本人可见，他人为空数组
  handCount: number;     // 他人手牌数量
  melds: Meld[];         // 副露（公开）
  discards: Tile[];      // 弃牌
  flowers: Tile[];       // 已亮出的花牌列表
  flowerBonus: number;   // 本局花牌额外番数（含座花加成）
  score: number;
  isDealer: boolean;
  isAI: boolean;         // 是否为断线 AI 接管状态
  isTenpai: boolean;     // 仅结算时公开
  isConnected: boolean;
  disconnectedAt?: number; // 断线时间戳 Unix ms
}

// 牌的基础类型
interface Tile {
  id: string;            // 唯一实例 id，如 "m1_0"（第0张1万）
  suit: 'man' | 'pin' | 'sou' | 'wind' | 'dragon' | 'flower';
  value: number;         // man/pin/sou: 1-9; wind: 1-4(东南西北); dragon: 1-3(中发白); flower: 1-8
}

// 副露（公开的面子）
interface Meld {
  type: 'chi' | 'pong' | 'kong_open' | 'kong_closed' | 'kong_added';
  tiles: Tile[];
  claimedFrom?: 'left' | 'right' | 'opposite'; // 从哪家拿的（暗杠无此字段）
}

// 等待中的操作
interface PendingAction {
  playerId: string;
  availableActions: Array<'chi' | 'pong' | 'kong' | 'win' | 'pass'>;
  deadline: number;      // 操作截止时间戳
}
```

---

## 4. UI/UX 设计

### 4.1 整体布局

```
┌─────────────────────────────────────────────────────┐
│  北家（对面玩家）                          [聊天/设置] │
│  [手牌背面 × 13]        弃牌区                        │
├───────────┬─────────────────────────┬───────────────┤
│ 西家       │                         │  东家          │
│ (左侧玩家) │     牌 桌 中 心          │  (右侧玩家)    │
│ 手牌背面   │  ┌──────────────┐        │  手牌背面      │
│            │  │  剩余: 72张   │       │               │
│ 弃牌区     │  │  东风圈·第1局  │       │  弃牌区        │
│            │  │  全场第1/16局 │       │               │
├───────────┴─────────────────────────┴───────────────┤
│  [我的手牌 - 13张，可点击选择]                          │
│  [副露区]                    [算番面板]                 │
│  [过] [吃] [碰] [杠] [和]    [操作计时器]              │
└─────────────────────────────────────────────────────┘
```

### 4.2 牌面设计

- 使用 SVG 渲染麻将牌，支持清晰缩放
- 手牌支持：正常、选中（高亮）、可打（微亮）、灰化（不可选）状态
- 摸入的牌有轻微动画（从牌堆滑入手牌区）

### 4.3 算番面板交互

- 默认收起，听牌/可和时自动展开
- 鼠标悬停番型条目：展示该番型的牌图示例
- 点击「？」图标：展开番型详情弹窗

### 4.4 响应式支持

| 设备 | 支持程度 | 说明 |
|------|----------|------|
| 桌面（≥1200px） | 完整支持 | 最佳游戏体验 |
| 平板（768-1199px） | 支持 | 布局自适应 |
| 手机（<768px） | 基础支持 | 竖屏优化，手牌横向滚动 |

### 4.5 视觉风格

- **主题**：深绿色桌面（传统麻将桌色调），金色装饰
- **字体**：正文使用 Noto Sans SC，番型高亮使用书法风格字体
- **动效**：牌的发送/打出/副露有流畅动画（≤300ms）
- **音效**（可选）：摸牌声、打牌声、碰/杠/和牌提示音

---

## 5. 算番引擎设计

### 5.1 算番流程

```
输入：手牌（含副露） + 和牌方式 + 场况信息
  ↓
穷举和牌分解（基本牌型 + 特殊牌型）
  ↓
对每种分解方式：逐一检测81个番型
  ↓
去除不可复合番型（互斥关系处理）
  ↓
选取番数最高的分解方式
  ↓
输出：番型列表 + 总番数
```

### 5.2 和牌分解算法

国标麻将和牌分解分为两大类：

**标准型**（4组面子 + 1对将）

使用递归分解：
1. 从手牌中逐一尝试抽取顺子（连续三张）、刻子（相同三张）
2. 最后剩余两张作为将
3. 记录所有有效分解方案

**特殊型**
- 七对：手牌恰好7对
- 全不靠：每种花色各取1-9中不连续的3张，加7张字牌
- 组合龙（1-2-3 4-5-6 7-8-9 跨三种花色）

### 5.3 番型互斥规则

部分番型不可同时计算，例如：
- 「清一色」包含「无字」，不重复计算
- 「碰碰和」与「平和」互斥
- 「大四喜」已包含「小四喜」、「圈风刻」、「门风刻」等

需维护一张互斥/包含关系表，在汇总番型时过滤。

### 5.4 性能考量

- 算番在 **服务端**执行，防止客户端作弊
- 客户端仅做**预览计算**（听牌提示用），使用 Web Worker 避免阻塞 UI
- 单次算番目标时延：< 10ms（服务端），< 50ms（客户端 Web Worker）

---

## 6. 防作弊设计

| 风险 | 防护措施 |
|------|----------|
| 查看他人手牌 | 服务端仅向本人下发手牌数据 |
| 伪造操作 | 服务端校验操作合法性后才更新状态 |
| 重放攻击 | 每次操作携带 `actionSequence` 序列号 |
| 房间冒入 | 加入时校验 Session，房间码不可猜测（UUID片段） |
| 操作超时作弊 | 服务端计时器权威，客户端倒计时仅供显示 |

---

## 7. 错误处理与边界情况

### 7.1 断线处理

- 玩家断线后保留座位 **60 秒**
- 断线期间由服务端自动操作（超时自动打牌/过牌）
- 重连后同步最新游戏状态
- 若玩家 60 秒内未重连，AI 自动接管该座位直至玩家重连或全场结束；其他玩家会看到该座位标记为「[AI]」
- **AI 策略**：随机打牌（从手牌中随机选一张打出）；面对他人打牌，不执行吃/碰/杠，仅在可自摸时和牌

### 7.2 边界情况

| 情况 | 处理方式 |
|------|----------|
| 海底摸月 | 最后一张牌自摸和，额外计番 |
| 杠上开花 | 杠后摸牌和牌，额外计番 |
| 抢杠和 | 他人补杠时可抢和（除非暗杠） |
| 一炮多响 | 最高番者得分，按国标规则处理 |
| 流局 | 所有玩家亮牌，计算听牌奖罚（可选） |
| 连续摸花 | 连续从牌尾补摸，每张花牌均自动亮出，直到摸到正常牌 |
| 杠后补花 | 杠后补摸若得花牌，继续从牌尾补摸，杠上开花的判定以最终补到的非花牌为准 |

---

## 8. 开发里程碑

### Phase 1 — 基础框架（第 1-2 周）

- [ ] 项目脚手架（前后端）
- [ ] WebSocket 连接管理
- [ ] 房间创建/加入/大厅功能
- [ ] 基础牌面 UI 渲染

### Phase 2 — 游戏核心（第 3-5 周）

- [ ] 完整游戏流程（发牌→摸牌→打牌→循环）
- [ ] 花牌自动补牌逻辑（从牌尾补摸，连续补花处理）
- [ ] 吃/碰/明杠/暗杠逻辑
- [ ] 和牌检测（标准型 + 七对）
- [ ] 操作超时处理与 AI 随机接管
- [ ] 4圈16局推进逻辑（庄家轮转、连庄判定）
- [ ] 积分结算（含花牌番数）

### Phase 3 — 算番系统（第 6-7 周）

- [ ] 88番判定引擎（全部81个番型）
- [ ] 互斥关系处理
- [ ] 实时算番提示 UI
- [ ] 听牌提示
- [ ] 番型说明弹窗

### Phase 4 — 完善与测试（第 8-9 周）

- [ ] 断线重连
- [ ] 全流程 E2E 测试
- [ ] 番型判定单元测试（覆盖所有番型）
- [ ] 性能测试（并发房间数）
- [ ] 移动端适配

### Phase 5 — 上线准备（第 10 周）

- [ ] Docker 化部署
- [ ] 域名 / SSL 配置
- [ ] 监控与日志
- [ ] 内测邀请

---

## 9. 设计决策记录（Resolved Decisions）

以下问题已确认，不再作为 Open Questions：

| 问题 | 决策 |
|------|------|
| 花牌 | **支持**。使用全部8张花牌（144张牌堆），遇花自动从牌尾补摸；花牌不计入最低8番门槛，但和牌时每张额外计1番（座花再加1番） |
| AI 接管 | **随机打牌**。断线60秒后AI接管，随机选牌打出，不主动吃/碰/杠，可自摸时和牌 |
| 观战模式 | **不支持**。房间严格限制4人，第5人无法进入，不设观战席 |
| 牌谱回放 | **不支持**。v1不做录制与回放功能 |
| 局数 | **固定4圈16局**（东南西北风圈各一圈，每圈4局），不可自定义 |
| 账号系统 | **免注册**。通过浏览器Session识别玩家，关闭浏览器后Session失效 |

---

## 10. 核心实现细节

### 10.1 牌墙初始化

```typescript
// server/game/Deck.ts
class Deck {
  private tiles: Tile[] = [];
  private deadWallStart: number; // 牌尾开始索引（花牌补牌区）

  constructor(includeFlowers = true) {
    // 生成万/条/饼各 1-9，每种 4 张 = 108 张
    for (const suit of ['man', 'pin', 'sou'] as const) {
      for (let v = 1; v <= 9; v++) {
        for (let i = 0; i < 4; i++) {
          this.tiles.push({ id: `${suit[0]}${v}_${i}`, suit, value: v });
        }
      }
    }
    // 风牌 4 种各 4 张 = 16 张
    for (let v = 1; v <= 4; v++) {
      for (let i = 0; i < 4; i++) {
        this.tiles.push({ id: `z${v}_${i}`, suit: 'wind', value: v });
      }
    }
    // 箭牌 3 种各 4 张 = 12 张
    for (let v = 5; v <= 7; v++) {
      for (let i = 0; i < 4; i++) {
        this.tiles.push({ id: `z${v}_${i}`, suit: 'dragon', value: v - 4 });
      }
    }
    // 花牌 8 张
    if (includeFlowers) {
      for (let v = 1; v <= 8; v++) {
        this.tiles.push({ id: `f${v}_0`, suit: 'flower', value: v });
      }
    }

    this.shuffle();
    // 牌尾 14 张作为岭上牌（花牌补牌区）
    this.deadWallStart = this.tiles.length - 14;
  }

  // Fisher-Yates 洗牌
  private shuffle(): void {
    for (let i = this.tiles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.tiles[i], this.tiles[j]] = [this.tiles[j], this.tiles[i]];
    }
  }

  draw(): Tile | null {
    if (this.deadWallStart <= 0) return null; // 牌墙摸完
    return this.tiles.shift()!;
  }

  drawFromDeadWall(): Tile | null {
    if (this.deadWallStart >= this.tiles.length) return null;
    return this.tiles.pop()!;
  }

  get remaining(): number { return this.deadWallStart; }
  get deadWallCount(): number { return this.tiles.length - this.deadWallStart; }
}
```

### 10.2 游戏主状态机

GameEngine 以有限状态机驱动，避免并发操作冲突：

```
                ┌─────────────────────────────────────────┐
                │              游戏状态机                    │
                └─────────────────────────────────────────┘

  WAITING ──start──► DEALING ──dealt──► PLAYER_TURN
                                            │
                        ┌───────────────────┴───────────────────┐
                        │                                       │
                    自己摸牌                               等待他人打牌后操作
                        │                                       │
                  SELF_DRAW_PHASE                    RESPONSE_PHASE
                  (可打/和/杠)                      (可吃/碰/杠/和/过)
                        │                                       │
                    打出牌                            所有人pass或超时
                        │                                       │
                  DISCARD_BROADCAST ◄────────────────────────────┘
                        │
              ┌─────────┴─────────┐
           有人响应            无人响应
              │                  │
        RESPONSE_PHASE    下家 PLAYER_TURN
              │
    ┌─────────┴──────────┐
  和牌/杠             吃/碰
    │                   │
SETTLEMENT        PLAYER_TURN（操作者）
```

关键实现：所有状态转换在服务端串行执行，使用 Redis 分布式锁（`SET roomCode:lock NX PX 5000`）防止并发竞态。

### 10.3 操作优先级与响应收集

```typescript
// server/game/TurnManager.ts
class TurnManager {
  private pendingResponses: Map<string, PendingAction> = new Map();
  private timer: NodeJS.Timeout | null = null;
  private readonly TIMEOUT_MS = 20_000;

  // 广播打牌后，通知所有有权操作的玩家
  async broadcastDiscard(discardedTile: Tile, discarderId: string): Promise<void> {
    const eligible = this.getEligiblePlayers(discardedTile, discarderId);
    
    for (const [playerId, actions] of eligible) {
      this.pendingResponses.set(playerId, { actions, responded: false });
      this.emit(playerId, 'game:canAct', {
        actions,
        timeoutAt: Date.now() + this.TIMEOUT_MS,
      });
    }

    // 倒计时结束后自动 pass 所有未响应玩家
    this.timer = setTimeout(() => this.resolveResponses(), this.TIMEOUT_MS);
  }

  async receiveResponse(playerId: string, action: ActionType, payload: unknown): Promise<void> {
    const pending = this.pendingResponses.get(playerId);
    if (!pending || pending.responded) {
      throw new GameError(ErrorCode.INVALID_ACTION);
    }

    pending.responded = true;
    pending.chosenAction = action;
    pending.payload = payload;

    // 若有人宣告和牌，立即结算（最高优先级）
    if (action === 'win') {
      clearTimeout(this.timer!);
      await this.resolveResponses();
    } else if (this.allResponded()) {
      clearTimeout(this.timer!);
      await this.resolveResponses();
    }
  }

  private resolveResponses(): void {
    // 优先级：win > kong > pong > chi > pass
    // 若多人同时 win，按"一炮多响"规则：取番数最高者
    const winner = this.findHighestFanWinner();
    if (winner) { /* 进入结算 */ return; }

    const kongPlayer = this.findAction('kong');
    if (kongPlayer) { /* 执行杠 */ return; }

    const pongPlayer = this.findAction('pong');
    if (pongPlayer) { /* 执行碰 */ return; }

    const chiPlayer = this.findAction('chi');
    if (chiPlayer) { /* 执行吃（仅上家） */ return; }

    // 所有人 pass，轮到下家摸牌
    this.advanceTurn();
  }
}
```

### 10.4 算番引擎核心

```typescript
// server/fan/FanCalculator.ts

interface WinContext {
  hand: Tile[];          // 手牌（不含副露）
  melds: Meld[];         // 副露
  winTile: Tile;         // 和牌张
  winType: 'self' | 'discard';
  roundWind: 1 | 2 | 3 | 4;   // 圈风
  seatWind: 1 | 2 | 3 | 4;    // 门风
  isLastTile: boolean;         // 海底/河底
  isAfterKong: boolean;        // 杠上开花
  isRobbingKong: boolean;      // 抢杠
  flowers: Tile[];             // 花牌
}

function calculateFan(ctx: WinContext): FanResult {
  // 1. 枚举所有和牌分解方案
  const decompositions = decomposeWinningHand(ctx.hand, ctx.melds, ctx.winTile);
  
  let bestResult: FanResult = { fans: [], total: 0, flowerBonus: [] };

  for (const decomp of decompositions) {
    // 2. 对每种分解逐一检测81个番型
    const rawFans = ALL_FAN_RULES.flatMap(rule => rule.check(decomp, ctx));

    // 3. 去除互斥番型（保留高番，移除其隐含的低番）
    const filteredFans = applyExclusionRules(rawFans);

    // 4. 计算花牌加成
    const flowerBonus = calculateFlowerBonus(ctx.flowers, ctx.seatWind);

    const total = filteredFans.reduce((s, f) => s + f.score, 0)
                + flowerBonus.reduce((s, f) => s + f.bonus, 0);

    if (total > bestResult.total) {
      bestResult = { fans: filteredFans, flowerBonus, total };
    }
  }

  // 5. 番数不足8番，本番型组合无效（但和牌检测应在此前已拦截）
  return bestResult;
}

// 递归枚举和牌分解（标准型：4面子+1将）
function decomposeWinningHand(
  hand: Tile[],
  melds: Meld[],
  winTile: Tile
): Decomposition[] {
  const fullHand = [...hand, winTile];
  const results: Decomposition[] = [];

  // 尝试七对
  if (isSevenPairs(fullHand)) {
    results.push({ type: 'seven-pairs', groups: buildSevenPairGroups(fullHand), pair: null });
  }

  // 尝试全不靠
  if (isThirteenOrphans(fullHand)) {
    results.push({ type: 'orphans', groups: [], pair: null });
  }

  // 尝试标准型（递归）
  const standardDecomps = findStandardDecompositions(fullHand, melds);
  results.push(...standardDecomps);

  return results;
}
```

### 10.5 Redis 数据模型

所有数据以 JSON 字符串存储，TTL 随游戏阶段动态调整。

```
# 房间元数据
KEY  room:{code}:meta
TTL  waiting=1800s / playing=7200s / settled=600s
VAL  { code, phase, playerIds[], createdAt, settings }

# 游戏完整状态（含牌墙，仅服务端读写）
KEY  room:{code}:gamestate
TTL  7200s
VAL  GameState（含完整牌墙，不对外暴露）

# 玩家 Session
KEY  session:{sessionToken}
TTL  7200s
VAL  SessionData

# 分布式操作锁
KEY  room:{code}:lock
TTL  5s（NX 获取，操作完成后 DEL）

# 操作序列号防重放
KEY  room:{code}:seq:{playerId}
TTL  7200s
VAL  最后处理的 seq 号（number）
```

### 10.6 前端状态管理

使用 **Zustand** 管理游戏状态，WebSocket 事件直接调用 store action：

```typescript
// src/store/gameSlice.ts
interface GameStore {
  gameState: GameState | null;
  myPlayerId: string | null;
  pendingAction: CanActData | null;
  fanHint: FanHintData | null;
  
  // Actions（由 WebSocket hook 调用）
  applyStateUpdate: (state: GameState) => void;
  applyDrawTile: (data: DrawTileData) => void;
  applyActionBroadcast: (data: ActionBroadcastData) => void;
  setCanAct: (data: CanActData | null) => void;
  setFanHint: (data: FanHintData | null) => void;
  applySettlement: (data: SettlementData) => void;
  reset: () => void;
}

// src/hooks/useWebSocket.ts
function useWebSocket(roomCode: string) {
  const store = useGameStore();

  useEffect(() => {
    const socket = io({ path: '/socket.io', auth: { roomCode } });

    socket.on('game:stateUpdate',   store.applyStateUpdate);
    socket.on('game:drawTile',      store.applyDrawTile);
    socket.on('game:action',        store.applyActionBroadcast);
    socket.on('game:canAct',        store.setCanAct);
    socket.on('game:fanHint',       store.setFanHint);
    socket.on('game:settled',       store.applySettlement);

    // 客户端发送操作（自动附加 seq）
    let seq = 0;
    const send = (event: string, data?: object) =>
      socket.emit(event, { ...data, seq: ++seq });

    return () => { socket.disconnect(); };
  }, [roomCode]);
}
```

---

## 11. 部署指南

### 11.1 目录结构

```
mahjong/
├── client/                  # React 前端（Vite 构建）
│   ├── src/
│   ├── dist/                # 构建产物（不提交）
│   └── Dockerfile
├── server/                  # Node.js 后端
│   ├── src/
│   └── Dockerfile
├── nginx/
│   ├── nginx.conf           # 主配置
│   └── ssl/                 # 证书目录（不提交，挂载）
├── docker-compose.yml
├── docker-compose.prod.yml
└── .env.example
```

### 11.2 环境变量

**.env.example**（各环境复制为 `.env`）

```bash
# 服务端口
PORT=3001

# Redis
REDIS_URL=redis://redis:6379
REDIS_PASSWORD=

# Session
SESSION_SECRET=change-this-to-a-random-64-char-string
SESSION_TTL_SECONDS=7200
COOKIE_DOMAIN=mahjong.example.com

# 游戏配置
ROOM_IDLE_TIMEOUT_SECONDS=1800   # 无人操作后房间关闭
DISCONNECT_GRACE_SECONDS=60      # 断线保留时间
ACTION_TIMEOUT_SECONDS=20        # 操作超时

# 前端（构建时注入）
VITE_WS_URL=wss://mahjong.example.com
VITE_API_BASE=/api/v1

# 监控（可选）
SENTRY_DSN=
LOG_LEVEL=info                   # debug | info | warn | error
```

### 11.3 Docker 配置

**client/Dockerfile**

```dockerfile
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_WS_URL
ARG VITE_API_BASE
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx-client.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

**server/Dockerfile**

```dockerfile
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build          # tsc 编译到 dist/

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/dist ./dist
COPY package*.json ./
RUN npm ci --omit=dev
EXPOSE 3001
CMD ["node", "dist/index.js"]
```

**docker-compose.yml**（本地开发）

```yaml
version: '3.9'

services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    command: redis-server --save 60 1 --loglevel warning

  server:
    build: ./server
    ports:
      - "3001:3001"
    environment:
      - REDIS_URL=redis://redis:6379
      - SESSION_SECRET=${SESSION_SECRET}
      - NODE_ENV=development
    depends_on:
      - redis
    volumes:
      - ./server/src:/app/src   # 开发热重载
    command: npm run dev

  client:
    build:
      context: ./client
      args:
        VITE_WS_URL: ws://localhost:3001
        VITE_API_BASE: /api/v1
    ports:
      - "5173:80"
    depends_on:
      - server

volumes:
  redis_data:
```

**docker-compose.prod.yml**（生产覆盖）

```yaml
version: '3.9'

services:
  nginx:
    image: nginx:1.27-alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/ssl:/etc/nginx/ssl:ro
      - client_dist:/usr/share/nginx/html:ro
    depends_on:
      - server

  server:
    restart: always
    deploy:
      replicas: 2               # 水平扩展时需 Redis Pub/Sub 同步（见 11.6）
    environment:
      - NODE_ENV=production
    command: node dist/index.js
    # 开发热重载 volumes 不继承
    volumes: []

  redis:
    restart: always
    command: >
      redis-server
        --requirepass ${REDIS_PASSWORD}
        --save 60 1
        --maxmemory 512mb
        --maxmemory-policy allkeys-lru

volumes:
  client_dist:
```

生产启动命令：

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

### 11.4 Nginx 配置

```nginx
# nginx/nginx.conf
worker_processes auto;

events { worker_connections 4096; }

http {
  # WebSocket 连接升级映射
  map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
  }

  upstream game_server {
    # ip_hash 保证同一玩家路由到同一 server 实例（单机部署可去掉）
    ip_hash;
    server server:3001;
    # 多实例时继续添加：
    # server server2:3001;
  }

  server {
    listen 80;
    server_name mahjong.example.com;
    return 301 https://$host$request_uri;
  }

  server {
    listen 443 ssl http2;
    server_name mahjong.example.com;

    ssl_certificate     /etc/nginx/ssl/fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;

    # 前端静态资源
    root /usr/share/nginx/html;
    index index.html;

    location / {
      try_files $uri $uri/ /index.html;  # SPA fallback
      expires 1h;
      add_header Cache-Control "public, must-revalidate";
    }

    # JS/CSS 强缓存（Vite 带 hash 文件名）
    location /assets/ {
      expires 1y;
      add_header Cache-Control "public, immutable";
    }

    # REST API 代理
    location /api/ {
      proxy_pass         http://game_server;
      proxy_set_header   Host $host;
      proxy_set_header   X-Real-IP $remote_addr;
      proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header   X-Forwarded-Proto $scheme;
      proxy_read_timeout 10s;
    }

    # WebSocket 代理（Socket.IO）
    location /socket.io/ {
      proxy_pass             http://game_server;
      proxy_http_version     1.1;
      proxy_set_header       Upgrade $http_upgrade;
      proxy_set_header       Connection $connection_upgrade;
      proxy_set_header       Host $host;
      proxy_set_header       X-Real-IP $remote_addr;
      proxy_read_timeout     86400s;  # 长连接不超时
      proxy_send_timeout     86400s;
    }
  }
}
```

### 11.5 SSL 证书（Let's Encrypt）

```bash
# 首次申请
docker run --rm -v ./nginx/ssl:/etc/letsencrypt certbot/certbot \
  certonly --standalone \
  -d mahjong.example.com \
  --email admin@example.com \
  --agree-tos --no-eff-email

# 证书续签（加入 crontab，每月执行一次）
0 3 1 * * docker run --rm \
  -v ./nginx/ssl:/etc/letsencrypt \
  certbot/certbot renew --quiet && \
  docker compose exec nginx nginx -s reload
```

### 11.6 水平扩展（多 Server 实例）

单机 2 实例时，Nginx `ip_hash` 保证同一玩家路由到同一节点。若需真正的水平扩展：

1. 启用 Socket.IO Redis Adapter，让多实例共享 WebSocket 房间广播：

```typescript
// server/src/socket/index.ts
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';

const pubClient = createClient({ url: process.env.REDIS_URL });
const subClient = pubClient.duplicate();
await Promise.all([pubClient.connect(), subClient.connect()]);

io.adapter(createAdapter(pubClient, subClient));
```

2. Nginx upstream 改为 `least_conn`（去掉 `ip_hash`，由 Redis Adapter 统一状态）。

### 11.7 CI/CD 流水线

使用 GitHub Actions：

```yaml
# .github/workflows/deploy.yml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      redis:
        image: redis:7-alpine
        ports: ["6379:6379"]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22' }
      - run: npm ci
        working-directory: server
      - run: npm test          # 单元测试（含番型判定）
        working-directory: server
      - run: npm run type-check
        working-directory: client

  deploy:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Build & Push Docker Images
        run: |
          docker buildx build \
            --build-arg VITE_WS_URL=${{ secrets.PROD_WS_URL }} \
            --build-arg VITE_API_BASE=/api/v1 \
            -t ghcr.io/${{ github.repository }}/client:${{ github.sha }} \
            --push ./client
          docker buildx build \
            -t ghcr.io/${{ github.repository }}/server:${{ github.sha }} \
            --push ./server

      - name: Deploy via SSH
        uses: appleboy/ssh-action@v1
        with:
          host:     ${{ secrets.SERVER_HOST }}
          username: ${{ secrets.SERVER_USER }}
          key:      ${{ secrets.SERVER_SSH_KEY }}
          script: |
            cd /opt/mahjong
            export IMAGE_TAG=${{ github.sha }}
            docker compose -f docker-compose.yml -f docker-compose.prod.yml pull
            docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --no-build
            docker system prune -f
```

### 11.8 监控与日志

**日志结构化（Pino）**

```typescript
// server/src/logger.ts
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  formatters: {
    level: (label) => ({ level: label }),
  },
});

// 使用示例
logger.info({ roomCode, playerId, action: 'discard', tile }, 'player action');
logger.warn({ roomCode, err }, 'action timeout, auto-passing');
```

**Prometheus 指标暴露**（`/metrics`，供 Prometheus 抓取）

```typescript
// server/src/metrics.ts
import { register, Gauge, Counter, Histogram } from 'prom-client';

export const activeRooms    = new Gauge({ name: 'mj_active_rooms', help: '活跃房间数' });
export const activePlayers  = new Gauge({ name: 'mj_active_players', help: '在线玩家数' });
export const gamesCompleted = new Counter({ name: 'mj_games_completed_total', help: '完成对局数' });
export const fanCalcDuration = new Histogram({
  name: 'mj_fan_calc_duration_ms',
  help: '算番耗时（毫秒）',
  buckets: [1, 5, 10, 25, 50],
});
```

**推荐监控栈**

```
Prometheus ──抓取──► Node.js /metrics
                         │
                    Grafana Dashboard
                    - 活跃房间/玩家趋势
                    - 算番耗时 P99
                    - WebSocket 连接数
                    - Redis 内存用量

日志链路: Pino → stdout → Docker log driver → Loki → Grafana Logs
```

**健康检查配置**（Docker Compose）

```yaml
server:
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:3001/api/v1/health"]
    interval: 30s
    timeout: 5s
    retries: 3
    start_period: 10s
```

### 11.9 首次上线检查清单

```
基础设施
  [ ] 服务器（推荐 2 核 2GB，Ubuntu 24.04）
  [ ] 域名 DNS A 记录指向服务器 IP
  [ ] 防火墙开放 22/80/443 端口
  [ ] SSL 证书申请成功

配置
  [ ] .env 中 SESSION_SECRET 已替换为随机字符串（openssl rand -hex 32）
  [ ] REDIS_PASSWORD 已设置
  [ ] COOKIE_DOMAIN 与实际域名一致

部署验证
  [ ] docker compose ps 所有服务 healthy
  [ ] GET /api/v1/health 返回 {"status":"ok"}
  [ ] 能创建房间并收到房间码
  [ ] 四个浏览器标签页可正常完成一局（含和牌结算）
  [ ] 断线重连测试（关闭标签页后重新打开链接）
  [ ] 移动端浏览器基础功能可用

监控
  [ ] Prometheus 能抓取到 /metrics 指标
  [ ] 日志在 Grafana Loki 中可查询
  [ ] 配置告警：activeRooms 超阈值、服务 down
```

---

## 12. 参考资料

- 《中国国家体育总局麻将竞赛规则》（2002年版）
- 国标麻将88番完整番型表
- WebSocket 游戏设计模式：《Multiplayer Game Programming》
- Socket.IO 文档：https://socket.io/docs/
- Socket.IO Redis Adapter：https://socket.io/docs/v4/redis-adapter/
- Pino 日志库：https://github.com/pinojs/pino
- Prometheus Node.js 客户端：https://github.com/siimon/prom-client
