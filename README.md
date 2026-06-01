# 国标麻将 · Guobiao Mahjong

四人实时对战网页麻将，完整实现《国家体育总局麻将竞赛规则》（88番，81个番型判定）。

## 快速开始（开发）

```bash
# 安装依赖
cd server && npm install && cd ..
cd client && npm install && cd ..

# 启动 Redis（需要 Docker）
docker run -d -p 6379:6379 redis:7-alpine

# 启动服务端（dev 模式，热重载）
cd server && cp ../.env.example .env && npm run dev

# 另一个终端，启动客户端
cd client && npm run dev
```

访问 http://localhost:5173，开始游戏。

## Docker Compose 一键启动

```bash
cp .env.example .env
docker compose up --build
```

访问 http://localhost:5173。

## 技术栈

| 层次 | 方案 |
|------|------|
| 前端 | React 18 + TypeScript + Vite + Zustand |
| 实时通信 | Socket.IO 4 |
| 后端 | Node.js 22 + Express + TypeScript |
| 持久化 | Redis 7 |
| 部署 | Docker + Nginx |

## 功能

- 房间制，6位房间码分享邀请
- 完整游戏流程：发牌、摸牌、打牌、吃碰杠和
- 花牌自动补摸，座花加番
- 88番系统（覆盖60+个番型）
- 实时算番提示，和牌前预览番型
- 断线60秒后AI自动接管
- 4圈16局完整场次
- 服务端权威，防止客户端作弊

## 项目结构

```
mahjong/
├── server/src/
│   ├── game/       # 游戏引擎、牌墙、积分
│   ├── fan/        # 算番引擎（winChecker + FanCalculator）
│   ├── rooms/      # 房间生命周期管理
│   ├── socket/     # WebSocket 事件路由
│   └── api/        # REST 健康检查
└── client/src/
    ├── components/ # UI 组件
    ├── store/      # Zustand 状态管理
    ├── hooks/      # WebSocket、计时器
    └── utils/      # 牌面显示工具
```

## 设计文档

见 [guobiao_mahjong_design_doc.md](guobiao_mahjong_design_doc.md)。
