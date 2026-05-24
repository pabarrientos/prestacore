# PrestaCore

Sistema web integral para la gestión de préstamos personales con múltiples sistemas de amortización.

<!-- ![PrestaCore Logo](apps/web/src/app/logo.svg) -->

<img src="apps/web/public/logo-dark.svg" width="500" height="auto" />

## 🚀 Características

- **Gestión de Préstamos**: Creación, seguimiento y administración de préstamos
- **Múltiples Sistemas de Amortización**: 
  - **Sistema Francés**: Cuota fija, interés sobre saldo decreciente
  - **Sistema Alemán**: Capital constante, interés decreciente
  - **Sistema de Tasa Plana**: Interés fijo sobre capital original
- **Configurable**: El sistema default se configura en `/admin/settings`
- **Gestión de Cobros**: Registro de pagos y seguimiento de cuotas vencidas
- **Simulador Público**: Herramienta de simulación interactiva para clientes
- **Roles**: Administrador, Vendedor, Cliente
- **Dashboard**: Métricas en tiempo real (total prestado, cobranza, mora)
- **API REST**: Comunicación entre frontend y backend
- **Períodos de Pago**: Semanal, Quincenal, Mensual, Diario (configurable)
- **Configuración de Tasas**: Tasas base configurables por período desde `/admin/settings`

## 🛠️ Tech Stack

| Componente | Tecnología |
|------------|------------|
| Frontend | Next.js 14 (App Router) + Tailwind CSS |
| Backend | Express + TypeScript |
| Base de datos | PostgreSQL + Prisma ORM |
| Testing | Vitest + Playwright |
| Container | Docker Compose + Dev Containers |

## 📋 Requisitos

- Node.js >= 20
- pnpm >= 8
- Docker y Docker Compose

## 🏁 Inicio Rápido

### Con Docker Compose — Desarrollo (hot reload)

```bash
# Clonar el proyecto
cd prestamos

# Iniciar servicios con hot reload (carga docker-compose.override.yml automáticamente)
docker compose up

# Acceder a la aplicación
# Frontend: http://localhost:3000
# API: http://localhost:3001
```

Los cambios en el código se reflejan automáticamente gracias a `tsx watch` (API) y `next dev` (Web).

### Con Docker Compose — Producción

```bash
# Build y start de imágenes optimizadas (multi-stage)
docker compose -f docker-compose.yml up -d --build

# Ver logs
docker compose logs -f

# Detener
docker compose down
```

### Desarrollo Local (sin Docker)

```bash
# Instalar dependencias
pnpm install

# Generar Prisma Client
pnpm db:generate

# Ejecutar migraciones
pnpm db:migrate

# Seed de datos iniciales
pnpm db:seed

# Iniciar desarrollo
pnpm dev
```

### Servicios Individuales

Para desarrollo local donde necesitás PostgreSQL pero querés correr la API y Web localmente:

```bash
# Solo PostgreSQL (bind mount a ./storage/postgres)
docker compose up postgres -d

# Solo API (requiere postgres corriendo)
docker compose up api -d

# Solo Web (requiere api corriendo)
docker compose up web -d

# Ver logs de un servicio específico
docker compose logs -f postgres
docker compose logs -f api
docker compose logs -f web

# Detener un servicio específico
docker compose stop api
```

> **Nota**: La carpeta `storage/postgres` se crea automáticamente al ejecutar `docker compose up postgres`.
> Los datos de PostgreSQL persisten ahí entre reinicios. Si querés limpiar la base de datos,
> eliminá la carpeta: `rm -rf storage/postgres`

## 👤 Credenciales (seed)

| Rol | Email | Contraseña |
|-----|-------|------------|
| Administrador | admin@prestamos.com | admin123 |
| Vendedor | vendedor@prestamos.com | vendedor123 |
| Cliente | cliente@prestamos.com | cliente123 |

## 📁 Estructura del Proyecto

```
prestamos/
├── apps/
│   ├── api/                 # Express API
│   │   ├── src/
│   │   │   ├── routes/      # Endpoints REST
│   │   │   ├── services/    # Lógica de negocio
│   │   │   └── middleware/  # Auth, RBAC
│   │   └── Dockerfile       # Multi-stage build (producción)
│   └── web/                 # Next.js App
│       ├── src/
│       │   ├── app/         # Páginas
│       │   ├── components/  # Componentes React
│       │   └── lib/         # Utilidades
│       └── Dockerfile       # Multi-stage build (producción)
├── packages/
│   ├── database/           # Prisma schema
│   └── shared/             # Tipos compartidos
├── docker-compose.yml           # Producción (API + Web + PostgreSQL)
├── docker-compose.override.yml  # Desarrollo (hot reload con bind mounts)
└── .devcontainer/               # VSCode Dev Containers
```

