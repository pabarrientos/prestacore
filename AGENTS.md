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
│   └── src/
│       ├── routes/    # Endpoints: auth, loans, payments, dashboard
│       ├── services/  # amortization.ts, mora.ts, payment.ts, jwt.ts
│       └── middleware/# auth.ts, rbac.ts
├── apps/web/          # Next.js 14 App Router
│   └── src/
│       ├── app/       # Pages: login, register, admin, simulator
│       ├── components/# React components
│       └── lib/       # auth-context.tsx
├── packages/
│   ├── database/      # Prisma schema + migrations
│   └── shared/        # Tipos TypeScript compartidos
├── docker-compose.yml # PostgreSQL + API + Web
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
# Desarrollo
pnpm dev              # Iniciar todos los servicios
pnpm --filter @prestamos/api dev   # Solo API
pnpm --filter @prestamos/web dev   # Solo Web

# Base de datos
pnpm db:migrate      # Ejecutar migraciones
pnpm db:seed         # Seed de datos
pnpm db:studio       # Prisma Studio

# Testing
pnpm test            # Todos los tests
pnpm test:e2e        # Solo E2E

# Build
pnpm build           # Build de producción
```

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

## 🤖 Guidelines para Agentes

1. **Leer antes de escribir**: Siempre leer archivos existentes para entender patrones
2. **Seguir convenciones**: Mantener consistencia con código existente
3. **Escribir tests**: Para nuevas funcionalidades, crear tests unitarios
4. **Documentar decisiones**: Usar comentarios para decisiones no obvias
5. **Validar tipos**: No usar `any`, siempre tipar correctamente
