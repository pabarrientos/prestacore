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

# Copy source code
COPY apps/web/ ./apps/web/
COPY packages/shared/ ./packages/shared/

# Build arg for API URL (baked into Next.js bundle at build time)
ARG NEXT_PUBLIC_API_URL=http://localhost:3001
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

# Build Next.js app
RUN cd apps/web && pnpm run build

# ---- Production Stage ----
FROM node:20-slim AS production

WORKDIR /app

# Install Argentine locale (es_AR.UTF-8)
RUN apt-get update && apt-get install -y locales && \
    sed -i '/es_AR.UTF-8/s/^# //' /etc/locale.gen && \
    locale-gen es_AR.UTF-8

ENV LANG=es_AR.UTF-8
ENV LC_ALL=es_AR.UTF-8
ENV TZ=America/Argentina/Buenos_Aires

# Copy everything from builder
COPY --from=builder /app .

# Remove source files that aren't needed at runtime
RUN rm -rf apps/web/src apps/api packages/database/prisma/migrations

WORKDIR /app/apps/web

# Environment variables
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["/app/node_modules/.pnpm/node_modules/.bin/next", "start", "-H", "0.0.0.0"]