## 🧪 Testing

```bash
# Unit tests
cd apps/api && pnpm test

# Integration tests
cd apps/api && pnpm exec vitest run src/routes/

# E2E tests (requiere servicios corriendo)
cd apps/web && pnpm test:e2e
```

## 💾 Respaldos de Base de Datos

El sistema cuenta con un módulo completo de respaldo y restauración de PostgreSQL accesible desde **Admin → Sistema → Respaldos**.

### Acceso

- **Ruta**: `/admin/settings/backups` (solo ADMIN)
- **Ubicación en menú**: Admin → **Sistema** ▼ → Respaldos

### Crear un respaldo manual

1. Ir a **Admin → Sistema → Respaldos**
2. Hacer clic en **"+ Crear Respaldo"**
3. El respaldo se genera con `pg_dump` y aparece en la lista

### Programar respaldos automáticos

En la tarjeta **Programación de Respaldos**:

1. Activar el toggle **Activo**
2. Elegir frecuencia: **Diario**, **Semanal** o **Mensual**
3. Configurar la hora (formato 24h, 0-23)
4. Para semanal: elegir el día de la semana
5. Para mensual: elegir el día del mes (1-31)
6. Guardar

### Política de retención

En la misma tarjeta de programación, configurar:

- **Máx. cantidad de respaldos**: elimina los más antiguos cuando se supere el límite
- **Máx. edad (días)**: elimina respaldos más antiguos que el límite de días

Ambos filtros se aplican simultáneamente.

### Descargar respaldos

Desde la lista de respaldos, hacer clic en **"Descargar"** en la fila correspondiente. El archivo `.dump` se guarda localmente.

### Restaurar desde un respaldo existente

1. En la lista, hacer clic en **"Restaurar"** en la fila del respaldo
2. Se muestra una previsualización con tablas y cantidad de filas
3. Marcar el checkbox de confirmación: *"Entiendo que esto sobreescribirá todos los datos actuales"*
4. Hacer clic en **"Restaurar"**

> **🔒 Seguridad**: Antes de ejecutar la restauración, el sistema crea automáticamente un respaldo de seguridad del estado actual. Si algo falla, ese respaldo queda disponible en la lista.
>
> **🔄 Reconciliación**: Después de restaurar, el sistema escanea el directorio de backups y recrea los registros de cualquier archivo que haya quedado huérfano (ej. respaldos creados antes de la restauración).

### Restaurar desde archivo externo

1. Ir a la tarjeta **"Restaurar desde Archivo Externo"**
2. Seleccionar un archivo `.sql`, `.dump` o `.tar`
3. Hacer clic en **"Subir y Previsualizar"**
4. Revisar la previsualización de tablas
5. Usar el botón **"Restaurar"** que abre el diálogo de confirmación
6. Confirmar la restauración

### Almacenamiento

La carpeta de backups se configura con variables de entorno:

| Variable | Default | Dónde se define | Propósito |
|----------|---------|----------------|-----------|
| `BACKUPS_HOST_DIR` | `./storage/backups` | `.env` (raíz) o variable del host | Carpeta en el host montada como volumen en el contenedor |
| `BACKUPS_DIR` | `/app/backups` | `environment:` en docker-compose, o `apps/api/.env` | Ruta dentro del contenedor API donde se leen/escriben los backups |

**Para cambiar la ubicación**, editá `.env` en la raíz del proyecto:

```bash
BACKUPS_HOST_DIR=/mnt/nas/prestamos-backups
```

El volumen se monta automáticamente:

```
${BACKUPS_HOST_DIR:-./storage/backups}  →  /app/backups
```

> **Nota**: `pg_dump` y `pg_restore` se ejecutan dentro del contenedor de la API. El Dockerfile de producción usa `node:20-slim` (Debian 12 bookworm) que incluye `postgresql-client-15` nativo, compatible con PostgreSQL 15.
>
> **Archivos huérfanos**: Si un archivo `.dump` existe en el directorio pero no tiene registro en la base de datos (ej. después de una restauración), el sistema lo detecta automáticamente y crea su registro al ejecutar cualquier operación de restore.

