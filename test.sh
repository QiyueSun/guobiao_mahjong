#!/bin/sh
# Run server unit tests in a temporary Docker container.
# node_modules are cached in a named Docker volume for speed on subsequent runs.

set -e

docker run --rm \
  -v "$(pwd)/server:/app" \
  -v "mahjong-server-test-modules:/app/node_modules" \
  -w /app \
  node:22-alpine \
  sh -c "npm install --silent && npm test"
