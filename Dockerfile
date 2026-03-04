# Stage 1: Build all components
FROM node:24-alpine AS builder

# Install pnpm
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /app

# Copy workspace configuration and lockfile
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./

# Copy all package.json files to fetch dependencies efficiently
COPY packages/core/package.json ./packages/core/
COPY packages/database/package.json ./packages/database/
COPY apps/server/package.json ./apps/server/
COPY apps/web/package.json ./apps/web/
COPY apps/cli/package.json ./apps/cli/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy the entire source
COPY . .

# Build all packages (database -> core -> server & web)
RUN pnpm -r build

# Stage 2: Production runner
FROM node:24-alpine AS runner

WORKDIR /app

# Install pnpm for production deployment
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# Copy built server and core
COPY --from=builder /app/apps/server/dist ./apps/server/dist
COPY --from=builder /app/apps/server/package.json ./apps/server/
COPY --from=builder /app/packages/core/dist ./packages/core/dist
COPY --from=builder /app/packages/core/package.json ./packages/core/
COPY --from=builder /app/packages/database/dist ./packages/database/dist
COPY --from=builder /app/packages/database/package.json ./packages/database/

# Copy web assets to a public folder for static serving
COPY --from=builder /app/apps/web/dist ./public

# Copy root manifest and lockfile for deployment
COPY --from=builder /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./

# Install only production dependencies
# We use pnpm deploy to create a focused production build for the server
RUN pnpm install --prod --frozen-lockfile

# Default Environment Variables
ENV NODE_ENV=production
ENV PORT=3001
ENV DB_PATH=/data/soup.db
ENV WEB_DIST_PATH=../../public
ENV MEDIA_ROOT=/media
ENV LOCAL_DOWNLOAD_ROOT=/downloads
ENV QB_DOWNLOAD_ROOT=/downloads

# Expose the API/Web port
EXPOSE 3001

# Volume mounts for persistence and ingestion
VOLUME ["/data", "/downloads", "/media"]

# Start the server
CMD ["node", "apps/server/dist/index.js"]