### Endpoints API relacionados

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/backups` | Listar todos los respaldos |
| POST | `/api/backups` | Crear respaldo manual |
| GET | `/api/backups/:id/download` | Descargar archivo |
| DELETE | `/api/backups/:id` | Eliminar respaldo |
| POST | `/api/backups/upload` | Subir respaldo externo |
| GET | `/api/backups/preview/:id` | Previsualizar tablas |
| POST | `/api/backups/:id/restore` | Ejecutar restauración |
| GET | `/api/backups/schedule` | Obtener configuración |
| PATCH | `/api/backups/schedule` | Guardar schedule + retención |

## 📡 API Endpoints

### Autenticación
- `POST /api/auth/login` - Iniciar sesión
- `POST /api/auth/register` - Registrarse
- `GET /api/auth/me` - Usuario actual
- `POST /api/auth/refresh` - Refrescar token

### Clientes
- `GET /api/clients/search?q=` - Buscar clientes por nombre o email
- `GET /api/clients` - Listar clientes (Admin/Vendedor)
- `POST /api/clients` - Crear cliente (Admin)
- `GET /api/clients/:id` - Ver cliente
- `PATCH /api/clients/:id` - Editar cliente (Admin)
- `DELETE /api/clients/:id` - Eliminar cliente (Admin)

### Préstamos
- `POST /api/loans/simulate` - Simular préstamo (público)
- `GET /api/loans/mine` - Mis préstamos (Cliente)
- `POST /api/loans/request` - Solicitar préstamo (Cliente)
- `GET /api/loans` - Listar préstamos (Admin/Vendedor)
- `POST /api/loans` - Crear préstamo (Vendedor)
- `GET /api/loans/:id` - Ver préstamo
- `PATCH /api/loans/:id/approve` - Aprobar préstamo (Admin)
- `PATCH /api/loans/:id` - Editar o cambiar estado (Admin)
- `GET /api/loans/:id/schedule` - Ver cronograma de cuotas
- `GET /api/loans/:id/preview-refinancing` - Previsualizar refinanciación
- `POST /api/loans/:id/execute-refinancing` - Ejecutar refinanciación
- `GET /api/loans/:id/preview-cancelacion-anticipada` - Previsualizar cancelación anticipada
- `POST /api/loans/:id/execute-cancelacion-anticipada` - Ejecutar cancelación anticipada
- `DELETE /api/loans/:id` - Eliminar préstamo (Admin)

### Pagos
- `POST /api/payments` - Registrar pago de cuota
- `GET /api/payments/by-date` - Obtener pagos por rango de fecha (filtros: fechaInicio, fechaFin, vendedorId, estado, cliente)
- `GET /api/payments/loan/:loanId` - Historial de pagos de un préstamo
- `GET /api/payments/balance/:loanId` - Balance del préstamo con cuotas
- `GET /api/payments/balance/:loanId/at?date=YYYY-MM-DD` - Balance en fecha específica (con mora calculada)
- `PUT /api/payments/:id` - Editar pago (Admin)
- `DELETE /api/payments/:id` - Eliminar pago (Admin)
- `POST /api/payments/mora` - Registrar pago de mora

### Dashboard
- `GET /api/dashboard` - Métricas del sistema
- `GET /api/dashboard/recent` - Actividad reciente
- `GET /api/dashboard/overdue` - Cuotas vencidas

### Usuarios
- `GET /api/users/vendors` - Listar vendedores (Admin)

### Configuración
- `GET /api/settings` - Obtener todas las configuraciones
- `GET /api/settings/rates` - Obtener tasas de interés
- `GET /api/settings/default-amortization-system` - Obtener sistema de amortización default
- `PATCH /api/settings/default-amortization-system` - Actualizar sistema default (Admin)
- `PATCH /api/settings` - Actualizar configuraciones (Admin)

## 🔄 Refinanciación

El sistema permite refinanciar préstamos en mora:

1. **Previsualización**: Muestra el desglose de deuda (capital pendiente, intereses vencidos, pagos atrasados)
2. **Edición manual**: Los intereses vencidos pueden ajustarse manualmente
3. **Nuevo préstamo**: Se crea un nuevo préstamo con el capital refinanciado
4. **Seguimiento**: Links bidireccionales entre préstamo original y nuevo

Para refinanciar un préstamo, debe estar en estado DEFAULTED o tener cuotas vencidas.

## 🔄 Cancelación Anticipada

El sistema permite cancelar un préstamo antes de su fecha de vencimiento:

1. **Previsualización**: Muestra el desglose de deuda actual (capital pendiente, intereses vencidos, pagos atrasados)
2. **Edición manual**: Los intereses vencidos pueden ajustarse manualmente
3. **Pago único**: Se crea un pago extraordinario por el total de la deuda
4. **Estado**: El préstamo pasa a estado PAID

Para cancelar anticipadamente, el préstamo debe estar en estado ACTIVE o DEFAULTED (no PENDING, PAID ni REFINANCIADO).

## 💰 Períodos de Pago

El sistema soporta 4 períodos de pago configurables:

| Período | Cuotas/año | Configuración de Tasa |
|---------|------------|----------------------|
| Semanal | 48 | `WEEKLY_BASE_RATE` (ej: 7.5%) |
| Quincenal | 24 | `BIWEEKLY_BASE_RATE` (ej: 15%) |
| Mensual | 12 | `MONTHLY_BASE_RATE` (ej: 30%) |
| Diario | 360 | `DAILY_BASE_RATE` (ej: 0.5%) |

### Configuración de Tasas

Las tasas base se configuran desde `/admin/settings`:

1. **Tasa semanal**: Ejemplo: 7.5% × 52 semanas = 390% anual
2. **Tasa quincenal**: Ejemplo: 15% × 24 quincenas = 360% anual
3. **Tasa mensual**: Ejemplo: 30% × 12 meses = 360% anual
4. **Tasa diaria**: Ejemplo: 0.5% × 365 días = 182.5% anual

Cada tasa se aplica automáticamente según el período seleccionado al crear el préstamo.

## 💰 Sistemas de Amortización

El sistema soporta 3 sistemas de amortización configurables:

| Sistema | Descripción | Fórmula |
|---------|-------------|----------|
| **Francés** | Cuota fija, interés sobre saldo | `P × [r(1+r)^n] / [(1+r)^n - 1]` |
| **Alemán** | Capital constante, interés decreciente | Capital = P/n, Interés = Saldo × r |
| **Tasa Plana** | Interés fijo sobre capital original | Interés = P × r (constante) |

### Configuración del Sistema Default

Desde `/admin/settings` podés configurar el sistema de amortización por defecto:

- **Sistema Francés** (default): Cuota fija, recomendado para la mayoría de clientes
- **Sistema Alemán**: Cuota inicial más alta, interés total menor
- **Sistema de Tasa Plana**: Cuotas constantes, interés total mayor

El sistema default se precarga automáticamente en:
- Simulador público (`/simulator`)
- Creación de préstamos (`/admin/loans/new`)
- Edición de préstamos (`/admin/loans/[id]/edit`)
- Refinanciación

**Usuarios con rol ADMIN o VENDEDOR** pueden cambiar el sistema en el formulario. ** clientes** ven el sistema usado pero no pueden cambiarlo (excepto en el simulador si tienen ese rol).

## 🔧 Variables de Entorno

### Desarrollo

Las variables de entorno para desarrollo ya están configuradas en `docker-compose.override.yml` con valores por defecto. No necesitás crear ningún archivo adicional.

### Producción

Creá un archivo `.env` en la raíz del proyecto (no se commitea):

```env
# JWT — Cambiá esto en producción
JWT_SECRET=tu-secreto-super-seguro

