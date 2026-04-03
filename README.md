# Sistema de Gestión de Préstamos Personales

Sistema web integral para la gestión de préstamos personales con sistema de amortización francés.

## 🚀 Características

- **Gestión de Préstamos**: Creación, seguimiento y administración de préstamos
- **Sistema de Amortización Francés**: Cálculo automático de cuotas fijas
- **Gestión de Cobros**: Registro de pagos y seguimiento de cuotas vencidas
- **Simulador Público**: Herramienta de simulación de préstamos para clientes
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

### Con Docker Compose

```bash
# Clonar el proyecto
cd prestamos

# Iniciar servicios
docker-compose up -d

# Acceder a la aplicación
# Frontend: http://localhost:3000
# API: http://localhost:3001
```

### Desarrollo Local

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
│   │   └── src/
│   │       ├── routes/      # Endpoints REST
│   │       ├── services/    # Lógica de negocio
│   │       └── middleware/  # Auth, RBAC
│   └── web/                 # Next.js App
│       └── src/
│           ├── app/         # Páginas
│           ├── components/ # Componentes React
│           └── lib/         # Utilidades
├── packages/
│   ├── database/           # Prisma schema
│   └── shared/             # Tipos compartidos
├── docker-compose.yml      # Servicios Docker
└── .devcontainer/          # VSCode Dev Containers
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

## 📡 API Endpoints

### Autenticación
- `POST /api/auth/login` - Iniciar sesión
- `POST /api/auth/register` - Registrarse
- `GET /api/auth/me` - Usuario actual

### Préstamos
- `POST /api/loans/simulate` - Simular préstamo (público)
- `GET /api/loans` - Listar préstamos
- `POST /api/loans` - Crear préstamo
- `GET /api/loans/:id` - Ver préstamo
- `PATCH /api/loans/:id` - Editar o cambiar estado (Admin)
- `GET /api/loans/:id/preview-refinancing` - Previsualizar refinanciación
- `POST /api/loans/:id/execute-refinancing` - Ejecutar refinanciación
- `GET /api/loans/:id/preview-cancelacion-anticipada` - Previsualizar cancelación anticipada
- `POST /api/loans/:id/execute-cancelacion-anticipada` - Ejecutar cancelación anticipada
- `DELETE /api/loans/:id` - Eliminar préstamo (Admin)

### Pagos
- `POST /api/payments` - Registrar pago de cuota

### Dashboard
- `GET /api/dashboard` - Métricas del sistema
- `GET /api/dashboard/overdue` - Cuotas vencidas

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
| Semanal | 52 | `WEEKLY_BASE_RATE` (ej: 7.5%) |
| Quincenal | 24 | `BIWEEKLY_BASE_RATE` (ej: 15%) |
| Mensual | 12 | `MONTHLY_BASE_RATE` (ej: 30%) |
| Diario | 365 | `DAILY_BASE_RATE` (ej: 0.5%) |

### Configuración de Tasas

Las tasas base se configuran desde `/admin/settings`:

1. **Tasa semanal**: Ejemplo: 7.5% × 52 semanas = 390% anual
2. **Tasa quincenal**: Ejemplo: 15% × 24 quincenas = 360% anual
3. **Tasa mensual**: Ejemplo: 30% × 12 meses = 360% anual
4. **Tasa diaria**: Ejemplo: 0.5% × 365 días = 182.5% anual

Cada tasa se aplica automáticamente según el período seleccionado al crear el préstamo.

## ⏰ Zona Horaria

El sistema configurable timezone desde `/admin/settings`:

1. La zona horaria afecta el cálculo de cuotas vencidas, mora y cancelaciones anticipadas
2. Por defecto: America/Argentina/Buenos_Aires
3. Los cálculos de fecha usan la zona horaria configurada (no UTC del servidor)

## 🔧 Variables de Entorno

```env
# Database
DATABASE_URL="postgresql://prestamos:prestamos_dev@localhost:5432/prestamos"

# JWT
JWT_SECRET="your-secret-key"
JWT_EXPIRES_IN="7d"

# API
PORT=3001
NODE_ENV=development

# Frontend
NEXT_PUBLIC_API_URL=http://localhost:3001
```

## 📄 Licencia

MIT
