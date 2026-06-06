# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**PrestaCore** is a personal loan management system (Sistema de Gestión de Préstamos Personales) targeting the Argentine market. The UI, domain language, and commit messages are in Spanish. It supports French/German/Flat Rate amortization, role-based access (Admin, Vendor, Client), payment tracking, collection actions, vendor commission management, and database backup/restore.

## Commands

### Development

```bash
# Full stack (hot reload via docker compose override)
docker compose up                  # auto-loads docker-compose.override.yml
docker compose up -d               # detached

# Local dev (without Docker for API/Web, requires PostgreSQL)
docker compose up postgres -d      # PostgreSQL only
pnpm install
pnpm -w db:generate                # Prisma client generation
pnpm -w db:migrate                 # Run migrations
pnpm -w db:seed                    # Seed data
pnpm -w dev                        # All apps in parallel

# Individual services
pnpm --filter @prestamos/api dev   # API only (tsx watch)
pnpm --filter @prestamos/web dev   # Web only (next dev)
```

### Testing

```bash
pnpm -w test                       # All unit/integration tests (vitest, recursive)
pnpm --filter @prestamos/api test  # API tests only
pnpm --filter @prestamos/web test  # Web tests only (jsdom)

# Run specific test file
pnpm --filter @prestamos/api exec vitest run src/services/payment.test.ts
pnpm --filter @prestamos/web exec vitest run src/lib/rounding.test.ts

# E2E (requires web + api running on localhost:3000/3001)
pnpm test:e2e

# Run specific E2E test
pnpm --filter @prestamos/web exec playwright test e2e/loans.test.ts
```

### Build & Lint

```bash
pnpm -w build                      # Production build (all packages)
pnpm -w lint                       # ESLint (all packages)
```

### Database

```bash
pnpm -w db:generate                # Regenerate Prisma client after schema changes
pnpm -w db:migrate                 # Run pending migrations (dev)
pnpm -w db:seed                    # Seed initial data
pnpm -w db:studio                  # Open Prisma Studio
```

### Production (Docker)

```bash
docker compose -f docker-compose.yml up -d --build
```

## URLs (dev)

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| API | http://localhost:3001 |
| PostgreSQL | localhost:5432 |

## Seed Credentials

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@prestamos.com | admin123 |
| Vendor | vendedor@prestamos.com | vendedor123 |
| Client | cliente@prestamos.com | cliente123 |

## Architecture

### Monorepo (pnpm workspaces)

```
apps/
  api/          Express REST API (@prestamos/api)
  web/          Next.js 14 App Router (@prestamos/web)
packages/
  database/     Prisma schema + migrations + seed (@prestamos/database)
  shared/       Shared TypeScript types/enums (@prestamos/shared)
```

### API (`apps/api/src/`)

