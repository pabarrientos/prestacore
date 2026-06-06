# AGENTS.md - Directrices para Agentes IA

Este archivo proporciona contexto específico del proyecto para agentes IA que trabajen en este codebase.

## 📋 Información del Proyecto

**Nombre**: Sistema de Gestión de Préstamos Personales  
**Stack**: Next.js 14 + Express + TypeScript + Prisma + PostgreSQL  
**Testing**: Vitest + Playwright  
**Arquitectura**: Monorepo con workspaces

## 🏗️ Estructura del Proyecto

```
prestamos/
├── apps/api/           # Express API REST
│   ├── src/
│   │   ├── routes/    # Endpoints: auth, loans, payments, dashboard
│   │   ├── services/  # amortization.ts, mora.ts, payment.ts, jwt.ts
│   │   └── middleware/# auth.ts, rbac.ts
│   └── Dockerfile     # Multi-stage build (producción)
├── apps/web/          # Next.js 14 App Router
│   ├── src/
│   │   ├── app/       # Pages: login, register, admin, simulator
│   │   ├── components/# React components
│   │   └── lib/       # auth-context.tsx
│   └── Dockerfile     # Multi-stage build (producción)
├── packages/
│   ├── database/      # Prisma schema + migrations
│   └── shared/        # Tipos TypeScript compartidos
├── docker-compose.yml           # Producción (API + Web + PostgreSQL)
├── docker-compose.override.yml  # Desarrollo (hot reload con bind mounts)
└── .devcontainer/    # VSCode Dev Containers
```

## 🎯 Convenciones de Código

### TypeScript
- Usar `interface` para tipos públicos, `type` para uniones/aliases
- Nombres en camelCase para variables y funciones
- Nombres en PascalCase para componentes React y clases
- Tipado estricto (`strict: true` en tsconfig)

### React/Next.js
- Componentes funcionales con TypeScript
- Usar `use client` solo cuando sea necesario (event handlers, hooks)
- Server Components por defecto para mejor rendimiento
- Tailwind CSS para estilos

### API REST
- Prefijo `/api/` para todos los endpoints
- Respuestas en formato: `{ success: boolean, data?: T, error?: string }`
- Validación con Zod
- Autenticación JWT en headers `Authorization: Bearer <token>`

### Base de Datos (Prisma)
- Migraciones en `packages/database/prisma/migrations/`
- Schema en `packages/database/prisma/schema.prisma`
- Usar transacciones para operaciones múltiples (`prisma.$transaction`)

## 🔐 Autenticación y Autorización

### Roles
- `ADMIN`: Acceso completo
- `VENDEDOR`: Gestión de clientes y préstamos
- `CLIENTE`: Ver sus propios préstamos y pagos

### Middleware
- `authMiddleware`: Verifica JWT
- `rbacMiddleware(role)`: Control de acceso por rol

## 🧪 Testing

### Unit Tests (Vitest)
- Ubicación: `*.test.ts` junto al archivo a testear
- Nombrar describe blocks por funcionalidad
- Usar `expect` de Vitest

### Integration Tests (Supertest)
- Ubicación: `src/routes/*.test.ts`
- Tests de API endpoints
- Requieren base de datos

### E2E Tests (Playwright)
- Ubicación: `apps/web/e2e/*.test.ts`
- Config en `playwright.config.ts`
- Correr con `pnpm test:e2e`

## 📦 Comandos Útiles

```bash
# Docker — Desarrollo (hot reload automático)
docker compose up              # Carga docker-compose.yml + override automáticamente
docker compose up -d           # Detached mode
docker compose logs -f         # Ver logs en tiempo real
docker compose down            # Detener y limpiar

# Docker — Producción (build optimizado multi-stage)
docker compose -f docker-compose.yml up -d --build

# Docker — Servicios individuales (útil para dev local + DB en Docker)
docker compose up postgres -d  # Solo PostgreSQL (bind mount a ./storage/postgres)
docker compose up api -d       # Solo API
docker compose up web -d       # Solo Web
docker compose stop api        # Detener un servicio

# Desarrollo local
pnpm -w dev                    # Iniciar todos los servicios localmente
pnpm --filter @prestamos/api dev   # Solo API
pnpm --filter @prestamos/web dev   # Solo Web

# Base de datos
pnpm -w db:migrate           # Ejecutar migraciones (desarrollo)
pnpm -w db:migrate:deploy    # Ejecutar migraciones (producción, seguro)
pnpm -w db:seed              # Seed de datos
pnpm -w db:studio            # Prisma Studio

# Sincronizar migraciones después de restaurar backup
./scripts/sync-migrations.sh  # Detecta y resuelve tablas desincronizadas

# Testing
pnpm -w test            # Todos los tests
pnpm test:e2e           # Solo E2E

# Build
pnpm -w build           # Build de producción
pnpm -w start           # Start de producción (local)
```

> **Nota**: `storage/postgres` se crea automáticamente al levantar postgres con Docker.
> Los datos persisten ahí entre reinicios. Para limpiar la DB: `rm -rf storage/postgres`

## 🔗 URLs de Desarrollo

| Servicio | URL |
|----------|-----|
| Frontend | http://localhost:3000 |
| API | http://localhost:3001 |
| PostgreSQL | localhost:5432 |

## 📝 Notas Importantes

