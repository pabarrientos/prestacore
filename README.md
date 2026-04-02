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
