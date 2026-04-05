# Build stage — install all deps and compile native modules
FROM node:22-alpine AS base

WORKDIR /app

# Build tools required by better-sqlite3 (native module)
RUN apk add --no-cache python3 make g++

COPY package*.json ./
# Disable Corepack enforcement so the image npm version is used as-is
RUN COREPACK_ENABLE_STRICT=0 npm ci

# Builder stage — compile TypeScript + Vite
FROM base AS builder

WORKDIR /app

COPY --from=base /app/node_modules ./node_modules
COPY . .

RUN npm run build

# Production stage — lean image with only what's needed to run
FROM node:22-alpine AS production

WORKDIR /app

ENV SQLITE_DB_PATH=/app/data/sqlite.db
ENV NODE_ENV=production
ENV PORT=5000
ENV PUID=1000
ENV PGID=1000

# Build tools needed to compile better-sqlite3 during prod npm ci,
# then removed to keep the image small
RUN apk add --no-cache python3 make g++ su-exec shadow

COPY package*.json ./
RUN COREPACK_ENABLE_STRICT=0 npm ci --omit=dev && \
    apk del python3 make g++

# Copy build output and migration files
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/drizzle.config.ts ./
COPY --from=builder /app/migrations ./migrations
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/package.json ./

# Create user/group and data directory
RUN addgroup preservarr && \
    adduser -G preservarr -s /bin/sh -D preservarr && \
    mkdir -p /app/data && \
    chown -R preservarr:preservarr /app

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 5000

ENTRYPOINT ["/entrypoint.sh"]
CMD ["npm", "run", "start"]

LABEL org.opencontainers.image.title="Preservarr"
LABEL org.opencontainers.image.description="A self-hosted ROM and emulation manager for the -arr ecosystem"
LABEL org.opencontainers.image.authors="ImSoHM02"
LABEL org.opencontainers.image.source="https://github.com/ImSoHM02/Preservarr"
LABEL org.opencontainers.image.licenses="GPL-3.0-only"
LABEL org.opencontainers.image.version="0.1.0"