- **routes/**: Express route handlers. Each file = one resource. Pattern: validate with Zod → Prisma query → respond with `{ success, data, error }`.
- **middleware/auth.ts**: JWT verification (`authMiddleware`, `optionalAuthMiddleware`)
- **middleware/rbac.ts**: Role gates (`requireAdmin`, `requireVendor`, `requireClient`)
- **services/amortization.ts**: French, German, Flat Rate schedule calculations
- **services/payment.ts**: Payment processing — allocates amount across interest → principal
- **services/mora.ts**: Late penalty calculations
- **services/commission.ts**: Vendor commission calculations (3 modes: PROPORTIONAL, AFTER_CAPITAL_RECOVERY, ADVANCED)
- **services/refinancing.ts**: Loan refinancing logic
- **services/cancelacion-anticipada.ts**: Early payoff calculations
- **services/datetime.ts**: Timezone-aware date utilities
- **services/settings.ts**: Settings management with in-memory rates cache
- **services/backup/**: pg_dump/pg_restore, retention policy, cron scheduler

Route registration: all routes are mounted in `src/index.ts` with `/api/` prefix.

### Web (`apps/web/src/`)

- **app/**: Next.js App Router pages. `admin/` requires auth, `simulator/` and `solicitar/` are public.
- **components/**: Shared React components. Complex features have subdirectories (Backups/, loans/).
- **lib/api.ts**: `apiFetch()` — wraps fetch with JWT auto-attach and 401 redirect.
- **lib/auth-context.tsx**: `AuthProvider` + `useAuth()` hook.
- **lib/pdf/**: jsPDF generation for account statements and simulator reports.

### Shared (`packages/shared/src/`)

TypeScript enums (Role, LoanStatus, PaymentFrequency, AmortizationSystemType) and interfaces (ApiResponse, PaginatedResponse, Backup types, Dashboard types). Imported directly via path alias — no build step needed (transpiled by Next.js webpack config).

### Database

- **Schema**: `packages/database/prisma/schema.prisma`
- **Migrations**: `packages/database/prisma/migrations/`
- All monetary fields use `Decimal(12,2)`. Commission percentage uses `Decimal(7,4)`.
- Dates are `timestamp without time zone` in PostgreSQL. PostgreSQL runs in UTC; timezone conversion happens at the container level (`TZ=America/Argentina/Buenos_Aires`).

### Production Deployment with Migrations

When deploying to production after restoring a backup or when migrations are out of sync:

1. **Pull latest code and rebuild**:
   ```bash
   git pull
   docker compose build
   ```

2. **Sync migrations** (if tables exist but aren't registered in `_prisma_migrations`):
   ```bash
   ./scripts/sync-migrations.sh
   ```
   This script checks which migrations need to be marked as applied and syncs them automatically.

3. **Apply new migrations**:
   ```bash
   docker exec prestamos-api npx prisma migrate deploy
   ```

4. **Restart services**:
   ```bash
   docker compose up -d
   ```

**Note**: The sync script is only needed when restoring backups or when there's a mismatch between physical tables and migration history. Normal deployments can skip step 2.

## Key Patterns

- **API response format**: `{ success: boolean, data?: T, error?: string }`
- **Validation**: Zod schemas in route handlers, before Prisma calls
- **Auth**: JWT access + refresh tokens. Header: `Authorization: Bearer <token>`
- **RBAC**: `authMiddleware` then `rbacMiddleware(Role.ADMIN)` chained on protected routes
- **Currency rounding**: `Math.round(x * 100) / 100` for monetary values
- **Path aliases**: `@/` maps to `./src/` in both API and Web
- **Dark mode**: Tailwind `dark:` classes, `next-themes` provider, `class` strategy

## Timezone

The system operates in **Argentina (ART, UTC-3)**. This is critical because:
- PostgreSQL stores `timestamp without time zone` in UTC
- All date comparisons in SQL use `::date` casts to avoid timezone drift
- Container TZ is set in 4 places: `docker-compose.yml`, `docker-compose.override.yml`, `apps/api/Dockerfile`, `apps/web/Dockerfile`
- Key file: `apps/api/src/services/datetime.ts`

## Test Structure

- **Unit tests**: `*.test.ts` co-located with source files
- **API integration tests**: `apps/api/src/routes/*.test.ts` (use supertest)
- **API service tests**: `apps/api/src/services/*.test.ts`
- **Web component tests**: `apps/web/src/**/*.test.tsx` (jsdom + @testing-library/react)
- **E2E tests**: `apps/web/e2e/*.test.ts` (Playwright, Chromium only)

## Environment Variables

Key variables (configured in `.env`, `docker-compose.yml`, or `docker-compose.override.yml`):

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection |
| `JWT_SECRET` | JWT signing key |
| `NEXT_PUBLIC_API_URL` | API URL for frontend (baked at build time) |
| `BACKUPS_HOST_DIR` | Host path for backup volume |
| `BACKUPS_DIR` | Container path for backups |

`NEXT_PUBLIC_API_URL` is read at **build time** — changing it requires rebuilding the web image.

## Conventions

- **Commits**: Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`, etc.)
- **TypeScript**: Strict mode. Use `interface` for public types, `type` for unions/aliases.
- **React**: Functional components. `use client` only when needed (hooks, event handlers). Server Components by default.
- **Prisma**: Use `$transaction` for multi-step writes. Run `pnpm db:generate` after any schema change.
- **Database data directory**: `storage/postgres` (auto-created by Docker). Delete to reset DB.
- **Docker + Prisma**: When the API runs in Docker, the container has its own `node_modules` (isolated via anonymous volumes in `docker-compose.override.yml`). After schema changes, run `docker compose restart api` — the container's startup command already runs `prisma generate` automatically.

### Restoring Production Backups in Dev (or after adding new migrations)

When you add a new migration in dev (`prisma migrate dev` creates the table AND registers it in `_prisma_migrations`), then later restore a production backup that does NOT have that table yet:

- The restore **removes** the new table (it wasn't in the backup)
- But the migration **files** remain in `packages/database/prisma/migrations/`
- Production **does not have the table either**, so `migrate deploy` works fine — no conflicts

The sync script (`./scripts/sync-migrations.sh`) is only needed for the rare case where a table exists physically but its migration isn't registered in `_prisma_migrations` (e.g., after an incomplete migration or partial restore).

**Normal flow after restoring a backup:** just run `pnpm -w db:migrate:deploy` — it applies pending migrations that don't exist yet. No manual resolution needed.