1. **No hacer commit de archivos con secrets**: `.env`, `.env.local` están en `.gitignore`
2. **Usar migrations para cambios en schema**: No editar schema directamente en producción
3. **Tests antes de PR**: Ejecutar `pnpm test` antes de subir cambios
4. **Conventional Commits**: Usar formato `feat:`, `fix:`, `docs:`, etc.
5. **Restaurar backup de producción en dev**: Después de restaurar, ejecutar `pnpm -w db:migrate:deploy`. Si el backup es de producción (sin las migraciones nuevas), el deploy las aplica limpiamente porque las tablas nuevas NO existen en el backup — no hay conflicto. El script `./scripts/sync-migrations.sh` solo es necesario si una tabla YA existe físicamente pero su migración no está registrada (caso raro, ej. migración fallida a medio aplicar).

## 🕐 Timezone

El sistema está configurado para operar en **Argentina (ART, UTC-3)**. Esto es crítico porque los cálculos de mora y vencimientos comparan fechas sin almacenar timezone en la base de datos (`timestamp without time zone`).

### Configuración actual

| Componente | Timezone | Dónde se configura |
|-----------|----------|-------------------|
| API (dev) | `America/Argentina/Buenos_Aires` | `docker-compose.override.yml` → `TZ` |
| API (prod) | `America/Argentina/Buenos_Aires` | `docker-compose.yml` + `apps/api/Dockerfile` → `ENV TZ` |
| Web (dev) | `America/Argentina/Buenos_Aires` | `docker-compose.override.yml` → `TZ` |
| Web (prod) | `America/Argentina/Buenos_Aires` | `docker-compose.yml` + `apps/web/Dockerfile` → `ENV TZ` |
| PostgreSQL | **UTC** (default) | No configurado explícitamente |

> ⚠️ **Importante**: PostgreSQL corre en UTC. Los cálculos de fecha en SQL deben usar casts explícitos (`::date`) para comparar solo la parte de fecha y evitar desplazamientos. Ver `apps/api/src/routes/dashboard.ts` como referencia.

### Si se despliega en otro país

Si el sistema se usa en una zona horaria distinta, hay que cambiar **3 cosas**:

1. **Docker / contenedores**: Cambiar `TZ` en todos los archivos de configuración:
   - `docker-compose.yml` (API + Web)
   - `docker-compose.override.yml` (API + Web)
   - `apps/api/Dockerfile` (`ENV TZ=...`)
   - `apps/web/Dockerfile` (`ENV TZ=...`)

2. **Código**: Si hay lógica que dependa de `new Date()` o `Intl.DateTimeFormat`, verificar que use la timezone correcta. Revisar:
   - `apps/api/src/services/datetime.ts` — si se usa `Intl.DateTimeFormat` con timezone hardcodeado
   - `apps/web/src/app/admin/overdue/page.tsx` — `formatDate` con `es-AR`

3. **PostgreSQL**: Evaluar si conviene cambiar el timezone del servidor PG con:
   ```sql
   ALTER DATABASE prestamos SET timezone TO 'America/Argentina/Buenos_Aires';
   ```
   Esto afecta cómo PG convierte `TIMESTAMPTZ → timestamp` en los parámetros de queries. Si no se cambia, las queries deben seguir usando `::date` para comparaciones de fecha.

## 🤖 Guidelines para Agentes

1. **Leer antes de escribir**: Siempre leer archivos existentes para entender patrones
2. **Seguir convenciones**: Mantener consistencia con código existente
3. **Escribir tests**: Para nuevas funcionalidades, crear tests unitarios
4. **Documentar decisiones**: Usar comentarios para decisiones no obvias
5. **Validar tipos**: No usar `any`, siempre tipar correctamente

<!-- CODEGRAPH_START -->
## CodeGraph

This project has a CodeGraph MCP server (`codegraph_*` tools) configured. CodeGraph is a tree-sitter-parsed knowledge graph of every symbol, edge, and file. Reads are sub-millisecond and return structural information grep cannot.

### When to prefer codegraph over native search

Use codegraph for **structural** questions — what calls what, what would break, where is X defined, what is X's signature. Use native grep/read only for **literal text** queries (string contents, comments, log messages) or after you already have a specific file open.

| Question | Tool |
|---|---|
| "Where is X defined?" / "Find symbol named X" | `codegraph_search` |
| "What calls function Y?" | `codegraph_callers` |
| "What does Y call?" | `codegraph_callees` |
| "What would break if I changed Z?" | `codegraph_impact` |
| "Show me Y's signature / source / docstring" | `codegraph_node` |
| "Give me focused context for a task/area" | `codegraph_context` |
| "See several related symbols' source at once" | `codegraph_explore` |
| "What files exist under path/" | `codegraph_files` |
| "Is the index healthy?" | `codegraph_status` |

### Rules of thumb

- **Answer directly — don't delegate exploration.** For "how does X work" / architecture / trace questions, answer with 2-3 codegraph calls: `codegraph_context` first, then ONE `codegraph_explore` for the source of the symbols it surfaces. Codegraph IS the pre-built index, so spawning a separate file-reading sub-task/agent — or running a grep + read loop — repeats work codegraph already did and costs more for the same answer.
- **Trust codegraph results.** They come from a full AST parse. Do NOT re-verify them with grep — that's slower, less accurate, and wastes context.
- **Don't grep first** when looking up a symbol by name. `codegraph_search` is faster and returns kind + location + signature in one call.
- **Don't chain `codegraph_search` + `codegraph_node`** when you just want context — `codegraph_context` is one call.
- **Don't loop `codegraph_node` over many symbols** — one `codegraph_explore` call returns several symbols' source grouped in a single capped call, while each separate node/Read call re-reads the whole context and costs far more.
- **Index lag**: the file watcher debounces ~500ms behind writes; don't re-query immediately after editing a file in the same turn.

### If `.codegraph/` doesn't exist

The MCP server returns "not initialized." Ask the user: *"I notice this project doesn't have CodeGraph initialized. Want me to run `codegraph init -i` to build the index?"*
<!-- CODEGRAPH_END -->
