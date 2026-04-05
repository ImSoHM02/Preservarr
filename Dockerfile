# Build stage with shared dependencies
FROM node:22-alpine@sha256:4d64b49e6c891c8fc821007cb1cdc6c0db7773110ac2c34bf2e6960adef62ed3 AS base

WORKDIR /app

COPY package*.json ./
RUN npm ci

# Build stage
FROM base AS builder

WORKDIR /app

COPY --from=base /app/node_modules ./node_modules
COPY . .

# Build client and server
RUN npm run build

# Production stage
FROM node:22-alpine@sha256:4d64b49e6c891c8fc821007cb1cdc6c0db7773110ac2c34bf2e6960adef62ed3 AS production

WORKDIR /app

# Set default environment variables
ENV SQLITE_DB_PATH=/app/data/sqlite.db
ENV NODE_ENV=production
ENV PORT=5000
ENV PUID=1000
ENV PGID=1000

# Install su-exec (for privilege dropping) and shadow (for usermod/groupmod)
RUN apk add --no-cache su-exec shadow

# Install production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev

# Copy necessary files from build stage
COPY --from=builder /app/dist ./dist

# Copy drizzle configuration and migrations for production
COPY --from=builder /app/drizzle.config.ts ./
COPY --from=builder /app/migrations ./migrations
COPY --from=builder /app/shared ./shared
COPY --from=builder /app/scripts ./scripts

# Copy configuration files...
COPY --from=builder /app/package.json ./

# Create user, group, data directory, and set ownership
RUN addgroup preservarr && \
    adduser -G preservarr -s /bin/sh -D preservarr && \
    mkdir -p /app/data && \
    chown -R preservarr:preservarr /app

# Copy and set up entrypoint script
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
