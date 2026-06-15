#!/bin/sh
# Run the bot game client.
# Requires the server to be running: docker compose up -d
#
# Usage:
#   ./bot.sh [--bots N] [--rounds N] [--delay MS] [--server URL]
#
# Examples:
#   ./bot.sh                     # 3 bots, 16 rounds — open browser to join as 4th player
#   ./bot.sh --bots 4            # fully automated 16-round game
#   ./bot.sh --bots 4 --rounds 3 --delay 200

set -e

docker run --rm \
  -v "$(pwd)/tools/bot-client:/app" \
  -v "mahjong-bot-client-modules:/app/node_modules" \
  -w /app \
  --network mahjong_default \
  node:22-alpine \
  sh -c "npm install --silent && npx ts-node run-game.ts --server http://mahjong-server-1:3001 $*"
