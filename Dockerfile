# syntax=docker/dockerfile:1
# Build context is the repository root; the app lives in web/.
# Usage: docker build -t mimiuchi .   (or `docker compose up -d --build`)
#
# No `output: "standalone"` on purpose: lib/db/migrate reads ./drizzle and the
# kuromoji dictionary lookup walks ./node_modules/.pnpm, both relative to the
# process cwd, so the runtime image ships the full pnpm layout with cwd = web/.

ARG NODE_IMAGE=node:22-bookworm-slim
ARG PNPM_VERSION=10.28.1

# ---------- base: node + pnpm, shared by the install/build stages ----------
FROM ${NODE_IMAGE} AS base
ARG PNPM_VERSION
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    NEXT_TELEMETRY_DISABLED=1
# npm global rather than corepack: corepack is being removed from Node
# distributions and its signing-key rotation has broken builds before.
RUN npm install -g pnpm@${PNPM_VERSION}
# Toolchain only as a fallback: better-sqlite3 normally downloads a prebuilt
# binary, but falls back to node-gyp if none matches this Node/arch.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app/web

# ---------- deps: full install (dev deps are needed for next build) ----------
FROM base AS deps
COPY web/package.json web/pnpm-lock.yaml web/pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir /pnpm/store

# ---------- build: next build ----------
FROM deps AS build
COPY web/ ./
# Throwaway data dir: lib/config generates a session-secret file at module
# load and build workers may lazily open the DB. Keep both out of the image.
ENV KIKOERU_DATA_DIR=/tmp/kikoeru-build
# next/font/google fetches Geist / Noto Sans JP here, so this needs network.
RUN pnpm build

# ---------- prod-deps: production-only node_modules for the runtime ----------
FROM base AS prod-deps
COPY web/package.json web/pnpm-lock.yaml web/pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --prod --frozen-lockfile --store-dir /pnpm/store

# ---------- runtime ----------
FROM ${NODE_IMAGE} AS runtime
# ffmpeg drives the waveform seek bar and WAV transcoding.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg \
 && rm -rf /var/lib/apt/lists/* \
 && mkdir -p /data /covers /library \
 && chown node:node /data /covers

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    KIKOERU_DATA_DIR=/data \
    KIKOERU_COVERS_DIR=/covers \
    KIKOERU_LIBRARY_ROOT=/library \
    KIKOERU_IN_CONTAINER=1

# cwd must be web/: lib/config derives the project root from it, the migrator
# reads ./drizzle, and the kuromoji dict lookup walks ./node_modules.
WORKDIR /app/web
COPY --from=prod-deps --chown=node:node /app/web/node_modules ./node_modules
# .next is chowned because Next writes its fetch cache under .next/cache.
COPY --from=build --chown=node:node /app/web/.next ./.next
COPY --chown=node:node web/package.json web/next.config.ts web/tsconfig.json ./
COPY --chown=node:node web/public ./public
COPY --chown=node:node web/drizzle ./drizzle

USER node
EXPOSE 3000
VOLUME ["/data", "/covers"]
# Direct node invocation (no shell, no pnpm) so signals reach the server.
CMD ["node", "node_modules/next/dist/bin/next", "start"]
