FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm npm install
COPY . .
RUN npm run build && cp -r src/db/migrations dist/db/migrations

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/dist ./dist
COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm npm install --omit=dev
EXPOSE 3001
CMD ["sh", "-c", "node dist/db/migrate.js && node dist/index.js"]