# Web — URL de la API (se bakea en el bundle de Next.js en build time)
NEXT_PUBLIC_API_URL=http://tu-dominio.com:3001
```

> **Importante**: `NEXT_PUBLIC_API_URL` se lee en **build time** (no en runtime).
> Si cambiás este valor, necesitás rebuildar la imagen:
> ```bash
> docker compose -f docker-compose.yml up -d --build
> ```

### Variables disponibles

| Variable | Uso | Default |
|----------|-----|---------|
| `JWT_SECRET` | Firma de tokens JWT | `your-secret-key-change-in-production` |
| `NEXT_PUBLIC_API_URL` | URL de la API para el frontend | `http://localhost:3001` |

> **Nota**: `DATABASE_URL`, `PORT`, `JWT_EXPIRES_IN` y `NODE_ENV` están configurados directamente en `docker-compose.yml` y no necesitan sobrescribirse.

## 🕐 Timezone

El sistema opera en **Argentina (ART, UTC-3)**. Todos los cálculos de fechas (mora, vencimientos, cuotas) dependen de esta configuración.

La zona horaria se configura en **4 lugares**:

| Componente | Timezone | Dónde |
|-----------|----------|-------|
| API (dev) | `America/Argentina/Buenos_Aires` | `docker-compose.override.yml` → `TZ` |
| API (prod) | `America/Argentina/Buenos_Aires` | `docker-compose.yml` + `apps/api/Dockerfile` → `ENV TZ` |
| Web (dev) | `America/Argentina/Buenos_Aires` | `docker-compose.override.yml` → `TZ` |
| Web (prod) | `America/Argentina/Buenos_Aires` | `docker-compose.yml` + `apps/web/Dockerfile` → `ENV TZ` |

> PostgreSQL corre en UTC por defecto. Las queries usan `::date` para comparar solo la fecha sin timezone.

### Si desplegás en otro país

Cambiá `America/Argentina/Buenos_Aires` por la timezone de IANA que corresponda (ej: `America/Mexico_City`, `America/Santiago`, `Europe/Madrid`) en:

1. `docker-compose.yml` — API + Web
2. `docker-compose.override.yml` — API + Web
3. `apps/api/Dockerfile` — `ENV TZ=...`
4. `apps/web/Dockerfile` — `ENV TZ=...`
5. Revisar `apps/api/src/services/datetime.ts` si tiene timezone hardcodeada
6. Revisar `apps/web/src/app/admin/overdue/page.tsx` — `formatDate`

## 📄 Licencia

MIT
