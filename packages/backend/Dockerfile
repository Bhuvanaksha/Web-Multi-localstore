# syntax=docker/dockerfile:1
FROM node:20-alpine AS builder
WORKDIR /app

# Install dependencies first (leverages layer caching)
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/backend/package.json packages/backend/package.json
COPY packages/frontend/package.json packages/frontend/package.json
RUN npm ci --workspaces --include-workspace-root --no-audit --no-fund

# Copy source and build shared + backend
COPY . .
RUN npm run build -w @alpha/shared && npm run build -w @alpha/backend

# ─── Runtime image ─────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared ./packages/shared
COPY --from=builder /app/packages/backend ./packages/backend

EXPOSE 5347
CMD ["node", "packages/backend/dist/server.js"]
