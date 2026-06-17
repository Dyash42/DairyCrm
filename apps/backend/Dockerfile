# Jharanai backend image — runs BOTH the API and the worker from one image
# (override the command per process). Build context MUST be the repo root:
#
#   docker build -f apps/backend/Dockerfile -t jharanai-backend .
#
# The app runs TypeScript directly via tsx (no separate compile step), so tsx
# is a runtime dependency. Env vars are injected by the platform/compose — we
# do NOT bake a .env into the image.

FROM node:20-slim AS base
WORKDIR /app

# OpenSSL is required by Prisma's query engine on slim images.
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*

# --- deps: install with the lockfile for reproducible builds ---
# Copy only manifests first so Docker can cache the install layer.
COPY package.json package-lock.json turbo.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/backend/package.json apps/backend/
COPY apps/web-admin/package.json apps/web-admin/
COPY apps/mobile/package.json apps/mobile/
RUN npm ci

# --- source ---
COPY packages/shared packages/shared
COPY apps/backend apps/backend

# Generate the Prisma client for the image's platform.
RUN cd apps/backend && npx prisma generate

ENV NODE_ENV=production
WORKDIR /app/apps/backend
EXPOSE 3000

# Default command = API. The worker overrides this:
#   command: ["npm", "run", "worker:prod"]
CMD ["npm", "run", "start:prod"]
