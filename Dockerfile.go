# Stage 1: Build the Go Backend
FROM golang:1.25-bookworm AS go-builder

WORKDIR /app
COPY apps/server-go/go.mod apps/server-go/go.sum ./
RUN go mod download

COPY apps/server-go/ ./
RUN go build -o soup-go main.go

# Stage 2: Build the Frontend
FROM node:24-bookworm-slim AS node-builder
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/core/package.json ./packages/core/
COPY packages/database/package.json ./packages/database/

# Install dependencies
RUN pnpm install --no-frozen-lockfile

# Copy source code
COPY packages/database/ ./packages/database/
COPY packages/core/ ./packages/core/
COPY apps/web/ ./apps/web/

# Build frontend
RUN pnpm --filter @soup/web build

# Stage 3: Runner
FROM debian:bookworm-slim AS runner

WORKDIR /app

# Install runtime dependencies (ca-certificates for TMDB API)
RUN apt-get update && apt-get install -y \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy binaries and assets
COPY --from=go-builder /app/soup-go /app/soup-go
COPY --from=node-builder /app/apps/web/dist /app/web/dist

# Default Environment
ENV PORT=3001
ENV DATA_DIR=/downloads
ENV MEDIA_ROOT=/media
ENV ENGINE_DB_PATH=/data/engine.db
ENV WEB_DIST_PATH=/app/web/dist

# Expose
EXPOSE 3001

# Run
CMD ["/app/soup-go"]
