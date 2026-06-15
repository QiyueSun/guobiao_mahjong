#!/bin/sh
# Run Playwright E2E tests against the running Docker Compose stack.
# Requires the stack to be up first: docker compose up -d
#
# Usage:
#   ./e2e.sh                          # run all specs
#   ./e2e.sh lobby.spec.ts            # single spec
#   ./e2e.sh --grep "can create"      # grep filter
#   BASE_URL=http://localhost:5173 ./e2e.sh  # override base URL (default: mahjong-client-1)

set -e

docker run --rm \
  -v "$(pwd)/e2e:/app" \
  -v "mahjong-e2e-modules:/app/node_modules" \
  --network mahjong_default \
  --ipc=host \
  -e BASE_URL="${BASE_URL:-http://mahjong-client-1}" \
  mcr.microsoft.com/playwright:v1.48.0-noble \
  sh -c "cd /app && npm install --silent && npx playwright test $*"
