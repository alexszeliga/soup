# Stage 1: Build all components
FROM node:24-bookworm-slim AS builder

# Install build dependencies for native modules
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Install pnpm
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /app

# Copy workspace configuration and lockfile
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./

# Copy all package.json files
COPY packages/core/package.json ./packages/core/
COPY packages/database/package.json ./packages/database/
COPY apps/server/package.json ./apps/server/
COPY apps/web/package.json ./apps/web/
COPY apps/cli/package.json ./apps/cli/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy the entire source
COPY . .

# Build all packages
RUN pnpm -r build

# Stage 2: Production runner
FROM node:24-bookworm-slim AS runner

WORKDIR /app

# Install pnpm
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# Copy EVERYTHING from builder. This ensures:
# 1. Native modules (better-sqlite3) are present and compiled.
# 2. Web assets are in apps/web/dist (the monorepo path).
# 3. Workspace links work correctly.
COPY --from=builder /app /app

# Default Environment Variables
ENV NODE_ENV=production
ENV PORT=3001
ENV DB_PATH=/data/soup.db
# This path is relative to apps/server/dist/index.js (where the server runs from)
ENV WEB_DIST_PATH=../../web/dist
ENV MEDIA_ROOT=/media
ENV LOCAL_DOWNLOAD_ROOT=/downloads
ENV QB_DOWNLOAD_ROOT=/downloads

# Expose the API/Web port
EXPOSE 3001

# Volume mounts
VOLUME ["/data", "/downloads", "/media"]

# Start the server
WORKDIR /app/apps/server
CMD ["node", "dist/index.js"]
