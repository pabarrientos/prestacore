# ---- Build Stage ----
FROM node:20-slim AS builder

WORKDIR /app

# Install pnpm globally
RUN npm install -g pnpm

# Copy workspace root configuration
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./

# Copy all workspace package.json files
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/database/package.json ./packages/database/
COPY packages/shared/package.json ./packages/shared/

# Install all dependencies (including devDependencies for build)
RUN pnpm install --frozen-lockfile

# Copy all source code
COPY apps/api/ ./apps/api/
COPY apps/web/ ./apps/web/
COPY packages/database/ ./packages/database/
COPY packages/shared/ ./packages/shared/

# Generate Prisma Client
RUN cd packages/database && pnpm exec prisma generate

# Build API
RUN cd apps/api && pnpm run build

# ---- Production Stage ----
FROM node:20-bullseye-slim AS production

WORKDIR /app

# Install Argentine locale (es_AR.UTF-8)
RUN apt-get update && apt-get install -y locales && \
    sed -i '/es_AR.UTF-8/s/^# //' /etc/locale.gen && \
    locale-gen es_AR.UTF-8

ENV LANG=es_AR.UTF-8
ENV LC_ALL=es_AR.UTF-8
ENV TZ=America/Argentina/Buenos_Aires

# Copy everything from builder (simpler and more reliable than pnpm deploy)
COPY --from=builder /app .

# Remove devDependencies that aren't needed at runtime
# (We keep the full node_modules since prisma generate already ran)
RUN rm -rf apps/api/src apps/api/*.test.ts apps/web apps/web/src packages/database/prisma/migrations

WORKDIR /app/apps/api

# Environment variables
ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

# Use node directly since code is already compiled to CommonJS
CMD ["node", "dist/index.js"]
